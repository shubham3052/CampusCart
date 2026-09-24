from decimal import Decimal
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from django.contrib.auth.hashers import make_password, check_password
from django.core import signing
import uuid
import secrets

class Order(models.Model):
    """
    Core order entity for stationery, printing, or combined purchases.
    Belongs to a customer and a shop.
    """
    class OrderType(models.TextChoices):
        STATIONERY = 'STATIONERY', 'Stationery Items Only'
        PRINTING = 'PRINTING', 'Document Printing / Xerox Only'
        COMBINED = 'COMBINED', 'Combined Stationery & Printing'

    class FulfillmentType(models.TextChoices):
        PICKUP = 'PICKUP', 'Store Counter Pickup'
        DELIVERY = 'DELIVERY', 'Hostel / Campus Delivery'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        CONFIRMED = 'CONFIRMED', 'Confirmed'
        PREPARING = 'PREPARING', 'Preparing'
        READY = 'READY', 'Ready for Pickup / Dispatch'
        OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', 'Out for Delivery'
        DELIVERED = 'DELIVERED', 'Delivered'
        PICKED_UP = 'PICKED_UP', 'Picked Up'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    VALID_TRANSITIONS = {
        Status.PENDING: [Status.CONFIRMED, Status.CANCELLED],
        Status.CONFIRMED: [Status.PREPARING, Status.CANCELLED],
        Status.PREPARING: [Status.READY, Status.CANCELLED],
        Status.READY: [Status.OUT_FOR_DELIVERY, Status.PICKED_UP, Status.COMPLETED, Status.CANCELLED],
        Status.OUT_FOR_DELIVERY: [Status.DELIVERED, Status.COMPLETED, Status.READY, Status.CANCELLED],
        Status.DELIVERED: [Status.COMPLETED],
        Status.PICKED_UP: [Status.COMPLETED],
        Status.COMPLETED: [],
        Status.CANCELLED: [],
    }

    class PaymentStatus(models.TextChoices):
        PENDING = 'PENDING', 'Payment Pending'
        PAID = 'PAID', 'Paid'
        FAILED = 'FAILED', 'Failed'
        REFUNDED = 'REFUNDED', 'Refunded'
        PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED', 'Partially Refunded'

    class PaymentMethod(models.TextChoices):
        COD = 'COD', 'Cash on Delivery / Counter'
        ONLINE = 'ONLINE', 'Online Payment (UPI, Cards, NetBanking)'
        PICKUP_CASH = 'PICKUP_CASH', 'Cash on Counter Pickup'
        UPI = 'UPI', 'UPI / Online Payment'
        CAMPUS_CARD = 'CAMPUS_CARD', 'Student Campus Smart Card'

    order_number = models.CharField(
        max_length=36,
        unique=True,
        db_index=True,
        default=uuid.uuid4,
        editable=False
    )
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='orders',
        db_index=True
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='orders',
        db_index=True
    )
    order_type = models.CharField(
        max_length=20,
        choices=OrderType.choices,
        default=OrderType.STATIONERY,
        db_index=True
    )
    fulfillment_type = models.CharField(
        max_length=20,
        choices=FulfillmentType.choices,
        default=FulfillmentType.PICKUP,
        db_index=True
    )
    pickup_slot = models.ForeignKey(
        'delivery.PickupSlot',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )
    delivery_slot = models.ForeignKey(
        'delivery.DeliverySlot',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='orders'
    )
    delivery_address = models.TextField(blank=True, help_text="Delivery address if delivery fulfillment chosen")
    delivery_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot delivery latitude at order time")
    delivery_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot delivery longitude at order time")
    shop_latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot shop latitude at order time")
    shop_longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Snapshot shop longitude at order time")
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.PENDING,
        db_index=True
    )
    payment_status = models.CharField(
        max_length=20,
        choices=PaymentStatus.choices,
        default=PaymentStatus.PENDING,
        db_index=True
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.COD
    )
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    applied_coupon_code = models.CharField(max_length=50, blank=True, default='')
    delivery_fee = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    order_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'orders'
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        indexes = [
            models.Index(fields=['customer', 'status']),
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['created_at']),
        ]

    def can_transition_to(self, new_status):
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def clean(self):
        if self.pk:
            old = Order.objects.filter(pk=self.pk).values('status').first()
            if old and old['status'] != self.status and not self.can_transition_to(self.status):
                raise ValidationError(f"Invalid status transition from {old['status']} to {self.status}.")

    def generate_pickup_otp(self, expiry_minutes=120):
        """
        Generates a cryptographically secure 6-digit OTP for pickup handoff.
        Invalidates any prior unverified pickup OTPs for this order.
        """
        from django.utils import timezone
        from notifications.models import Notification

        # Invalidate any existing unverified pickup OTPs
        self.otps.filter(purpose=OTPVerification.Purpose.PICKUP, is_verified=False).update(
            is_verified=True, verified_at=timezone.now()
        )

        # Generate unpredictable 6 digits using secrets module
        plain_otp = f"{secrets.randbelow(900000) + 100000}"
        expires_at = timezone.now() + timezone.timedelta(minutes=expiry_minutes)

        otp_record = OTPVerification(
            order=self,
            purpose=OTPVerification.Purpose.PICKUP,
            expires_at=expires_at,
            max_attempts=5,
            attempt_count=0,
        )
        otp_record.set_otp(plain_otp)
        otp_record.save()

        # Send notification to customer
        try:
            slot_info = f"Slot: {self.pickup_slot.date} ({self.pickup_slot.start_time.strftime('%H:%M')}-{self.pickup_slot.end_time.strftime('%H:%M')})" if self.pickup_slot else ""
            Notification.objects.create(
                recipient=self.customer,
                title="Your Order is Ready for Pickup!",
                message=f"Order #{str(self.order_number)[:8]} is ready for collection at {self.shop.name}. {slot_info} Please show your pickup OTP at the counter.",
                notification_type=Notification.NotificationType.PICKUP_READY,
                reference_id=str(self.order_number)
            )
        except Exception:
            pass

        return plain_otp, otp_record

    def generate_delivery_otp(self, expiry_minutes=120):
        """
        Generates a cryptographically secure 6-digit OTP for campus doorstep delivery verification.
        Invalidates any prior unverified delivery OTPs for this order.
        """
        from django.utils import timezone
        from notifications.models import Notification

        # Invalidate any existing unverified delivery OTPs
        self.otps.filter(purpose=OTPVerification.Purpose.DELIVERY, is_verified=False).update(
            is_verified=True, verified_at=timezone.now()
        )

        # Generate unpredictable 6 digits using secrets module
        plain_otp = f"{secrets.randbelow(900000) + 100000}"
        expires_at = timezone.now() + timezone.timedelta(minutes=expiry_minutes)

        otp_record = OTPVerification(
            order=self,
            purpose=OTPVerification.Purpose.DELIVERY,
            expires_at=expires_at,
            max_attempts=5,
            attempt_count=0,
        )
        otp_record.set_otp(plain_otp)
        otp_record.save()

        # Send notification to customer
        try:
            courier_info = ""
            if hasattr(self, 'delivery_details') and self.delivery_details.delivery_agent:
                agent = self.delivery_details.delivery_agent
                courier_info = f" Courier: {agent.name or agent.username} ({agent.phone_number or ''})."

            Notification.objects.create(
                recipient=self.customer,
                title="Your Order is Out for Delivery!",
                message=f"Order #{str(self.order_number)[:8]} is out for campus delivery.{courier_info} Please share your Delivery OTP with the courier upon receiving your items.",
                notification_type=Notification.NotificationType.DELIVERY_UPDATE,
                reference_id=str(self.order_number)
            )
        except Exception:
            pass

        return plain_otp, otp_record

    def __str__(self):
        return f"Order #{str(self.order_number)[:8]} - {self.customer.username} [{self.get_status_display()}]"


