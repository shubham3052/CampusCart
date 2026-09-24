from decimal import Decimal
from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import (
    Category,
    Product,
    Review,
    Wishlist,
    ShoppingList,
    ShoppingListItem,
    BulkPricingTier,
    PriceAlert
)
from shops.models import Shop


class CategorySerializer(serializers.ModelSerializer):
    """
    Serializer for product classification categories.
    """
    slug = serializers.SlugField(required=False)
    product_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'slug',
            'description',
            'is_active',
            'product_count',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate(self, attrs):
        if not attrs.get('slug') and attrs.get('name'):
            from django.utils.text import slugify
            attrs['slug'] = slugify(attrs['name'])
        return super().validate(attrs)

    @extend_schema_field(serializers.IntegerField())
    def get_product_count(self, obj):
        return obj.products.filter(is_active=True).count()


class ProductSummarySerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for nested product references.
    """
    class Meta:
        model = Product
        fields = ['id', 'name', 'price', 'unit', 'image', 'is_active']


class ProductSerializer(serializers.ModelSerializer):
    """
    Full Product Serializer with nested Category, Shop summary, and live stock info.
    """
    category_details = CategorySerializer(source='category', read_only=True)
    shop = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all(), required=False, allow_null=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    shop_location = serializers.CharField(source='shop.campus_location', read_only=True)
    unit_display = serializers.CharField(source='get_unit_display', read_only=True)
    slug = serializers.SlugField(required=False)
    sku = serializers.CharField(max_length=60, required=False, allow_blank=True)
    current_stock = serializers.SerializerMethodField()
    is_in_stock = serializers.SerializerMethodField()
    stock_status = serializers.SerializerMethodField()
    initial_stock = serializers.IntegerField(required=False, write_only=True, min_value=0, allow_null=True)

    class Meta:
        model = Product
        fields = [
            'id',
            'shop',
            'shop_name',
            'shop_location',
            'category',
            'category_details',
            'name',
            'slug',
            'sku',
            'description',
            'price',
            'brand',
            'unit',
            'unit_display',
            'image',
            'current_stock',
            'is_in_stock',
            'stock_status',
            'initial_stock',
            'bulk_pricing_tiers',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'bulk_pricing_tiers']
        validators = []  # Bypass DRF auto unique_together validator so shop & sku can be auto-derived

    def validate(self, attrs):
        request = self.context.get('request')
        user = getattr(request, 'user', None)

        # Secure Shop Auto-Derivation for Shop Owners
        if user and user.is_authenticated and getattr(user, 'is_shop_owner', False) and not getattr(user, 'is_admin', False):
            owned_shop = getattr(user, 'owned_shop', None)
            if not owned_shop:
                owned_shop = Shop.objects.filter(owner=user).first()
            if not owned_shop:
                raise serializers.ValidationError({"shop": "No active stationery shop found associated with your account."})

            target_shop = attrs.get('shop')
            if target_shop and target_shop != owned_shop:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied("You can only add products to your own shop.")

            attrs['shop'] = owned_shop
        elif not attrs.get('shop') and not self.instance:
            # If not shop owner and shop not provided, check if user has shop
            if user and hasattr(user, 'owned_shop') and user.owned_shop:
                attrs['shop'] = user.owned_shop
            else:
                raise serializers.ValidationError({"shop": "This field is required."})

        if not attrs.get('slug') and attrs.get('name'):
            from django.utils.text import slugify
            import uuid
            base = slugify(attrs['name'])
            attrs['slug'] = f"{base}-{uuid.uuid4().hex[:6]}"

        if not attrs.get('sku') and attrs.get('name') and not self.instance:
            from django.utils.text import slugify
            import uuid
            clean = slugify(attrs['name'])[:8].upper() or 'PROD'
            attrs['sku'] = f"{clean}-{uuid.uuid4().hex[:6].upper()}"

        # Enforce unique_together (shop, sku)
        shop = attrs.get('shop') or (self.instance.shop if self.instance else None)
        sku = attrs.get('sku') or (self.instance.sku if self.instance else None)
        if shop and sku:
            qs = Product.objects.filter(shop=shop, sku=sku)
            if self.instance:
                qs = qs.exclude(pk=self.instance.pk)
            if qs.exists():
                raise serializers.ValidationError({"sku": "A product with this SKU already exists in this shop."})

        return attrs

    @extend_schema_field(serializers.IntegerField())
    def get_current_stock(self, obj):
        # Read from associated inventory record if present
        inv = getattr(obj, 'inventory_records', None)
        if inv:
            first_inv = inv.first()
            return first_inv.current_stock if first_inv else 0
        return 0

    @extend_schema_field(serializers.BooleanField())
    def get_is_in_stock(self, obj):
        return self.get_current_stock(obj) > 0

    @extend_schema_field(serializers.CharField())
    def get_stock_status(self, obj):
        inv = getattr(obj, 'inventory_records', None)
        if inv:
            first_inv = inv.first()
            if first_inv:
                return first_inv.stock_status
        return 'OUT_OF_STOCK'

    def validate_name(self, value):
        if not value or len(value.strip()) < 2:
            raise serializers.ValidationError("Product name must be at least 2 characters long.")
        return value.strip()

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price cannot be negative.")
        return value

    def validate_shop(self, value):
        if not value.is_active:
            raise serializers.ValidationError("Cannot add products to an inactive shop.")
        return value

    def create(self, validated_data):
        from django.db import transaction
        from inventory.models import Inventory, InventoryTransaction

        initial_stock = validated_data.pop('initial_stock', None)
        if initial_stock is None and hasattr(self, 'initial_data'):
            raw = self.initial_data.get('initial_stock')
            if raw is not None and str(raw).strip() != '':
                try:
                    initial_stock = max(0, int(raw))
                except (ValueError, TypeError):
                    initial_stock = None

        with transaction.atomic():
            product = super().create(validated_data)

            if initial_stock is not None:
                inv, created = Inventory.objects.get_or_create(
                    shop=product.shop,
                    product=product,
                    defaults={
                        'current_stock': initial_stock,
                        'minimum_stock': 5,
                        'reorder_level': 10,
                        'selling_price_snapshot': product.price,
                    }
                )
                if not created:
                    inv.current_stock = initial_stock
                    inv.save(update_fields=['current_stock', 'updated_at'])

                if initial_stock > 0:
                    request = self.context.get('request')
                    actor = request.user if request and request.user and request.user.is_authenticated else None
                    InventoryTransaction.objects.create(
                        inventory=inv,
                        transaction_type=InventoryTransaction.TransactionType.INITIAL_STOCK,
                        quantity_change=initial_stock,
                        stock_before=0,
                        stock_after=initial_stock,
                        reason="Initial inventory setup upon product creation",
                        performed_by=actor
                    )

            return product

    def update(self, instance, validated_data):
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if user and not getattr(user, 'is_admin', False):
            # Prohibit altering shop ownership on existing products
            validated_data.pop('shop', None)

        validated_data.pop('initial_stock', None)
        return super().update(instance, validated_data)


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    shop = serializers.PrimaryKeyRelatedField(queryset=Shop.objects.all(), required=False)
    shop_name = serializers.CharField(source='shop.name', read_only=True, allow_null=True)
    product_name = serializers.CharField(source='product.name', read_only=True, allow_null=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    moderated_by_username = serializers.CharField(source='moderated_by.username', read_only=True, allow_null=True)

    class Meta:
        model = Review
        fields = [
            'id',
            'user',
            'username',
            'shop',
            'shop_name',
            'product',
            'product_name',
            'order',
            'order_item',
            'rating',
            'comment',
            'status',
            'status_display',
            'is_reported',
            'report_reason',
            'moderation_notes',
            'moderated_by',
            'moderated_by_username',
            'moderated_at',
            'seller_response',
            'seller_responded_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'username',
            'status',
            'status_display',
            'is_reported',
            'report_reason',
            'moderation_notes',
            'moderated_by',
            'moderated_by_username',
            'moderated_at',
            'seller_response',
            'seller_responded_at',
            'created_at',
            'updated_at',
        ]

    def validate(self, attrs):
        if not attrs.get('shop') and attrs.get('product'):
            attrs['shop'] = attrs['product'].shop
        if not attrs.get('shop'):
            raise serializers.ValidationError({"shop": "Shop must be specified or inferable from product."})
        return attrs

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("Rating must be an integer between 1 and 5.")
        return value


class WishlistSerializer(serializers.ModelSerializer):
    product_details = ProductSummarySerializer(source='product', read_only=True)
    is_in_stock = serializers.SerializerMethodField()
    current_stock = serializers.SerializerMethodField()
    suggested_alternatives = serializers.SerializerMethodField()

    class Meta:
        model = Wishlist
        fields = [
            'id',
            'user',
            'product',
            'product_details',
            'is_in_stock',
            'current_stock',
            'suggested_alternatives',
            'created_at',
        ]
        read_only_fields = ['id', 'user', 'created_at']

    @extend_schema_field(serializers.IntegerField())
    def get_current_stock(self, obj):
        if obj.product:
            inv = getattr(obj.product, 'inventory_records', None)
            if inv:
                first_inv = inv.first()
                return first_inv.current_stock if first_inv else 0
        return 0

    @extend_schema_field(serializers.BooleanField())
    def get_is_in_stock(self, obj):
        return self.get_current_stock(obj) > 0

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_suggested_alternatives(self, obj):
        if self.get_is_in_stock(obj) or not obj.product:
            return []
        alts = Product.objects.filter(
            category=obj.product.category,
            is_active=True
        ).exclude(id=obj.product.id)[:3]
        return [
            {
                'id': a.id,
                'name': a.name,
                'price': float(a.price),
                'shop_name': a.shop.name if a.shop else ''
            }
            for a in alts
        ]


class ShoppingListItemSerializer(serializers.ModelSerializer):
    product_details = ProductSummarySerializer(source='product', read_only=True)
    item_name = serializers.CharField(read_only=True)
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)

    class Meta:
        model = ShoppingListItem
        fields = [
            'id',
            'shopping_list',
            'product',
            'product_details',
            'custom_item_name',
            'item_name',
            'source',
            'source_display',
            'priority',
            'priority_display',
            'notes',
            'service_type',
            'estimated_price',
            'quantity',
            'is_checked',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'item_name', 'created_at', 'updated_at']

    def validate_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Quantity must be at least 1.")
        return value


class ShoppingListSerializer(serializers.ModelSerializer):
    items = ShoppingListItemSerializer(many=True, read_only=True)
    total_estimated_cost = serializers.SerializerMethodField()

    class Meta:
        model = ShoppingList
        fields = ['id', 'user', 'name', 'items', 'total_estimated_cost', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    @extend_schema_field(serializers.FloatField())
    def get_total_estimated_cost(self, obj):
        total = Decimal('0.00')
        for item in obj.items.select_related('product'):
            if item.product and item.product.price:
                total += (item.product.price * item.quantity)
            elif item.estimated_price:
                total += (item.estimated_price * item.quantity)
        return float(total)


class BulkPricingTierSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True, default='All Products')
    discount_type_display = serializers.CharField(source='get_discount_type_display', read_only=True)

    class Meta:
        model = BulkPricingTier
        fields = [
            'id',
            'shop',
            'shop_name',
            'product',
            'product_name',
            'min_quantity',
            'max_quantity',
            'discount_type',
            'discount_type_display',
            'discount_value',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PriceAlertSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    shop_name = serializers.CharField(source='product.shop.name', read_only=True)
    current_product_price = serializers.DecimalField(source='product.price', max_digits=10, decimal_places=2, read_only=True)

    class Meta:
        model = PriceAlert
        fields = [
            'id',
            'user',
            'product',
            'product_name',
            'shop_name',
            'current_product_price',
            'target_price',
            'initial_price',
            'alert_on_restock',
            'is_active',
            'is_triggered',
            'triggered_at',
            'created_at',
        ]
        read_only_fields = ['id', 'user', 'initial_price', 'is_triggered', 'triggered_at', 'created_at']


