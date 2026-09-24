import re
from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from users.models import AuditLog
from shops.models import Shop
from orders.models import Order, OrderItem, Payment, Refund, Coupon
from inventory.models import Inventory
from printing.models import PrintingOrder
from predictions.models import DemandPrediction
from notifications.models import Notification

User = get_user_model()


class AdminManagementSerializer(serializers.ModelSerializer):
    """
    Serializer for Platform Owner to manage Administrator accounts.
    Strictly forbids role escalation to PLATFORM_OWNER.
    Passwords are write-only and validated against Django password validators.
    """
    name = serializers.CharField(max_length=150, required=False, trim_whitespace=True)
    password = serializers.CharField(
        write_only=True,
        required=False,
        style={'input_type': 'password'},
        min_length=8
    )

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'first_name',
            'last_name',
            'name',
            'phone_number',
            'department',
            'role',
            'is_active',
            'is_staff',
            'created_at',
            'last_login',
            'password',
        ]
        read_only_fields = ['id', 'username', 'role', 'is_staff', 'created_at', 'last_login']

    def validate_email(self, value):
        email_clean = value.strip().lower()
        instance = getattr(self, 'instance', None)
        qs = User.objects.filter(email__iexact=email_clean)
        if instance:
            qs = qs.exclude(id=instance.id)
        if qs.exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return email_clean

    def validate_password(self, value):
        if value:
            if len(value) < 8:
                raise serializers.ValidationError("Password must be at least 8 characters long.")
            if not re.search(r'\d', value):
                raise serializers.ValidationError("Password must contain at least one numerical digit.")
            validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        if not password:
            raise serializers.ValidationError({"password": "A secure initial password is required to create an Administrator."})

        name = validated_data.pop('name', '').strip()
        if name:
            parts = name.split(' ', 1)
            validated_data['first_name'] = parts[0]
            validated_data['last_name'] = parts[1] if len(parts) > 1 else ''

        email = validated_data['email'].strip().lower()
        validated_data['email'] = email
        validated_data['username'] = email
        # Strictly assign ADMIN role, never PLATFORM_OWNER
        validated_data['role'] = User.Role.ADMIN
        validated_data['is_staff'] = True
        validated_data['email_verified'] = True

        admin_user = User(**validated_data)
        admin_user.set_password(password)
        admin_user.save()

        AuditService_log_admin_created(self.context.get('request'), admin_user)
        return admin_user

    def update(self, instance, validated_data):
        # Prevent mutating role to PLATFORM_OWNER or changing username
        validated_data.pop('role', None)
        validated_data.pop('username', None)
        password = validated_data.pop('password', None)

        name = validated_data.pop('name', None)
        if name is not None:
            parts = name.strip().split(' ', 1)
            instance.first_name = parts[0]
            instance.last_name = parts[1] if len(parts) > 1 else ''

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()
        return instance


def AuditService_log_admin_created(request, target_user):
    from users.services.audit_service import AuditService
    AuditService.log(
        action=AuditLog.Action.ADMIN_ACTION,
        actor=getattr(request, 'user', None),
        actor_email=getattr(request.user, 'email', '') if request and request.user else '',
        target_model='User',
        target_id=str(target_user.id),
        metadata={"sub_action": "ADMIN_ACCOUNT_CREATED", "email": target_user.email},
        request=request
    )


class PlatformOwnerUserSerializer(serializers.ModelSerializer):
    """
    Serializer for Platform Owner to oversee Student / Customer accounts.
    Excludes passwords and sensitive secrets.
    """
    name = serializers.CharField(read_only=True)
    orders_count = serializers.SerializerMethodField()
    total_spend = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'name',
            'first_name',
            'last_name',
            'phone_number',
            'role',
            'college_id',
            'department',
            'hostel_block',
            'room_number',
            'email_verified',
            'is_active',
            'created_at',
            'last_login',
            'orders_count',
            'total_spend',
        ]
        read_only_fields = fields

    def get_orders_count(self, obj):
        return Order.objects.filter(customer=obj).count()

    def get_total_spend(self, obj):
        from django.db.models import Sum
        completed = Order.objects.filter(customer=obj, status=Order.Status.COMPLETED).aggregate(s=Sum('total_amount'))
        return float(completed['s'] or 0.0)


