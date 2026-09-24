from rest_framework import serializers
from .models import Notification, NotificationPreference

class NotificationSerializer(serializers.ModelSerializer):
    notification_type_display = serializers.CharField(source='get_notification_type_display', read_only=True)
    recipient_username = serializers.CharField(source='recipient.username', read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id',
            'recipient',
            'recipient_username',
            'title',
            'message',
            'notification_type',
            'notification_type_display',
            'is_read',
            'reference_id',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = NotificationPreference
        fields = [
            'id',
            'user',
            'username',
            'order_updates',
            'delivery_updates',
            'printing_updates',
            'pickup_reminders',
            'stock_alerts',
            'offers_promotions',
            'wishlist_alerts',
            'academic_reminders',
            'recommendations',
            'complaint_updates',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'username', 'updated_at']

    def validate(self, attrs):
        # Mandatory critical notifications cannot be disabled
        attrs['order_updates'] = True
        attrs['delivery_updates'] = True
        return attrs

