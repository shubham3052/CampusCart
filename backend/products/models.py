from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils import timezone

class Category(models.Model):
    """
    Product categories (e.g., Notebooks & Registers, Writing Instruments,
    Drafting Tools, Exam Supplies, Paper Reams, Adhesives).
    """
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'categories'
        verbose_name = 'Category'
        verbose_name_plural = 'Categories'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    """
    Stationery products listed by a shop.
    One shop can contain many products.
    """
    class Unit(models.TextChoices):
        PIECE = 'PIECE', 'Piece'
        PACK = 'PACK', 'Pack'
        BOX = 'BOX', 'Box'
        REAM = 'REAM', 'Paper Ream (500 sheets)'
        SET = 'SET', 'Set / Kit'

    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='products',
        db_index=True
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.PROTECT,
        related_name='products',
        db_index=True
    )
    name = models.CharField(max_length=200, db_index=True)
    slug = models.SlugField(max_length=220)
    sku = models.CharField(max_length=60, blank=True, db_index=True)
    description = models.TextField(blank=True)
    from decimal import Decimal
    price = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(Decimal('0.00'))])
    brand = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20, choices=Unit.choices, default=Unit.PIECE)
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'products'
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        unique_together = ('shop', 'sku')
        indexes = [
            models.Index(fields=['shop', 'category']),
            models.Index(fields=['name', 'price']),
        ]

    def __str__(self):
        return f"{self.name} - {self.shop.name} (${self.price})"


class Review(models.Model):
    """
    Student ratings and feedback for products and shops.
    Enforces verified purchase linking, rating validation, and review moderation workflows.
    """
    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending Moderation'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'
        HIDDEN = 'HIDDEN', 'Hidden'
        REPORTED = 'REPORTED', 'Reported'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='reviews'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='reviews',
        null=True,
        blank=True
    )
    order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviews'
    )
    order_item = models.ForeignKey(
        'orders.OrderItem',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviews'
    )
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)],
        help_text="Rating score from 1 to 5"
    )
    comment = models.TextField(blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.APPROVED,
        db_index=True
    )
    is_reported = models.BooleanField(default=False, db_index=True)
    report_reason = models.TextField(blank=True, default='')
    moderation_notes = models.TextField(blank=True, default='')
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='moderated_reviews'
    )
    moderated_at = models.DateTimeField(null=True, blank=True)
    seller_response = models.TextField(blank=True, default='')
    seller_responded_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'reviews'
        verbose_name = 'Review'
        verbose_name_plural = 'Reviews'
        indexes = [
            models.Index(fields=['shop', 'rating']),
            models.Index(fields=['product', 'rating']),
            models.Index(fields=['status', '-created_at']),
        ]

    def __str__(self):
        target = self.product.name if self.product else self.shop.name
        return f"{self.rating}★ for {target} by {self.user.username} [{self.status}]"


class Wishlist(models.Model):
    """
    Student wishlist for favorite or frequently purchased stationery.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='wishlists'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='wishlisted_by'
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'wishlists'
        unique_together = ('user', 'product')
        verbose_name = 'Wishlist'
        verbose_name_plural = 'Wishlists'

    def __str__(self):
        return f"{self.user.username} -> {self.product.name}"


class ShoppingList(models.Model):
    """
    Pre-saved supply lists for students (e.g., 'Semester Start Kit', 'Architecture Lab Supplies').
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='shopping_lists'
    )
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shopping_lists'
        verbose_name = 'Shopping List'
        verbose_name_plural = 'Shopping Lists'

    def __str__(self):
        return f"{self.name} ({self.user.username})"