class PlatformOwnerShopOwnerSerializer(serializers.ModelSerializer):
    """
    Serializer for Platform Owner to oversee Shop Owners and their linked shops.
    """
    name = serializers.CharField(read_only=True)
    shop_details = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'name',
            'phone_number',
            'role',
            'email_verified',
            'is_active',
            'created_at',
            'shop_details',
        ]
        read_only_fields = fields

    def get_shop_details(self, obj):
        shop = getattr(obj, 'owned_shop', None)
        if not shop:
            return None
        return {
            'id': shop.id,
            'name': shop.name,
            'slug': shop.slug,
            'shop_type': shop.shop_type,
            'shop_type_display': shop.get_shop_type_display(),
            'campus_location': shop.campus_location,
            'is_active': shop.is_active,
            'rating': float(shop.rating),
            'contact_phone': shop.contact_phone,
            'total_orders': Order.objects.filter(shop=shop).count(),
        }


class PlatformOwnerShopSerializer(serializers.ModelSerializer):
    """
    Serializer for Platform Owner to view and manage campus stores.
    """
    owner_name = serializers.CharField(source='owner.name', read_only=True)
    owner_email = serializers.CharField(source='owner.email', read_only=True)
    total_products = serializers.SerializerMethodField()
    total_orders = serializers.SerializerMethodField()
    inventory_items_count = serializers.SerializerMethodField()
    low_stock_count = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = [
            'id',
            'name',
            'slug',
            'shop_type',
            'description',
            'address',
            'campus_location',
            'contact_phone',
            'contact_email',
            'opening_time',
            'closing_time',
            'latitude',
            'longitude',
            'is_active',
            'commission_rate',
            'rating',
            'owner_name',
            'owner_email',
            'total_products',
            'total_orders',
            'inventory_items_count',
            'low_stock_count',
            'created_at',
        ]
        read_only_fields = ['id', 'slug', 'owner_name', 'owner_email', 'total_products', 'total_orders', 'inventory_items_count', 'low_stock_count', 'created_at']

    def get_total_products(self, obj):
        return obj.products.count()

    def get_total_orders(self, obj):
        return Order.objects.filter(shop=obj).count()

    def get_inventory_items_count(self, obj):
        return Inventory.objects.filter(shop=obj).count()

    def get_low_stock_count(self, obj):
        from django.db.models import F
        return Inventory.objects.filter(shop=obj, current_stock__lte=F('reorder_level')).count()


class PlatformOwnerDeliveryPartnerSerializer(serializers.ModelSerializer):
    """
    Serializer for Platform Owner to oversee campus couriers / delivery agents.
    """
    name = serializers.CharField(read_only=True)
    active_deliveries_count = serializers.SerializerMethodField()
    completed_deliveries_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'name',
            'phone_number',
            'role',
            'availability_status',
            'approval_status',
            'email_verified',
            'is_active',
            'created_at',
            'active_deliveries_count',
            'completed_deliveries_count',
        ]
        read_only_fields = fields

    def get_active_deliveries_count(self, obj):
        from delivery.models import Delivery
        return Delivery.objects.filter(
            delivery_agent=obj,
            delivery_status__in=['ASSIGNED', 'ARRIVED_AT_SHOP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING']
        ).count()

    def get_completed_deliveries_count(self, obj):
        from delivery.models import Delivery
        return Delivery.objects.filter(delivery_agent=obj, delivery_status='DELIVERED').count()


class PlatformOwnerOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)

    class Meta:
        model = OrderItem
        fields = [
            'id',
            'product_name',
            'product_sku',
            'quantity',
            'unit_price',
            'total_price',
        ]


class PlatformOwnerOrderSerializer(serializers.ModelSerializer):
    """
    Comprehensive Order oversight serializer for Platform Owner.
    """
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    customer_email = serializers.CharField(source='customer.email', read_only=True)
    customer_phone = serializers.CharField(source='customer.phone_number', read_only=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    items = PlatformOwnerOrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id',
            'order_number',
            'customer_name',
            'customer_email',
            'customer_phone',
            'shop_name',
            'order_type',
            'fulfillment_type',
            'status',
            'payment_status',
            'payment_method',
            'subtotal',
            'discount_amount',
            'delivery_fee',
            'total_amount',
            'created_at',
            'updated_at',
            'items',
        ]
        read_only_fields = fields


class PlatformOwnerPaymentSerializer(serializers.ModelSerializer):
    """
    Payment transaction serializer. Zero sensitive provider secrets exposed.
    """
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.name', read_only=True)

    class Meta:
        model = Payment
        fields = [
            'id',
            'gateway_payment_id',
            'order_number',
            'customer_name',
            'amount',
            'currency',
            'status',
            'payment_method',
            'gateway',
            'created_at',
            'updated_at',
        ]
        read_only_fields = fields


class PlatformOwnerRefundSerializer(serializers.ModelSerializer):
    """
    Refund oversight serializer for Platform Owner.
    """
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    customer_name = serializers.CharField(source='order.customer.name', read_only=True)

    class Meta:
        model = Refund
        fields = [
            'id',
            'gateway_refund_id',
            'order_number',
            'customer_name',
            'amount',
            'reason',
            'status',
            'processed_at',
            'created_at',
        ]
        read_only_fields = fields


