"""
Admin Management & Controlled Administrator Creation / Invitation System.

Enforces:
1. Only authorized Administrators (role in [ADMIN, PLATFORM_OWNER]) can invite new admins.
2. Normal users, shop owners, and delivery couriers are strictly forbidden (403 Forbidden).
3. Public registration as admin or role escalation is blocked.
4. Invitation dispatches a secure 6-digit OTP via Gmail SMTP to the invited admin's registered email.
5. Invitee verifies OTP and chooses their own application password (never emailed, never plaintext).
6. Account activation occurs only after successful OTP verification and password setup.
7. System Owner and the last active administrator are protected against accidental deactivation.
"""

import re
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.utils import timezone
from rest_framework import status, permissions, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema, OpenApiResponse

from users.models import EmailVerificationOTP, AuditLog
from users.permissions import IsAdmin
from users.services.email_service import EmailService
from users.services.audit_service import AuditService

User = get_user_model()

INVITATION_TOKEN_SALT = 'admin-invitation-salt'
INVITATION_TOKEN_MAX_AGE = 900  # 15 minutes


class AdminListSerializer(serializers.ModelSerializer):
    """Safe serializer for listing administrators."""
    name = serializers.CharField(read_only=True)
    is_owner = serializers.BooleanField(source='is_platform_owner', read_only=True)

    class Meta:
        model = User
        fields = [
            'id',
            'username',
            'email',
            'name',
            'first_name',
            'last_name',
            'role',
            'department',
            'phone_number',
            'is_active',
            'email_verified',
            'approval_status',
            'created_at',
            'last_login',
            'is_owner',
        ]
        read_only_fields = fields


class AdminInviteSerializer(serializers.Serializer):
    """Input serializer for inviting a new administrator."""
    email = serializers.EmailField(
        required=True,
        help_text="Target administrator email address (invitation recipient)"
    )
    name = serializers.CharField(
        max_length=150,
        required=False,
        allow_blank=True,
        default="",
        help_text="Optional administrator full name"
    )
    department = serializers.CharField(
        max_length=100,
        required=False,
        allow_blank=True,
        default="Campus Operations",
        help_text="Optional administrative department"
    )

    def validate_email(self, value):
        email_clean = value.strip().lower()
        existing_user = User.objects.filter(email__iexact=email_clean).first()
        if existing_user:
            if existing_user.role in [User.Role.ADMIN, User.Role.PLATFORM_OWNER] and existing_user.is_active:
                raise serializers.ValidationError("An active administrator or system owner account already exists with this email.")
            if existing_user.role not in [User.Role.ADMIN, User.Role.PLATFORM_OWNER]:
                raise serializers.ValidationError(
                    f"An account with this email already exists with role '{existing_user.role}'. "
                    "Cannot invite an existing student, shop owner, or delivery courier as administrator."
                )
        return email_clean


class AdminVerifyInvitationSerializer(serializers.Serializer):
    """Input serializer for verifying the 6-digit invitation OTP."""
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(required=True, min_length=6, max_length=6)


class AdminSetPasswordSerializer(serializers.Serializer):
    """Input serializer for setting the application password following OTP verification."""
    email = serializers.EmailField(required=True)
    invitation_token = serializers.CharField(required=True)
    password = serializers.CharField(required=True, min_length=8, write_only=True)
    confirm_password = serializers.CharField(required=True, min_length=8, write_only=True)

    def validate(self, attrs):
        if attrs['password'] != attrs['confirm_password']:
            raise serializers.ValidationError({"confirm_password": "Passwords do not match."})

        pwd = attrs['password']
        if len(pwd) < 8:
            raise serializers.ValidationError({"password": "Password must be at least 8 characters long."})
        if not re.search(r'\d', pwd):
            raise serializers.ValidationError({"password": "Password must contain at least one numerical digit."})

        # Validate token
        email_clean = attrs['email'].strip().lower()
        token = attrs['invitation_token']
        try:
            payload = signing.loads(token, salt=INVITATION_TOKEN_SALT, max_age=INVITATION_TOKEN_MAX_AGE)
        except signing.SignatureExpired:
            raise serializers.ValidationError({"invitation_token": "Invitation session has expired. Please verify your OTP again."})
        except signing.BadSignature:
            raise serializers.ValidationError({"invitation_token": "Invalid or forged invitation token."})

        if payload.get('email') != email_clean or payload.get('purpose') != 'ADMIN_INVITATION':
            raise serializers.ValidationError({"invitation_token": "Invitation token does not match the provided email address."})

        attrs['validated_email'] = email_clean
        return attrs


# ==============================================================================
# VIEWSETS & API VIEWS
# ==============================================================================

