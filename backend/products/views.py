from decimal import Decimal
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from .models import Category, Product, ShoppingList, ShoppingListItem, Review, Wishlist, BulkPricingTier, PriceAlert
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    ShoppingListSerializer,
    ShoppingListItemSerializer,
    ReviewSerializer,
    WishlistSerializer,
    BulkPricingTierSerializer,
    PriceAlertSerializer,
)
from .services.shopping_intelligence_service import ShoppingIntelligenceService
from .services.review_service import ReviewService
from users.permissions import (
    IsAdmin,
    IsShopOwnerOrAdmin,
    IsShopEntityOwnerOrAdmin,
    IsOwnerOrAdmin
)

class CategoryViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for Stationery Categories.
    
    SECURITY:
    - Read: AllowAny (Students, Vendors, Public).
    - Create/Update/Delete: IsAdmin only.
    """
    queryset = Category.objects.all().order_by('name')
    serializer_class = CategorySerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]


class ProductViewSet(viewsets.ModelViewSet):
    """
    Product Catalog ViewSet with Search and Filtering.
    
    SECURITY:
    - Read: AllowAny (Public, Students, Vendors).
    - Create: IsShopOwnerOrAdmin (Vendors can only create products for their own shop).
    - Update/Destroy: IsShopEntityOwnerOrAdmin (Vendor can only modify products in their own shop).
    """
    queryset = Product.objects.select_related('shop', 'category').prefetch_related('inventory_records').all().order_by('name')
    serializer_class = ProductSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'price_comparison', 'price_comparison_alt', 'alternatives']:
            permission_classes = [permissions.AllowAny]
        elif self.action in ['price_alert', 'price_alert_alt']:
            permission_classes = [permissions.IsAuthenticated]
        elif self.action == 'create':
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated, IsShopEntityOwnerOrAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()

        # Enforce Shop Owner Data Isolation:
        # Authenticated shop owners only see products belonging to their owned shop
        if user and user.is_authenticated and getattr(user, 'is_shop_owner', False) and not getattr(user, 'is_admin', False):
            queryset = queryset.filter(shop__owner=user)
        elif self.action == 'list' and not (user and user.is_authenticated and getattr(user, 'is_admin', False)):
            # Public / student catalog default to active products unless explicitly requested
            if self.request.query_params.get('is_active') is None:
                queryset = queryset.filter(is_active=True)

        # Query filters
        search = self.request.query_params.get('search')
        category = self.request.query_params.get('category')
        shop_id = self.request.query_params.get('shop')
        is_active = self.request.query_params.get('is_active')
        min_price = self.request.query_params.get('min_price')
        max_price = self.request.query_params.get('max_price')
        in_stock = self.request.query_params.get('in_stock')
        ordering = self.request.query_params.get('ordering')

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(brand__icontains=search) |
                Q(description__icontains=search)
            )
        if category:
            if str(category).isdigit():
                queryset = queryset.filter(category_id=category)
            else:
                queryset = queryset.filter(Q(category__slug__iexact=category) | Q(category__name__icontains=category))
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() in ('true', '1'))
        if min_price:
            try:
                queryset = queryset.filter(price__gte=float(min_price))
            except (ValueError, TypeError):
                pass
        if max_price:
            try:
                queryset = queryset.filter(price__lte=float(max_price))
            except (ValueError, TypeError):
                pass
        if in_stock is not None:
            if in_stock.lower() in ('true', '1'):
                queryset = queryset.filter(inventory_records__current_stock__gt=0).distinct()
            elif in_stock.lower() in ('false', '0'):
                queryset = queryset.filter(inventory_records__current_stock=0).distinct()

        # Sorting / Ordering
        valid_orderings = ['price', '-price', 'name', '-name', 'created_at', '-created_at']
        if ordering and ordering in valid_orderings:
            queryset = queryset.order_by(ordering)

        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, 'is_admin', False):
            # Enforce that shop owner creates products for their own shop
            target_shop = serializer.validated_data.get('shop')
            if not target_shop:
                from shops.models import Shop
                target_shop = getattr(user, 'owned_shop', None) or Shop.objects.filter(owner=user).first()
                if not target_shop:
                    raise PermissionDenied("You must own a registered shop to add products.")
                serializer.validated_data['shop'] = target_shop
            elif target_shop.owner != user:
                raise PermissionDenied("You can only add products to your own shop.")
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        from django.db import models
        from inventory.models import Inventory
        instance = self.get_object()

        # If product has historical orders, preserve order history and deactivate instead of hard delete
        has_orders = hasattr(instance, 'order_items') and instance.order_items.exists()
        if has_orders:
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            Inventory.objects.filter(product=instance).update(is_active=False)
            return Response(status=status.HTTP_204_NO_CONTENT)

        try:
            return super().destroy(request, *args, **kwargs)
        except models.ProtectedError:
            instance.is_active = False
            instance.save(update_fields=['is_active', 'updated_at'])
            Inventory.objects.filter(product=instance).update(is_active=False)
            return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['get'], url_path='price-comparison')
    def price_comparison(self, request, id=None):
        """
        GET /api/products/<id>/price-comparison/
        Cross-shop price and stock comparison across all campus merchants.
        """
        product = self.get_object()
        data = ShoppingIntelligenceService.get_price_comparison(product.id)
        return Response(data)

    @action(detail=True, methods=['get'], url_path='price_comparison')
    def price_comparison_alt(self, request, id=None):
        return self.price_comparison(request, id=id)

    @action(detail=True, methods=['get'], url_path='alternatives')
    def alternatives(self, request, id=None):
        """
        GET /api/products/<id>/alternatives/
        Available in-stock alternatives (same product other shops + similar category items).
        """
        product = self.get_object()
        limit = int(request.query_params.get('limit', 4))
        data = ShoppingIntelligenceService.get_product_alternatives(product.id, limit=limit)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='price-alert')
    def price_alert(self, request, id=None):
        """
        POST /api/products/<id>/price-alert/
        Subscribe to price drop or restock alerts for this product.
        """
        product = self.get_object()
        target_price = request.data.get('target_price')
        alert = ShoppingIntelligenceService.create_price_alert(
            user=request.user,
            product=product,
            target_price=Decimal(str(target_price)) if target_price else None,
            alert_on_restock=request.data.get('alert_on_restock', True)
        )
        return Response({
            'success': True,
            'alert_set': True,
            'message': f"Price alert active for '{product.name}'.",
            'alert': PriceAlertSerializer(alert).data
        })

    @action(detail=True, methods=['post'], url_path='price_alert')
    def price_alert_alt(self, request, id=None):
        return self.price_alert(request, id=id)


class ShoppingListViewSet(viewsets.ModelViewSet):
    """
    Student Shopping List & Supply Checklists ViewSet.
    
    SECURITY:
    - User can only view and manage their OWN shopping lists.
    - Admin has platform oversight.
    """
    serializer_class = ShoppingListSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return ShoppingList.objects.none()
        if user.is_admin:
            return ShoppingList.objects.prefetch_related('items__product').all().order_by('-updated_at')
        return ShoppingList.objects.filter(user=user).prefetch_related('items__product').order_by('-updated_at')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=['post'], url_path='convert-to-order')
    def convert_to_order(self, request, pk=None):
        """
        Converts checked items in a shopping list into an Order-ready payload structure.
        """
        shopping_list = self.get_object()
        checked_items = shopping_list.items.filter(is_checked=True).select_related('product')

        if not checked_items.exists():
            # Fall back to all items if none explicitly checked
            checked_items = shopping_list.items.all().select_related('product')

        if not checked_items.exists():
            return Response(
                {"success": False, "message": "Shopping list has no items to order."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Build order items list grouped by shop
        items_by_shop = {}
        for item in checked_items:
            shop_id = item.product.shop_id
            if shop_id not in items_by_shop:
                items_by_shop[shop_id] = []
            items_by_shop[shop_id].append({
                "product_id": item.product.id,
                "product_name": item.product.name,
                "unit_price": float(item.product.price),
                "quantity": item.quantity,
                "total_price": float(item.product.price * item.quantity)
            })

        return Response({
            "success": True,
            "message": f"Successfully prepared order payloads for {len(items_by_shop)} shop(s).",
            "order_batches": [
                {
                    "shop_id": shop_id,
                    "customer_id": shopping_list.user_id,
                    "items": items,
                    "subtotal": sum(i["total_price"] for i in items)
                }
                for shop_id, items in items_by_shop.items()
            ]
        })

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, pk=None):
        """
        POST /api/shopping-lists/{id}/add-item/
        Adds a product or custom academic need to the user's shopping list.
        """
        shopping_list = self.get_object()
        product_id = request.data.get('product_id')
        custom_item_name = request.data.get('custom_item_name') or request.data.get('name')
        source = request.data.get('source', 'MANUAL')
        priority = request.data.get('priority', 'MEDIUM')
        notes = request.data.get('notes', '')
        service_type = request.data.get('service_type', '')
        estimated_price = request.data.get('estimated_price')

        try:
            quantity = int(request.data.get('quantity', 1))
        except (ValueError, TypeError):
            return Response({"success": False, "message": "Invalid quantity."}, status=status.HTTP_400_BAD_REQUEST)

        if not product_id and not custom_item_name:
            return Response({"success": False, "message": "Either product_id or custom_item_name is required."}, status=status.HTTP_400_BAD_REQUEST)
        if quantity < 1:
            return Response({"success": False, "message": "quantity must be at least 1."}, status=status.HTTP_400_BAD_REQUEST)

        product = None
        if product_id:
            try:
                product = Product.objects.get(id=product_id)
            except Product.DoesNotExist:
                return Response({"success": False, "message": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

            item, created = ShoppingListItem.objects.get_or_create(
                shopping_list=shopping_list,
                product=product,
                defaults={
                    'quantity': quantity,
                    'source': source,
                    'priority': priority,
                    'notes': notes,
                    'service_type': service_type,
                    'estimated_price': estimated_price or product.price,
                }
            )
            if not created:
                item.quantity += quantity
                item.save()
        else:
            item = ShoppingListItem.objects.create(
                shopping_list=shopping_list,
                product=None,
                custom_item_name=custom_item_name.strip(),
                quantity=quantity,
                source=source,
                priority=priority,
                notes=notes,
                service_type=service_type,
                estimated_price=estimated_price,
            )
            created = True

        return Response({
            "success": True,
            "message": f"Added '{item.item_name}' to shopping list.",
            "data": ShoppingListItemSerializer(item).data
        }, status=status.HTTP_200_OK if not created else status.HTTP_201_CREATED)

    @action(detail=True, methods=['patch', 'post'], url_path='update-item')
    def update_item(self, request, pk=None):
        """
        POST/PATCH /api/shopping-lists/{id}/update-item/
        Updates quantity or checks/unchecks an item in the shopping list.
        """
        shopping_list = self.get_object()
        item_id = request.data.get('item_id')
        product_id = request.data.get('product_id')

        item = None
        if item_id:
            item = shopping_list.items.filter(id=item_id).first()
        elif product_id:
            item = shopping_list.items.filter(product_id=product_id).first()

        if not item:
            return Response({"success": False, "message": "Shopping list item not found."}, status=status.HTTP_404_NOT_FOUND)

        if 'quantity' in request.data:
            try:
                qty = int(request.data['quantity'])
                if qty < 1:
                    return Response({"success": False, "message": "Quantity must be at least 1."}, status=status.HTTP_400_BAD_REQUEST)
                item.quantity = qty
            except (ValueError, TypeError):
                return Response({"success": False, "message": "Invalid quantity."}, status=status.HTTP_400_BAD_REQUEST)

        if 'is_checked' in request.data:
            val = request.data['is_checked']
            item.is_checked = val in (True, 'true', '1', 1)

        if 'priority' in request.data:
            prio = request.data['priority']
            if prio in dict(ShoppingListItem.Priority.choices):
                item.priority = prio

        if 'notes' in request.data:
            item.notes = request.data['notes']

        item.save()
        return Response({
            "success": True,
            "message": "Shopping list item updated.",
            "data": ShoppingListItemSerializer(item).data
        })

    @action(detail=True, methods=['post', 'delete'], url_path='remove-item')
    def remove_item(self, request, pk=None):
        """
        POST/DELETE /api/shopping-lists/{id}/remove-item/
        Removes an item from the shopping list.
        """
        shopping_list = self.get_object()
        item_id = request.data.get('item_id')
        product_id = request.data.get('product_id')

        item = None
        if item_id:
            item = shopping_list.items.filter(id=item_id).first()
        elif product_id:
            item = shopping_list.items.filter(product_id=product_id).first()

        if not item:
            return Response({"success": False, "message": "Item not found in shopping list."}, status=status.HTTP_404_NOT_FOUND)

        item.delete()
        return Response({
            "success": True,
            "message": "Item removed from shopping list."
        })

    @action(detail=True, methods=['post'], url_path='clear-completed')
    def clear_completed(self, request, pk=None):
        """
        POST /api/shopping-lists/{id}/clear-completed/
        Removes all purchased/checked items from the shopping list.
        """
        shopping_list = self.get_object()
        deleted_count, _ = shopping_list.items.filter(is_checked=True).delete()
        return Response({
            "success": True,
            "message": f"Cleared {deleted_count} completed item(s) from shopping list.",
            "deleted_count": deleted_count
        })

    @action(detail=True, methods=['post'], url_path='add-to-cart')
    def add_to_cart(self, request, pk=None):
        """
        POST /api/shopping-lists/{id}/add-to-cart/
        Authoritatively validates stock and price from backend before returning cart items payload.
        """
        shopping_list = self.get_object()
        item_ids = request.data.get('item_ids')
        
        items_qs = shopping_list.items.all()
        if item_ids:
            items_qs = items_qs.filter(id__in=item_ids)
        elif request.data.get('only_checked'):
            items_qs = items_qs.filter(is_checked=True)

        items_payload = []
        for itm in items_qs:
            if itm.product_id:
                items_payload.append({
                    "product_id": itm.product_id,
                    "quantity": itm.quantity,
                    "name": itm.product.name
                })
            else:
                items_payload.append({
                    "product_id": None,
                    "name": itm.custom_item_name,
                    "quantity": itm.quantity
                })

        from academics.services.planner_service import SmartPlannerService
        result = SmartPlannerService.validate_and_add_to_cart(request.user, items_payload)
        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)


class BulkPricingTierViewSet(viewsets.ModelViewSet):
    """
    CRUD ViewSet for quantity-based volume discount tiers.
    Shopkeepers manage tiers for their own shop; Admins have global oversight.
    """
    serializer_class = BulkPricingTierSerializer
    permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return BulkPricingTier.objects.none()
        if getattr(user, 'is_admin', False):
            return BulkPricingTier.objects.select_related('shop', 'product').all()
        return BulkPricingTier.objects.filter(shop__owner=user).select_related('shop', 'product')

    def perform_create(self, serializer):
        user = self.request.user
        shop = serializer.validated_data.get('shop')
        if not getattr(user, 'is_admin', False) and shop.owner != user:
            raise PermissionDenied("You can only configure bulk pricing tiers for your own shop.")
        serializer.save()

    def perform_update(self, serializer):
        user = self.request.user
        if not getattr(user, 'is_admin', False) and serializer.instance.shop.owner != user:
            raise PermissionDenied("You can only modify bulk pricing tiers for your own shop.")
        serializer.save()


class PriceAlertViewSet(viewsets.ModelViewSet):
    """
    ViewSet for student price drop and restock alert subscriptions.
    """
    serializer_class = PriceAlertSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return PriceAlert.objects.none()
        return PriceAlert.objects.filter(user=user).select_related('product', 'product__shop')

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ReviewViewSet(viewsets.ModelViewSet):
    """
    Step 24: Product & Shop Reviews API.
    Enforces verified purchases, duplicate blocking, review moderation, and rating aggregations.
    """
    serializer_class = ReviewSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'summary']:
            permission_classes = [permissions.AllowAny]
        elif self.action == 'create':
            permission_classes = [permissions.IsAuthenticated]
        elif self.action in ['update', 'partial_update', 'destroy']:
            permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
        elif self.action == 'moderate':
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        elif self.action == 'respond':
            permission_classes = [permissions.IsAuthenticated, IsShopOwnerOrAdmin]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        user = self.request.user
        queryset = Review.objects.select_related('user', 'product', 'shop', 'order', 'moderated_by').all()

        product_id = self.request.query_params.get('product')
        shop_id = self.request.query_params.get('shop')
        rating = self.request.query_params.get('rating')
        r_status = self.request.query_params.get('status')

        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if shop_id:
            queryset = queryset.filter(shop_id=shop_id)
        if rating:
            queryset = queryset.filter(rating=rating)

        # Moderation filtering:
        if user and user.is_authenticated and getattr(user, 'is_admin', False):
            if r_status:
                queryset = queryset.filter(status=r_status)
        elif user and user.is_authenticated and getattr(user, 'is_shop_owner', False):
            # Merchant can see reviews of their shop
            if r_status:
                queryset = queryset.filter(status=r_status, shop__owner=user)
            else:
                queryset = queryset.filter(Q(status=Review.Status.APPROVED) | Q(shop__owner=user))
        else:
            # Public / Students only see APPROVED reviews unless viewing own
            if user and user.is_authenticated:
                queryset = queryset.filter(Q(status=Review.Status.APPROVED) | Q(user=user))
            else:
                queryset = queryset.filter(status=Review.Status.APPROVED)

        return queryset.order_by('-created_at')

    def perform_create(self, serializer):
        user = self.request.user
        product = serializer.validated_data.get('product')
        shop = serializer.validated_data.get('shop')
        order = serializer.validated_data.get('order')

        if product and not shop:
            shop = product.shop

        # Enforce verified purchase
        verification = ReviewService.verify_purchase(
            user=user,
            product=product,
            shop=shop,
            order_id=order.id if order else None
        )

        if not verification['is_verified']:
            raise PermissionDenied(verification['reason'])

        assigned_order = verification['order']
        assigned_item = verification['order_item']

        # Prevent duplicate reviews
        if product:
            if Review.objects.filter(user=user, product=product).exists():
                raise PermissionDenied("You have already submitted a review for this product. Please edit your existing review.")
        elif shop:
            if Review.objects.filter(user=user, shop=shop, product__isnull=True).exists():
                raise PermissionDenied("You have already submitted a review for this store. Please edit your existing review.")

        serializer.save(
            user=user,
            shop=shop,
            order=assigned_order,
            order_item=assigned_item,
            status=Review.Status.APPROVED
        )

    def perform_update(self, serializer):
        user = self.request.user
        if not getattr(user, 'is_admin', False) and serializer.instance.user != user:
            raise PermissionDenied("You can only edit your own reviews.")
        serializer.save()

    def perform_destroy(self, instance):
        user = self.request.user
        if not getattr(user, 'is_admin', False) and instance.user != user:
            raise PermissionDenied("You can only delete your own reviews.")
        instance.delete()

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        """
        GET /api/reviews/summary/?product=X or ?shop=Y
        Returns average rating, total count, and 1-5 star distribution histogram.
        """
        product_id = request.query_params.get('product')
        shop_id = request.query_params.get('shop')

        product = Product.objects.filter(id=product_id).first() if product_id else None
        shop = None
        if shop_id:
            from shops.models import Shop
            shop = Shop.objects.filter(id=shop_id).first()

        data = ReviewService.get_rating_summary(product=product, shop=shop)
        return Response(data)

    @action(detail=True, methods=['post'], url_path='moderate')
    def moderate(self, request, id=None):
        """
        POST /api/reviews/{id}/moderate/
        Admin moderation workflow: approve, reject, hide, or restore.
        """
        if not getattr(request.user, 'is_admin', False):
            raise PermissionDenied("Only administrators can moderate reviews.")

        review = self.get_object()
        new_status = request.data.get('status')
        notes = request.data.get('moderation_notes', '')

        if new_status not in Review.Status.values:
            return Response({"error": f"Invalid status: {new_status}"}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils import timezone
        review.status = new_status
        review.moderation_notes = notes
        review.moderated_by = request.user
        review.moderated_at = timezone.now()
        if new_status == Review.Status.APPROVED:
            review.is_reported = False
        review.save()

        return Response(ReviewSerializer(review).data)

    @action(detail=True, methods=['post'], url_path='report')
    def report(self, request, id=None):
        """
        POST /api/reviews/{id}/report/
        Flag a review for administrative review.
        """
        review = self.get_object()
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({"error": "Report reason is required."}, status=status.HTTP_400_BAD_REQUEST)

        review.is_reported = True
        review.report_reason = reason
        review.status = Review.Status.REPORTED
        review.save(update_fields=['is_reported', 'report_reason', 'status', 'updated_at'])

        return Response({
            "success": True,
            "message": "Review reported for administrator moderation."
        })

    @action(detail=True, methods=['post'], url_path='respond')
    def respond(self, request, id=None):
        """
        POST /api/reviews/{id}/respond/
        Shop owner response to customer review.
        """
        review = self.get_object()
        user = request.user
        if not (getattr(user, 'is_admin', False) or (review.shop and review.shop.owner == user)):
            raise PermissionDenied("Only the owner of this shop can respond to customer reviews.")

        response_text = request.data.get('seller_response', '').strip()
        if not response_text:
            return Response({"error": "Response text cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        from django.utils import timezone
        review.seller_response = response_text
        review.seller_responded_at = timezone.now()
        review.save(update_fields=['seller_response', 'seller_responded_at', 'updated_at'])

        return Response(ReviewSerializer(review).data)


class WishlistViewSet(viewsets.ModelViewSet):
    """
    Step 24: Student Wishlist API.
    Provides private wishlist management, stock availability checks,
    and single-click migration to cart or shopping lists.
    """
    serializer_class = WishlistSerializer
    lookup_field = 'id'
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Wishlist.objects.none()
        return Wishlist.objects.filter(user=user).select_related('product', 'product__shop', 'product__category')

    def perform_create(self, serializer):
        user = self.request.user
        product = serializer.validated_data.get('product')
        if Wishlist.objects.filter(user=user, product=product).exists():
            raise PermissionDenied("This product is already in your wishlist.")
        serializer.save(user=user)

    @action(detail=False, methods=['post'], url_path='toggle')
    def toggle(self, request):
        """
        POST /api/wishlist/toggle/
        Quick toggle button on product cards. Adds if missing, removes if present.
        Payload: { "product_id": 12 }
        """
        product_id = request.data.get('product_id')
        if not product_id:
            return Response({"error": "Product ID is required."}, status=status.HTTP_400_BAD_REQUEST)

        product = Product.objects.filter(id=product_id).first()
        if not product:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)

        item = Wishlist.objects.filter(user=request.user, product=product).first()
        if item:
            item.delete()
            return Response({
                "in_wishlist": False,
                "message": f"'{product.name}' removed from your wishlist."
            })
        else:
            Wishlist.objects.create(user=request.user, product=product)
            return Response({
                "in_wishlist": True,
                "message": f"'{product.name}' added to your wishlist."
            })

    @action(detail=False, methods=['get'], url_path='check')
    def check(self, request):
        """
        GET /api/wishlist/check/?product=12
        Returns whether the specified product is in user's wishlist.
        """
        product_id = request.query_params.get('product')
        if not product_id:
            return Response({"is_wishlisted": False})
        is_wishlisted = Wishlist.objects.filter(user=request.user, product_id=product_id).exists()
        return Response({"is_wishlisted": is_wishlisted})

    @action(detail=True, methods=['post'], url_path='move-to-cart')
    def move_to_cart(self, request, id=None):
        """
        POST /api/wishlist/{id}/move-to-cart/
        Validates inventory availability and prepares cart addition payload.
        """
        wishlist_item = self.get_object()
        product = wishlist_item.product

        # Check inventory
        inv = getattr(product, 'inventory_records', None)
        first_inv = inv.first() if inv else None
        current_stock = first_inv.current_stock if first_inv else 0

        if current_stock <= 0:
            return Response({
                "success": False,
                "message": f"'{product.name}' is currently out of stock. You can check alternative items.",
                "is_in_stock": False
            }, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            "success": True,
            "message": f"'{product.name}' is ready to be added to your cart.",
            "item": {
                "product_id": product.id,
                "name": product.name,
                "price": float(product.price),
                "shop_id": product.shop_id,
                "shop_name": product.shop.name if product.shop else '',
                "quantity": 1
            }
        })

    @action(detail=True, methods=['post'], url_path='move-to-shopping-list')
    def move_to_shopping_list(self, request, id=None):
        """
        POST /api/wishlist/{id}/move-to-shopping-list/
        Transfers item into student's persistent academic shopping list.
        """
        wishlist_item = self.get_object()
        user = request.user
        list_id = request.data.get('shopping_list_id')

        if list_id:
            shopping_list = ShoppingList.objects.filter(id=list_id, user=user).first()
        else:
            shopping_list = ShoppingList.objects.filter(user=user).first()
            if not shopping_list:
                shopping_list = ShoppingList.objects.create(user=user, name="My Stationery List")

        if not shopping_list:
            return Response({"error": "Shopping list not found."}, status=status.HTTP_404_NOT_FOUND)

        from products.models import ShoppingListItem
        item, created = ShoppingListItem.objects.get_or_create(
            shopping_list=shopping_list,
            product=wishlist_item.product,
            defaults={
                'source': ShoppingListItem.Source.MANUAL,
                'priority': ShoppingListItem.Priority.MEDIUM,
                'quantity': 1
            }
        )

        return Response({
            "success": True,
            "message": f"'{wishlist_item.product.name}' added to list '{shopping_list.name}'.",
            "list_id": shopping_list.id
        })