class OrderItem(models.Model):
    """
    Line items within a stationery order.
    """
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='order_items'
    )
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        db_table = 'order_items'
        verbose_name = 'Order Item'
        verbose_name_plural = 'Order Items'

    def __str__(self):
        return f"{self.product.name} x {self.quantity} in Order #{str(self.order.order_number)[:8]}"


def generate_bulk_share_code():
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "CLS-" + "".join(secrets.choice(chars) for _ in range(5))


class BulkOrder(models.Model):
    """
    High-volume stationery, class-wide, and project group orders.
    Enables class reps, student teams, and groups to aggregate quantities,
    unlock volume discounts, and reserve inventory atomically.
    """
    class OrderType(models.TextChoices):
        CLASS = 'CLASS', 'Class / Course Batch Order'
        GROUP = 'GROUP', 'Student Group Order'
        PROJECT_TEAM = 'PROJECT_TEAM', 'Project Team Order'
        INDIVIDUAL_BULK = 'INDIVIDUAL_BULK', 'Individual Bulk Purchase'

    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        OPEN = 'OPEN', 'Open for Participants'
        CONFIRMED = 'CONFIRMED', 'Confirmed & Stock Reserved'
        PROCESSING = 'PROCESSING', 'Processing by Shop'
        READY = 'READY', 'Ready for Collection / Dispatch'
        OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', 'Out for Delivery'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'
        # Legacy status values preserved for backward compatibility
        REQUESTED = 'REQUESTED', 'Quote Requested'
        QUOTED = 'QUOTED', 'Price Quoted by Shop'
        FULFILLED = 'FULFILLED', 'Fulfilled'
        REJECTED = 'REJECTED', 'Rejected'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bulk_orders',
        help_text="Order creator or class representative"
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='bulk_orders'
    )
    title = models.CharField(max_length=200, help_text="e.g. BCA 4th Sem Project Files & Printing Batch")
    description = models.TextField(blank=True)
    order_type = models.CharField(
        max_length=25,
        choices=OrderType.choices,
        default=OrderType.CLASS,
        db_index=True
    )
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True
    )
    share_code = models.CharField(
        max_length=20,
        default=generate_bulk_share_code,
        db_index=True,
        blank=True,
        help_text="Invite code for students to join this bulk order"
    )
    participant_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Maximum students permitted to join. None = unlimited."
    )
    deadline = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Cutoff time after which no new participants can join"
    )
    fulfillment_type = models.CharField(
        max_length=20,
        choices=[('PICKUP', 'Store Counter Pickup'), ('DELIVERY', 'Hostel / Campus Delivery')],
        default='PICKUP'
    )
    pickup_slot = models.ForeignKey(
        'delivery.PickupSlot',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bulk_orders'
    )
    delivery_slot = models.ForeignKey(
        'delivery.DeliverySlot',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bulk_orders'
    )
    delivery_address = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    delivery_fee = models.DecimalField(max_digits=6, decimal_places=2, default=0.00)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    stock_reserved = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether inventory is actively reserved for this bulk order"
    )
    # Legacy fields preserved
    estimated_quantity = models.PositiveIntegerField(default=10)
    quoted_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    required_by_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulk_orders'
        verbose_name = 'Bulk Order'
        verbose_name_plural = 'Bulk Orders'
        indexes = [
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['user', 'status']),
            models.Index(fields=['share_code']),
            models.Index(fields=['created_at']),
        ]

    @property
    def is_expired(self):
        """Returns True if current time exceeds deadline."""
        from django.utils import timezone
        from django.utils.dateparse import parse_datetime
        if not self.deadline:
            return False
        dl = self.deadline
        if isinstance(dl, str):
            dl = parse_datetime(dl)
            if not dl:
                return False
        if timezone.is_naive(dl):
            dl = timezone.make_aware(dl)
        return timezone.now() > dl

    @property
    def total_quantity(self):
        """Aggregate unit count across all items in this bulk order."""
        return sum(item.target_quantity for item in self.items.all())

    @property
    def active_participants_count(self):
        return self.participants.filter(status='ACTIVE').count()

    def __str__(self):
        return f"{self.get_order_type_display()}: {self.title} ({self.share_code}) [{self.get_status_display()}]"


