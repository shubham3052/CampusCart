import csv
from datetime import timedelta
from decimal import Decimal
from django.http import HttpResponse
from django.db import transaction
from django.db.models import F, Q, Sum, Count
from django.utils import timezone
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError

from django.core.cache import cache
from products.models import Product
from .models import (
    Inventory,
    InventoryTransaction,
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryReturn,
)
from .serializers import (
    InventorySerializer,
    StockAdjustmentSerializer,
    DirectStockReceiveSerializer,
    DamageStockSerializer,
    InventoryTransactionSerializer,
    SupplierSerializer,
    SupplierProductSerializer,
    PurchaseOrderSerializer,
    PurchaseOrderApprovalSerializer,
    PurchaseOrderRejectionSerializer,
    PurchaseOrderReceiveSerializer,
    InventoryReturnSerializer,
)
from .supplier_intelligence import (
    get_supplier_performance,
    calculate_product_cost_metrics,
    rank_suppliers_for_product,
    generate_reorder_recommendations,
)
from .sales_aggregation import get_daily_sales_series, get_product_velocity_ranking
from users.permissions import IsShopOwnerOrAdmin, IsShopEntityOwnerOrAdmin, IsAdmin
from notifications.models import Notification
from users.models import AuditLog
from users.services.audit_service import AuditService


def send_inventory_alert_if_needed(inventory, user):
    """
    Dispatches deduplicated notifications to shop owners when stock drops to low or out-of-stock levels.
    """
    shop = inventory.shop
    owner = shop.owner
    if not owner:
        return

    # Check if an unread notification of this type already exists in the last 2 hours to avoid spamming
    two_hours_ago = timezone.now() - timedelta(hours=2)
    recent_alert = Notification.objects.filter(
        recipient=owner,
        notification_type=Notification.NotificationType.LOW_STOCK,
        reference_id=str(inventory.id),
        created_at__gte=two_hours_ago
    ).exists()

    if recent_alert:
        return

    if inventory.current_stock == 0:
        Notification.objects.create(
            recipient=owner,
            title=f"Out of Stock Alert: {inventory.product.name}",
            message=f"{inventory.product.name} at {shop.name} is completely out of stock. Immediate replenishment recommended.",
            notification_type=Notification.NotificationType.LOW_STOCK,
            reference_id=str(inventory.id)
        )
    elif inventory.current_stock <= inventory.reorder_level:
        Notification.objects.create(
            recipient=owner,
            title=f"Low Stock Alert: {inventory.product.name}",
            message=f"{inventory.product.name} at {shop.name} has reached {inventory.current_stock} units (Reorder level: {inventory.reorder_level}).",
            notification_type=Notification.NotificationType.LOW_STOCK,
            reference_id=str(inventory.id)
        )


