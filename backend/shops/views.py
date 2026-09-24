import math
from rest_framework import viewsets, filters, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied, ValidationError
from django.db.models import Q
from django.utils import timezone
from .models import Shop, ShopFavorite, Offer
from .serializers import ShopSerializer, ShopFavoriteSerializer, OfferSerializer
from users.permissions import IsAdmin, IsShopOwnerOrAdmin, IsShopEntityOwnerOrAdmin


def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Geographic distance between two coordinates in kilometers using Haversine formula.
    Avoids unnecessary third-party Google Distance Matrix API calls for stored coordinates.
    """
    r = 6371.0  # Earth's radius in kilometers
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) *
         math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class ShopViewSet(viewsets.ModelViewSet):
    """
    Shop Directory & Administration ViewSet.
    
    SECURITY (STEP 7 RBAC):
    - List / Retrieve / Nearby: AllowAny (Students and Public can browse active shops).
    - Create: Authenticated Shop Owners (for their own single shop) or Admins.
    - Update / Partial Update: IsShopEntityOwnerOrAdmin (Shop Owner can only edit their OWN shop).
    - Destroy: IsAdmin only.
    """
    queryset = Shop.objects.select_related('owner').all().order_by('-rating', 'name')
    serializer_class = ShopSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'nearby']:
            permission_classes = [permissions.AllowAny]
        elif self.action in ['create', 'my_shop', 'my_shop_alt']:
            permission_classes = [permissions.IsAuthenticated]
        elif self.action in ['update', 'partial_update']:
            permission_classes = [permissions.IsAuthenticated, IsShopEntityOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filtering parameters
        shop_type = self.request.query_params.get('shop_type')
        is_active = self.request.query_params.get('is_active')
        search = self.request.query_params.get('search')
        ordering = self.request.query_params.get('ordering')

        if shop_type:
            queryset = queryset.filter(shop_type=shop_type)
        if is_active is not None:
            active_bool = is_active.lower() in ('true', '1')
            queryset = queryset.filter(is_active=active_bool)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(campus_location__icontains=search) |
                Q(address__icontains=search)
            )
        if ordering and ordering in ['rating', '-rating', 'name', '-name', 'created_at', '-created_at']:
            queryset = queryset.order_by(ordering)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_admin:
            if not user.is_shop_owner:
                raise PermissionDenied("Only registered shop owner accounts or administrators can create a shop.")
            if hasattr(user, 'owned_shop'):
                raise ValidationError({"owner": "You have already registered a shop on the platform."})
            serializer.save(owner=user)
        else:
            serializer.save()

    @action(detail=False, methods=['get'], url_path='my-shop')
    def my_shop(self, request):
        """
        GET /api/shops/my-shop/
        Retrieve the shop owned by current authenticated shopkeeper.
        """
        if not request.user.is_authenticated:
            return Response({'error': 'Authentication required'}, status=401)
        shop = Shop.objects.filter(owner=request.user).first()
        if not shop:
            return Response({'error': 'No shop registered for current user'}, status=404)
        return Response(ShopSerializer(shop).data)

    @action(detail=False, methods=['get'], url_path='my_shop')
    def my_shop_alt(self, request):
        return self.my_shop(request)

    @action(detail=False, methods=['get'], url_path='nearby')
    def nearby(self, request):
        """
        GET /api/shops/nearby/?latitude=...&longitude=...&radius=...
        Returns approved active stationery & xerox shops sorted by proximity.
        """
        lat_str = request.query_params.get('latitude')
        lon_str = request.query_params.get('longitude')
        radius_str = request.query_params.get('radius', '10.0')

        if not lat_str or not lon_str:
            return Response(
                {"error": "Both 'latitude' and 'longitude' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            latitude = float(lat_str)
            longitude = float(lon_str)
        except (ValueError, TypeError):
            return Response(
                {"error": "Invalid coordinates. 'latitude' and 'longitude' must be valid decimal numbers."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not (-90.0 <= latitude <= 90.0):
            return Response(
                {"error": "Latitude must be between -90.0 and 90.0 degrees."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not (-180.0 <= longitude <= 180.0):
            return Response(
                {"error": "Longitude must be between -180.0 and 180.0 degrees."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            radius_km = float(radius_str)
            if radius_km <= 0 or radius_km > 100.0:
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {"error": "Radius must be a positive number up to 100.0 km."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Only query active shops that have valid coordinates configured
        queryset = Shop.objects.filter(
            is_active=True,
            latitude__isnull=False,
            longitude__isnull=False
        ).select_related('owner')

        # Optional filters matching standard shop directory
        shop_type = request.query_params.get('shop_type')
        if shop_type:
            queryset = queryset.filter(shop_type=shop_type)

        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(campus_location__icontains=search) |
                Q(address__icontains=search)
            )

        nearby_shops = []
        for shop in queryset:
            s_lat = float(shop.latitude)
            s_lon = float(shop.longitude)
            dist = haversine_distance(latitude, longitude, s_lat, s_lon)
            if dist <= radius_km:
                shop_data = ShopSerializer(shop, context={'request': request}).data
                shop_data['distance_km'] = round(dist, 2)
                nearby_shops.append(shop_data)

        # Sort nearest first
        nearby_shops.sort(key=lambda s: s['distance_km'])

        return Response({
            "count": len(nearby_shops),
            "origin": {"latitude": latitude, "longitude": longitude},
            "radius_km": radius_km,
            "results": nearby_shops
        })


class ShopFavoriteViewSet(viewsets.ModelViewSet):
    """
    Step 24: Student Shop Favorites API.
    Enables students to bookmark preferred campus stationery & xerox vendors.
    """
    serializer_class = ShopFavoriteSerializer
    lookup_field = 'id'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ShopFavorite.objects.none()
        return ShopFavorite.objects.filter(user=user).select_related('shop')

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if ShopFavorite.objects.filter(user=user, shop=shop).exists():
            raise ValidationError({"shop": "You have already favorited this shop."})
        serializer.save(user=user)

    @action(detail=False, methods=['post'], url_path='toggle')
    def toggle(self, request):
        """
        POST /api/favorites/shops/toggle/
        Quick toggle button on shop cards.
        Payload: { "shop_id": 3 }
        """
        shop_id = request.data.get('shop_id')
        if not shop_id:
            return Response({"error": "Shop ID is required."}, status=400)

        shop = Shop.objects.filter(id=shop_id).first()
        if not shop:
            return Response({"error": "Shop not found."}, status=404)

        fav = ShopFavorite.objects.filter(user=request.user, shop=shop).first()
        if fav:
            fav.delete()
            return Response({
                "is_favorite": False,
                "message": f"'{shop.name}' removed from your favorite shops."
            })
        else:
            ShopFavorite.objects.create(user=request.user, shop=shop)
            return Response({
                "is_favorite": True,
                "message": f"'{shop.name}' added to your favorite shops."
            })

    @action(detail=False, methods=['get'], url_path='check')
    def check(self, request):
        """
        GET /api/favorites/shops/check/?shop=3
        """
        shop_id = request.query_params.get('shop')
        if not shop_id:
            return Response({"is_favorite": False})
        is_fav = ShopFavorite.objects.filter(user=request.user, shop_id=shop_id).exists()
        return Response({"is_favorite": is_fav})


class OfferViewSet(viewsets.ModelViewSet):
    """
    Step 24: Merchant Promotional Offers & Discounts API.
    Shop owners manage promotions for their own shop; students view active discounts.
    """
    serializer_class = OfferSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'active']:
            permission_classes = [permissions.AllowAny]
        elif self.action == 'create':
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsShopEntityOwnerOrAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        queryset = Offer.objects.select_related('shop').prefetch_related('applicable_categories', 'applicable_products').all()

        shop_id = self.request.query_params.get('shop')
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)

        # Non-admins or unauthenticated students only see active valid offers
        if not user or not user.is_authenticated or not getattr(user, 'is_admin', False):
            if user and user.is_authenticated and getattr(user, 'is_shop_owner', False):
                # Merchant inspects their own shop offers
                queryset = queryset.filter(shop__owner=user)
            else:
                # Student / Public: only currently active offers
                now = timezone.now()
                queryset = queryset.filter(
                    is_active=True,
                    start_date__lte=now,
                    end_date__gte=now
                )

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not getattr(user, 'is_admin', False):
            if not shop or shop.owner != user:
                raise PermissionDenied("You can only create promotional offers for your own registered shop.")
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        if not getattr(user, 'is_admin', False):
            if serializer.instance.shop.owner != user:
                raise PermissionDenied("You can only modify offers for your own registered shop.")
        serializer.save()

    @action(detail=False, methods=['get'], url_path='active')
    def active(self, request):
        """
        GET /api/offers/active/?shop=3
        Returns currently active and valid offers for a shop or platform.
        """
        now = timezone.now()
        qs = Offer.objects.filter(
            is_active=True,
            start_date__lte=now,
            end_date__gte=now
        ).select_related('shop')

        shop_id = request.query_params.get('shop')
        if shop_id:
            qs = qs.filter(shop_id=shop_id)

        serializer = OfferSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/offers/analytics/
        Operational overview of offers for admin or merchant dashboard.
        """
        user = request.user
        if not user or not user.is_authenticated:
            return Response({"error": "Authentication required"}, status=401)

        qs = Offer.objects.all()
        if not getattr(user, 'is_admin', False):
            if not getattr(user, 'is_shop_owner', False):
                raise PermissionDenied("Only merchants and administrators can access offer analytics.")
            qs = qs.filter(shop__owner=user)

        now = timezone.now()
        total = qs.count()
        active = qs.filter(is_active=True, start_date__lte=now, end_date__gte=now).count()
        expired = qs.filter(end_date__lt=now).count()

        from django.db.models import Sum
        total_redemptions = qs.aggregate(t=Sum('times_used'))['t'] or 0

        return Response({
            "total_offers": total,
            "active_offers": active,
            "expired_offers": expired,
            "total_redemptions": total_redemptions
        })