class BulkOrderItem(models.Model):
    """
    Line items included in a bulk order (stationery catalog product or bulk printing specification).
    """
    class ItemType(models.TextChoices):
        STATIONERY = 'STATIONERY', 'Stationery Catalog Product'
        PRINTING = 'PRINTING', 'Bulk Document Printing'

    bulk_order = models.ForeignKey(
        BulkOrder,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='bulk_order_items'
    )
    custom_item_name = models.CharField(max_length=200, blank=True, help_text="e.g. Spiral Bound Project Report")
    item_type = models.CharField(
        max_length=20,
        choices=ItemType.choices,
        default=ItemType.STATIONERY
    )
    base_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    discounted_unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    target_quantity = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Total aggregate quantity required across all participants"
    )
    allocated_quantity = models.PositiveIntegerField(
        default=0,
        help_text="Sum of quantities claimed by active participants"
    )
    printing_spec = models.JSONField(
        default=dict,
        blank=True,
        help_text="Specifications if bulk printing (pages, copies, color, paper, binding)"
    )
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)

    class Meta:
        db_table = 'bulk_order_items'
        verbose_name = 'Bulk Order Item'
        verbose_name_plural = 'Bulk Order Items'

    @property
    def name(self):
        return self.product.name if self.product else (self.custom_item_name or 'Bulk Item')

    @property
    def quantity(self):
        return max(self.target_quantity, self.allocated_quantity)

    @property
    def discount_percentage(self):
        if self.base_unit_price and self.base_unit_price > 0:
            pct = ((self.base_unit_price - self.discounted_unit_price) / self.base_unit_price) * Decimal('100.00')
            return pct.quantize(Decimal('0.01'))
        return Decimal('0.00')

    def __str__(self):
        return f"{self.name} x {self.target_quantity} in {self.bulk_order.title}"


