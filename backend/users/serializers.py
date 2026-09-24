from rest_framework import serializers
from django.contrib.auth import get_user_model
from drf_spectacular.utils import extend_schema_field

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for User profile details.
    Safely omits password hash and internal authentication artifacts.
    """
    full_name = serializers.SerializerMethodField()
    shop = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'first_name',
            'last_name',
            'full_name',
            'email',
            'email_verified',
            'phone_number',
            'role',
            'approval_status',
            'college_id',
            'department',
            'hostel_block',
            'room_number',
            'is_active',
            'created_at',
            'updated_at',
            'shop',
        ]
        read_only_fields = ['id', 'username', 'role', 'approval_status', 'is_active', 'email_verified', 'created_at', 'updated_at', 'shop']

    @extend_schema_field(serializers.CharField())
    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username

    @extend_schema_field(serializers.DictField(allow_null=True))
    def get_shop(self, obj):
        if obj.role == 'SHOP_OWNER':
            shop = getattr(obj, 'owned_shop', None)
            if shop:
                return {
                    'id': shop.id,
                    'name': shop.name,
                    'shop_type': shop.shop_type,
                    'shop_type_display': shop.get_shop_type_display(),
                    'description': shop.description,
                    'address': shop.address,
                    'campus_location': shop.campus_location,
                    'contact_phone': shop.contact_phone,
                    'contact_email': shop.contact_email,
                    'opening_time': str(shop.opening_time),
                    'closing_time': str(shop.closing_time),
                    'is_active': shop.is_active,
                    'rating': float(shop.rating),
                    'latitude': float(shop.latitude) if shop.latitude is not None else None,
                    'longitude': float(shop.longitude) if shop.longitude is not None else None,
                }
        return None
