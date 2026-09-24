from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from decimal import Decimal


class RecommendationInteraction(models.Model):
    """
    Lightweight interaction tracking for student recommendation events.
    Enables future collaborative filtering, CTR, and conversion rate analysis.
    """
    class Action(models.TextChoices):
        VIEWED = 'VIEWED', 'Viewed / Impressed'
        CLICKED = 'CLICKED', 'Clicked Product Card'
        ADDED_TO_CART = 'ADDED_TO_CART', 'Added to Cart'
        PURCHASED = 'PURCHASED', 'Completed Purchase'
        DISMISSED = 'DISMISSED', 'Dismissed / Hidden'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='recommendation_interactions',
        null=True,
        blank=True,
        db_index=True
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='recommendation_interactions',
        null=True,
        blank=True,
        db_index=True
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='recommendation_interactions',
        null=True,
        blank=True
    )
    recommendation_type = models.CharField(
        max_length=50,
        default='PERSONALIZED',
        db_index=True,
        help_text="Recommendation category e.g. BUY_AGAIN, ACADEMIC, FREQUENTLY_BOUGHT"
    )
    action = models.CharField(
        max_length=30,
        choices=Action.choices,
        default=Action.VIEWED,
        db_index=True
    )
    session_id = models.CharField(max_length=64, blank=True)
    context_data = models.JSONField(default=dict, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'recommendation_interactions'
        verbose_name = 'Recommendation Interaction'
        verbose_name_plural = 'Recommendation Interactions'
        indexes = [
            models.Index(fields=['user', 'action']),
            models.Index(fields=['recommendation_type', 'action']),
            models.Index(fields=['timestamp', 'action']),
        ]

    def __str__(self):
        user_name = self.user.username if self.user else "Anonymous"
        prod_name = self.product.name if self.product else "N/A"
        return f"{user_name} [{self.action}] on {prod_name} ({self.recommendation_type})"


class RecommendationFeedback(models.Model):
    """
    Explicit negative/positive feedback from students to tune unwanted recommendations.
    """
    class FeedbackType(models.TextChoices):
        NOT_INTERESTED = 'NOT_INTERESTED', 'Not Interested in this item'
        ALREADY_HAVE = 'ALREADY_HAVE', 'Already have this item'
        NOT_RELEVANT = 'NOT_RELEVANT', 'Not relevant to my semester/course'
        PRICE_TOO_HIGH = 'PRICE_TOO_HIGH', 'Price is too high'
        OTHER = 'OTHER', 'Other reason'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='recommendation_feedbacks',
        db_index=True
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='recommendation_feedbacks',
        db_index=True
    )
    feedback_type = models.CharField(
        max_length=30,
        choices=FeedbackType.choices,
        default=FeedbackType.NOT_INTERESTED,
        db_index=True
    )
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'recommendation_feedbacks'
        unique_together = ('user', 'product')
        verbose_name = 'Recommendation Feedback'
        verbose_name_plural = 'Recommendation Feedbacks'

    def __str__(self):
        return f"{self.user.username} marked {self.product.name}: {self.get_feedback_type_display()}"


class RecommendationConfig(models.Model):
    """
    Configurable scoring weights and policy parameters for the hybrid engine.
    Allows administrators to tune weights without application restart.
    """
    personal_history_weight = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('0.30'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('1.00'))]
    )
    academic_context_weight = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('0.35'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('1.00'))]
    )
    product_similarity_weight = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('0.15'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('1.00'))]
    )
    trending_velocity_weight = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('0.10'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('1.00'))]
    )
    popularity_weight = models.DecimalField(
        max_digits=4, decimal_places=2, default=Decimal('0.10'),
        validators=[MinValueValidator(Decimal('0.00')), MaxValueValidator(Decimal('1.00'))]
    )
    recency_decay_halflife_days = models.PositiveIntegerField(
        default=30, help_text="Exponential decay half-life in days for repeat purchase weighting"
    )
    min_inventory_required = models.PositiveIntegerField(
        default=1, help_text="Minimum stock required before recommending a product"
    )
    co_occurrence_min_orders = models.PositiveIntegerField(
        default=2, help_text="Minimum joint order threshold for Frequently Bought Together"
    )
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'recommendation_configs'
        verbose_name = 'Recommendation Configuration'
        verbose_name_plural = 'Recommendation Configurations'

    @classmethod
    def get_active(cls):
        config = cls.objects.filter(is_active=True).first()
        if not config:
            config = cls.objects.create()
        return config

    def __str__(self):
        return f"Recommendation Config (P={self.personal_history_weight}, A={self.academic_context_weight}, S={self.product_similarity_weight})"