class BulkOrderParticipant(models.Model):
    """
    Students who have joined a class/group bulk order.
    """
    class Role(models.TextChoices):
        OWNER = 'OWNER', 'Order Creator / Class Representative'
        PARTICIPANT = 'PARTICIPANT', 'Class Member / Participant'

    ParticipantRole = Role

    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active Participant'
        LEFT = 'LEFT', 'Left Order'
        REMOVED = 'REMOVED', 'Removed by Owner'

    bulk_order = models.ForeignKey(
        BulkOrder,
        on_delete=models.CASCADE,
        related_name='participants'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='bulk_order_participations'
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.PARTICIPANT
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.ACTIVE
    )
    notes = models.CharField(max_length=200, blank=True, help_text="e.g. Roll No. 24 / Room 302")
    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulk_order_participants'
        verbose_name = 'Bulk Order Participant'
        verbose_name_plural = 'Bulk Order Participants'
        unique_together = ('bulk_order', 'user')
        indexes = [
            models.Index(fields=['bulk_order', 'status']),
            models.Index(fields=['user', 'status']),
        ]

    @property
    def items(self):
        return self.item_selections

    def __str__(self):
        return f"{self.user.username} ({self.get_role_display()}) in {self.bulk_order.title}"


class BulkOrderParticipantItem(models.Model):
    """
    Quantities requested by an individual student within a collective bulk order.
    """
    participant = models.ForeignKey(
        BulkOrderParticipant,
        on_delete=models.CASCADE,
        related_name='item_selections'
    )
    bulk_order_item = models.ForeignKey(
        BulkOrderItem,
        on_delete=models.CASCADE,
        related_name='participant_allocations'
    )
    quantity = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])

    class Meta:
        db_table = 'bulk_order_participant_items'
        verbose_name = 'Bulk Order Participant Item'
        verbose_name_plural = 'Bulk Order Participant Items'
        unique_together = ('participant', 'bulk_order_item')

    def __str__(self):
        return f"{self.participant.user.username}: {self.bulk_order_item.name} x {self.quantity}"


class BulkOrderAudit(models.Model):
    """
    Audit trail for major lifecycle transitions, participant entries, and stock operations.
    """
    bulk_order = models.ForeignKey(
        BulkOrder,
        on_delete=models.CASCADE,
        related_name='audit_logs'
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    action = models.CharField(max_length=50)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'bulk_order_audits'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.action} on {self.bulk_order.title} at {self.created_at}"



class OTPVerification(models.Model):
    """
    One-Time Password used for secure order handoff (Pickup counter or Hostel delivery).
    """
    class Purpose(models.TextChoices):
        PICKUP = 'PICKUP', 'Pickup Counter Verification'
        DELIVERY = 'DELIVERY', 'Doorstep Delivery Verification'

    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        related_name='otps'
    )
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    otp_code = models.CharField(max_length=6, blank=True, null=True, db_index=True)
    otp_hash = models.CharField(max_length=128, blank=True, db_index=True)
    encrypted_otp = models.CharField(max_length=255, blank=True)
    is_verified = models.BooleanField(default=False, db_index=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='verified_otps'
    )
    verified_by_role = models.CharField(max_length=20, blank=True, null=True)
    attempt_count = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'otp_verifications'
        verbose_name = 'OTP Verification'
        verbose_name_plural = 'OTP Verifications'
        indexes = [
            models.Index(fields=['order', 'purpose']),
            models.Index(fields=['otp_code', 'is_verified']),
            models.Index(fields=['otp_hash', 'is_verified']),
        ]

    def set_otp(self, raw_otp):
        """
        Hashes and encrypts the 6-digit OTP code using Django secure hashing and signing.
        """
        self.otp_code = raw_otp  # Preserved for backward compatibility
        self.otp_hash = make_password(raw_otp)
        self.encrypted_otp = signing.dumps(raw_otp)

    def check_otp(self, candidate_otp):
        """
        Constant-time comparison against the stored hash or fallback code.
        """
        if self.otp_hash:
            return check_password(candidate_otp, self.otp_hash)
        return self.otp_code == candidate_otp

    def get_plaintext_otp(self):
        """
        Securely unsigns the encrypted OTP for authorized student viewing.
        """
        if self.encrypted_otp:
            try:
                return signing.loads(self.encrypted_otp)
            except Exception:
                pass
        return self.otp_code

    @property
    def is_expired(self):
        """Returns True if the current time exceeds expires_at."""
        from django.utils import timezone
        return timezone.now() > self.expires_at

    def __str__(self):
        masked = f"***{self.otp_code[-3:]}" if self.otp_code else "******"
        return f"{self.purpose} OTP ({masked}) for Order #{str(self.order.order_number)[:8]}"


