from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Notification, NotificationPreference
from .serializers import NotificationSerializer, NotificationPreferenceSerializer
from users.permissions import IsOwnerOrAdmin

class NotificationViewSet(viewsets.ModelViewSet):
    """
    User Notifications ViewSet.
    
    SECURITY:
    - Strictly scoped to the authenticated recipient (IsOwnerOrAdmin).
    - Users can only read and mark their own notifications.
    """
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return Notification.objects.none()

        if user.is_admin:
            all_param = self.request.query_params.get('all')
            if all_param and all_param.lower() in ('true', '1'):
                queryset = Notification.objects.select_related('recipient').all()
            else:
                queryset = Notification.objects.filter(recipient=user)

            recipient_id = self.request.query_params.get('user')
            if recipient_id:
                queryset = queryset.filter(recipient_id=recipient_id)
        else:
            queryset = Notification.objects.filter(recipient=user)

        unread_only = self.request.query_params.get('unread')
        if unread_only and unread_only.lower() in ('true', '1'):
            queryset = queryset.filter(is_read=False)

        type_param = self.request.query_params.get('type')
        if type_param:
            queryset = queryset.filter(notification_type=type_param)

        return queryset.order_by('-created_at')

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        user = request.user
        count = Notification.objects.filter(recipient=user, is_read=False).count()
        return Response({
            "unread_count": count
        })

    @action(detail=False, methods=['post'], url_path='mark-all-read')
    def mark_all_read(self, request):
        user = request.user
        count = Notification.objects.filter(recipient=user, is_read=False).update(is_read=True)
        return Response({
            "success": True,
            "message": f"Successfully marked {count} notifications as read."
        })


class NotificationPreferenceViewSet(viewsets.ModelViewSet):
    """
    Step 24: Customer Notification Preferences API.
    Enables users to customize alert categories while strictly maintaining critical order notices.
    """
    serializer_class = NotificationPreferenceSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return NotificationPreference.objects.none()
        if getattr(user, 'is_admin', False):
            return NotificationPreference.objects.select_related('user').all()
        return NotificationPreference.objects.filter(user=user)

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='my-preferences')
    def my_preferences(self, request):
        """
        GET /api/notification-preferences/my-preferences/
        PUT/PATCH /api/notification-preferences/my-preferences/
        """
        pref, _ = NotificationPreference.objects.get_or_create(user=request.user)

        if request.method in ['PUT', 'PATCH']:
            partial = (request.method == 'PATCH')
            serializer = NotificationPreferenceSerializer(pref, data=request.data, partial=partial)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = NotificationPreferenceSerializer(pref)
        return Response(serializer.data)

