from django.db import models
from django.conf import settings
from decimal import Decimal

class Shop(models.Model):
    """
    Stationery & Print shops on or around university campuses.
    Enforces that one shop has one registered owner.
    """
    class ShopType(models.TextChoices):
        LOCAL_STATIONERY = 'LOCAL_STATIONERY', 'Local Stationery Shop'
        COLLEGE_STATIONERY = 'COLLEGE_STATIONERY', 'College Stationery Shop'
        BOOK_STATIONERY = 'BOOK_STATIONERY', 'Book + Stationery Shop'
        PRINTING_XEROX = 'PRINTING_XEROX', 'Printing / Xerox Shop'

    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owned_shop',
        help_text="Designated shop owner account"
    )
    institution = models.ForeignKey(
        'academics.Institution',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='shops',
        db_index=True,
        help_text="Optional affiliated college/institution. General local shops leave blank."
    )
    name = models.CharField(max_length=150, db_index=True)
    slug = models.SlugField(max_length=160, unique=True)
    shop_type = models.CharField(
        max_length=30,
        choices=ShopType.choices,
        default=ShopType.COLLEGE_STATIONERY,
        db_index=True
    )
    description = models.TextField(blank=True)
    address = models.TextField(help_text="Physical shop address")
    campus_location = models.CharField(
        max_length=150,
        help_text="Campus landmark (e.g. Student Activity Center Block B)"
    )
    contact_phone = models.CharField(max_length=20)
    contact_email = models.EmailField(blank=True)
    opening_time = models.TimeField(default="08:00:00")
    closing_time = models.TimeField(default="21:00:00")
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Shop GPS latitude")
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True, help_text="Shop GPS longitude")
    is_active = models.BooleanField(default=True, db_index=True)
    is_cod_enabled = models.BooleanField(default=True, help_text="Whether this shop accepts Cash on Delivery")
    is_online_enabled = models.BooleanField(default=True, help_text="Whether this shop accepts online payments (UPI/Card)")
    is_pickup_cash_enabled = models.BooleanField(default=True, help_text="Whether this shop accepts cash on counter pickup")
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('5.00'), help_text="Platform commission rate percentage")
    rating = models.DecimalField(max_digits=3, decimal_places=2, default=5.00)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shops'
        verbose_name = 'Shop'
        verbose_name_plural = 'Shops'
        indexes = [
            models.Index(fields=['shop_type', 'is_active']),
            models.Index(fields=['name']),
        ]

    def __str__(self):
        return f"{self.name} [{self.get_shop_type_display()}]"


class ShopFavorite(models.Model):
    """
    Student favorite campus stationery or printing shop shortcut.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='favorite_shops'
    )
    shop = models.ForeignKey(
        Shop,
        on_delete=models.CASCADE,
        related_name='favorited_by'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'shop_favorites'
        verbose_name = 'Shop Favorite'
        verbose_name_plural = 'Shop Favorites'
        unique_together = ('user', 'shop')
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.username} -> {self.shop.name}"


class Offer(models.Model):
    """
    Merchant promotions and special discount deals.
    Enforces shop isolation, validity time windows, and percentage/fixed thresholds.
    """
    class DiscountType(models.TextChoices):
        PERCENTAGE = 'PERCENTAGE', 'Percentage Discount'
        FIXED_AMOUNT = 'FIXED_AMOUNT', 'Fixed Amount Off'

    shop = models.ForeignKey(
        Shop,
        on_delete=models.CASCADE,
        related_name='offers',
        db_index=True
    )
    title = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        help_text="Percentage (e.g. 15.00 for 15%) or flat currency discount"
    )
    min_order_value = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0.00
    )
    max_discount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum discount cap for percentage offers"
    )
    start_date = models.DateTimeField()
    end_date = models.DateTimeField()
    is_active = models.BooleanField(default=True, db_index=True)
    applicable_categories = models.ManyToManyField(
        'products.Category',
        blank=True,
        related_name='offers',
        help_text="Leave empty to apply to entire store"
    )
    applicable_products = models.ManyToManyField(
        'products.Product',
        blank=True,
        related_name='offers',
        help_text="Leave empty to apply to entire store or category"
    )
    usage_limit = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total maximum redemptions across all users"
    )
    per_user_limit = models.PositiveIntegerField(
        default=1,
        help_text="Max times a single user can redeem this offer"
    )
    times_used = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'offers'
        verbose_name = 'Offer'
        verbose_name_plural = 'Offers'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shop', 'is_active']),
            models.Index(fields=['start_date', 'end_date']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        from decimal import Decimal
        if self.end_date <= self.start_date:
            raise ValidationError("Offer end date must be strictly after the start date.")
        if self.discount_type == self.DiscountType.PERCENTAGE and self.discount_value > Decimal('100.00'):
            raise ValidationError("Percentage discount cannot exceed 100%.")

    @property
    def is_currently_valid(self):
        from django.utils import timezone
        now = timezone.now()
        if not self.is_active:
            return False
        if not (self.start_date <= now <= self.end_date):
            return False
        if self.usage_limit is not None and self.times_used >= self.usage_limit:
            return False
        return True

    def __str__(self):
        return f"{self.title} ({self.shop.name}) - {self.discount_value} {self.get_discount_type_display()}"