class Coupon(models.Model):
    """
    Promotional coupon codes for students at checkout.
    Supports percentage or flat discounts, per-user limits, shop scoping, and validity periods.
    """
    class DiscountType(models.TextChoices):
        PERCENTAGE = 'PERCENTAGE', 'Percentage Discount'
        FIXED_AMOUNT = 'FIXED_AMOUNT', 'Fixed Amount Off'

    code = models.CharField(max_length=50, unique=True, db_index=True)
    title = models.CharField(max_length=150, blank=True)
    description = models.TextField(blank=True, help_text="Detailed promo terms and conditions")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_coupons',
        help_text="Admin or merchant who created this promo code"
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='coupons',
        help_text="Optional shop scope. Leave blank for platform-wide coupon."
    )
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))]
    )
    min_order_amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        validators=[MinValueValidator(Decimal('0.00'))]
    )
    max_discount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text="Maximum discount cap for percentage discounts"
    )
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    usage_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Global maximum uses"
    )
    per_user_limit = models.PositiveIntegerField(
        default=1,
        help_text="Max times a single student can redeem"
    )
    times_used = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'coupons'
        verbose_name = 'Coupon'
        verbose_name_plural = 'Coupons'
        ordering = ['-created_at']

    def clean(self):
        if self.valid_until <= self.valid_from:
            raise ValidationError("Coupon validity end date must be strictly after valid from date.")
        if self.discount_type == self.DiscountType.PERCENTAGE and self.discount_value > Decimal('100.00'):
            raise ValidationError("Percentage discount cannot exceed 100%.")

    @property
    def is_currently_valid(self):
        from django.utils import timezone
        now = timezone.now()
        if not self.is_active:
            return False
        if not (self.valid_from <= now <= self.valid_until):
            return False
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False
        return True

    def __str__(self):
        return f"{self.code} ({self.discount_value} {self.get_discount_type_display()})"


class CouponUsage(models.Model):
    """
    Tracks individual user coupon redemptions for auditing and per-user limit enforcement.
    """
    coupon = models.ForeignKey(Coupon, on_delete=models.CASCADE, related_name='usages')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='coupon_usages')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='coupon_usages')
    discount_applied = models.DecimalField(max_digits=10, decimal_places=2)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'coupon_usages'
        verbose_name = 'Coupon Usage'
        verbose_name_plural = 'Coupon Usages'
        indexes = [
            models.Index(fields=['coupon', 'user']),
        ]

    def __str__(self):
        return f"{self.coupon.code} used by {self.user.username} on Order #{str(self.order.order_number)[:8]}"