class AdminManagementListView(APIView):
    """
    GET /api/admin/management/admins/
    Lists all administrator accounts. Strictly restricted to authorized Admins and Platform Owner.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="List Administrators",
        description="Retrieves the directory of system administrators and platform owners.",
        responses={200: AdminListSerializer(many=True)}
    )
    def get(self, request):
        qs = User.objects.filter(role__in=[User.Role.ADMIN, User.Role.PLATFORM_OWNER]).order_by('-created_at')

        # Optional filters
        is_active = request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=(is_active.lower() in ['true', '1']))

        search = request.query_params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(email__icontains=search) |
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(department__icontains=search)
            )

        serializer = AdminListSerializer(qs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminInviteView(APIView):
    """
    POST /api/admin/management/invite/
    Sends an administrator invitation with a secure 6-digit OTP via Gmail SMTP.
    Strictly restricted to authorized Admins and Platform Owner.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="Invite Administrator",
        description="Creates a pending administrator account and sends a 6-digit verification code to the invitee.",
        request=AdminInviteSerializer,
        responses={
            201: OpenApiResponse(description="Invitation dispatched successfully"),
            400: OpenApiResponse(description="Invalid request or conflicting account"),
            403: OpenApiResponse(description="Unauthorized caller")
        }
    )
    def post(self, request):
        serializer = AdminInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_clean = data['email']
        name = data.get('name', '').strip()
        department = data.get('department', '').strip() or 'Campus Operations'

        parts = name.split(' ', 1) if name else ['', '']
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ''

        # Get or create pending admin user
        user = User.objects.filter(email__iexact=email_clean).first()
        if not user:
            user = User.objects.create(
                username=email_clean,
                email=email_clean,
                first_name=first_name,
                last_name=last_name,
                role=User.Role.ADMIN,
                department=department,
                is_active=False,            # Inactive until OTP is verified and password is set!
                email_verified=False,
                approval_status=User.ApprovalStatus.PENDING,
                is_staff=True,
            )
            user.set_unusable_password()
            user.save()
        else:
            # Refresh pending user details
            user.role = User.Role.ADMIN
            user.is_active = False
            user.email_verified = False
            user.approval_status = User.ApprovalStatus.PENDING
            if first_name:
                user.first_name = first_name
            if last_name:
                user.last_name = last_name
            if department:
                user.department = department
            user.save()

        # Generate and dispatch 6-digit verification OTP
        sent, dispatch_msg, otp_record = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION,
            user=user
        )

        if not sent:
            return Response(
                {"success": False, "message": dispatch_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in dispatch_msg or "limit" in dispatch_msg else status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        AuditService.log(
            action=AuditLog.Action.ADMIN_INVITED,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={
                "invited_email": user.email,
                "department": department,
                "otp_id": otp_record.id if otp_record else None
            },
            request=request
        )

        return Response(
            {
                "success": True,
                "message": f"Administrator invitation successfully sent to {user.email}.",
                "email": user.email,
                "account_status": "PENDING_VERIFICATION"
            },
            status=status.HTTP_201_CREATED
        )


class AdminResendInvitationOTPView(APIView):
    """
    POST /api/admin/management/invitations/resend/
    Resends the 6-digit invitation verification OTP with cooldown protection.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw_email = request.data.get('email') if isinstance(request.data, dict) else ''
        email_clean = str(raw_email).strip().lower() if raw_email is not None else ''
        if not email_clean:
            return Response({"success": False, "message": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(email__iexact=email_clean, role=User.Role.ADMIN).first()
        if not user:
            return Response({"success": False, "message": "No pending administrator account found for this email."}, status=status.HTTP_404_NOT_FOUND)

        if user.is_active and user.email_verified:
            return Response({"success": False, "message": "This administrator account is already active. Please log in directly."}, status=status.HTTP_400_BAD_REQUEST)

        sent, msg, _ = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION,
            user=user
        )

        if not sent:
            return Response(
                {"success": False, "message": msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in msg or "limit" in msg else status.HTTP_400_BAD_REQUEST
            )

        return Response({"success": True, "message": msg}, status=status.HTTP_200_OK)


class AdminVerifyInvitationOTPView(APIView):
    """
    POST /api/admin/management/invitations/verify/
    Verifies the 6-digit OTP code sent to the invited administrator's inbox.
    Issues a cryptographically signed one-time token to set the application password.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Verify Administrator Invitation OTP",
        description="Validates the 6-digit invitation OTP and issues a temporary signed token to create a password.",
        request=AdminVerifyInvitationSerializer,
        responses={
            200: OpenApiResponse(description="OTP confirmed; token granted to set password"),
            400: OpenApiResponse(description="Invalid, expired, or locked OTP")
        }
    )
    def post(self, request):
        serializer = AdminVerifyInvitationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_clean = data['email'].strip().lower()
        candidate_otp = data['otp'].strip()

        user = User.objects.filter(email__iexact=email_clean, role=User.Role.ADMIN).first()
        if not user:
            return Response(
                {"success": False, "message": "No administrator invitation found for this email."},
                status=status.HTTP_404_NOT_FOUND
            )

        success, message, otp_record = EmailService.verify_otp(
            email=email_clean,
            candidate_otp=candidate_otp,
            purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION,
            user=user
        )

        if not success:
            return Response({"success": False, "message": message}, status=status.HTTP_400_BAD_REQUEST)

        # Issue temporary signed token valid for 15 minutes to set application password
        invitation_token = signing.dumps(
            {
                'email': email_clean,
                'purpose': 'ADMIN_INVITATION',
                'user_id': user.id,
                'ts': timezone.now().timestamp()
            },
            salt=INVITATION_TOKEN_SALT
        )

        return Response(
            {
                "success": True,
                "message": "Email verification confirmed. Please set your application password.",
                "invitation_token": invitation_token
            },
            status=status.HTTP_200_OK
        )


class AdminSetPasswordView(APIView):
    """
    POST /api/admin/management/invitations/set-password/
    Sets the new administrator's chosen application password and activates their account.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Set Administrator Application Password",
        description="Creates a secure password for the verified admin account and marks it ACTIVE.",
        request=AdminSetPasswordSerializer,
        responses={
            200: OpenApiResponse(description="Account activated successfully; ready for Admin Login"),
            400: OpenApiResponse(description="Validation error or expired invitation token")
        }
    )
    def post(self, request):
        serializer = AdminSetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_clean = data['validated_email']
        password = data['password']

        user = User.objects.filter(email__iexact=email_clean).first()
        if not user:
            return Response({"success": False, "message": "User account not found."}, status=status.HTTP_404_NOT_FOUND)

        if user.role != User.Role.ADMIN:
            return Response({"success": False, "message": "Account does not have administrator privileges."}, status=status.HTTP_403_FORBIDDEN)

        # Set secure password using PBKDF2
        user.set_password(password)
        user.is_active = True
        user.email_verified = True
        user.approval_status = User.ApprovalStatus.APPROVED
        user.is_staff = True
        user.save()

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTIVATED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"status": "ACTIVATED", "auth_mechanism": "INVITATION_OTP_COMPLETED"},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": "Administrator account successfully activated. You may now log in to the Administrator Portal.",
                "email": user.email,
                "role": user.role,
                "is_active": True
            },
            status=status.HTTP_200_OK
        )


class AdminToggleStatusView(APIView):
    """
    POST /api/admin/management/admins/<int:admin_id>/toggle-status/
    Activates or deactivates an administrator account.
    Enforces:
    - The System Owner (garibhokya@gmail.com / PLATFORM_OWNER) can never be deactivated.
    - The last remaining active administrator cannot be deactivated.
    """
    permission_classes = [permissions.IsAuthenticated, IsAdmin]

    @extend_schema(
        summary="Toggle Administrator Status (Activate / Deactivate)",
        description="Toggles the active state of an administrator account with protections for System Owner and the last remaining admin.",
        responses={
            200: OpenApiResponse(description="Status updated successfully"),
            400: OpenApiResponse(description="Operation rejected to preserve platform continuity"),
            403: OpenApiResponse(description="System Owner modification attempt rejected")
        }
    )
    def post(self, request, admin_id):
        target = User.objects.filter(id=admin_id).first()
        if not target:
            return Response({"success": False, "message": "Administrator account not found."}, status=status.HTTP_404_NOT_FOUND)

        # Protection 1: System Owner cannot be deactivated
        if getattr(target, 'is_platform_owner', False) or target.email.lower() == 'garibhokya@gmail.com':
            return Response(
                {
                    "success": False,
                    "error": "SystemOwnerProtection",
                    "message": "The System Owner account cannot be deactivated or modified."
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Protection 2: Prevent deactivating the only remaining active administrator
        if target.is_active:
            active_admins_count = User.objects.filter(role=User.Role.ADMIN, is_active=True).exclude(id=target.id).count()
            if active_admins_count == 0:
                return Response(
                    {
                        "success": False,
                        "error": "LastAdminProtection",
                        "message": "Cannot deactivate the only remaining active administrator. At least one active administrator must remain on the platform."
                    },
                    status=status.HTTP_400_BAD_REQUEST
                )

        target.is_active = not target.is_active
        target.save(update_fields=['is_active'])

        AuditService.log(
            action=AuditLog.Action.ADMIN_ACTION,
            actor=request.user,
            actor_email=request.user.email,
            target_model='User',
            target_id=str(target.id),
            metadata={"sub_action": "ADMIN_STATUS_TOGGLED", "new_is_active": target.is_active},
            request=request
        )

        return Response(
            {
                "id": target.id,
                "email": target.email,
                "is_active": target.is_active,
                "message": f"Administrator account {'activated' if target.is_active else 'deactivated'} successfully."
            },
            status=status.HTTP_200_OK
        )
