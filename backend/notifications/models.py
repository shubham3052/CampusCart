from django.db import models
from django.conf import settings

class Notification(models.Model):
    """
    Multichannel system notification dispatch for students, shop owners, and admins.
    """
    class NotificationType(models.TextChoices):
        ORDER_STATUS = 'ORDER_STATUS', 'Order Status Update'
        PRINT_READY = 'PRINT_READY', 'Print Document Ready'
        PICKUP_READY = 'PICKUP_READY', 'Ready for Store Pickup'
        DELIVERY_UPDATE = 'DELIVERY_UPDATE', 'Delivery Courier Update'
        LOW_STOCK = 'LOW_STOCK', 'Low Stock Warning (Shopkeeper)'
        RESTOCK_RECOMMENDATION = 'RESTOCK_RECOMMENDATION', 'AI Restock Recommendation'
        ACADEMIC_ALERT = 'ACADEMIC_ALERT', 'Academic Cycle Demand Alert'
        TASK_REMINDER = 'TASK_REMINDER', 'Task & Deadline Reminder'
        PLANNER_SUGGESTION = 'PLANNER_SUGGESTION', 'Smart Planner Suggestion'
        OFFER_ALERT = 'OFFER_ALERT', 'Special Offer & Promotion'
        WISHLIST_ALERT = 'WISHLIST_ALERT', 'Wishlist Restock Alert'
        COMPLAINT_UPDATE = 'COMPLAINT_UPDATE', 'Support Grievance Update'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True
    )
    title = models.CharField(max_length=150)
    message = models.TextField()
    notification_type = models.CharField(
        max_length=30,
        choices=NotificationType.choices,
        default=NotificationType.ORDER_STATUS,
        db_index=True
    )
    is_read = models.BooleanField(default=False, db_index=True)
    reference_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Optional identifier linking to Order Number, Product ID, or Recommendation"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
        ]

    def __str__(self):
        return f"[{self.notification_type}] for {self.recipient.username}: {self.title}"


class NotificationPreference(models.Model):
    """
    Student and merchant notification preferences.
    Mandatory critical alerts (order/delivery updates) cannot be disabled.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notification_preferences'
    )
    order_updates = models.BooleanField(default=True, help_text="Order confirmed, ready, completed (Critical)")
    delivery_updates = models.BooleanField(default=True, help_text="Courier assigned, out for delivery (Critical)")
    printing_updates = models.BooleanField(default=True, help_text="Print queue status and completion")
    pickup_reminders = models.BooleanField(default=True, help_text="Store counter pickup reminders")
    stock_alerts = models.BooleanField(default=True, help_text="Low stock and restock notices")
    offers_promotions = models.BooleanField(default=True, help_text="Exclusive shop discounts and promotional offers")
    wishlist_alerts = models.BooleanField(default=True, help_text="Restock alerts for wishlisted items")
    academic_reminders = models.BooleanField(default=True, help_text="Exam and syllabus stationery preparation notices")
    recommendations = models.BooleanField(default=True, help_text="AI personalized stationery suggestions")
    complaint_updates = models.BooleanField(default=True, help_text="Support grievance resolution notices")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notification_preferences'
        verbose_name = 'Notification Preference'
        verbose_name_plural = 'Notification Preferences'

    @classmethod
    def is_allowed_for(cls, user, notification_type: str) -> bool:
        """
        Checks if the user allows notifications of this type.
        Mandatory critical notifications (order and delivery updates) are ALWAYS allowed.
        """
        if not user or not user.is_authenticated:
            return True

        # Critical mandatory types cannot be disabled
        if notification_type in [
            Notification.NotificationType.ORDER_STATUS,
            Notification.NotificationType.DELIVERY_UPDATE,
            Notification.NotificationType.PICKUP_READY,
        ]:
            return True

        pref = cls.objects.filter(user=user).first()
        if not pref:
            return True

        type_map = {
            Notification.NotificationType.PRINT_READY: pref.printing_updates,
            Notification.NotificationType.LOW_STOCK: pref.stock_alerts,
            Notification.NotificationType.RESTOCK_RECOMMENDATION: pref.stock_alerts,
            Notification.NotificationType.ACADEMIC_ALERT: pref.academic_reminders,
            Notification.NotificationType.TASK_REMINDER: pref.academic_reminders,
            Notification.NotificationType.PLANNER_SUGGESTION: pref.recommendations,
            Notification.NotificationType.OFFER_ALERT: pref.offers_promotions,
            Notification.NotificationType.WISHLIST_ALERT: pref.wishlist_alerts,
            Notification.NotificationType.COMPLAINT_UPDATE: pref.complaint_updates,
        }
        return type_map.get(notification_type, True)

    def __str__(self):
        return f"Notification Preferences for {self.user.username}"

