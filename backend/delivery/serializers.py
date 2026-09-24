from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from .models import (
    PickupSlot,
    DeliveryZone,
    DeliverySlot,
    Delivery,
    DeliveryAttempt,
    StudentAddress,
    DeliveryLocation,
    DeliveryRoute,
    DeliveryRouteStop,
)
from users.serializers import UserSerializer

class StudentAddressSerializer(serializers.ModelSerializer):
    formatted_address = serializers.CharField(read_only=True)

    class Meta:
        model = StudentAddress
        fields = [
            'id',
            'user',
            'label',
            'recipient_name',
            'phone_number',
            'address_line_1',
            'address_line_2',
            'hostel_block',
            'room_number',
            'landmark',
            'city',
            'state',
            'postal_code',
            'latitude',
            'longitude',
            'is_default',
            'formatted_address',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'formatted_address', 'created_at', 'updated_at']

    def validate_phone_number(self, value):
        if not value or len(value.strip()) < 7:
            raise serializers.ValidationError("A valid contact phone number is required.")
        return value.strip()

    def validate_latitude(self, value):
        if value is not None and (value < -90 or value > 90):
            raise serializers.ValidationError("Latitude must be between -90.0 and 90.0 degrees.")
        return value

    def validate_longitude(self, value):
        if value is not None and (value < -180 or value > 180):
            raise serializers.ValidationError("Longitude must be between -180.0 and 180.0 degrees.")
        return value

    def validate(self, attrs):
        lat = attrs.get('latitude', getattr(self.instance, 'latitude', None))
        lng = attrs.get('longitude', getattr(self.instance, 'longitude', None))
        if (lat is not None and lng is None) or (lat is None and lng is not None):
            raise serializers.ValidationError("Both latitude and longitude must be provided together, or both left blank.")
        return attrs


class PickupSlotSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    available_capacity = serializers.IntegerField(read_only=True)

    class Meta:
        model = PickupSlot
        fields = [
            'id',
            'shop',
            'shop_name',
            'date',
            'start_time',
            'end_time',
            'capacity',
            'booked_count',
            'available_capacity',
            'is_available',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'booked_count', 'available_capacity', 'is_available', 'created_at']

    def validate(self, attrs):
        capacity = attrs.get('capacity', getattr(self.instance, 'capacity', 1))
        booked_count = getattr(self.instance, 'booked_count', 0)
        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))

        if capacity <= 0:
            raise serializers.ValidationError({"capacity": "Pickup slot capacity must be greater than 0."})

        if self.instance and 'capacity' in attrs and capacity < booked_count:
            raise serializers.ValidationError({"capacity": f"Cannot reduce capacity to {capacity}; {booked_count} slot(s) already booked."})

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({"end_time": "Slot end time must be strictly after start time."})

        return attrs


class DeliveryZoneSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)

    class Meta:
        model = DeliveryZone
        fields = [
            'id',
            'shop',
            'shop_name',
            'name',
            'minimum_distance',
            'maximum_distance',
            'base_charge',
            'free_delivery_threshold',
            'is_active',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class DeliverySlotSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    is_available = serializers.BooleanField(read_only=True)
    available_capacity = serializers.IntegerField(read_only=True)

    class Meta:
        model = DeliverySlot
        fields = [
            'id',
            'shop',
            'shop_name',
            'date',
            'start_time',
            'end_time',
            'capacity',
            'booked_count',
            'available_capacity',
            'is_available',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'booked_count', 'available_capacity', 'is_available', 'created_at', 'updated_at']

    def validate(self, attrs):
        capacity = attrs.get('capacity', getattr(self.instance, 'capacity', 1))
        booked_count = getattr(self.instance, 'booked_count', 0)
        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))

        if capacity <= 0:
            raise serializers.ValidationError({"capacity": "Delivery slot capacity must be greater than 0."})

        if self.instance and 'capacity' in attrs and capacity < booked_count:
            raise serializers.ValidationError({"capacity": f"Cannot reduce capacity to {capacity}; {booked_count} slot(s) already booked."})

        if start_time and end_time and start_time >= end_time:
            raise serializers.ValidationError({"end_time": "Delivery slot end time must be strictly after start time."})

        return attrs


