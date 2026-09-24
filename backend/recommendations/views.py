from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count, Q
from django.utils import timezone
from datetime import timedelta

from users.permissions import IsAdmin, IsShopOwnerOrAdmin
from .models import RecommendationInteraction, RecommendationFeedback, RecommendationConfig
from .serializers import (
    RecommendationItemSerializer,
    RecommendationInteractionSerializer,
    RecommendationFeedbackSerializer,
    RecommendationConfigSerializer
)
from .services.recommendation_engine import RecommendationEngine
from .services.general_recommender import get_buy_again_recommendations
from .services.academic_recommender import get_academic_recommendations, get_recommended_shops
from .services.popularity_recommender import get_popular_products, get_trending_products
from .services.collaborative_recommender import get_frequently_bought_together
from .services.content_recommender import get_similar_products


class RecommendationViewSet(viewsets.ViewSet):
    """
    Unified Intelligent Recommendation API for Students, Shopkeepers, and Administrators.
    Provides real-time, explainable, and inventory-verified stationery & print service suggestions.
    """

    def get_permissions(self):
        if self.action in ['home', 'popular', 'trending', 'frequently_bought', 'similar', 'shops', 'academic']:
            return [permissions.AllowAny()]
        elif self.action in ['admin_analytics', 'config']:
            return [permissions.IsAuthenticated(), IsAdmin()]
        elif self.action in ['shop_insights', 'shop_restock']:
            return [permissions.IsAuthenticated(), IsShopOwnerOrAdmin()]
        return [permissions.IsAuthenticated()]

    @action(detail=False, methods=['get'], url_path='home')
    def home(self, request):
        """
        GET /api/recommendations/home/
        Aggregated home payload: Recommended For You, Buy Again, Because You Bought This,
        Academic Events & Services, Trending, Popular, and Recommended Shops.
        """
        user = request.user if request.user.is_authenticated else None
        limit = int(request.query_params.get('limit', 6))
        feed = RecommendationEngine.get_home_feed(user, limit_per_section=limit)
        return Response({
            'success': True,
            'timestamp': timezone.now().isoformat(),
            **feed
        })

    @action(detail=False, methods=['get'], url_path='personalized')
    def personalized(self, request):
        """
        GET /api/recommendations/personalized/
        Blended hybrid recommendations tailored for the authenticated student.
        """
        limit = int(request.query_params.get('limit', 10))
        items = RecommendationEngine.get_personalized_recommendations(request.user, limit=limit)
        return Response({
            'success': True,
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='buy-again')
    def buy_again(self, request):
        """
        GET /api/recommendations/buy-again/
        Previously purchased stationery with purchase frequency and last order dates.
        """
        limit = int(request.query_params.get('limit', 8))
        items = get_buy_again_recommendations(request.user, limit=limit)
        return Response({
            'success': True,
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='academic')
    def academic(self, request):
        """
        GET /api/recommendations/academic/
        Academic event-driven stationery, exam kits, project supplies, and printing services.
        """
        user = request.user if request.user.is_authenticated else None
        limit = int(request.query_params.get('limit', 8))
        days = int(request.query_params.get('days', 30))
        res = get_academic_recommendations(user, limit=limit, days_ahead=days)
        return Response({
            'success': True,
            **res
        })

    @action(detail=False, methods=['get'], url_path='trending')
    def trending(self, request):
        """
        GET /api/recommendations/trending/
        Surging stationery items based on 7-day order velocity acceleration.
        """
        shop_id = request.query_params.get('shop')
        shop_id = int(shop_id) if shop_id else None
        limit = int(request.query_params.get('limit', 8))
        items = get_trending_products(shop_id=shop_id, limit=limit)
        return Response({
            'success': True,
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='popular')
    def popular(self, request):
        """
        GET /api/recommendations/popular/
        Time-decayed high-volume sales and student rating favorites.
        """
        shop_id = request.query_params.get('shop')
        shop_id = int(shop_id) if shop_id else None
        category_id = request.query_params.get('category')
        category_id = int(category_id) if category_id else None
        limit = int(request.query_params.get('limit', 10))

        items = get_popular_products(shop_id=shop_id, category_id=category_id, limit=limit)
        return Response({
            'success': True,
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='frequently-bought')
    def frequently_bought(self, request):
        """
        GET /api/recommendations/frequently-bought/?product_id=123
        Statistically co-purchased companion items based on completed orders.
        """
        p_id = request.query_params.get('product_id')
        if not p_id:
            return Response({'error': 'product_id parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        limit = int(request.query_params.get('limit', 4))
        items = get_frequently_bought_together(int(p_id), limit=limit)
        return Response({
            'success': True,
            'product_id': int(p_id),
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='similar/(?P<product_id>[^/.]+)')
    def similar(self, request, product_id=None):
        """
        GET /api/recommendations/similar/<product_id>/
        TF-IDF and Cosine similarity content-based matches.
        """
        limit = int(request.query_params.get('limit', 4))
        items = get_similar_products(int(product_id), limit=limit)
        return Response({
            'success': True,
            'product_id': int(product_id),
            'count': len(items),
            'recommendations': items
        })

    @action(detail=False, methods=['get'], url_path='shops')
    def shops(self, request):
        """
        GET /api/recommendations/shops/
        Recommended campus stores based on student college affiliation & printing capabilities.
        """
        user = request.user if request.user.is_authenticated else None
        limit = int(request.query_params.get('limit', 4))
        shops_list = get_recommended_shops(user, limit=limit)
        return Response({
            'success': True,
            'count': len(shops_list),
            'shops': shops_list
        })

    @action(detail=False, methods=['post'], url_path='track')
    def track(self, request):
        """
        POST /api/recommendations/track/
        Logs engagement events: VIEWED, CLICKED, ADDED_TO_CART, PURCHASED, DISMISSED.
        """
        serializer = RecommendationInteractionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(user=request.user)
        return Response({
            'success': True,
            'message': 'Interaction recorded successfully.'
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='feedback')
    def feedback(self, request):
        """
        POST /api/recommendations/feedback/
        Records negative or tuning feedback (NOT_INTERESTED, ALREADY_HAVE, NOT_RELEVANT).
        """
        product_id = request.data.get('product')
        if not product_id:
            return Response({'error': 'product ID is required.'}, status=status.HTTP_400_BAD_REQUEST)

        obj, created = RecommendationFeedback.objects.update_or_create(
            user=request.user,
            product_id=product_id,
            defaults={
                'feedback_type': request.data.get('feedback_type', RecommendationFeedback.FeedbackType.NOT_INTERESTED),
                'comment': request.data.get('comment', '')
            }
        )
        return Response({
            'success': True,
            'message': 'Feedback received. We will adjust your future recommendations.',
            'feedback_id': obj.id
        })

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='config')
    def config(self, request):
        """
        GET /api/recommendations/config/
        PUT /api/recommendations/config/
        Allows administrators to view or update hybrid recommendation weights.
        """
        cfg = RecommendationConfig.get_active()
        if request.method in ['PUT', 'PATCH']:
            serializer = RecommendationConfigSerializer(cfg, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response({
                'success': True,
                'message': 'Recommendation configuration updated.',
                'config': serializer.data
            })

        serializer = RecommendationConfigSerializer(cfg)
        return Response({
            'success': True,
            'config': serializer.data
        })

    @action(detail=False, methods=['get'], url_path='admin-analytics')
    def admin_analytics(self, request):
        """
        GET /api/recommendations/admin-analytics/
        Platform-wide recommendation performance, CTR, and conversion metrics.
        """
        last_30d = timezone.now() - timedelta(days=30)
        total_impressions = RecommendationInteraction.objects.filter(
            action=RecommendationInteraction.Action.VIEWED, timestamp__gte=last_30d
        ).count()
        total_clicks = RecommendationInteraction.objects.filter(
            action=RecommendationInteraction.Action.CLICKED, timestamp__gte=last_30d
        ).count()
        total_conversions = RecommendationInteraction.objects.filter(
            action=RecommendationInteraction.Action.PURCHASED, timestamp__gte=last_30d
        ).count()

        ctr = round((total_clicks / max(1, total_impressions)) * 100, 2)
        conversion_rate = round((total_conversions / max(1, total_clicks)) * 100, 2)

        type_breakdown = list(
            RecommendationInteraction.objects.filter(timestamp__gte=last_30d)
            .values('recommendation_type')
            .annotate(interactions_count=Count('id'))
            .order_by('-interactions_count')
        )

        return Response({
            'success': True,
            'metrics_window_days': 30,
            'total_impressions': total_impressions,
            'total_clicks': total_clicks,
            'total_conversions': total_conversions,
            'click_through_rate_pct': ctr,
            'conversion_rate_pct': conversion_rate,
            'recommendation_type_breakdown': type_breakdown
        })

    @action(detail=False, methods=['get'], url_path='shop-insights')
    def shop_insights(self, request):
        """
        GET /api/recommendations/shop-insights/?shop=1
        Customer demand and academic surge opportunities for storekeepers.
        """
        shop_id = request.query_params.get('shop')
        if not shop_id and request.user.is_shop_owner:
            if hasattr(request.user, 'owned_shop'):
                shop_id = request.user.owned_shop.id

        if not shop_id:
            return Response({'error': 'shop parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        insights = RecommendationEngine.get_shop_insights(int(shop_id))
        return Response({
            'success': True,
            **insights
        })

    @action(detail=False, methods=['get'], url_path='shop-restock')
    def shop_restock(self, request):
        """
        Backward-compatible endpoint for Step 18 purchase restock recommendations.
        """
        from predictions.models import PurchaseRecommendation
        from predictions.serializers import PurchaseRecommendationSerializer

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