class ShoppingListItem(models.Model):
    """
    Items inside a saved student shopping list. Supports catalog products as well as
    generic academic/custom needs (e.g., 'Print Project Report', 'Spiral Binding').
    """
    class Source(models.TextChoices):
        MANUAL = 'MANUAL', 'Manual'
        ACADEMIC = 'ACADEMIC', 'Academic'
        RECOMMENDATION = 'RECOMMENDATION', 'Recommendation'
        BUY_AGAIN = 'BUY_AGAIN', 'Buy Again'
        TASK = 'TASK', 'Task'
        EVENT = 'EVENT', 'Event'

    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        URGENT = 'URGENT', 'Urgent'

    shopping_list = models.ForeignKey(
        ShoppingList,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        null=True,
        blank=True
    )
    custom_item_name = models.CharField(max_length=200, blank=True, default='')
    source = models.CharField(
        max_length=30,
        choices=Source.choices,
        default=Source.MANUAL
    )
    priority = models.CharField(
        max_length=15,
        choices=Priority.choices,
        default=Priority.MEDIUM
    )
    notes = models.TextField(blank=True, default='')
    service_type = models.CharField(max_length=30, blank=True, default='')
    estimated_price = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    is_checked = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shopping_list_items'
        ordering = ['is_checked', '-priority', '-updated_at']

    @property
    def item_name(self):
        return self.product.name if self.product else (self.custom_item_name or 'Stationery Item')

    def __str__(self):
        return f"{self.item_name} x {self.quantity}"


class BulkPricingTier(models.Model):
    """
    Configurable quantity-tiered bulk discounts for products or shops.
    Enables campus merchants to offer volume discounts (e.g. 10-24: 5%, 25-49: 10%, 50+: 15%).
    """
    class DiscountType(models.TextChoices):
        PERCENTAGE = 'PERCENTAGE', 'Percentage Discount'
        FIXED = 'FIXED', 'Fixed Amount Discount Per Unit'

    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='bulk_pricing_tiers',
        db_index=True
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='bulk_pricing_tiers',
        null=True,
        blank=True,
        db_index=True,
        help_text="Leave blank to apply tier to all products in this shop"
    )
    min_quantity = models.PositiveIntegerField(
        default=10,
        validators=[MinValueValidator(2)],
        help_text="Minimum purchase units to qualify for this tier"
    )
    max_quantity = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Upper threshold (inclusive). Leave blank for open-ended (e.g. 50+)"
    )
    discount_type = models.CharField(
        max_length=20,
        choices=DiscountType.choices,
        default=DiscountType.PERCENTAGE
    )
    discount_value = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        validators=[MinValueValidator(0.00)],
        help_text="Discount percentage (e.g. 10.00 for 10%) or fixed currency reduction per unit"
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulk_pricing_tiers'
        verbose_name = 'Bulk Pricing Tier'
        verbose_name_plural = 'Bulk Pricing Tiers'
        ordering = ['shop', 'product', 'min_quantity']
        indexes = [
            models.Index(fields=['shop', 'is_active', 'min_quantity']),
            models.Index(fields=['product', 'is_active', 'min_quantity']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.max_quantity is not None and self.max_quantity < self.min_quantity:
            raise ValidationError("Maximum quantity must be greater than or equal to minimum quantity.")
        if self.discount_type == self.DiscountType.PERCENTAGE and self.discount_value > 100:
            raise ValidationError("Percentage discount cannot exceed 100%.")

    def __str__(self):
        prod_str = self.product.name if self.product else "All Products"
        range_str = f"{self.min_quantity}-{self.max_quantity or '+'}"
        return f"{self.shop.name} | {prod_str} ({range_str}): {self.discount_value} ({self.get_discount_type_display()})"


class PriceAlert(models.Model):
    """
    Student price drop or restock notification trigger.
    Notifies students when out-of-stock items restock or prices fall to a target threshold.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='price_alerts',
        db_index=True
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
        related_name='price_alerts',
        db_index=True
    )
    target_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Target price to trigger drop notification"
    )
    initial_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        help_text="Price at the time the alert was created"
    )
    alert_on_restock = models.BooleanField(
        default=True,
        help_text="Trigger alert when out-of-stock item becomes available"
    )
    is_active = models.BooleanField(default=True, db_index=True)
    is_triggered = models.BooleanField(default=False)
    triggered_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'price_alerts'
        verbose_name = 'Price Alert'
        verbose_name_plural = 'Price Alerts'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['product', 'is_active']),
        ]

    @property
    def active(self):
        return self.is_active

    @active.setter
    def active(self, val):
        self.is_active = val

    @property
    def notified_at(self):
        return self.triggered_at

    @notified_at.setter
    def notified_at(self, val):
        self.triggered_at = val

    def __str__(self):
        return f"Alert: {self.user.username} -> {self.product.name} (Target: ₹{self.target_price})"


