from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal

class PickupSlot(models.Model):
    """
    Time slots provided by shops for orderly in-person order pickups.
    """
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='pickup_slots'
    )
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    capacity = models.PositiveIntegerField(default=15, validators=[MinValueValidator(1)])
    booked_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'pickup_slots'
        verbose_name = 'Pickup Slot'
        verbose_name_plural = 'Pickup Slots'
        unique_together = ('shop', 'date', 'start_time', 'end_time')
        indexes = [
            models.Index(fields=['shop', 'date', 'is_active']),
        ]

    @property
    def is_available(self):
        return self.is_active and (self.booked_count < self.capacity)

    @property
    def available_capacity(self):
        return max(0, self.capacity - self.booked_count)

    def __str__(self):
        return f"{self.shop.name} Pickup: {self.date} ({self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}) [{self.booked_count}/{self.capacity}]"


class DeliveryZone(models.Model):
    """
    Configurable campus delivery zones and distance slabs with associated base charges.
    Supports future GPS boundary calculations without redesigning schema.
    """
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='delivery_zones',
        help_text="Associated shop. If null, applies globally across campus."
    )
    name = models.CharField(max_length=100, help_text="e.g. Zone A (0-2 km) - Campus Core Hostels")
    minimum_distance = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'), help_text="Minimum distance in km")
    maximum_distance = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('2.00'), help_text="Maximum distance in km")
    base_charge = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('15.00'))
    free_delivery_threshold = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('250.00'), help_text="Subtotal above which delivery is free")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_zones'
        verbose_name = 'Delivery Zone'
        verbose_name_plural = 'Delivery Zones'
        ordering = ['minimum_distance']

    def __str__(self):
        return f"{self.name} ({self.minimum_distance}-{self.maximum_distance}km): ₹{self.base_charge}"


class DeliverySlot(models.Model):
    """
    Designated campus doorstep delivery time slots provided by shops.
    Includes atomic capacity control protecting against concurrent overbooking.
    """
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='delivery_slots'
    )
    date = models.DateField(db_index=True)
    start_time = models.TimeField()
    end_time = models.TimeField()
    capacity = models.PositiveIntegerField(default=10, validators=[MinValueValidator(1)])
    booked_count = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'delivery_slots'
        verbose_name = 'Delivery Slot'
        verbose_name_plural = 'Delivery Slots'
        unique_together = ('shop', 'date', 'start_time', 'end_time')
        indexes = [
            models.Index(fields=['shop', 'date', 'is_active']),
        ]

    @property
    def is_available(self):
        return self.is_active and (self.booked_count < self.capacity)

    @property
    def available_capacity(self):
        return max(0, self.capacity - self.booked_count)

    def __str__(self):
        return f"{self.shop.name} Delivery Slot: {self.date} ({self.start_time.strftime('%H:%M')} - {self.end_time.strftime('%H:%M')}) [{self.booked_count}/{self.capacity}]"