class InventoryViewSet(viewsets.ModelViewSet):
    """
    Advanced Inventory Management ViewSet with Safe Stock Adjustments,
    Procurement Receival, Damaged Discards, and Historical Intelligence Analytics.
    """
    serializer_class = InventorySerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Inventory.objects.none()

        base_qs = Inventory.objects.select_related('shop', 'product', 'product__category').order_by('shop', 'product__name')

        if user.is_admin:
            queryset = base_qs.all()
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                queryset = queryset.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            return Inventory.objects.none()

        # Status filtering
        status_param = self.request.query_params.get('status')
        if status_param == 'low':
            queryset = queryset.filter(
                current_stock__gt=0
            ).filter(
                Q(current_stock__lte=F('reorder_level')) | Q(current_stock__lte=F('reorder_threshold'))
            )
        elif status_param == 'out':
            queryset = queryset.filter(current_stock=0)
        elif status_param == 'overstocked':
            queryset = queryset.filter(maximum_stock__gt=0, current_stock__gt=F('maximum_stock'))
        elif status_param == 'in_stock':
            queryset = queryset.filter(current_stock__gt=0)

        # Search query
        search_query = self.request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(product__name__icontains=search_query) |
                Q(product__sku__icontains=search_query) |
                Q(product__category__name__icontains=search_query)
            )

        # Category filter
        cat_id = self.request.query_params.get('category')
        if cat_id:
            queryset = queryset.filter(product__category_id=cat_id)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not user.is_admin and shop.owner != user:
            raise PermissionDenied("You can only create inventory for your own shop.")
        serializer.save()

    def _execute_adjustment(self, request, inventory):
        """Unified atomic adjustment logic shared between /adjust/ and legacy /adjust-stock/."""
        if not request.user.is_admin and inventory.shop.owner != request.user:
            raise PermissionDenied("You can only adjust stock for your own shop.")

        serializer = StockAdjustmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        qty_change = serializer.validated_data['quantity_change']
        trans_type = serializer.validated_data.get('transaction_type', InventoryTransaction.TransactionType.ADJUSTMENT)
        reason = serializer.validated_data.get('reason', '')
        ref_id = serializer.validated_data.get('reference_id', '')
        notes = serializer.validated_data.get('notes', '')

        with transaction.atomic():
            locked_inv = Inventory.objects.select_for_update().get(id=inventory.id)
            stock_before = locked_inv.current_stock
            new_stock = stock_before + qty_change

            if new_stock < 0:
                return Response(
                    {
                        "success": False,
                        "message": f"Stock cannot be negative. Current stock is {stock_before}, attempted deduction is {abs(qty_change)}."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            locked_inv.current_stock = new_stock
            locked_inv.last_stock_update = timezone.now()
            if qty_change > 0:
                locked_inv.last_restocked_at = timezone.now()
            locked_inv.save()

            # Record immutable audit transaction
            tx = InventoryTransaction.objects.create(
                inventory=locked_inv,
                transaction_type=trans_type,
                quantity_change=qty_change,
                stock_before=stock_before,
                stock_after=new_stock,
                reference_type='MANUAL_ADJUSTMENT',
                reference_id=ref_id or f"ADJ-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                reason=reason or 'Manual stock adjustment',
                notes=notes,
                performed_by=request.user
            )

            # Check threshold notification
            send_inventory_alert_if_needed(locked_inv, request.user)

            # Record platform audit log
            AuditService.log(
                action=AuditLog.Action.INVENTORY_ADJUSTED,
                actor=request.user,
                target_model='Inventory',
                target_id=str(locked_inv.id),
                metadata={
                    "shop_id": locked_inv.shop_id,
                    "product_id": locked_inv.product_id,
                    "quantity_change": qty_change,
                    "stock_before": stock_before,
                    "stock_after": new_stock,
                    "reason": reason or 'Manual stock adjustment'
                },
                request=request
            )

        return Response({
            "success": True,
            "message": f"Stock successfully updated from {stock_before} to {new_stock}.",
            "inventory": InventorySerializer(locked_inv).data,
            "transaction": InventoryTransactionSerializer(tx).data
        })

    @action(detail=True, methods=['post'], url_path='adjust')
    def adjust(self, request, id=None):
        """POST /api/inventory/{id}/adjust/"""
        inventory = self.get_object()
        return self._execute_adjustment(request, inventory)

    @action(detail=True, methods=['post'], url_path='adjust-stock')
    def adjust_stock(self, request, id=None):
        """POST /api/inventory/{id}/adjust-stock/ (Legacy alias maintained for test suite)."""
        inventory = self.get_object()
        return self._execute_adjustment(request, inventory)

    @action(detail=True, methods=['post'], url_path='receive')
    def receive_stock(self, request, id=None):
        """
        POST /api/inventory/{id}/receive/
        Records direct supplier inbound stock without requiring an explicit PO.
        """
        inventory = self.get_object()
        if not request.user.is_admin and inventory.shop.owner != request.user:
            raise PermissionDenied("You can only receive stock for your own shop.")

        serializer = DirectStockReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quantity = serializer.validated_data['quantity']
        unit_cost = serializer.validated_data.get('unit_cost')
        invoice_number = serializer.validated_data.get('invoice_number', '')
        notes = serializer.validated_data.get('notes', '')

        with transaction.atomic():
            locked_inv = Inventory.objects.select_for_update().get(id=inventory.id)
            stock_before = locked_inv.current_stock
            new_stock = stock_before + quantity

            locked_inv.current_stock = new_stock
            locked_inv.last_restocked_at = timezone.now()
            locked_inv.last_stock_update = timezone.now()
            if unit_cost is not None:
                locked_inv.unit_cost = unit_cost
            locked_inv.save()

            tx = InventoryTransaction.objects.create(
                inventory=locked_inv,
                transaction_type=InventoryTransaction.TransactionType.RESTOCK,
                quantity_change=quantity,
                stock_before=stock_before,
                stock_after=new_stock,
                reference_type='DIRECT_RECEIVE',
                reference_id=invoice_number or f"REC-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                reason='Direct supplier delivery received',
                notes=notes,
                performed_by=request.user
            )

        return Response({
            "success": True,
            "message": f"Successfully received {quantity} units. New stock is {new_stock}.",
            "inventory": InventorySerializer(locked_inv).data,
            "transaction": InventoryTransactionSerializer(tx).data
        })

    @action(detail=True, methods=['post'], url_path='damage')
    def report_damage(self, request, id=None):
        """
        POST /api/inventory/{id}/damage/
        Safely records damaged or expired stock and discards it from inventory balance.
        """
        inventory = self.get_object()
        if not request.user.is_admin and inventory.shop.owner != request.user:
            raise PermissionDenied("You can only report damage for your own shop.")

        serializer = DamageStockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        quantity = serializer.validated_data['quantity']
        reason = serializer.validated_data['reason']
        notes = serializer.validated_data.get('notes', '')

        with transaction.atomic():
            locked_inv = Inventory.objects.select_for_update().get(id=inventory.id)
            stock_before = locked_inv.current_stock

            if locked_inv.current_stock < quantity:
                return Response(
                    {
                        "success": False,
                        "message": f"Cannot discard {quantity} units. Current stock is only {stock_before}."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

            new_stock = stock_before - quantity
            locked_inv.current_stock = new_stock
            locked_inv.last_stock_update = timezone.now()
            locked_inv.save()

            tx = InventoryTransaction.objects.create(
                inventory=locked_inv,
                transaction_type=InventoryTransaction.TransactionType.DAMAGE,
                quantity_change=-quantity,
                stock_before=stock_before,
                stock_after=new_stock,
                reference_type='DAMAGE_DISCARD',
                reference_id=f"DMG-{timezone.now().strftime('%Y%m%d%H%M%S')}",
                reason=reason,
                notes=notes,
                performed_by=request.user
            )

            # Record return model entry for audit trail
            InventoryReturn.objects.create(
                shop=locked_inv.shop,
                product=locked_inv.product,
                quantity=quantity,
                return_type=InventoryReturn.ReturnType.DAMAGED,
                status=InventoryReturn.ReturnStatus.RECEIVED,
                reason=reason,
                notes=notes,
                processed_by=request.user
            )

            send_inventory_alert_if_needed(locked_inv, request.user)

        return Response({
            "success": True,
            "message": f"Recorded {quantity} damaged units discarded. Remaining stock: {new_stock}.",
            "inventory": InventorySerializer(locked_inv).data,
            "transaction": InventoryTransactionSerializer(tx).data
        })

    @action(detail=True, methods=['get'], url_path='history')
    def stock_history(self, request, id=None):
        """
        GET /api/inventory/{id}/history/
        Returns chronological immutable transaction history for this inventory item.
        """
        inventory = self.get_object()
        transactions = inventory.transactions.select_related('performed_by').order_by('-created_at')
        page = self.paginate_queryset(transactions)
        if page is not None:
            serializer = InventoryTransactionSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = InventoryTransactionSerializer(transactions, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='low-stock')
    def low_stock(self, request):
        """GET /api/inventory/low-stock/"""
        qs = self.get_queryset().filter(
            current_stock__gt=0
        ).filter(
            Q(current_stock__lte=F('reorder_level')) | Q(current_stock__lte=F('reorder_threshold'))
        )
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='out-of-stock')
    def out_of_stock(self, request):
        """GET /api/inventory/out-of-stock/"""
        qs = self.get_queryset().filter(current_stock=0)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/inventory/analytics/
        Aggregates operational inventory statistics, cost valuation, and product movement rankings.
        """
        user = request.user
        qs = self.get_queryset()

        # Determine target shop for calculations
        shop_id = request.query_params.get('shop')
        if not shop_id and user.is_shop_owner:
            user_shop = getattr(user, 'shops', None)
            first_shop = user_shop.first() if user_shop else None
            shop_id = first_shop.id if first_shop else None

        total_products = qs.count()
        total_units = qs.aggregate(sum_units=Sum('current_stock'))['sum_units'] or 0

        # Calculate total inventory valuation based on unit_cost
        total_value = Decimal('0.00')
        for inv in qs.only('current_stock', 'unit_cost'):
            total_value += inv.stock_value

        low_stock_count = qs.filter(
            current_stock__gt=0
        ).filter(
            Q(current_stock__lte=F('reorder_level')) | Q(current_stock__lte=F('reorder_threshold'))
        ).count()

        out_of_stock_count = qs.filter(current_stock=0).count()
        overstocked_count = qs.filter(maximum_stock__gt=0, current_stock__gt=F('maximum_stock')).count()

        pending_po_count = 0
        if shop_id:
            pending_po_count = PurchaseOrder.objects.filter(
                shop_id=shop_id,
                status__in=[PurchaseOrder.Status.PLACED, PurchaseOrder.Status.PARTIALLY_RECEIVED]
            ).count()

        # Product velocity rankings (Fast / Slow moving based on trailing 30 days)
        velocity_list = []
        if shop_id:
            velocity_list = get_product_velocity_ranking(shop_id=shop_id, days=30)

        fast_moving = [p for p in velocity_list if p['velocity_tag'] == 'FAST_MOVING'][:5]
        slow_moving = [p for p in velocity_list if p['velocity_tag'] == 'SLOW_MOVING'][:5]

        # 30-day movement breakdown by transaction type
        thirty_days_ago = timezone.now() - timedelta(days=30)
        movement_qs = InventoryTransaction.objects.filter(
            inventory__in=qs,
            created_at__gte=thirty_days_ago
        ).values('transaction_type').annotate(
            tx_count=Count('id'),
            units=Sum('quantity_change')
        )

        movements = {
            m['transaction_type']: {
                'count': m['tx_count'],
                'units': abs(m['units']) if m['units'] else 0
            }
            for m in movement_qs
        }

        return Response({
            "total_products": total_products,
            "total_stock_units": total_units,
            "estimated_inventory_cost_value": float(total_value),
            "low_stock_count": low_stock_count,
            "out_of_stock_count": out_of_stock_count,
            "overstocked_count": overstocked_count,
            "pending_purchase_orders": pending_po_count,
            "fast_moving_products": fast_moving,
            "slow_moving_products": slow_moving,
            "movements_30_days": movements
        })

    @action(detail=False, methods=['get'], url_path='daily-sales')
    def daily_sales(self, request):
        """
        GET /api/inventory/daily-sales/
        Historical time-series endpoint serving units sold per day for clean ML model input in Step 16/17.
        """
        user = request.user
        shop_id = request.query_params.get('shop')
        product_id = request.query_params.get('product')
        days = int(request.query_params.get('days', 30))

        if not shop_id and user.is_shop_owner:
            user_shop = getattr(user, 'shops', None)
            first_shop = user_shop.first() if user_shop else None
            shop_id = first_shop.id if first_shop else None

        if not shop_id:
            return Response({"error": "shop parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        series = get_daily_sales_series(shop_id=shop_id, product_id=product_id, days=days)
        return Response({
            "shop_id": shop_id,
            "product_id": product_id,
            "days_count": len(series),
            "series": series
        })

    @action(detail=False, methods=['get'], url_path='export-csv')
    def export_csv(self, request):
        """
        GET /api/inventory/export-csv/
        Exports shop-isolated inventory report as a downloadable CSV.
        """
        queryset = self.get_queryset()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="inventory_report_{timezone.now().strftime("%Y%m%d")}.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Shop', 'Product Name', 'SKU', 'Category',
            'Current Stock', 'Reserved Stock', 'Available Stock',
            'Min Stock', 'Reorder Level', 'Max Stock',
            'Unit Cost (₹)', 'Est. Stock Value (₹)', 'Status'
        ])

        for inv in queryset:
            writer.writerow([
                inv.shop.name,
                inv.product.name,
                inv.product.sku,
                inv.product.category.name if inv.product.category else 'General',
                inv.current_stock,
                inv.reserved_stock,
                inv.available_stock,
                inv.minimum_stock,
                inv.reorder_level,
                inv.maximum_stock,
                inv.unit_cost,
                inv.stock_value,
                inv.stock_status
            ])

        return response

    @action(detail=True, methods=['get'], url_path='cost-history')
    def cost_history(self, request, id=None):
        """
        GET /api/inventory/{id}/cost-history/
        Returns comprehensive purchase cost trajectory (last, avg, min, max, monthly trends).
        """
        inventory = self.get_object()
        data = calculate_product_cost_metrics(inventory.product, inventory.shop)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='reorder-recommendations')
    def reorder_recommendations(self, request):
        """
        GET /api/inventory/reorder-recommendations/
        Generates procurement replenishment recommendations for low-stock products with supplier ranking.
        """
        user = request.user
        shop_id = request.query_params.get('shop')
        if not shop_id and user.is_shop_owner:
            user_shop = getattr(user, 'shops', None)
            first_shop = user_shop.first() if user_shop else None
            shop_id = first_shop.id if first_shop else None

        if not shop_id:
            return Response({"error": "shop parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        from shops.models import Shop
        try:
            shop = Shop.objects.get(id=shop_id)
            if not user.is_admin and shop.owner != user:
                raise PermissionDenied("You can only view recommendations for your own shop.")
        except Shop.DoesNotExist:
            return Response({"error": "Shop not found."}, status=status.HTTP_404_NOT_FOUND)

        recommendations = generate_reorder_recommendations(shop)
        return Response({
            "shop_id": shop.id,
            "shop_name": shop.name,
            "count": len(recommendations),
            "recommendations": recommendations
        })


class SupplierViewSet(viewsets.ModelViewSet):
    """
    Supplier directory management with strict shop-owner isolation,
    performance intelligence, and transparent vendor recommendation scoring.
    """
    serializer_class = SupplierSerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Supplier.objects.none()

        base_qs = Supplier.objects.select_related('shop').prefetch_related('supplier_products', 'supplier_products__product').order_by('name')

        if user.is_admin:
            queryset = base_qs.all()
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                queryset = queryset.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            return Supplier.objects.none()

        # Status filter
        active_param = self.request.query_params.get('is_active')
        if active_param is not None:
            queryset = queryset.filter(is_active=(active_param.lower() in ['true', '1']))

        # Search query
        search_query = self.request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(name__icontains=search_query) |
                Q(business_name__icontains=search_query) |
                Q(contact_person__icontains=search_query) |
                Q(email__icontains=search_query) |
                Q(phone__icontains=search_query)
            )

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not user.is_admin and shop.owner != user:
            raise PermissionDenied("You can only add suppliers for your own shop.")
        serializer.save()

    @action(detail=True, methods=['get'], url_path='performance')
    def performance(self, request, id=None):
        """
        GET /api/suppliers/{id}/performance/
        Returns comprehensive supplier scorecard calculated dynamically from actual PO data.
        """
        supplier = self.get_object()
        perf = get_supplier_performance(supplier, shop=supplier.shop)
        return Response(perf)

    @action(detail=False, methods=['get'], url_path='performance-summary')
    def performance_summary(self, request):
        """
        GET /api/suppliers/performance-summary/?shop={id}
        Returns performance scorecards for all suppliers in the shop.
        """
        user = request.user
        shop_id = request.query_params.get('shop')
        qs = self.get_queryset()
        if shop_id:
            qs = qs.filter(shop_id=shop_id)

        summaries = [get_supplier_performance(s, shop=s.shop) for s in qs]
        return Response(summaries)

    @action(detail=False, methods=['get'], url_path='recommend')
    def recommend(self, request):
        """
        GET /api/suppliers/recommend/?product_id={id}&quantity={qty}&shop={id}
        Rule-based multi-factor supplier selection for a product.
        """
        product_id = request.query_params.get('product_id')
        if not product_id:
            return Response({"error": "product_id parameter is required."}, status=status.HTTP_400_BAD_REQUEST)

        qty = int(request.query_params.get('quantity', 1))

        user = request.user
        shop_id = request.query_params.get('shop')
        if not shop_id and user.is_shop_owner:
            user_shop = getattr(user, 'shops', None)
            first_shop = user_shop.first() if user_shop else None
            shop_id = first_shop.id if first_shop else None

        from shops.models import Shop
        try:
            shop = Shop.objects.get(id=shop_id)
            if not user.is_admin and shop.owner != user:
                raise PermissionDenied("You can only access suppliers for your own shop.")
        except Shop.DoesNotExist:
            return Response({"error": "Shop not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            prod = Product.objects.get(id=product_id, shop=shop)
        except Product.DoesNotExist:
            return Response({"error": "Product not found in this shop."}, status=status.HTTP_404_NOT_FOUND)

        recommendation = rank_suppliers_for_product(prod, shop, target_quantity=qty)
        return Response(recommendation)

    @action(detail=True, methods=['post'], url_path='add-product')
    def add_product(self, request, id=None):
        """
        POST /api/suppliers/{id}/add-product/
        Maps a product to this supplier with pricing, lead time, and MOQ.
        """
        supplier = self.get_object()
        product_id = request.data.get('product_id')
        purchase_price = request.data.get('purchase_price', '0.00')
        lead_time_days = int(request.data.get('lead_time_days', 3))
        moq = int(request.data.get('minimum_order_quantity', 1))
        is_pref = bool(request.data.get('is_preferred', False))
        sku = request.data.get('supplier_product_code', '')

        if not product_id:
            return Response({"error": "product_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prod = Product.objects.get(id=product_id, shop=supplier.shop)
        except Product.DoesNotExist:
            return Response({"error": "Product does not exist in this shop."}, status=status.HTTP_404_NOT_FOUND)

        # If marking as preferred, clear any existing preferred supplier for this product in the shop
        if is_pref:
            SupplierProduct.objects.filter(shop=supplier.shop, product=prod).update(is_preferred=False)

        sp, created = SupplierProduct.objects.update_or_create(
            supplier=supplier,
            product=prod,
            defaults={
                'shop': supplier.shop,
                'supplier_product_code': sku,
                'purchase_price': Decimal(str(purchase_price)),
                'lead_time_days': lead_time_days,
                'minimum_order_quantity': moq,
                'is_preferred': is_pref,
                'is_active': True,
            }
        )
        return Response({
            "success": True,
            "message": f"Product {prod.name} successfully mapped to {supplier.name}.",
            "supplier_product": SupplierProductSerializer(sp).data
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class PurchaseOrderViewSet(viewsets.ModelViewSet):
    """
    Purchase Order workflow management supporting complete lifecycle:
    DRAFT -> PENDING_APPROVAL -> APPROVED -> ORDERED -> PARTIALLY_RECEIVED -> RECEIVED (plus REJECTED, CANCELLED).
    Enforces transaction safety, object-level RBAC, and idempotency.
    """
    serializer_class = PurchaseOrderSerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return PurchaseOrder.objects.none()

        base_qs = PurchaseOrder.objects.select_related(
            'shop', 'supplier', 'created_by', 'approved_by'
        ).prefetch_related('items', 'items__product').order_by('-created_at')

        if user.is_admin:
            queryset = base_qs.all()
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                queryset = queryset.filter(shop_id=shop_id)
        elif user.is_shop_owner:
            queryset = base_qs.filter(shop__owner=user)
        else:
            return PurchaseOrder.objects.none()

        # Status filter
        status_param = self.request.query_params.get('status')
        if status_param:
            queryset = queryset.filter(status=status_param)

        # Supplier filter
        supplier_param = self.request.query_params.get('supplier')
        if supplier_param:
            queryset = queryset.filter(supplier_id=supplier_param)

        # Search query
        search_query = self.request.query_params.get('search')
        if search_query:
            queryset = queryset.filter(
                Q(po_number__icontains=search_query) |
                Q(supplier__name__icontains=search_query) |
                Q(notes__icontains=search_query)
            )

        # Date range filters
        date_from = self.request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(Q(order_date__gte=date_from) | Q(created_at__date__gte=date_from))

        date_to = self.request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(Q(order_date__lte=date_to) | Q(created_at__date__lte=date_to))

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not user.is_admin and shop.owner != user:
            raise PermissionDenied("You can only create purchase orders for your own shop.")
        serializer.save()

    @action(detail=True, methods=['post'], url_path='submit-approval')
    def submit_for_approval(self, request, id=None):
        """
        POST /api/purchase-orders/{id}/submit-approval/
        Transitions DRAFT -> PENDING_APPROVAL.
        """
        po = self.get_object()
        if not po.can_transition_to(PurchaseOrder.Status.PENDING_APPROVAL):
            return Response(
                {"error": f"Cannot submit purchase order with status '{po.status}' for approval."},
                status=status.HTTP_400_BAD_REQUEST
            )

        po.status = PurchaseOrder.Status.PENDING_APPROVAL
        po.save(update_fields=['status', 'updated_at'])
        return Response({
            "success": True,
            "message": f"Purchase Order {po.po_number} submitted for approval.",
            "order": PurchaseOrderSerializer(po).data
        })

    @action(detail=True, methods=['post'], url_path='approve')
    def approve(self, request, id=None):
        """
        POST /api/purchase-orders/{id}/approve/
        Approves a purchase order from PENDING_APPROVAL or DRAFT status.
        """
        po = self.get_object()
        if not po.can_transition_to(PurchaseOrder.Status.APPROVED):
            return Response(
                {"error": f"Cannot approve purchase order with status '{po.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        po.status = PurchaseOrder.Status.APPROVED
        po.approved_by = request.user
        po.approved_at = timezone.now()
        po.rejection_reason = ""
        po.save(update_fields=['status', 'approved_by', 'approved_at', 'rejection_reason', 'updated_at'])

        return Response({
            "success": True,
            "message": f"Purchase Order {po.po_number} approved successfully.",
            "order": PurchaseOrderSerializer(po).data
        })

    @action(detail=True, methods=['post'], url_path='reject')
    def reject(self, request, id=None):
        """
        POST /api/purchase-orders/{id}/reject/
        Rejects a purchase order in PENDING_APPROVAL status.
        """
        po = self.get_object()
        if not po.can_transition_to(PurchaseOrder.Status.REJECTED):
            return Response(
                {"error": f"Cannot reject purchase order with status '{po.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PurchaseOrderRejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        po.status = PurchaseOrder.Status.REJECTED
        po.rejection_reason = serializer.validated_data['reason']
        po.save(update_fields=['status', 'rejection_reason', 'updated_at'])

        return Response({
            "success": True,
            "message": f"Purchase Order {po.po_number} has been rejected.",
            "order": PurchaseOrderSerializer(po).data
        })

    def _execute_order_placement(self, request, po, target_status=PurchaseOrder.Status.ORDERED):
        if not po.can_transition_to(target_status) and not po.can_transition_to(PurchaseOrder.Status.PLACED) and not po.can_transition_to(PurchaseOrder.Status.ORDERED):
            return Response(
                {"error": f"Cannot place order for PO with status '{po.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        po.status = target_status
        po.order_date = timezone.now().date()
        po.save(update_fields=['status', 'order_date', 'updated_at'])

        return Response({
            "success": True,
            "message": f"Purchase Order {po.po_number} marked as {target_status}.",
            "order": PurchaseOrderSerializer(po).data
        })

    @action(detail=True, methods=['post'], url_path='order')
    def mark_ordered(self, request, id=None):
        """POST /api/purchase-orders/{id}/order/"""
        po = self.get_object()
        return self._execute_order_placement(request, po, target_status=PurchaseOrder.Status.ORDERED)

    @action(detail=True, methods=['post'], url_path='place')
    def place_order(self, request, id=None):
        """POST /api/purchase-orders/{id}/place/ (Legacy alias)."""
        po = self.get_object()
        return self._execute_order_placement(request, po, target_status=PurchaseOrder.Status.PLACED)

    @action(detail=True, methods=['post'], url_path='receive')
    def receive_stock(self, request, id=None):
        """
        POST /api/purchase-orders/{id}/receive/
        Atomically processes line items received, increments physical inventory,
        creates RESTOCK audit transactions with unit/total costs, updates SupplierProduct
        last purchase price and date, and provides idempotency protection.
        """
        po = self.get_object()
        if po.status not in [
            PurchaseOrder.Status.ORDERED,
            PurchaseOrder.Status.PLACED,
            PurchaseOrder.Status.PARTIALLY_RECEIVED
        ]:
            return Response(
                {"error": f"Cannot receive stock for PO with status '{po.status}'."},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PurchaseOrderReceiveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        items_to_receive = serializer.validated_data['items']
        notes = serializer.validated_data.get('notes', '')
        idem_key = serializer.validated_data.get('idempotency_key') or request.headers.get('X-Idempotency-Key')

        # Idempotency deduplication check
        if idem_key:
            cache_key = f"po_rcv_{po.id}_{idem_key}"
            if cache.get(cache_key):
                return Response({
                    "success": True,
                    "idempotent_duplicate": True,
                    "message": f"Duplicate request acknowledged. PO {po.po_number} current status is {po.status}.",
                    "order": PurchaseOrderSerializer(po).data
                })
            cache.set(cache_key, True, timeout=60)

        with transaction.atomic():
            received_anything = False
            for entry in items_to_receive:
                item_id = entry['item_id']
                qty_inbound = entry['quantity_to_receive']

                try:
                    po_item = PurchaseOrderItem.objects.select_for_update().get(id=item_id, purchase_order=po)
                except PurchaseOrderItem.DoesNotExist:
                    raise ValidationError(f"Item #{item_id} does not belong to this Purchase Order.")

                if qty_inbound <= 0:
                    raise ValidationError("Received quantity must be greater than zero.")

                if qty_inbound > po_item.remaining_quantity:
                    raise ValidationError(
                        f"Cannot receive {qty_inbound} units for {po_item.product.name}. Remaining is only {po_item.remaining_quantity}."
                    )

                po_item.quantity_received += qty_inbound
                po_item.save(update_fields=['quantity_received', 'updated_at'])

                # Increment shop physical inventory atomically
                inv, _ = Inventory.objects.select_for_update().get_or_create(
                    shop=po.shop,
                    product=po_item.product,
                    defaults={'unit_cost': po_item.unit_cost}
                )

                stock_before = inv.current_stock
                new_stock = stock_before + qty_inbound
                inv.current_stock = new_stock
                inv.unit_cost = po_item.unit_cost
                inv.last_restocked_at = timezone.now()
                inv.last_stock_update = timezone.now()
                inv.save()

                # Audit log with unit cost and total cost
                line_total = po_item.unit_cost * Decimal(str(qty_inbound))
                InventoryTransaction.objects.create(
                    inventory=inv,
                    transaction_type=InventoryTransaction.TransactionType.RESTOCK,
                    quantity_change=qty_inbound,
                    stock_before=stock_before,
                    stock_after=new_stock,
                    reference_type='PURCHASE_ORDER',
                    reference_id=po.po_number,
                    unit_cost=po_item.unit_cost,
                    total_cost=line_total,
                    reason=f"Received delivery for PO {po.po_number} from {po.supplier.name}",
                    notes=notes,
                    performed_by=request.user
                )

                # Update SupplierProduct last purchase price and date
                SupplierProduct.objects.filter(
                    supplier=po.supplier,
                    product=po_item.product,
                    shop=po.shop
                ).update(
                    last_purchase_price=po_item.unit_cost,
                    last_purchase_date=timezone.now()
                )

                received_anything = True

            if not received_anything:
                return Response({"error": "No items received."}, status=status.HTTP_400_BAD_REQUEST)

            # Check if all items in the PO are fully received (fresh DB query to avoid cached prefetch)
            all_items = PurchaseOrderItem.objects.filter(purchase_order=po)
            all_complete = all(i.quantity_received >= i.quantity_ordered for i in all_items)

            if all_complete:
                po.status = PurchaseOrder.Status.RECEIVED
                po.received_date = timezone.now()
            else:
                po.status = PurchaseOrder.Status.PARTIALLY_RECEIVED

            po.save(update_fields=['status', 'received_date', 'updated_at'])

        return Response({
            "success": True,
            "message": f"Successfully received stock for {po.po_number}. Status is now {po.status}.",
            "order": PurchaseOrderSerializer(po).data
        })

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel_order(self, request, id=None):
        """POST /api/purchase-orders/{id}/cancel/"""
        po = self.get_object()
        if po.status in [PurchaseOrder.Status.RECEIVED, PurchaseOrder.Status.PARTIALLY_RECEIVED]:
            return Response(
                {"error": "Cannot cancel a purchase order that has already received inventory."},
                status=status.HTTP_400_BAD_REQUEST
            )

        po.status = PurchaseOrder.Status.CANCELLED
        po.save(update_fields=['status', 'updated_at'])
        return Response({
            "success": True,
            "message": f"Purchase Order {po.po_number} cancelled.",
            "order": PurchaseOrderSerializer(po).data
        })

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/purchase-orders/analytics/?shop={id}
        Returns procurement analytics:
        - Monthly purchase spend trend
        - Supplier spend breakdown
        - PO status distribution
        - Delayed order alerts
        """
        user = request.user
        qs = self.get_queryset()

        shop_id = request.query_params.get('shop')
        if not shop_id and user.is_shop_owner:
            user_shop = getattr(user, 'shops', None)
            first_shop = user_shop.first() if user_shop else None
            shop_id = first_shop.id if first_shop else None

        if shop_id:
            qs = qs.filter(shop_id=shop_id)

        # 1. Total POs and Total Spend
        total_pos = qs.count()
        non_cancelled = qs.exclude(status=PurchaseOrder.Status.CANCELLED)
        total_spend = Decimal('0.00')
        for po in non_cancelled:
            total_spend += po.grand_total if po.grand_total > Decimal('0.00') else po.subtotal

        # 2. Status Distribution
        status_counts = {}
        for s_choice in PurchaseOrder.Status.values:
            status_counts[s_choice] = qs.filter(status=s_choice).count()

        # 3. Monthly Spend (trailing 6 months)
        six_months_ago = timezone.now().date() - timedelta(days=180)
        recent_pos = non_cancelled.filter(
            Q(order_date__gte=six_months_ago) | Q(created_at__date__gte=six_months_ago)
        )
        monthly_spend_dict = {}
        for po in recent_pos:
            dt = po.order_date or po.created_at.date()
            m_key = dt.strftime('%Y-%m')
            val = po.grand_total if po.grand_total > Decimal('0.00') else po.subtotal
            monthly_spend_dict[m_key] = monthly_spend_dict.get(m_key, Decimal('0.00')) + val

        monthly_spend_series = [
            {"month": k, "spend": float(round(v, 2))}
            for k, v in sorted(monthly_spend_dict.items())
        ]

        # 4. Supplier Spend Distribution
        supplier_spend_dict = {}
        for po in non_cancelled:
            s_name = po.supplier.name
            val = po.grand_total if po.grand_total > Decimal('0.00') else po.subtotal
            supplier_spend_dict[s_name] = supplier_spend_dict.get(s_name, Decimal('0.00')) + val

        supplier_spend_series = [
            {"supplier_name": k, "spend": float(round(v, 2))}
            for k, v in sorted(supplier_spend_dict.items(), key=lambda item: item[1], reverse=True)
        ]

        # 5. Delayed Order Alerts
        today = timezone.now().date()
        delayed_pos = qs.filter(
            status__in=[
                PurchaseOrder.Status.ORDERED,
                PurchaseOrder.Status.PLACED,
                PurchaseOrder.Status.PARTIALLY_RECEIVED,
            ],
            expected_date__isnull=False,
            expected_date__lt=today
        ).select_related('supplier')

        alerts = [
            {
                "id": po.id,
                "po_number": po.po_number,
                "supplier_name": po.supplier.name,
                "expected_date": po.expected_date.isoformat(),
                "days_overdue": (today - po.expected_date).days,
                "status": po.status,
            }
            for po in delayed_pos
        ]

        return Response({
            "total_purchase_orders": total_pos,
            "total_procurement_spend": float(round(total_spend, 2)),
            "status_distribution": status_counts,
            "monthly_spend": monthly_spend_series,
            "supplier_spend": supplier_spend_series,
            "delayed_orders_count": len(alerts),
            "delayed_order_alerts": alerts,
        })


class InventoryTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only audit trail endpoint for inventory movements.
    """
    serializer_class = InventoryTransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return InventoryTransaction.objects.none()

        base_qs = InventoryTransaction.objects.select_related(
            'inventory',
            'inventory__shop',
            'inventory__product',
            'performed_by'
        ).order_by('-created_at')

        if user.is_admin:
            shop_id = self.request.query_params.get('shop')
            if shop_id:
                base_qs = base_qs.filter(inventory__shop_id=shop_id)
            return base_qs.all()
        elif user.is_shop_owner:
            return base_qs.filter(inventory__shop__owner=user)
        return InventoryTransaction.objects.none()


class InventoryReturnViewSet(viewsets.ModelViewSet):
    """
    Handles customer returns and discarded items with distinction between sellable and damaged stock.
    """
    serializer_class = InventoryReturnSerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return InventoryReturn.objects.none()

        base_qs = InventoryReturn.objects.select_related('shop', 'product', 'order', 'processed_by').order_by('-created_at')

        if user.is_admin:
            return base_qs.all()
        elif user.is_shop_owner:
            return base_qs.filter(shop__owner=user)
        return InventoryReturn.objects.none()

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not user.is_admin and shop.owner != user:
            raise PermissionDenied("You can only manage returns for your own shop.")

        with transaction.atomic():
            ret = serializer.save(processed_by=user)
            # If sellable, restore to current_stock
            if ret.return_type == InventoryReturn.ReturnType.SELLABLE and ret.status == InventoryReturn.ReturnStatus.RECEIVED:
                inv = Inventory.objects.select_for_update().filter(shop=ret.shop, product=ret.product).first()
                if inv:
                    stock_before = inv.current_stock
                    new_stock = stock_before + ret.quantity
                    inv.current_stock = new_stock
                    inv.last_stock_update = timezone.now()
                    inv.save()

                    InventoryTransaction.objects.create(
                        inventory=inv,
                        transaction_type=InventoryTransaction.TransactionType.RETURN,
                        quantity_change=ret.quantity,
                        stock_before=stock_before,
                        stock_after=new_stock,
                        reference_type='CUSTOMER_RETURN',
                        reference_id=f"RET-{ret.id}",
                        reason=ret.reason,
                        notes=ret.notes,
                        performed_by=user
                    )