class DeliveryAttemptSerializer(serializers.ModelSerializer):
    delivery_person_name = serializers.CharField(source='delivery_person.name', read_only=True)

    class Meta:
        model = DeliveryAttempt
        fields = [
            'id',
            'delivery',
            'attempt_number',
            'status',
            'reason',
            'notes',
            'attempted_at',
            'delivery_person',
            'delivery_person_name',
        ]
        read_only_fields = ['id', 'attempted_at']


class DeliverySerializer(serializers.ModelSerializer):
    agent_details = UserSerializer(source='delivery_agent', read_only=True)
    delivery_person = UserSerializer(source='delivery_agent', read_only=True)
    order_number = serializers.CharField(source='order.order_number', read_only=True)
    status_display = serializers.CharField(source='get_delivery_status_display', read_only=True)
    failure_reason_display = serializers.CharField(source='get_failure_reason_display', read_only=True)

    shop_id = serializers.IntegerField(source='order.shop.id', read_only=True)
    shop_name = serializers.CharField(source='order.shop.name', read_only=True)
    shop_address = serializers.CharField(source='order.shop.address', read_only=True)
    shop_phone = serializers.CharField(source='order.shop.contact_phone', read_only=True)
    shop_latitude = serializers.SerializerMethodField()
    shop_longitude = serializers.SerializerMethodField()

    customer_name = serializers.CharField(source='order.customer.name', read_only=True)
    customer_phone = serializers.CharField(source='order.customer.phone_number', read_only=True)

    order_type = serializers.CharField(source='order.order_type', read_only=True)
    order_status = serializers.CharField(source='order.status', read_only=True)
    order_total = serializers.DecimalField(source='order.total_amount', max_digits=10, decimal_places=2, read_only=True)
    payment_method = serializers.CharField(source='order.payment_method', read_only=True)
    payment_status = serializers.CharField(source='order.payment_status', read_only=True)

    delivery_slot_details = DeliverySlotSerializer(source='delivery_slot', read_only=True)
    delivery_zone_name = serializers.CharField(source='delivery_zone.name', read_only=True)
    attempts = DeliveryAttemptSerializer(many=True, read_only=True)

    items_summary = serializers.SerializerMethodField()
    has_active_otp = serializers.SerializerMethodField()
    otp_expires_at = serializers.SerializerMethodField()
    is_live_tracking_available = serializers.SerializerMethodField()

    class Meta:
        model = Delivery
        fields = [
            'id',
            'order',
            'order_number',
            'delivery_agent',
            'delivery_person',
            'agent_details',
            'delivery_address',
            'latitude',
            'longitude',
            'delivery_zone',
            'delivery_zone_name',
            'delivery_slot',
            'delivery_slot_details',
            'hostel_block',
            'room_number',
            'delivery_charge',
            'priority',
            'delivery_status',
            'status_display',
            'estimated_delivery_time',
            'assigned_at',
            'arrived_at_shop_at',
            'picked_up_at',
            'out_for_delivery_at',
            'delivered_at',
            'failed_at',
            'cancelled_at',
            'rescheduled_at',
            'attempt_count',
            'failure_reason',
            'failure_reason_display',
            'cancellation_reason',
            'delivery_notes',
            'customer_notes',
            'attempts',
            'shop_id',
            'shop_name',
            'shop_address',
            'shop_phone',
            'shop_latitude',
            'shop_longitude',
            'customer_name',
            'customer_phone',
            'order_type',
            'order_status',
            'order_total',
            'payment_method',
            'payment_status',
            'items_summary',
            'has_active_otp',
            'otp_expires_at',
            'is_live_tracking_available',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'order',
            'order_number',
            'assigned_at',
            'arrived_at_shop_at',
            'picked_up_at',
            'out_for_delivery_at',
            'delivered_at',
            'failed_at',
            'cancelled_at',
            'rescheduled_at',
            'created_at',
            'updated_at',
        ]

    @extend_schema_field(serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True))
    def get_shop_latitude(self, obj):
        if obj.shop_latitude is not None:
            return obj.shop_latitude
        if hasattr(obj, 'order') and obj.order and hasattr(obj.order, 'shop') and obj.order.shop:
            return obj.order.shop.latitude
        return None

    @extend_schema_field(serializers.DecimalField(max_digits=9, decimal_places=6, allow_null=True))
    def get_shop_longitude(self, obj):
        if obj.shop_longitude is not None:
            return obj.shop_longitude
        if hasattr(obj, 'order') and obj.order and hasattr(obj.order, 'shop') and obj.order.shop:
            return obj.order.shop.longitude
        return None

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_items_summary(self, obj):
        order = obj.order
        if not order:
            return []

        # Stationery items
        items = []
        for item in order.items.select_related('product'):
            items.append({
                'id': item.id,
                'name': item.product.name,
                'quantity': item.quantity,
                'unit_price': str(item.unit_price),
                'total_price': str(item.total_price)
            })

        # Printing order items
        if hasattr(order, 'printing_details'):
            print_job = order.printing_details
            doc_name = "Document"
            first_doc = print_job.documents.first()
            if first_doc:
                doc_name = getattr(first_doc, 'original_filename', 'Document')

            items.append({
                'id': f"print_{print_job.id}",
                'name': f"Printing: {doc_name}",
                'quantity': print_job.copies,
                'details': f"{print_job.get_color_mode_display()}, {print_job.paper_size}, {print_job.get_binding_type_display()}",
                'unit_price': str(order.subtotal),
                'total_price': str(order.subtotal)
            })

        return items

    def get_has_active_otp(self, obj):
        if not obj.order:
            return False
        from orders.models import OTPVerification
        otp = obj.order.otps.filter(
            purpose=OTPVerification.Purpose.DELIVERY,
            is_verified=False
        ).order_by('-created_at').first()
        return otp is not None and not otp.is_expired

    def get_otp_expires_at(self, obj):
        if not obj.order:
            return None
        from orders.models import OTPVerification
        otp = obj.order.otps.filter(
            purpose=OTPVerification.Purpose.DELIVERY,
            is_verified=False
        ).order_by('-created_at').first()
        if otp and not otp.is_expired:
            return otp.expires_at.isoformat()
        return None

    def get_is_live_tracking_available(self, obj):
        return obj.delivery_status in [
            Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
            Delivery.DeliveryStatus.ARRIVING,
        ] and obj.delivery_agent is not None