class Delivery(models.Model):
    """
    Complete campus doorstep delivery lifecycle and assignment tracking for an Order.
    """
    class DeliveryStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending Assignment'
        ASSIGNED = 'ASSIGNED', 'Assigned to Courier'
        ARRIVED_AT_SHOP = 'ARRIVED_AT_SHOP', 'Arrived at Shop'
        PICKED_UP = 'PICKED_UP', 'Picked Up from Shop'
        OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', 'Out on Delivery'
        ARRIVING = 'ARRIVING', 'Arriving at Destination'
        DELIVERED = 'DELIVERED', 'Delivered & Handed Over'
        FAILED = 'FAILED', 'Delivery Attempt Failed'
        RESCHEDULED = 'RESCHEDULED', 'Delivery Rescheduled'
        CANCELLED = 'CANCELLED', 'Delivery Cancelled'

    class FailureReason(models.TextChoices):
        CUSTOMER_UNAVAILABLE = 'CUSTOMER_UNAVAILABLE', 'Customer Unavailable / Door Locked'
        WRONG_ADDRESS = 'WRONG_ADDRESS', 'Incorrect Address or Room Number'
        PHONE_UNREACHABLE = 'PHONE_UNREACHABLE', 'Phone Unreachable / Not Answering'
        CUSTOMER_REQUESTED_RESCHEDULE = 'CUSTOMER_REQUESTED_RESCHEDULE', 'Customer Requested Later Slot'
        ACCESS_PROBLEM = 'ACCESS_PROBLEM', 'Hostel Gate Closed / Entry Denied'
        OTHER = 'OTHER', 'Other Operational Issue'

    class DeliveryPriority(models.TextChoices):
        LOW = 'LOW', 'Low Priority'
        NORMAL = 'NORMAL', 'Normal Priority'
        HIGH = 'HIGH', 'High Priority'
        URGENT = 'URGENT', 'Urgent Priority'

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='delivery_details'
    )
    delivery_agent = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='assigned_deliveries',
        help_text="Assigned campus delivery courier / runner"
    )
    delivery_address = models.TextField(help_text="Formatted drop address")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Customer drop-off GPS latitude")
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Customer drop-off GPS longitude")
    shop_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot shop pickup GPS latitude")
    shop_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot shop pickup GPS longitude")
    delivery_zone = models.ForeignKey(
        DeliveryZone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries'
    )
    delivery_slot = models.ForeignKey(
        DeliverySlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='deliveries'
    )
    hostel_block = models.CharField(max_length=50, blank=True)
    room_number = models.CharField(max_length=20, blank=True)
    delivery_charge = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('15.00'))
    priority = models.CharField(
        max_length=20,
        choices=DeliveryPriority.choices,
        default=DeliveryPriority.NORMAL,
        db_index=True,
        help_text="Operational priority for route planning and delivery urgency"
    )
    delivery_status = models.CharField(
        max_length=20,
        choices=DeliveryStatus.choices,
        default=DeliveryStatus.PENDING,
        db_index=True
    )
    estimated_delivery_time = models.DateTimeField(null=True, blank=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    arrived_at_shop_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when courier arrived at the shop counter")
    picked_up_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp when courier collected package from shop")
    out_for_delivery_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    rescheduled_at = models.DateTimeField(null=True, blank=True)
    delivery_notes = models.TextField(blank=True, help_text="Courier operational notes")
    customer_notes = models.TextField(blank=True, help_text="Student doorstep instructions")
    attempt_count = models.PositiveIntegerField(default=0)
    failure_reason = models.CharField(max_length=50, blank=True, choices=FailureReason.choices)
    cancellation_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    VALID_TRANSITIONS = {
        DeliveryStatus.PENDING: [DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED],
        DeliveryStatus.ASSIGNED: [DeliveryStatus.ARRIVED_AT_SHOP, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.CANCELLED],
        DeliveryStatus.ARRIVED_AT_SHOP: [DeliveryStatus.PICKED_UP, DeliveryStatus.CANCELLED],
        DeliveryStatus.PICKED_UP: [DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.CANCELLED],
        DeliveryStatus.OUT_FOR_DELIVERY: [DeliveryStatus.ARRIVING, DeliveryStatus.DELIVERED, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
        DeliveryStatus.ARRIVING: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED, DeliveryStatus.CANCELLED],
        DeliveryStatus.FAILED: [DeliveryStatus.RESCHEDULED, DeliveryStatus.CANCELLED],
        DeliveryStatus.RESCHEDULED: [DeliveryStatus.ASSIGNED, DeliveryStatus.ARRIVED_AT_SHOP, DeliveryStatus.PICKED_UP, DeliveryStatus.OUT_FOR_DELIVERY, DeliveryStatus.CANCELLED],
        DeliveryStatus.DELIVERED: [],
        DeliveryStatus.CANCELLED: [],
    }

    class Meta:
        db_table = 'deliveries'
        verbose_name = 'Delivery'
        verbose_name_plural = 'Deliveries'
        indexes = [
            models.Index(fields=['delivery_agent', 'delivery_status']),
            models.Index(fields=['delivery_status', 'created_at']),
        ]

    @property
    def delivery_person(self):
        """Alias ensuring compatibility with delivery_person naming."""
        return self.delivery_agent

    def can_transition_to(self, new_status):
        allowed = self.VALID_TRANSITIONS.get(self.delivery_status, [])
        return new_status in allowed

    def __str__(self):
        return f"Delivery for Order #{str(self.order.order_number)[:8]} [{self.get_delivery_status_display()}]"


class DeliveryAttempt(models.Model):
    """
    Historical log of doorstep delivery attempts, failures, and operational reasons.
    """
    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name='attempts'
    )
    attempt_number = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, default='FAILED')
    reason = models.CharField(max_length=50, blank=True)
    notes = models.TextField(blank=True)
    attempted_at = models.DateTimeField(default=timezone.now)
    delivery_person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_attempts'
    )

    class Meta:
        db_table = 'delivery_attempts'
        verbose_name = 'Delivery Attempt'
        verbose_name_plural = 'Delivery Attempts'
        ordering = ['-attempted_at']

    def __str__(self):
        return f"Attempt #{self.attempt_number} for Delivery #{self.delivery.id} ({self.status})"