class Complaint(models.Model):
    """
    Customer grievances and support tickets.
    Supports issue tracking across orders, products, shops, printing, delivery, and payments.
    """
    class Category(models.TextChoices):
        ORDER = 'ORDER', 'Order & Items Issue'
        PRODUCT = 'PRODUCT', 'Damaged or Defective Product'
        SHOP = 'SHOP', 'Merchant Behavior or Overcharging'
        PRINTING = 'PRINTING', 'Print / Xerox Quality Issue'
        DELIVERY = 'DELIVERY', 'Delivery Courier Dispute'
        PAYMENT = 'PAYMENT', 'Payment or Refund Dispute'
        OTHER = 'OTHER', 'General Grievance'

    class Status(models.TextChoices):
        OPEN = 'OPEN', 'Open'
        IN_REVIEW = 'IN_REVIEW', 'In Review'
        RESOLVED = 'RESOLVED', 'Resolved'
        REJECTED = 'REJECTED', 'Rejected'
        CLOSED = 'CLOSED', 'Closed'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        URGENT = 'URGENT', 'Urgent'

    ticket_number = models.CharField(
        max_length=36,
        unique=True,
        default=uuid.uuid4,
        editable=False,
        db_index=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='complaints',
        db_index=True
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='complaints'
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='complaints'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='complaints'
    )
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.ORDER,
        db_index=True
    )
    subject = models.CharField(max_length=200)
    description = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        db_index=True
    )
    priority = models.CharField(
        max_length=15,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True
    )
    resolution = models.TextField(blank=True, default='')
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='resolved_complaints'
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'complaints'
        verbose_name = 'Complaint'
        verbose_name_plural = 'Complaints'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'status']),
            models.Index(fields=['status', 'priority']),
        ]

    def __str__(self):
        return f"[{self.status}] {self.subject} (#{str(self.ticket_number)[:8]})"


class ComplaintMessage(models.Model):
    """
    Threaded follow-up messages on a complaint ticket.
    """
    complaint = models.ForeignKey(Complaint, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'complaint_messages'
        verbose_name = 'Complaint Message'
        verbose_name_plural = 'Complaint Messages'
        ordering = ['created_at']

    def __str__(self):
        return f"Msg from {self.sender.username} on #{str(self.complaint.ticket_number)[:8]}"


class Payment(models.Model):
    """
    Step 25: Financial Payment & Gateway Transaction record.
    Authoritative, decoupled, and idempotent tracking of student and cash payments.
    """
    class Status(models.TextChoices):
        CREATED = 'CREATED', 'Created / Initiated'
        PENDING = 'PENDING', 'Pending Payment'
        AUTHORIZED = 'AUTHORIZED', 'Authorized'
        CAPTURED = 'CAPTURED', 'Captured / Paid'
        FAILED = 'FAILED', 'Failed'
        CANCELLED = 'CANCELLED', 'Cancelled'
        REFUNDED = 'REFUNDED', 'Refunded'
        PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED', 'Partially Refunded'

    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='payments',
        db_index=True
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='payments',
        db_index=True
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='payments',
        db_index=True
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default='INR')
    payment_method = models.CharField(
        max_length=20,
        choices=Order.PaymentMethod.choices,
        default=Order.PaymentMethod.COD
    )
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.CREATED,
        db_index=True
    )
    gateway = models.CharField(max_length=30, default='SANDBOX', db_index=True)
    gateway_order_id = models.CharField(max_length=100, blank=True, db_index=True)
    gateway_payment_id = models.CharField(max_length=100, blank=True, db_index=True)
    gateway_signature = models.CharField(max_length=255, blank=True)
    idempotency_key = models.CharField(max_length=100, unique=True, db_index=True)
    failure_reason = models.TextField(blank=True)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    merchant_payout = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='cash_collections'
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'payments'
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['user', 'status']),
            models.Index(fields=['gateway_order_id']),
            models.Index(fields=['gateway_payment_id']),
        ]

    def __str__(self):
        return f"Payment #{self.id} - Order #{str(self.order.order_number)[:8]} - ₹{self.amount} [{self.status}]"


class Refund(models.Model):
    """
    Step 25: Refund record linked to a payment and order.
    Supports full and partial refunds with cumulative cap enforcement.
    """
    class Status(models.TextChoices):
        REQUESTED = 'REQUESTED', 'Requested'
        APPROVED = 'APPROVED', 'Approved'
        PROCESSING = 'PROCESSING', 'Processing'
        COMPLETED = 'COMPLETED', 'Completed'
        FAILED = 'FAILED', 'Failed'
        REJECTED = 'REJECTED', 'Rejected'
        CANCELLED = 'CANCELLED', 'Cancelled'

    payment = models.ForeignKey(
        Payment,
        on_delete=models.CASCADE,
        related_name='refunds'
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='refunds'
    )
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    reason = models.TextField()
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.REQUESTED,
        db_index=True
    )
    gateway_refund_id = models.CharField(max_length=100, blank=True, db_index=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='refund_requests'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_refunds'
    )
    rejection_reason = models.TextField(blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'refunds'
        verbose_name = 'Refund'
        verbose_name_plural = 'Refunds'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['payment', 'status']),
        ]

    def __str__(self):
        return f"Refund #{self.id} for Order #{str(self.order.order_number)[:8]} - ₹{self.amount} [{self.status}]"