class DeliveryLocationSerializer(serializers.ModelSerializer):
    courier_name = serializers.CharField(source='delivery_person.name', read_only=True)
    order_number = serializers.CharField(source='delivery.order.order_number', read_only=True)

    class Meta:
        model = DeliveryLocation
        fields = [
            'id',
            'delivery',
            'order_number',
            'delivery_person',
            'courier_name',
            'latitude',
            'longitude',
            'accuracy',
            'heading',
            'speed',
            'timestamp',
            'source',
            'is_current',
            'is_flagged_suspicious',
            'created_at',
        ]
        read_only_fields = ['id', 'is_current', 'is_flagged_suspicious', 'created_at']


class DeliveryRouteStopSerializer(serializers.ModelSerializer):
    order_number = serializers.CharField(source='delivery.order.order_number', read_only=True)
    customer_name = serializers.CharField(source='delivery.order.customer.name', read_only=True)
    customer_phone = serializers.CharField(source='delivery.order.customer.phone_number', read_only=True)
    delivery_status = serializers.CharField(source='delivery.delivery_status', read_only=True)
    delivery_charge = serializers.DecimalField(source='delivery.delivery_charge', max_digits=6, decimal_places=2, read_only=True)
    hostel_block = serializers.CharField(source='delivery.hostel_block', read_only=True)
    room_number = serializers.CharField(source='delivery.room_number', read_only=True)

    class Meta:
        model = DeliveryRouteStop
        fields = [
            'id',
            'route',
            'delivery',
            'order_number',
            'customer_name',
            'customer_phone',
            'delivery_status',
            'delivery_charge',
            'hostel_block',
            'room_number',
            'sequence',
            'address',
            'latitude',
            'longitude',
            'estimated_arrival',
            'actual_arrival',
            'completed',
            'priority',
            'time_window_start',
            'time_window_end',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class DeliveryRouteSerializer(serializers.ModelSerializer):
    courier_name = serializers.CharField(source='delivery_person.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    stops = DeliveryRouteStopSerializer(many=True, read_only=True)
    total_stops = serializers.IntegerField(read_only=True)
    completed_stops_count = serializers.IntegerField(read_only=True)
    completion_percentage = serializers.FloatField(read_only=True)

    class Meta:
        model = DeliveryRoute
        fields = [
            'id',
            'delivery_person',
            'courier_name',
            'date',
            'status',
            'status_display',
            'start_location',
            'start_latitude',
            'start_longitude',
            'total_distance',
            'estimated_duration',
            'actual_duration',
            'optimization_algorithm',
            'stops',
            'total_stops',
            'completed_stops_count',
            'completion_percentage',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