class StudentAddress(models.Model):
    """
    Saved campus delivery addresses for students (hostel room, department lab, etc.).
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_addresses'
    )
    label = models.CharField(max_length=50, help_text="e.g. Hostel Room, Department Lab, Library Desk")
    recipient_name = models.CharField(max_length=100, blank=True, help_text="Name of the recipient")
    phone_number = models.CharField(max_length=15, help_text="Contact number for delivery courier")
    address_line_1 = models.CharField(max_length=255, blank=True)
    address_line_2 = models.CharField(max_length=255, blank=True)
    hostel_block = models.CharField(max_length=50, help_text="Hostel or Campus Building name")
    room_number = models.CharField(max_length=20, help_text="Room or Desk number")
    landmark = models.CharField(max_length=150, blank=True, help_text="Nearby campus landmark")
    city = models.CharField(max_length=100, default='Campus')
    state = models.CharField(max_length=100, default='State')
    postal_code = models.CharField(max_length=20, default='000000')
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_addresses'
        verbose_name = 'Student Address'
        verbose_name_plural = 'Student Addresses'
        ordering = ['-is_default', '-created_at']
        indexes = [
            models.Index(fields=['user', 'is_default']),
        ]

    def save(self, *args, **kwargs):
        # If set as default, unset previous default for this user
        if self.is_default:
            StudentAddress.objects.filter(user=self.user, is_default=True).exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)

    @property
    def formatted_address(self):
        parts = []
        if self.hostel_block and self.room_number:
            parts.append(f"{self.hostel_block}, {self.room_number}")
        elif self.address_line_1:
            parts.append(self.address_line_1)

        if self.landmark:
            parts.append(f"(Near {self.landmark})")
        if self.phone_number:
            parts.append(f"Ph: {self.phone_number}")
        return " - ".join(parts) if parts else (self.address_line_1 or self.label)

    def __str__(self):
        return f"{self.label} ({self.hostel_block} {self.room_number}) - {self.user.username}"


class DeliveryLocation(models.Model):
    """
    Real-time and historical GPS location updates reported by campus delivery couriers.
    Includes anti-spoofing flags, accuracy checks, and privacy enforcement.
    """
    class SourceType(models.TextChoices):
        GPS = 'GPS', 'Device GPS'
        NETWORK = 'NETWORK', 'Network / WiFi Triangulation'
        MANUAL = 'MANUAL', 'Manual Coordinate Override'

    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='locations',
        help_text="Active delivery associated with this location update"
    )
    delivery_person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='reported_locations',
        help_text="Courier who reported this coordinate"
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy = models.FloatField(default=10.0, help_text="Estimated accuracy radius in meters")
    heading = models.FloatField(null=True, blank=True, help_text="Bearing / direction of travel in degrees (0-360)")
    speed = models.FloatField(null=True, blank=True, help_text="Instantaneous velocity in meters per second")
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    source = models.CharField(max_length=20, choices=SourceType.choices, default=SourceType.GPS)
    is_current = models.BooleanField(default=True, db_index=True, help_text="True if this is the courier's most recent location")
    is_flagged_suspicious = models.BooleanField(default=False, help_text="Flagged by anti-spoofing velocity / jump checks")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'delivery_locations'
        verbose_name = 'Delivery Location'
        verbose_name_plural = 'Delivery Locations'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['delivery', 'is_current']),
            models.Index(fields=['delivery_person', '-timestamp']),
            models.Index(fields=['delivery_person', 'is_current']),
        ]

    def __str__(self):
        return f"{self.delivery_person.username} @ ({self.latitude}, {self.longitude}) [{self.timestamp.strftime('%H:%M:%S')}]"


class DeliveryRoute(models.Model):
    """
    Batched, multi-stop delivery journey assigned to a campus courier.
    Calculated via Nearest Neighbor + 2-Opt route optimization respecting delivery time windows.
    """
    class RouteStatus(models.TextChoices):
        PLANNED = 'PLANNED', 'Planned / Staged'
        ACTIVE = 'ACTIVE', 'Active / Out on Campus'
        COMPLETED = 'COMPLETED', 'All Stops Handed Over'
        CANCELLED = 'CANCELLED', 'Route Cancelled'

    delivery_person = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='delivery_routes'
    )
    date = models.DateField(default=timezone.now, db_index=True)
    status = models.CharField(
        max_length=20,
        choices=RouteStatus.choices,
        default=RouteStatus.PLANNED,
        db_index=True
    )
    start_location = models.CharField(max_length=200, default="Campus Central Hub / Shop")
    start_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    start_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    total_distance = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'), help_text="Total estimated road distance in km")
    estimated_duration = models.PositiveIntegerField(default=0, help_text="Total estimated route travel & service duration in minutes")
    actual_duration = models.PositiveIntegerField(null=True, blank=True, help_text="Actual duration from start to final delivery in minutes")
    optimization_algorithm = models.CharField(max_length=50, default='NEAREST_NEIGHBOR_2OPT')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'delivery_routes'
        verbose_name = 'Delivery Route'
        verbose_name_plural = 'Delivery Routes'
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['delivery_person', 'date', 'status']),
        ]

    @property
    def total_stops(self):
        return self.stops.count()

    @property
    def completed_stops_count(self):
        return self.stops.filter(completed=True).count()

    @property
    def completion_percentage(self):
        total = self.total_stops
        if total == 0:
            return 100.0
        return round((self.completed_stops_count / total) * 100, 1)

    def __str__(self):
        return f"Route #{self.id} for {self.delivery_person.username} ({self.date}) [{self.get_status_display()}]"


class DeliveryRouteStop(models.Model):
    """
    Individual sequenced delivery stop within a multi-order delivery route.
    """
    route = models.ForeignKey(
        DeliveryRoute,
        on_delete=models.CASCADE,
        related_name='stops'
    )
    delivery = models.ForeignKey(
        Delivery,
        on_delete=models.CASCADE,
        related_name='route_stops'
    )
    sequence = models.PositiveIntegerField(help_text="1-based sequence order in the optimized journey")
    address = models.TextField(help_text="Drop-off address snapshot")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    estimated_arrival = models.DateTimeField(null=True, blank=True)
    actual_arrival = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False, db_index=True)
    priority = models.CharField(max_length=20, choices=Delivery.DeliveryPriority.choices, default=Delivery.DeliveryPriority.NORMAL)
    time_window_start = models.DateTimeField(null=True, blank=True)
    time_window_end = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'delivery_route_stops'
        verbose_name = 'Delivery Route Stop'
        verbose_name_plural = 'Delivery Route Stops'
        ordering = ['route', 'sequence']
        unique_together = ('route', 'delivery')
        indexes = [
            models.Index(fields=['route', 'sequence']),
            models.Index(fields=['route', 'completed']),
        ]

    def __str__(self):
        return f"Stop #{self.sequence} on Route #{self.route_id} -> Order #{str(self.delivery.order.order_number)[:8]}"

