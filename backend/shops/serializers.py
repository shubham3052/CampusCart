from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import Shop, ShopFavorite, Offer
from users.serializers import UserSerializer

class ShopSerializer(serializers.ModelSerializer):
    """
    Serializer for stationery/print shops.
    Includes nested owner summary and operational metrics.
    """
    owner_details = UserSerializer(source='owner', read_only=True)
    shop_type_display = serializers.CharField(source='get_shop_type_display', read_only=True)
    pickup_available = serializers.SerializerMethodField()
    delivery_available = serializers.SerializerMethodField()

    class Meta:
        model = Shop
        fields = [
            'id',
            'owner',
            'owner_details',
            'name',
            'slug',
            'shop_type',
            'shop_type_display',
            'description',
            'address',
            'campus_location',
            'contact_phone',
            'contact_email',
            'opening_time',
            'closing_time',
            'latitude',
            'longitude',
            'pickup_available',
            'delivery_available',
            'is_active',
            'rating',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'rating', 'created_at', 'updated_at']

    @extend_schema_field(serializers.BooleanField())
    def get_pickup_available(self, obj):
        # A shop offers pickup if it is active and has configured pickup slots
        return obj.is_active

    @extend_schema_field(serializers.BooleanField())
    def get_delivery_available(self, obj):
        # By campus policy, college and local shops offer doorstep hostel delivery
        return obj.is_active

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90.0 and 90.0 degrees.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180.0 and 180.0 degrees.")
        return value

    def validate_name(self, value):
        if len(value.strip()) < 3:
            raise serializers.ValidationError("Shop name must be at least 3 characters long.")
        return value


class ShopFavoriteSerializer(serializers.ModelSerializer):
    shop_details = ShopSerializer(source='shop', read_only=True)

    class Meta:
        model = ShopFavorite
        fields = ['id', 'user', 'shop', 'shop_details', 'created_at']
        read_only_fields = ['id', 'user', 'created_at']


class OfferSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    discount_type_display = serializers.CharField(source='get_discount_type_display', read_only=True)
    is_currently_valid = serializers.BooleanField(read_only=True)

    class Meta:
        model = Offer
        fields = [
            'id',
            'shop',
            'shop_name',
            'title',
            'description',
            'discount_type',
            'discount_type_display',
            'discount_value',
            'min_order_value',
            'max_discount',
            'start_date',
            'end_date',
            'is_active',
            'is_currently_valid',
            'applicable_categories',
            'applicable_products',
            'usage_limit',
            'per_user_limit',
            'times_used',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'times_used', 'is_currently_valid', 'created_at', 'updated_at']

    def validate(self, attrs):
        from decimal import Decimal
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end <= start:
            raise serializers.ValidationError("End date must be strictly after the start date.")

        dtype = attrs.get('discount_type', getattr(self.instance, 'discount_type', None))
        dval = attrs.get('discount_value', getattr(self.instance, 'discount_value', None))
        if dtype == Offer.DiscountType.PERCENTAGE and dval and dval > Decimal('100.00'):
            raise serializers.ValidationError("Percentage discount value cannot exceed 100%.")

        return attrs

