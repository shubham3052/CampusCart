import os
import sys
from datetime import datetime, timedelta
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Q, Sum
from django.utils import timezone

from .models import DemandPrediction, DemandModelMetadata, PurchaseRecommendation, ProductRecommendation
from .serializers import (
    DemandPredictionSerializer,
    DemandModelMetadataSerializer,
    PurchaseRecommendationSerializer,
    PurchaseRecommendationOverrideSerializer,
    BulkAcceptRecommendationsSerializer,
    ProductRecommendationSerializer,
)
from users.permissions import IsShopOwnerOrAdmin, IsAdmin
from products.models import Product
from shops.models import Shop
from inventory.models import Inventory, Supplier, SupplierProduct, PurchaseOrder
from inventory.sales_aggregation import get_daily_sales_series
from inventory.supplier_intelligence import rank_suppliers_for_product
from ml.models.predict import detect_demand_spike, classify_demand_trend
from .purchase_advisor import (
    generate_recommendation_for_inventory,
    save_or_update_recommendation,
    create_purchase_orders_from_recommendations,
)


class DemandPredictionViewSet(viewsets.ModelViewSet):
    """
    Demand Predictions API endpoint.
    
    SECURITY:
    - Read: Shop Owner (for their OWN shop) or Admin.
    - Students and delivery personnel are denied access (403).
    - Create/Update/Delete: IsAdmin only (automated ML pipeline).
    """
    serializer_class = DemandPredictionSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'forecast', 'summary', 'trends', 'spikes', 'model_metrics']:
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def _get_shop_id(self):
        user = self.request.user
        if user.is_admin:
            return self.request.query_params.get('shop')
        elif user.is_shop_owner:
            if hasattr(user, 'owned_shop') and user.owned_shop:
                return user.owned_shop.id
            if hasattr(user, 'shop') and user.shop:
                return user.shop.id
            from shops.models import Shop
            shop = Shop.objects.filter(owner=user).first()
            if shop:
                return shop.id
        return None

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return DemandPrediction.objects.none()

        base_qs = DemandPrediction.objects.select_related('shop', 'product', 'product__category').order_by('target_date')

        if user.is_admin:
            queryset = base_qs.all()
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                queryset = queryset.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            return DemandPrediction.objects.none()

        # Filtering
        product_id = self.request.query_params.get('product')
        if product_id:
            queryset = queryset.filter(product_id=product_id)

        horizon = self.request.query_params.get('horizon')
        if horizon:
            queryset = queryset.filter(forecast_horizon=horizon.upper())

        return queryset

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        GET /api/demand-predictions/summary/
        Returns KPI summary metrics for the shop owner demand dashboard.
        """
        shop_id = self._get_shop_id()
        if not shop_id and not request.user.is_admin:
            return Response({"detail": "Shop not associated with user."}, status=status.HTTP_400_BAD_REQUEST)

        predictions_qs = DemandPrediction.objects.all()
        if shop_id:
            predictions_qs = predictions_qs.filter(shop_id=shop_id)

        # 7-day horizon records
        horizon_7d_qs = predictions_qs.filter(forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D)
        horizon_30d_qs = predictions_qs.filter(forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D)

        total_predicted_products = horizon_7d_qs.values('product_id').distinct().count()
        sum_7d = horizon_7d_qs.aggregate(total=Sum('predicted_units'))['total'] or 0
        sum_30d = horizon_30d_qs.aggregate(total=Sum('predicted_units'))['total'] or 0
        high_demand_count = horizon_7d_qs.filter(predicted_units__gte=25).count()

        # Check spikes
        spikes_count = 0
        active_spikes = []
        for pred in horizon_7d_qs.select_related('product'):
            recent_sales = get_daily_sales_series(shop_id=pred.shop_id, product_id=pred.product_id, days=14)
            actuals = [d['units_sold'] for d in recent_sales]
            # Next day daily prediction
            next_day_pred = predictions_qs.filter(
                product_id=pred.product_id,
                forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
                target_date__gte=timezone.now().date()
            ).order_by('target_date').first()
            
            incoming_val = next_day_pred.predicted_units if next_day_pred else int(pred.predicted_units / 7)
            spike = detect_demand_spike(actuals, incoming_val)
            if spike['detected']:
                spikes_count += 1
                active_spikes.append({
                    'product_id': pred.product.id,
                    'product_name': pred.product.name,
                    'severity': spike['severity'],
                    'spike_percentage': spike['spike_percentage'],
                    'recent_mean': spike['recent_mean'],
                    'incoming_demand': spike['incoming_demand'],
                })

        # Active Model Info
        active_model = DemandModelMetadata.objects.filter(is_active=True).first()
        model_data = DemandModelMetadataSerializer(active_model).data if active_model else None

        return Response({
            "success": True,
            "summary": {
                "total_products_predicted": total_predicted_products,
                "high_demand_products": high_demand_count,
                "demand_spikes_count": spikes_count,
                "total_7d_forecast_units": sum_7d,
                "total_30d_forecast_units": sum_30d,
                "active_spikes": active_spikes,
                "model": model_data
            }
        })

    @action(detail=False, methods=['get'], url_path='forecast')
    def forecast(self, request):
        """
        GET /api/demand-predictions/forecast/?product_id=<id>&horizon=7|30
        Returns unified time series: historical daily sales (past 14-30 days)
        followed by future forecasted points (next 7 or 30 days) for Chart.js dual-series plotting.
        """
        shop_id = self._get_shop_id()
        product_id = request.query_params.get('product_id')
        horizon_days = int(request.query_params.get('horizon', 7))
        if horizon_days not in [7, 30]:
            horizon_days = 7

        if not product_id:
            return Response({"detail": "product_id parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(id=product_id).select_related('category', 'shop').first()
        if not product:
            return Response({"detail": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        # Cross-shop security guard
        if request.user.is_shop_owner and product.shop_id != shop_id:
            return Response({"detail": "Access denied to product from another shop."}, status=status.HTTP_403_FORBIDDEN)

        # Current stock
        inv = Inventory.objects.filter(shop_id=product.shop_id, product_id=product.id).first()
        current_stock = inv.current_stock if inv else 0

        # 1. Historical Actual Sales (past 21 days)
        recent_sales = get_daily_sales_series(shop_id=product.shop_id, product_id=product.id, days=21)
        history_points = [
            {
                "date": s['date'],
                "units_sold": s['units_sold'],
                "is_historical": True
            }
            for s in recent_sales
        ]

        # 2. Daily Forecast Points
        today = timezone.now().date()
        daily_preds = DemandPrediction.objects.filter(
            shop_id=product.shop_id,
            product_id=product.id,
            forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
            target_date__gte=today
        ).order_by('target_date')[:horizon_days]

        if not daily_preds.exists():
            return Response({
                "success": True,
                "status": "INSUFFICIENT_DATA",
                "message": f"Demand prediction unavailable for {product.name}. Insufficient historical sales data (minimum 30 days required).",
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "category": product.category.name if product.category else 'General',
                    "current_stock": current_stock,
                },
                "historical_series": history_points,
                "forecast_series": [],
                "forecast_7d": 0,
                "forecast_30d": 0,
                "trend": "INSUFFICIENT_DATA",
                "spike_info": {"detected": False, "severity": "NONE"}
            })

        forecast_points = [
            {
                "date": p.target_date.strftime('%Y-%m-%d'),
                "predicted_units": p.predicted_units,
                "confidence_low": float(p.confidence_interval_low),
                "confidence_high": float(p.confidence_interval_high),
                "confidence_score": float(p.confidence_score),
                "is_historical": False
            }
            for p in daily_preds
        ]

        # Aggregate 7d and 30d
        pred_7d_rec = DemandPrediction.objects.filter(
            shop_id=product.shop_id,
            product_id=product.id,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D
        ).first()
        pred_30d_rec = DemandPrediction.objects.filter(
            shop_id=product.shop_id,
            product_id=product.id,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D
        ).first()

        forecast_7d = pred_7d_rec.predicted_units if pred_7d_rec else sum(p['predicted_units'] for p in forecast_points[:7])
        forecast_30d = pred_30d_rec.predicted_units if pred_30d_rec else sum(p['predicted_units'] for p in forecast_points[:30])

        # Spike detection & Trend
        actuals = [s['units_sold'] for s in recent_sales]
        next_day_val = forecast_points[0]['predicted_units'] if forecast_points else 0
        spike_info = detect_demand_spike(actuals, next_day_val)
        trend = classify_demand_trend(actuals, [p['predicted_units'] for p in forecast_points[:7]])

        active_model = DemandModelMetadata.objects.filter(is_active=True).first()
        model_meta = DemandModelMetadataSerializer(active_model).data if active_model else None

        return Response({
            "success": True,
            "status": "AVAILABLE",
            "product": {
                "id": product.id,
                "name": product.name,
                "category": product.category.name if product.category else 'General',
                "current_stock": current_stock,
                "price": float(product.price),
            },
            "horizon_days": horizon_days,
            "historical_series": history_points,
            "forecast_series": forecast_points,
            "forecast_7d": forecast_7d,
            "forecast_30d": forecast_30d,
            "trend": trend,
            "spike_info": spike_info,
            "model_metadata": model_meta
        })

    @action(detail=False, methods=['get'], url_path='trends')
    def trends(self, request):
        """
        GET /api/demand-predictions/trends/
        Returns product-by-product trend classifications (INCREASING, STABLE, DECREASING, VOLATILE).
        """
        shop_id = self._get_shop_id()
        if not shop_id and not request.user.is_admin:
            return Response({"detail": "Shop not associated."}, status=status.HTTP_400_BAD_REQUEST)

        # Products belonging to this shop
        products = Product.objects.filter(is_active=True)
        if shop_id:
            products = products.filter(shop_id=shop_id)

        results = []
        for p in products[:50]:
            h7 = DemandPrediction.objects.filter(
                shop_id=p.shop_id,
                product_id=p.id,
                forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D
            ).first()
            h30 = DemandPrediction.objects.filter(
                shop_id=p.shop_id,
                product_id=p.id,
                forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D
            ).first()

            recent = get_daily_sales_series(shop_id=p.shop_id, product_id=p.id, days=14)
            actuals = [s['units_sold'] for s in recent]

            if h7:
                daily_pts = DemandPrediction.objects.filter(
                    shop_id=p.shop_id,
                    product_id=p.id,
                    forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
                    target_date__gte=timezone.now().date()
                ).order_by('target_date')[:7]
                fc_pts = [pt.predicted_units for pt in daily_pts]
                trend = classify_demand_trend(actuals, fc_pts)
                f7_units = h7.predicted_units
                f30_units = h30.predicted_units if h30 else f7_units * 4
                prediction_status = "Available"
            else:
                trend = "INSUFFICIENT_DATA"
                f7_units = None
                f30_units = None
                prediction_status = "Insufficient Data"

            inv = Inventory.objects.filter(shop_id=p.shop_id, product_id=p.id).first()
            results.append({
                "product_id": p.id,
                "product_name": p.name,
                "category": p.category.name if p.category else 'General',
                "current_stock": inv.current_stock if inv else 0,
                "forecast_7d": f7_units,
                "forecast_30d": f30_units,
                "trend": trend,
                "prediction_status": prediction_status
            })

        return Response({
            "success": True,
            "count": len(results),
            "trends": results
        })

    @action(detail=False, methods=['get'], url_path='spikes')
    def spikes(self, request):
        """
        GET /api/demand-predictions/spikes/
        Returns list of active demand spikes with percentage surges and severity.
        """
        shop_id = self._get_shop_id()
        if not shop_id and not request.user.is_admin:
            return Response({"detail": "Shop not associated."}, status=status.HTTP_400_BAD_REQUEST)

        horizon_7d_qs = DemandPrediction.objects.filter(
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D
        ).select_related('product', 'product__category')

        if shop_id:
            horizon_7d_qs = horizon_7d_qs.filter(shop_id=shop_id)

        spikes_list = []
        for pred in horizon_7d_qs:
            recent_sales = get_daily_sales_series(shop_id=pred.shop_id, product_id=pred.product_id, days=14)
            actuals = [d['units_sold'] for d in recent_sales]
            
            next_day_pred = DemandPrediction.objects.filter(
                shop_id=pred.shop_id,
                product_id=pred.product_id,
                forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
                target_date__gte=timezone.now().date()
            ).order_by('target_date').first()
            
            incoming_val = next_day_pred.predicted_units if next_day_pred else int(pred.predicted_units / 7)
            spike = detect_demand_spike(actuals, incoming_val)
            
            if spike['detected']:
                inv = Inventory.objects.filter(shop_id=pred.shop_id, product_id=pred.product_id).first()
                spikes_list.append({
                    "product_id": pred.product.id,
                    "product_name": pred.product.name,
                    "category": pred.product.category.name if pred.product.category else 'General',
                    "current_stock": inv.current_stock if inv else 0,
                    "recent_average_daily": spike['recent_mean'],
                    "expected_demand_units": spike['incoming_demand'],
                    "spike_percentage": spike['spike_percentage'],
                    "severity": spike['severity'],
                    "forecast_7d": pred.predicted_units
                })

        return Response({
            "success": True,
            "count": len(spikes_list),
            "spikes": spikes_list
        })

    @action(detail=False, methods=['get'], url_path='model-metrics')
    def model_metrics(self, request):
        """
        GET /api/demand-predictions/model-metrics/
        Retrieves active model training metadata, features, and evaluation scorecard.
        """
        active_model = DemandModelMetadata.objects.filter(is_active=True).first()
        if not active_model:
            return Response({
                "success": False,
                "detail": "No active trained demand model found. Train model using management command."
            }, status=status.HTTP_404_NOT_FOUND)

        serializer = DemandModelMetadataSerializer(active_model)
        return Response({
            "success": True,
            "model": serializer.data
        })


class RecommendationViewSet(viewsets.ModelViewSet):
    """
    Student & Shop Recommendation APIs.
    Supports GENERAL, ACADEMIC, POPULAR, SIMILAR, and BUY_AGAIN categories.
    """
    serializer_class = ProductRecommendationSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ProductRecommendation.objects.none()

        base_qs = ProductRecommendation.objects.select_related('product', 'shop', 'user').order_by('-score')

        if user.is_admin:
            queryset = base_qs.all()
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            queryset = base_qs.filter(Q(user=user) | Q(user__isnull=True))

        rec_type = self.request.query_params.get('type')
        if rec_type:
            queryset = queryset.filter(recommendation_type=rec_type.upper())

        return queryset

    @action(detail=False, methods=['get'], url_path='shop-restock', permission_classes=[permissions.IsAuthenticated, IsShopOwnerOrAdmin])
    def shop_restock(self, request):
        """
        GET /api/recommendations/shop-restock/
        Retrieves restocking purchase recommendations for shopkeepers.
        """
        user = request.user
        qs = PurchaseRecommendation.objects.select_related('shop', 'product').order_by('-urgency_level', '-created_at')

        if user.is_admin:
            shop_id = request.query_params.get('shop')
            if shop_id:
                qs = qs.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            qs = qs.filter(shop__owner=user)
        else:
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        urgency = request.query_params.get('urgency')
        if urgency:
            qs = qs.filter(urgency_level=urgency.upper())

        serializer = PurchaseRecommendationSerializer(qs, many=True)
        return Response({
            "success": True,
            "count": qs.count(),
            "recommendations": serializer.data
        })


class PurchaseRecommendationViewSet(viewsets.ModelViewSet):
    """
    Smart Purchase Advisor API Endpoint.
    Provides statistical reorder recommendations, manual overrides, PO generation,
    supplier comparisons, and demand audit summaries for campus store managers.
    """
    serializer_class = PurchaseRecommendationSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action == 'admin_analytics':
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        return [permission() for permission in permission_classes]

    def _get_shop(self, request):
        user = request.user
        if user.is_admin:
            shop_id = request.query_params.get('shop') or request.data.get('shop')
            if shop_id:
                return Shop.objects.filter(id=shop_id).first()
            return None
        elif user.is_shop_owner:
            if hasattr(user, 'owned_shop') and user.owned_shop:
                return user.owned_shop
            return Shop.objects.filter(owner=user).first()
        return None

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return PurchaseRecommendation.objects.none()

        base_qs = PurchaseRecommendation.objects.select_related(
            'shop',
            'product',
            'product__category',
            'supplier',
            'purchase_order',
            'overridden_by'
        ).order_by('-priority', '-recommended_quantity')

        if user.is_admin:
            queryset = base_qs.all()
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                queryset = queryset.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            return PurchaseRecommendation.objects.none()

        # Status filtering: default to actionable recommendations unless explicitly requested
        status_param = self.request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            queryset = queryset.filter(status=status_param.upper())
        elif not status_param:
            # By default show actionable items in the primary list
            queryset = queryset.filter(status__in=[
                PurchaseRecommendation.Status.PENDING,
                PurchaseRecommendation.Status.VIEWED,
                PurchaseRecommendation.Status.ADJUSTED,
            ])

        priority = self.request.query_params.get('priority')
        if priority:
            queryset = queryset.filter(priority=priority.upper())

        reorder_status = self.request.query_params.get('reorder_status')
        if reorder_status:
            queryset = queryset.filter(reorder_status=reorder_status.upper())

        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(product__category_id=category)

        supplier = self.request.query_params.get('supplier')
        if supplier:
            queryset = queryset.filter(supplier_id=supplier)

        horizon = self.request.query_params.get('horizon')
        if horizon:
            queryset = queryset.filter(planning_horizon=horizon.upper())

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(product__name__icontains=search) | Q(product__sku__icontains=search)
            )

        return queryset

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        GET /api/purchase-recommendations/summary/
        Returns aggregate KPI metrics for top summary cards.
        """
        shop = self._get_shop(request)
        if not shop and not request.user.is_admin:
            return Response({"detail": "Shop not identified."}, status=status.HTTP_400_BAD_REQUEST)

        qs = PurchaseRecommendation.objects.all()
        if shop:
            qs = qs.filter(shop=shop)

        active_recs = qs.filter(status__in=[
            PurchaseRecommendation.Status.PENDING,
            PurchaseRecommendation.Status.VIEWED,
            PurchaseRecommendation.Status.ADJUSTED
        ])

        items_requiring_purchase = active_recs.filter(recommended_quantity__gt=0).count()
        critical_items = active_recs.filter(priority=PurchaseRecommendation.Priority.CRITICAL).count()
        high_demand_items = active_recs.filter(
            Q(predicted_demand_30d__gte=150) | Q(stock_movement_type=PurchaseRecommendation.MovementType.FAST_MOVING)
        ).count()
        overstocked_items = qs.filter(reorder_status=PurchaseRecommendation.ReorderStatus.OVERSTOCKED).count()
        dead_stock_items = qs.filter(stock_movement_type=PurchaseRecommendation.MovementType.POTENTIAL_DEAD_STOCK).count()
        demand_spikes = active_recs.filter(demand_spike_alert=True).count()

        total_cost = sum(r.estimated_purchase_cost for r in active_recs.filter(recommended_quantity__gt=0))

        return Response({
            "success": True,
            "summary": {
                "items_requiring_purchase": items_requiring_purchase,
                "critical_items": critical_items,
                "estimated_purchase_cost": float(total_cost),
                "high_demand_items": high_demand_items,
                "overstocked_items": overstocked_items,
                "potential_dead_stock": dead_stock_items,
                "demand_spikes_count": demand_spikes,
            }
        })

    @action(detail=True, methods=['post'], url_path='accept')
    def accept(self, request, id=None):
        """
        POST /api/purchase-recommendations/{id}/accept/
        Converts a single recommendation into a Draft Purchase Order in the PO system.
        """
        rec = self.get_object()
        if request.user.is_shop_owner and rec.shop.owner != request.user:
            return Response({"detail": "Access denied to other shops' recommendations."}, status=status.HTTP_403_FORBIDDEN)

        try:
            created_pos = create_purchase_orders_from_recommendations(rec.shop, [rec.id], request.user)
            rec.refresh_from_db()
            po = created_pos[0] if created_pos else None
            return Response({
                "success": True,
                "message": f"Draft Purchase Order {po.po_number if po else ''} created successfully.",
                "purchase_order_id": po.id if po else None,
                "po_number": po.po_number if po else None,
                "recommendation": PurchaseRecommendationSerializer(rec).data
            })
        except ValueError as e:
            return Response({"success": False, "detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='bulk-accept')
    def bulk_accept(self, request):
        """
        POST /api/purchase-recommendations/bulk-accept/
        Converts multiple selected recommendations into Draft Purchase Orders.
        Automatically groups items by supplier to generate separate POs per vendor.
        """
        serializer = BulkAcceptRecommendationsSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        rec_ids = serializer.validated_data['recommendation_ids']
        shop = self._get_shop(request)
        if not shop:
            return Response({"detail": "Shop not identified."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            created_pos = create_purchase_orders_from_recommendations(shop, rec_ids, request.user)
            return Response({
                "success": True,
                "message": f"Successfully created {len(created_pos)} draft purchase order(s) grouped by supplier.",
                "created_pos_count": len(created_pos),
                "purchase_orders": [
                    {
                        "id": po.id,
                        "po_number": po.po_number,
                        "supplier_name": po.supplier.name,
                        "items_count": po.items.count(),
                        "grand_total": float(po.grand_total)
                    } for po in created_pos
                ]
            })
        except ValueError as e:
            return Response({"success": False, "detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='override')
    def override(self, request, id=None):
        """
        POST /api/purchase-recommendations/{id}/override/
        Records manual quantity adjustment with merchant rationale and audit logging.
        """
        rec = self.get_object()
        if request.user.is_shop_owner and rec.shop.owner != request.user:
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        serializer = PurchaseRecommendationOverrideSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        manual_qty = serializer.validated_data['manual_quantity']
        reason = serializer.validated_data.get('override_reason', '')

        rec.manual_quantity = manual_qty
        rec.override_reason = reason
        rec.overridden_by = request.user
        rec.overridden_at = timezone.now()
        rec.status = PurchaseRecommendation.Status.ADJUSTED
        rec.save()

        return Response({
            "success": True,
            "message": f"Quantity overridden to {manual_qty} units with rationale recorded.",
            "recommendation": PurchaseRecommendationSerializer(rec).data
        })

    @action(detail=True, methods=['post'], url_path='dismiss')
    def dismiss(self, request, id=None):
        """
        POST /api/purchase-recommendations/{id}/dismiss/
        Marks a recommendation as dismissed.
        """
        rec = self.get_object()
        if request.user.is_shop_owner and rec.shop.owner != request.user:
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        rec.status = PurchaseRecommendation.Status.DISMISSED
        rec.save(update_fields=['status', 'updated_at'])
        return Response({
            "success": True,
            "message": f"Recommendation for {rec.product.name} dismissed.",
            "recommendation": PurchaseRecommendationSerializer(rec).data
        })

    @action(detail=True, methods=['get'], url_path='supplier-comparison')
    def supplier_comparison(self, request, id=None):
        """
        GET /api/purchase-recommendations/{id}/supplier-comparison/
        Returns comparative side-by-side analysis of all suppliers mapped to this product.
        """
        rec = self.get_object()
        if request.user.is_shop_owner and rec.shop.owner != request.user:
            return Response({"detail": "Access denied."}, status=status.HTTP_403_FORBIDDEN)

        ranking = rank_suppliers_for_product(rec.product, rec.shop, target_quantity=rec.effective_quantity)
        return Response({
            "success": True,
            "product_id": rec.product.id,
            "product_name": rec.product.name,
            "current_recommended_supplier_id": rec.supplier_id if rec.supplier else None,
            "suppliers": ranking.get('suppliers_ranked', []),
            "recommended_supplier": ranking.get('recommended_supplier')
        })

    @action(detail=False, methods=['get'], url_path='history')
    def history(self, request):
        """
        GET /api/purchase-recommendations/history/
        Returns historical recommendations (ordered, accepted, adjusted, or dismissed).
        """
        shop = self._get_shop(request)
        if not shop and not request.user.is_admin:
            return Response({"detail": "Shop not identified."}, status=status.HTTP_400_BAD_REQUEST)

        qs = PurchaseRecommendation.objects.select_related(
            'shop', 'product', 'product__category', 'supplier', 'purchase_order', 'overridden_by'
        )
        if shop:
            qs = qs.filter(shop=shop)

        qs = qs.filter(status__in=[
            PurchaseRecommendation.Status.ACCEPTED,
            PurchaseRecommendation.Status.ORDER_CREATED,
            PurchaseRecommendation.Status.DISMISSED,
            PurchaseRecommendation.Status.ADJUSTED,
            PurchaseRecommendation.Status.EXPIRED,
        ]).order_by('-updated_at')

        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(product__name__icontains=search) | Q(product__sku__icontains=search)
            )

        status_param = request.query_params.get('status')
        if status_param and status_param.upper() != 'ALL':
            qs = qs.filter(status=status_param.upper())

        serializer = PurchaseRecommendationSerializer(qs, many=True)
        return Response({
            "success": True,
            "count": qs.count(),
            "history": serializer.data
        })

    @action(detail=False, methods=['post'], url_path='refresh')
    def refresh(self, request):
        """
        POST /api/purchase-recommendations/refresh/
        Recalculates and refreshes recommendations for all active products in shop.
        """
        shop = self._get_shop(request)
        if not shop:
            return Response({"detail": "Shop not identified."}, status=status.HTTP_400_BAD_REQUEST)

        horizon = request.data.get('horizon', '30_DAYS')
        try:
            service_level = float(request.data.get('service_level', 0.95))
        except (ValueError, TypeError):
            service_level = 0.95

        inventories = Inventory.objects.filter(shop=shop, is_active=True).select_related('product', 'product__category')
        recs_updated = 0
        for inv in inventories:
            rec_data = generate_recommendation_for_inventory(inv, planning_horizon=horizon, service_level=service_level)
            save_or_update_recommendation(rec_data)
            recs_updated += 1

        return Response({
            "success": True,
            "message": f"Recalculated reorder recommendations for {recs_updated} product(s).",
            "count": recs_updated
        })

    @action(detail=False, methods=['get'], url_path='admin-analytics')
    def admin_analytics(self, request):
        """
        GET /api/purchase-recommendations/admin-analytics/
        Platform-wide procurement analytics for administrators.
        """
        if not request.user.is_admin:
            return Response({"detail": "Admin access required."}, status=status.HTTP_403_FORBIDDEN)

        total_recs = PurchaseRecommendation.objects.count()
        critical_count = PurchaseRecommendation.objects.filter(priority=PurchaseRecommendation.Priority.CRITICAL).count()
        overstocked_count = PurchaseRecommendation.objects.filter(reorder_status=PurchaseRecommendation.ReorderStatus.OVERSTOCKED).count()
        dead_stock_count = PurchaseRecommendation.objects.filter(stock_movement_type=PurchaseRecommendation.MovementType.POTENTIAL_DEAD_STOCK).count()

        pending_recs = PurchaseRecommendation.objects.filter(status__in=[
            PurchaseRecommendation.Status.PENDING,
            PurchaseRecommendation.Status.VIEWED,
            PurchaseRecommendation.Status.ADJUSTED
        ])
        total_value = sum(r.estimated_purchase_cost for r in pending_recs)

        shops = Shop.objects.all()
        shop_breakdown = []
        for s in shops:
            s_recs = pending_recs.filter(shop=s)
            s_crit = s_recs.filter(priority=PurchaseRecommendation.Priority.CRITICAL).count()
            s_val = sum(r.estimated_purchase_cost for r in s_recs)
            shop_breakdown.append({
                "shop_id": s.id,
                "shop_name": s.name,
                "pending_recommendations_count": s_recs.count(),
                "critical_count": s_crit,
                "estimated_value": float(s_val)
            })

        return Response({
            "success": True,
            "analytics": {
                "total_recommendations": total_recs,
                "critical_recommendations": critical_count,
                "estimated_campus_purchase_value": float(total_value),
                "overstocked_count": overstocked_count,
                "potential_dead_stock_count": dead_stock_count,
                "shops_breakdown": shop_breakdown
            }
        })