class PlatformOwnerInventorySerializer(serializers.ModelSerializer):
    """
    Inventory health and low-stock monitor serializer.
    """
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    category_name = serializers.CharField(source='product.category.name', read_only=True)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Inventory
        fields = [
            'id',
            'shop',
            'shop_name',
            'product',
            'product_name',
            'product_sku',
            'category_name',
            'current_stock',
            'reserved_stock',
            'minimum_stock',
            'reorder_level',
            'maximum_stock',
            'unit_cost',
            'is_low_stock',
        ]
        read_only_fields = fields

    def get_is_low_stock(self, obj):
        return obj.current_stock <= obj.reorder_level


class PlatformOwnerDemandPredictionSerializer(serializers.ModelSerializer):
    """
    ML demand predictions serializer.
    """
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    category_name = serializers.CharField(source='product.category.name', read_only=True)

    class Meta:
        model = DemandPrediction
        fields = [
            'id',
            'shop_name',
            'product_name',
            'category_name',
            'target_date',
            'forecast_horizon',
            'predicted_units',
            'confidence_score',
            'confidence_interval_low',
            'confidence_interval_high',
            'created_at',
        ]
        read_only_fields = fields


class PlatformOwnerPrintingSerializer(serializers.ModelSerializer):
    """
    Printout and Xerox order oversight serializer.
    Strictly displays metadata without exposing raw private document files.
    """
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    shop_name = serializers.CharField(source='order.shop.name', read_only=True)
    customer_name = serializers.CharField(source='order.customer.name', read_only=True)
    document_title = serializers.SerializerMethodField()

    class Meta:
        model = PrintingOrder
        fields = [
            'id',
            'order_number',
            'shop_name',
            'customer_name',
            'document_title',
            'total_pages',
            'copies',
            'color_mode',
            'paper_size',
            'print_sides',
            'binding_type',
            'status',
            'price',
            'created_at',
        ]
        read_only_fields = fields

    def get_document_title(self, obj):
        doc = getattr(obj, 'document', None)
        if doc and hasattr(doc, 'file_name'):
            return doc.file_name
        return f"Document Job #{obj.id}"


class PlatformOwnerCouponSerializer(serializers.ModelSerializer):
    """
    Promotions and campus coupons oversight serializer.
    """
    class Meta:
        model = Coupon
        fields = [
            'id',
            'code',
            'title',
            'description',
            'discount_type',
            'discount_value',
            'minimum_order_amount',
            'max_discount_amount',
            'usage_limit',
            'total_used',
            'is_active',
            'valid_from',
            'valid_until',
            'created_at',
        ]
        read_only_fields = ['id', 'total_used', 'created_at']


class PlatformOwnerBroadcastSerializer(serializers.Serializer):
    """
    System Notification Broadcast Serializer.
    Enables Platform Owner to broadcast targeted or campus-wide alerts.
    """
    TARGET_CHOICES = [
        ('ALL', 'All Platform Users'),
        ('STUDENT', 'All Students / Customers'),
        ('SHOP_OWNER', 'All Shop Owners'),
        ('DELIVERY_AGENT', 'All Delivery Partners'),
        ('ADMIN', 'All System Administrators'),
    ]

    target_group = serializers.ChoiceField(choices=TARGET_CHOICES, default='ALL')
    title = serializers.CharField(max_length=150, required=True)
    message = serializers.CharField(required=True)
    notification_type = serializers.CharField(default=Notification.NotificationType.OFFER_ALERT)


class PlatformOwnerAuditLogSerializer(serializers.ModelSerializer):
    """
    Security Audit Log serializer.
    """
    class Meta:
        model = AuditLog
        fields = [
            'id',
            'actor_email',
            'action',
            'target_model',
            'target_id',
            'ip_address',
            'metadata',
            'timestamp',
        ]
        read_only_fields = fields


class PlatformOwnerProfileSerializer(serializers.ModelSerializer):
    """
    Profile information for the Platform Owner account.
    """
    name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'name',
            'first_name',
            'last_name',
            'phone_number',
            'role',
            'email_verified',
            'is_active',
            'created_at',
            'last_login',
        ]
        read_only_fields = ['id', 'username', 'email', 'role', 'email_verified', 'is_active', 'created_at', 'last_login']


class ChangePasswordSerializer(serializers.Serializer):
    """
    Secure password change serializer verifying current password.
    """
    current_password = serializers.CharField(required=True, write_only=True)
    new_password = serializers.CharField(required=True, write_only=True, min_length=8)

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'\d', value):
            raise serializers.ValidationError("Password must contain at least one numerical digit.")
        validate_password(value)
        return value
