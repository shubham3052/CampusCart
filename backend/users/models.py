from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone

class User(AbstractUser):
    """
    Custom user model for Smart Student Stationery Delivery System.
    Enforces role-based capabilities without duplicating authentication logic.
    """
    class Role(models.TextChoices):
        STUDENT = 'STUDENT', 'Student / Customer'
        SHOP_OWNER = 'SHOP_OWNER', 'Shop Owner'
        DELIVERY_AGENT = 'DELIVERY_AGENT', 'Delivery Agent'
        ADMIN = 'ADMIN', 'System Administrator'
        PLATFORM_OWNER = 'PLATFORM_OWNER', 'Platform Owner'

    class AvailabilityStatus(models.TextChoices):
        AVAILABLE = 'AVAILABLE', 'Available for Orders'
        BUSY = 'BUSY', 'On Active Delivery'
        OFFLINE = 'OFFLINE', 'Shift Inactive / Offline'

    class ApprovalStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pending Approval'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    email = models.EmailField(
        unique=True,
        db_index=True,
        help_text="Primary email address used for login and notifications"
    )
    email_verified = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Designates whether the user's email address has been verified via OTP"
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        db_index=True,
        help_text="Primary role assigned to this user"
    )
    availability_status = models.CharField(
        max_length=20,
        choices=AvailabilityStatus.choices,
        default=AvailabilityStatus.AVAILABLE,
        db_index=True,
        help_text="Operational readiness for campus couriers"
    )
    approval_status = models.CharField(
        max_length=20,
        choices=ApprovalStatus.choices,
        default=ApprovalStatus.APPROVED,
        db_index=True,
        help_text="Administrative approval status for roles requiring verification (e.g. Couriers)"
    )
    phone_number = models.CharField(
        max_length=15,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="User contact phone number for delivery updates and OTP verification"
    )
    college_id = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        db_index=True,
        help_text="Student / Faculty University Roll / Registration Number"
    )
    department = models.CharField(
        max_length=100,
        null=True,
        blank=True,
        help_text="Academic Department (e.g. Computer Science, Mechanical)"
    )
    hostel_block = models.CharField(
        max_length=50,
        null=True,
        blank=True,
        help_text="Campus hostel / residential hall identifier"
    )
    room_number = models.CharField(
        max_length=20,
        null=True,
        blank=True,
        help_text="Room or flat number for hostel doorstep delivery"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            models.Index(fields=['role', 'is_active']),
            models.Index(fields=['college_id']),
            models.Index(fields=['email']),
        ]

    @property
    def name(self):
        full = f"{self.first_name} {self.last_name}".strip()
        return full if full else self.username

    @name.setter
    def name(self, value):
        if value:
            parts = value.strip().split(' ', 1)
            self.first_name = parts[0]
            self.last_name = parts[1] if len(parts) > 1 else ''

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_shop_owner(self):
        return self.role == self.Role.SHOP_OWNER

    @property
    def is_delivery_agent(self):
        return self.role == self.Role.DELIVERY_AGENT

    @property
    def is_approved_courier(self):
        return self.role == self.Role.DELIVERY_AGENT and self.approval_status == self.ApprovalStatus.APPROVED

    @property
    def is_pending_courier(self):
        return self.role == self.Role.DELIVERY_AGENT and self.approval_status == self.ApprovalStatus.PENDING

    @property
    def is_admin(self):
        return self.role in [self.Role.ADMIN, self.Role.PLATFORM_OWNER] or self.is_superuser or self.is_staff

    @property
    def is_platform_owner(self):
        return self.role == self.Role.PLATFORM_OWNER

    def __str__(self):
        return f"{self.name} <{self.email}> [{self.get_role_display()}]"


class EmailVerificationOTP(models.Model):
    """
    Dedicated Email Verification OTP model for account verification, email changes,
    and secure password resets. Completely separate from order pickup/delivery OTPs.
    """
    class Purpose(models.TextChoices):
        EMAIL_VERIFICATION = 'EMAIL_VERIFICATION', 'Account Email Verification'
        EMAIL_CHANGE = 'EMAIL_CHANGE', 'Email Address Change'
        PASSWORD_RESET = 'PASSWORD_RESET', 'Password Reset'
        ACCOUNT_DELETION = 'ACCOUNT_DELETION', 'Account Deletion'
        ADMIN_INVITATION = 'ADMIN_INVITATION', 'Admin Invitation Verification'

    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='email_otps'
    )
    email = models.EmailField(
        db_index=True,
        help_text="Recipient email address for OTP delivery"
    )
    purpose = models.CharField(
        max_length=30,
        choices=Purpose.choices,
        default=Purpose.EMAIL_VERIFICATION,
        db_index=True
    )
    otp_hash = models.CharField(
        max_length=128,
        db_index=True,
        help_text="PBKDF2/SHA256 salted hash of the 6-digit OTP code"
    )
    expires_at = models.DateTimeField(db_index=True)
    attempts = models.PositiveIntegerField(
        default=0,
        help_text="Number of verification attempts made on this OTP"
    )
    max_attempts = models.PositiveIntegerField(
        default=5,
        help_text="Maximum allowed verification attempts before lock"
    )
    resend_count = models.PositiveIntegerField(
        default=0,
        help_text="Resend counter for rate limiting"
    )
    last_sent_at = models.DateTimeField(
        default=timezone.now,
        help_text="Timestamp when OTP was generated and dispatched"
    )
    is_verified = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True if successfully verified"
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'email_verification_otps'
        verbose_name = 'Email Verification OTP'
        verbose_name_plural = 'Email Verification OTPs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'purpose', 'is_verified']),
            models.Index(fields=['user', 'purpose']),
            models.Index(fields=['expires_at']),
        ]

    def set_otp(self, raw_otp: str):
        """
        Hashes the 6-digit OTP code using Django's cryptographically secure make_password.
        Never stores the raw OTP in plaintext.
        """
        from django.contrib.auth.hashers import make_password
        self.otp_hash = make_password(str(raw_otp).strip())

    def check_otp(self, candidate_otp: str) -> bool:
        """
        Constant-time comparison of the candidate OTP against the stored PBKDF2 hash.
        """
        from django.contrib.auth.hashers import check_password
        if not self.otp_hash or not candidate_otp:
            return False
        return check_password(str(candidate_otp).strip(), self.otp_hash)

    @property
    def is_expired(self) -> bool:
        from django.utils import timezone
        return timezone.now() > self.expires_at

    @property
    def is_valid(self) -> bool:
        return (not self.is_verified) and (not self.is_expired) and (self.attempts < self.max_attempts)

    def __str__(self):
        return f"[{self.purpose}] OTP for {self.email} ({'Verified' if self.is_verified else 'Pending'})"


