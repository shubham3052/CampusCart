from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.contrib.auth import get_user_model
from .serializers import UserSerializer
from .permissions import IsAdmin, IsOwnerOrAdmin

User = get_user_model()

class UserViewSet(viewsets.ModelViewSet):
    """
    User Management and Profile ViewSet.
    
    SECURITY:
    - User list/create/destroy is strictly restricted to ADMIN.
    - Retrieving/updating individual accounts is restricted to the account owner or ADMIN.
    - Current profile action is restricted to Authenticated users.
    """
    queryset = User.objects.all().order_by('-created_at')
    serializer_class = UserSerializer
    filterset_fields = ['role', 'is_active']
    search_fields = ['username', 'first_name', 'last_name', 'email', 'phone_number', 'college_id']

    def get_permissions(self):
        if self.action in ['list', 'create', 'destroy']:
            permission_classes = [IsAdmin]
        elif self.action in ['retrieve', 'update', 'partial_update']:
            permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
        elif self.action == 'profile':
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated]
        return [permission() for permission in permission_classes]

    def destroy(self, request, *args, **kwargs):
        """
        DELETE /api/users/{id}/
        Prevent direct deletion of accounts to safeguard database integrity,
        audit history, student orders, payments, reviews, and print jobs.
        """
        return Response(
            {
                "success": False,
                "error": "AccountDeletionProhibited",
                "message": (
                    "Direct user account deletion is prohibited to safeguard order history, "
                    "financial transactions, and audit integrity. Please deactivate the account instead."
                )
            },
            status=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return User.objects.none()
        if user.is_admin:
            return User.objects.all().order_by('-created_at')
        return User.objects.filter(id=user.id)

    @action(detail=True, methods=['post'], url_path='verify-email')
    def verify_email(self, request, pk=None):
        """
        POST /api/users/{id}/verify-email/
        Allows administrators to mark an unverified user account's email as verified.
        Ensures test accounts and students encountering delivery issues can be securely verified.
        """
        if not request.user.is_admin:
            return Response(
                {"success": False, "message": "Only administrators can verify user emails."},
                status=status.HTTP_403_FORBIDDEN
            )
        target_user = self.get_object()
        target_user.email_verified = True
        target_user.save(update_fields=['email_verified'])

        from users.models import AuditLog
        from users.services.audit_service import AuditService
        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(target_user.id),
            metadata={"sub_action": "EMAIL_VERIFIED_BY_ADMIN", "user_email": target_user.email},
            request=request
        )

        return Response({
            "success": True,
            "id": target_user.id,
            "email": target_user.email,
            "email_verified": target_user.email_verified,
            "message": f"Email for account '{target_user.email}' has been verified successfully."
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='profile')
    def profile(self, request):
        """
        GET /api/users/profile/ - Retrieve current user profile.
        PUT/PATCH /api/users/profile/ - Update profile fields.
        """
        user = request.user
        if request.method == 'GET':
            serializer = self.get_serializer(user)
            return Response(serializer.data)

        partial = request.method == 'PATCH'
        serializer = self.get_serializer(user, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        """
        POST /api/users/change-password/
        Secure password change for authenticated users.
        Validates current password, minimum length, and confirmation match.
        """
        user = request.user
        current_password = request.data.get('current_password', '').strip()
        new_password = request.data.get('new_password', '').strip()
        confirm_password = request.data.get('confirm_password', '').strip()

        if not current_password or not new_password or not confirm_password:
            return Response(
                {"success": False, "message": "All password fields are required."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if not user.check_password(current_password):
            return Response(
                {"success": False, "message": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if new_password != confirm_password:
            return Response(
                {"success": False, "message": "New passwords do not match."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if len(new_password) < 8:
            return Response(
                {"success": False, "message": "New password must be at least 8 characters long."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user.set_password(new_password)
        user.save()

        try:
            from users.models import AuditLog
            from users.services.audit_service import AuditService
            AuditService.log(
                action=AuditLog.Action.LOGIN_ATTEMPT,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"event": "PASSWORD_CHANGED"},
                request=request
            )
        except Exception:
            pass

        return Response(
            {"success": True, "message": "Password changed successfully."},
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'], url_path='resend-verification')
    def resend_verification(self, request, pk=None):
        """
        POST /api/users/{id}/resend-verification/
        Allows administrators to trigger a verification email for an unverified account.
        """
        if not request.user.is_admin:
            return Response(
                {"success": False, "message": "Only administrators can resend verification emails for other users."},
                status=status.HTTP_403_FORBIDDEN
            )
        target_user = self.get_object()
        from users.services.email_service import EmailService
        from users.models import EmailVerificationOTP
        success, message, _ = EmailService.create_and_send_otp(
            email=target_user.email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            user=target_user
        )
        return Response(
            {"success": success, "message": message},
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST
        )

    @action(detail=True, methods=['post'], url_path='approve-courier')
    def approve_courier(self, request, pk=None):
        """
        POST /api/users/{id}/approve-courier/
        Allows Administrators / Platform Owners to approve a registered courier.
        """
        if not request.user.is_admin:
            return Response(
                {"success": False, "message": "Only administrators can approve courier applications."},
                status=status.HTTP_403_FORBIDDEN
            )
        target_user = self.get_object()
        if target_user.role != User.Role.DELIVERY_AGENT:
            return Response(
                {"success": False, "message": "Target account is not a courier / delivery partner."},
                status=status.HTTP_400_BAD_REQUEST
            )

        target_user.approval_status = User.ApprovalStatus.APPROVED
        target_user.save(update_fields=['approval_status'])

        from notifications.models import Notification
        from users.models import AuditLog
        from users.services.audit_service import AuditService

        Notification.objects.create(
            recipient=target_user,
            notification_type=Notification.NotificationType.DELIVERY_UPDATE,
            title="Courier Application Approved",
            message="Congratulations! Your delivery partner application has been approved by campus administration. You can now accept deliveries."
        )

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(target_user.id),
            metadata={"sub_action": "COURIER_APPROVED", "courier_email": target_user.email},
            request=request
        )

        return Response({
            "success": True,
            "id": target_user.id,
            "email": target_user.email,
            "approval_status": target_user.approval_status,
            "message": f"Courier '{target_user.email}' approved successfully."
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='reject-courier')
    def reject_courier(self, request, pk=None):
        """
        POST /api/users/{id}/reject-courier/
        Allows Administrators / Platform Owners to reject a registered courier.
        """
        if not request.user.is_admin:
            return Response(
                {"success": False, "message": "Only administrators can reject courier applications."},
                status=status.HTTP_403_FORBIDDEN
            )
        target_user = self.get_object()
        if target_user.role != User.Role.DELIVERY_AGENT:
            return Response(
                {"success": False, "message": "Target account is not a courier / delivery partner."},
                status=status.HTTP_400_BAD_REQUEST
            )

        reason = request.data.get('reason', 'Application did not meet campus delivery partner criteria.')
        target_user.approval_status = User.ApprovalStatus.REJECTED
        target_user.save(update_fields=['approval_status'])

        from notifications.models import Notification
        from users.models import AuditLog
        from users.services.audit_service import AuditService

        Notification.objects.create(
            recipient=target_user,
            notification_type=Notification.NotificationType.DELIVERY_UPDATE,
            title="Courier Application Status Update",
            message=f"Your delivery partner application was not approved. Reason: {reason}"
        )

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(target_user.id),
            metadata={"sub_action": "COURIER_REJECTED", "courier_email": target_user.email, "reason": reason},
            request=request
        )

        return Response({
            "success": True,
            "id": target_user.id,
            "email": target_user.email,
            "approval_status": target_user.approval_status,
            "message": f"Courier '{target_user.email}' rejected."
        }, status=status.HTTP_200_OK)