class AuditLog(models.Model):
    """
    Step 26: Platform-Wide Security Audit Log.
    Tracks security-sensitive events across all apps (authentication, authorization,
    inventory adjustments, financial transitions, document access, role mutations).
    Strictly sanitized - never contains passwords, tokens, OTPs, or payment secrets.
    """
    class Action(models.TextChoices):
        # Auth & Accounts
        LOGIN_SUCCESS = 'LOGIN_SUCCESS', 'Login Success'
        LOGIN_FAILED = 'LOGIN_FAILED', 'Login Failed'
        LOGOUT = 'LOGOUT', 'Logout'
        PASSWORD_CHANGE = 'PASSWORD_CHANGE', 'Password Changed'
        PASSWORD_RESET = 'PASSWORD_RESET', 'Password Reset Confirmed'
        EMAIL_VERIFIED = 'EMAIL_VERIFIED', 'Email Verified'
        ROLE_CHANGED = 'ROLE_CHANGED', 'User Role Modified'
        ACCOUNT_LOCKED = 'ACCOUNT_LOCKED', 'Account Locked (Brute Force)'
        ACCOUNT_DELETED = 'ACCOUNT_DELETED', 'Account Deleted'
        ADMIN_INVITED = 'ADMIN_INVITED', 'Administrator Invited'
        ADMIN_ACTIVATED = 'ADMIN_ACTIVATED', 'Administrator Account Activated'

        # Orders & Payments
        ORDER_CREATED = 'ORDER_CREATED', 'Order Created'
        ORDER_CANCELLED = 'ORDER_CANCELLED', 'Order Cancelled'
        ORDER_STATUS_CHANGED = 'ORDER_STATUS_CHANGED', 'Order Status Changed'
        PAYMENT_INITIATED = 'PAYMENT_INITIATED', 'Payment Initiated'
        PAYMENT_CAPTURED = 'PAYMENT_CAPTURED', 'Payment Captured'
        PAYMENT_FAILED = 'PAYMENT_FAILED', 'Payment Failed'
        REFUND_REQUESTED = 'REFUND_REQUESTED', 'Refund Requested'
        REFUND_APPROVED = 'REFUND_APPROVED', 'Refund Approved'
        REFUND_REJECTED = 'REFUND_REJECTED', 'Refund Rejected'
        OTP_VERIFIED = 'OTP_VERIFIED', 'Handoff OTP Verified'
        OTP_FAILED = 'OTP_FAILED', 'Handoff OTP Verification Failed'

        # Inventory & Procurement
        INVENTORY_ADJUSTED = 'INVENTORY_ADJUSTED', 'Inventory Stock Adjusted'
        PURCHASE_ORDER_APPROVED = 'PURCHASE_ORDER_APPROVED', 'Purchase Order Approved'

        # Documents & Privacy
        DOCUMENT_UPLOADED = 'DOCUMENT_UPLOADED', 'Printing Document Uploaded'
        DOCUMENT_ACCESSED = 'DOCUMENT_ACCESSED', 'Printing Document Downloaded'
        DOCUMENT_PURGED = 'DOCUMENT_PURGED', 'Printing Document Purged (Retention)'

        # Admin & System
        COUPON_CREATED = 'COUPON_CREATED', 'Coupon Created'
        COUPON_MODIFIED = 'COUPON_MODIFIED', 'Coupon Modified'
        COMPLAINT_RESOLVED = 'COMPLAINT_RESOLVED', 'Complaint Resolved'
        SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY', 'Suspicious Activity Detected'
        ADMIN_ACTION = 'ADMIN_ACTION', 'Administrative Action'

    actor = models.ForeignKey(
        'users.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_logs',
        help_text="User who performed the action (or None for system/unauthenticated)"
    )
    actor_email = models.CharField(max_length=255, blank=True, default='')
    action = models.CharField(max_length=50, choices=Action.choices, db_index=True)
    target_model = models.CharField(max_length=100, blank=True, default='', db_index=True)
    target_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = 'audit_logs'
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['action', 'timestamp']),
            models.Index(fields=['actor', 'action']),
            models.Index(fields=['target_model', 'target_id']),
        ]

    def __str__(self):
        actor_str = self.actor_email or (self.actor.username if self.actor else 'SYSTEM')
        return f"[{self.timestamp.strftime('%Y-%m-%d %H:%M:%S')}] {self.action} by {actor_str}"


