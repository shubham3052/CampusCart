from django.db import transaction
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse
from django.core import signing
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.cache import cache
import secrets
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from .auth_serializers import (
    RegisterSerializer,
    LoginSerializer,
    LogoutSerializer,
    SendEmailOTPSerializer,
    VerifyEmailOTPSerializer,
    ResendEmailOTPSerializer,
    RequestPasswordResetSerializer,
    VerifyPasswordResetOTPSerializer,
    ConfirmPasswordResetSerializer,
    RequestEmailChangeSerializer,
    ConfirmEmailChangeSerializer,
    ConfirmAccountDeletionSerializer,
    SwitchRoleSerializer,
    Owner2FAVerifySerializer,
    Owner2FAResendSerializer,
    OwnerTOTPVerifySerializer,
    OwnerPasswordSetupRequestSerializer,
    OwnerPasswordSetupVerifyEmailSerializer,
    OwnerPasswordSetupResendEmailSerializer,
    OwnerPasswordSetupVerifyTOTPSerializer,
    OwnerPasswordSetupCompleteSerializer,
)
from users.services.totp_service import OwnerTOTPService
from .serializers import UserSerializer
from users.services.email_service import EmailService
from users.services.role_service import RoleService
from users.models import EmailVerificationOTP, AuditLog, UserRole, PlatformOwnerTOTP
from users.services.audit_service import AuditService
from users.services.security_service import SecurityMonitoringService

User = get_user_model()


class RegisterView(APIView):
    """
    POST /api/auth/register/
    Registers a new public user (STUDENT or SHOP_OWNER).
    Rejects ADMIN registration attempts.
    Dispatches a 6-digit email verification OTP automatically upon creation.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Register New User",
        description="Public registration for Students and Shop Owners. Self-registration as ADMIN is strictly blocked.",
        request=RegisterSerializer,
        responses={
            201: OpenApiResponse(description="User registered successfully, returns JWT access and refresh tokens along with user profile."),
            400: OpenApiResponse(description="Validation error (e.g. duplicate email, weak password, or illegal admin role attempt).")
        }
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        # Mint tokens immediately upon successful registration
        refresh = RefreshToken.for_user(user)

        dispatch_error = getattr(user, '_email_dispatch_error', None)
        message = (
            f"User registered successfully, but verification email could not be sent: {dispatch_error}. Please use Resend Code."
            if dispatch_error
            else "User registered successfully! A 6-digit verification code has been sent to your email."
        )

        return Response(
            {
                "success": True,
                "message": message,
                "email_sent": dispatch_error is None,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "phone": user.phone_number,
                    "role": user.role,
                    "approval_status": getattr(user, 'approval_status', 'APPROVED'),
                    "email_verified": user.email_verified,
                }
            },
            status=status.HTTP_201_CREATED
        )


class LoginView(APIView):
    """
    POST /api/auth/login/
    Authenticates user via email and password, returning JWT access & refresh tokens.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="User Login (Email & Password)",
        description="Authenticates user and returns fresh JWT access and refresh tokens.",
        request=LoginSerializer,
        responses={
            200: OpenApiResponse(description="Login successful, returns JWT tokens and user metadata."),
            400: OpenApiResponse(description="Invalid credentials or inactive account.")
        }
    )
    def post(self, request):
        ip = AuditService.get_client_ip(request)
        raw_email = request.data.get('email') if isinstance(request.data, dict) else ''
        email = str(raw_email).strip().lower() if raw_email is not None else ''
        serializer = LoginSerializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
            if serializer.validated_data.get('requires_2fa'):
                return Response(serializer.validated_data, status=status.HTTP_200_OK)

            user_data = serializer.validated_data.get('user', {})
            authenticated_email = user_data.get('email') or email
            SecurityMonitoringService.clear_failed_logins(ip, authenticated_email)
            AuditService.log(
                action=AuditLog.Action.LOGIN_SUCCESS,
                actor_email=authenticated_email,
                target_model='User',
                target_id=str(user_data.get('id', '')),
                request=request
            )
            return Response(serializer.validated_data, status=status.HTTP_200_OK)
        except Exception:
            is_owner_target = email == 'garibhokya@gmail.com' or User.objects.filter(email__iexact=email, role=User.Role.PLATFORM_OWNER).exists()
            if is_owner_target:
                AuditService.log(
                    action=AuditLog.Action.OWNER_LOGIN_FAILURE,
                    actor_email=email,
                    target_model='User',
                    metadata={"reason": "INVALID_OWNER_CREDENTIALS"},
                    request=request
                )
            SecurityMonitoringService.record_failed_login(ip, email, request=request)
            AuditService.log(
                action=AuditLog.Action.LOGIN_FAILED,
                actor_email=email,
                target_model='User',
                metadata={"reason": "INVALID_CREDENTIALS"},
                request=request
            )
            raise


class CurrentUserView(APIView):
    """
    GET /api/auth/me/
    Returns the profile metadata of the currently authenticated user.
    Requires Bearer JWT token in Authorization header.
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Get Current User Profile",
        description="Returns identity and role information for the currently authenticated user based on JWT Bearer token.",
        responses={
            200: UserSerializer,
            401: OpenApiResponse(description="Authentication credentials were not provided or are invalid.")
        }
    )
    def get(self, request):
        active_role = getattr(request.user, 'active_role', request.user.role)
        return Response({
            "id": request.user.id,
            "name": request.user.name,
            "email": request.user.email,
            "email_verified": request.user.email_verified,
            "role": active_role,
            "active_role": active_role,
            "roles": request.user.roles,
            "phone": request.user.phone_number,
            "college_id": request.user.college_id,
            "department": request.user.department,
            "hostel_block": request.user.hostel_block,
            "room_number": request.user.room_number,
        })


class SwitchRoleView(APIView):
    """
    POST /api/auth/switch-role/
    Transitions the authenticated session to another authorized role assigned to the user.
    Mints new cryptographically signed JWT tokens containing the updated active_role.
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="Switch Active Role",
        description="Transitions the authenticated session to another authorized role assigned to the user.",
        request=SwitchRoleSerializer,
        responses={
            200: OpenApiResponse(description="Role switched successfully; new tokens issued."),
            400: OpenApiResponse(description="Invalid request or role specification."),
            403: OpenApiResponse(description="User is not authorized for the requested role.")
        }
    )
    def post(self, request):
        serializer = SwitchRoleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_role = serializer.validated_data['role']

        user = request.user
        authorized_roles = user.roles

        # Guard: Platform Owner is an exclusive role and cannot switch to another role
        if user.is_platform_owner or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com':
            AuditService.log(
                action=AuditLog.Action.OWNER_REJECTED_ROLE_SWITCH,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"operation": "SWITCH_ROLE_REJECTED", "attempted_role": target_role, "reason": "Platform Owner cannot switch roles."},
                request=request
            )
            return Response(
                {
                    "success": False,
                    "message": "Platform Owner cannot switch to any other role.",
                    "available_roles": [User.Role.PLATFORM_OWNER]
                },
                status=status.HTTP_403_FORBIDDEN
            )

        if target_role not in authorized_roles:
            return Response(
                {
                    "success": False,
                    "message": f"You do not possess the '{target_role}' role.",
                    "available_roles": authorized_roles
                },
                status=status.HTTP_403_FORBIDDEN
            )

        # Update active role and persist primary role
        RoleService.switch_active_role(user, target_role)

        # Mint new JWT tokens containing updated active_role claim
        refresh = RefreshToken.for_user(user)
        refresh['roles'] = authorized_roles
        refresh['active_role'] = target_role
        refresh.access_token['roles'] = authorized_roles
        refresh.access_token['active_role'] = target_role

        AuditService.log(
            action=AuditLog.Action.ROLE_CHANGED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"operation": "SWITCH_ROLE", "new_role": target_role},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": f"Active role switched to {target_role}.",
                "active_role": target_role,
                "roles": authorized_roles,
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "phone": user.phone_number,
                    "role": target_role,
                    "active_role": target_role,
                    "roles": authorized_roles,
                    "approval_status": getattr(user, 'approval_status', 'APPROVED'),
                    "email_verified": user.email_verified,
                    "college_id": user.college_id,
                    "department": user.department,
                    "hostel_block": user.hostel_block,
                    "room_number": user.room_number,
                }
            },
            status=status.HTTP_200_OK
        )


class LogoutView(APIView):
    """
    POST /api/auth/logout/
    Blacklists the provided refresh token, preventing further access token refreshes.
    """
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(
        summary="User Logout (Blacklist Refresh Token)",
        description="Revokes the refresh token and places its unique JTI into the server blacklist.",
        request=LogoutSerializer,
        responses={
            200: OpenApiResponse(description="Token successfully revoked and blacklisted."),
            400: OpenApiResponse(description="Invalid or expired token payload."),
            401: OpenApiResponse(description="Authentication required.")
        }
    )
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        AuditService.log(
            action=AuditLog.Action.LOGOUT,
            actor=request.user,
            request=request
        )
        return Response(
            {
                "success": True,
                "message": "Logged out successfully. The refresh token has been blacklisted."
            },
            status=status.HTTP_200_OK
        )


class SendEmailOTPView(APIView):
    """
    POST /api/auth/email/send-otp/
    Requests a 6-digit email verification code for an authenticated user or specified email.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = SendEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_email = data.get('email')
        if not target_email:
            if request.user and request.user.is_authenticated:
                target_email = request.user.email
            else:
                return Response(
                    {"success": False, "message": "Email address is required."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        purpose = data.get('purpose', EmailVerificationOTP.Purpose.EMAIL_VERIFICATION)
        user = (
            request.user
            if (request.user and request.user.is_authenticated and request.user.email.strip().lower() == str(target_email).strip().lower())
            else None
        )

        success, message, _ = EmailService.create_and_send_otp(
            email=target_email,
            purpose=purpose,
            user=user
        )

        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in message or "limit" in message else status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {"success": True, "message": message},
            status=status.HTTP_200_OK
        )


class VerifyEmailOTPView(APIView):
    """
    POST /api/auth/email/verify-otp/
    Submits and verifies a 6-digit OTP code against the PBKDF2 hash.
    Marks user account as email_verified upon success.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = VerifyEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_email = data.get('email')
        if not target_email:
            if request.user and request.user.is_authenticated:
                target_email = request.user.email
            else:
                return Response(
                    {"success": False, "message": "Email address is required."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        otp_code = data['otp']
        purpose = data.get('purpose', EmailVerificationOTP.Purpose.EMAIL_VERIFICATION)
        user = (
            request.user
            if (request.user and request.user.is_authenticated and request.user.email.strip().lower() == str(target_email).strip().lower())
            else None
        )

        success, message, _ = EmailService.verify_otp(
            email=target_email,
            candidate_otp=otp_code,
            purpose=purpose,
            user=user
        )

        if not success:
            SecurityMonitoringService.record_failed_otp(AuditService.get_client_ip(request), target_email, purpose, request=request)
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.EMAIL_VERIFIED,
            actor=user,
            actor_email=target_email,
            target_model='User',
            request=request
        )

        return Response(
            {
                "success": True,
                "message": message,
                "email_verified": True
            },
            status=status.HTTP_200_OK
        )


class ResendEmailOTPView(APIView):
    """
    POST /api/auth/email/resend-otp/
    Enforces minimum 60s cooldown and hourly rate limit, invalidates prior active codes,
    and dispatches a new 6-digit code.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = ResendEmailOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        target_email = data.get('email')
        if not target_email:
            if request.user and request.user.is_authenticated:
                target_email = request.user.email
            else:
                return Response(
                    {"success": False, "message": "Email address is required."},
                    status=status.HTTP_400_BAD_REQUEST
                )

        purpose = data.get('purpose', EmailVerificationOTP.Purpose.EMAIL_VERIFICATION)
        user = (
            request.user
            if (request.user and request.user.is_authenticated and request.user.email.strip().lower() == str(target_email).strip().lower())
            else None
        )

        success, message, _ = EmailService.create_and_send_otp(
            email=target_email,
            purpose=purpose,
            user=user
        )

        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in message or "limit" in message else status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {"success": True, "message": message},
            status=status.HTTP_200_OK
        )


class RequestPasswordResetView(APIView):
    """
    POST /api/auth/password-reset/request/
    Dispatches a password reset OTP to the user's email address.
    Strictly prevents account enumeration by returning a generic success message.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = RequestPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        success, message = EmailService.request_password_reset(email)
        return Response({"success": success, "message": message}, status=status.HTTP_200_OK)


class VerifyPasswordResetOTPView(APIView):
    """
    POST /api/auth/password-reset/verify/
    Verifies the password reset OTP code and returns a signed one-time reset token.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = VerifyPasswordResetOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        otp = serializer.validated_data['otp']

        success, message, reset_token = EmailService.verify_password_reset_otp(email, otp)
        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "success": True,
                "message": message,
                "reset_token": reset_token
            },
            status=status.HTTP_200_OK
        )


class ConfirmPasswordResetView(APIView):
    """
    POST /api/auth/password-reset/confirm/
    Applies the new password after verifying the signed reset token.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    def post(self, request):
        serializer = ConfirmPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        reset_token = serializer.validated_data['reset_token']
        new_password = serializer.validated_data['new_password']

        success, message = EmailService.confirm_password_reset(email, reset_token, new_password)
        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.PASSWORD_RESET,
            actor_email=email,
            target_model='User',
            request=request
        )

        return Response(
            {"success": True, "message": message},
            status=status.HTTP_200_OK
        )


class RequestEmailChangeView(APIView):
    """
    POST /api/auth/email/change/request/
    Authenticated user requests to change their email. An OTP is sent to the new address.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = RequestEmailChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data['new_email']

        success, message = EmailService.request_email_change(request.user, new_email)
        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {"success": True, "message": message},
            status=status.HTTP_200_OK
        )


class ConfirmEmailChangeView(APIView):
    """
    POST /api/auth/email/change/confirm/
    Verifies OTP sent to the new email and commits the update.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'otp'

    def post(self, request):
        serializer = ConfirmEmailChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data['new_email']
        otp = serializer.validated_data['otp']

        success, message = EmailService.confirm_email_change(request.user, new_email, otp)
        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "success": True,
                "message": message,
                "email": request.user.email,
                "email_verified": True
            },
            status=status.HTTP_200_OK
        )


class RequestAccountDeletionOTPView(APIView):
    """
    POST /api/auth/account-deletion/request-otp/
    Authenticated user requests an account deletion OTP.
    OTP is dispatched from garibhokya@gmail.com to the user's registered email address.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'otp'

    @extend_schema(
        summary="Request Account Deletion OTP",
        description="Dispatches a 6-digit verification code to the authenticated user's registered email address for account deletion authorization.",
        responses={
            200: OpenApiResponse(description="6-digit verification code sent to registered email."),
            400: OpenApiResponse(description="Bad request or user has no registered email."),
            429: OpenApiResponse(description="Cooldown or rate limit active.")
        }
    )
    def post(self, request):
        user = request.user
        target_email = getattr(user, 'email', None)
        if not target_email:
            return Response(
                {"success": False, "message": "No registered email address found for this user account."},
                status=status.HTTP_400_BAD_REQUEST
            )

        success, message, _ = EmailService.create_and_send_otp(
            email=target_email,
            purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION,
            user=user
        )

        if not success:
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in message or "limit" in message else status.HTTP_400_BAD_REQUEST
            )

        return Response(
            {
                "success": True,
                "message": "A 6-digit verification code has been sent to your registered email address."
            },
            status=status.HTTP_200_OK
        )


class ConfirmAccountDeletionView(APIView):
    """
    POST /api/auth/account-deletion/confirm/
    Authenticated user enters the 6-digit OTP to permanently delete their account.
    Deletion is executed purely on the backend by Django; React never touches raw database models.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_scope = 'otp'

    @extend_schema(
        summary="Confirm Account Deletion with OTP",
        description="Validates the 6-digit OTP received via email and permanently deletes the user account.",
        request=ConfirmAccountDeletionSerializer,
        responses={
            200: OpenApiResponse(description="Account permanently deleted."),
            400: OpenApiResponse(description="Invalid, expired, or locked OTP code.")
        }
    )
    def post(self, request):
        serializer = ConfirmAccountDeletionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        otp = serializer.validated_data['otp']
        user = request.user
        user_email = user.email

        # Protect platform owner accounts from accidental self-deletion
        if getattr(user, 'is_platform_owner', False):
            return Response(
                {"success": False, "message": "Platform Owner account cannot be deleted via self-service."},
                status=status.HTTP_403_FORBIDDEN
            )

        success, message, otp_rec = EmailService.verify_otp(
            email=user_email,
            candidate_otp=otp,
            purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION,
            user=user
        )

        if not success:
            SecurityMonitoringService.record_failed_otp(
                AuditService.get_client_ip(request),
                user_email,
                EmailVerificationOTP.Purpose.ACCOUNT_DELETION,
                request=request
            )
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Atomic transaction: all-or-nothing database deletion with rollback safety
        try:
            with transaction.atomic():
                # 1. Audit log the permanent deletion before executing user.delete()
                AuditService.log(
                    action=AuditLog.Action.ACCOUNT_DELETED,
                    actor_email=user_email,
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"email": user_email, "role": user.role},
                    request=request
                )

                # 2. Invalidate all SimpleJWT tokens for this user
                try:
                    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
                    tokens = OutstandingToken.objects.filter(user=user)
                    for tok in tokens:
                        BlacklistedToken.objects.get_or_create(token=tok)
                except Exception:
                    pass

                # 3. Permanently delete user record and cascade user-owned models
                user.delete()
        except Exception as e:
            from users.services.email_service import logger
            logger.error("Transaction rollback during account deletion for %s: %s", user_email, e)
            return Response(
                {
                    "success": False,
                    "message": "A database error occurred while deleting your account. The operation was safely rolled back."
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                "success": True,
                "message": "Your account has been permanently deleted."
            },
            status=status.HTTP_200_OK
        )


class VerifyOwner2FAView(APIView):
    """
    POST /api/auth/owner/verify-2fa/
    Completes Platform Owner 2FA authentication after password verification.
    Validates pre-auth token and 6-digit OTP code.
    Only upon successful OTP validation:
    - Mints full JWT access & refresh tokens with active_role='PLATFORM_OWNER'
    - Authenticates as PLATFORM_OWNER
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Verify Platform Owner 2FA",
        description="Validates 6-digit 2FA code and issues final authenticated JWT tokens for Platform Owner.",
        request=Owner2FAVerifySerializer,
        responses={
            200: OpenApiResponse(description="2FA verified successfully; JWT tokens issued."),
            400: OpenApiResponse(description="Invalid or expired code/token."),
            403: OpenApiResponse(description="Unauthorized account.")
        }
    )
    def post(self, request):
        serializer = Owner2FAVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_clean = data['email'].strip().lower()
        otp = data['otp'].strip()
        pre_auth_token = data['pre_auth_token']

        # Validate pre-authentication token
        try:
            payload = signing.loads(pre_auth_token, salt='owner-2fa-preauth-salt', max_age=300)
        except signing.SignatureExpired:
            AuditService.log(
                action=AuditLog.Action.OWNER_OTP_FAILED,
                actor_email=email_clean,
                target_model='User',
                metadata={"reason": "PRE_AUTH_TOKEN_EXPIRED"},
                request=request
            )
            return Response(
                {"success": False, "message": "Pre-authentication session expired. Please log in again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            AuditService.log(
                action=AuditLog.Action.OWNER_OTP_FAILED,
                actor_email=email_clean,
                target_model='User',
                metadata={"reason": "BAD_PRE_AUTH_SIGNATURE"},
                request=request
            )
            return Response(
                {"success": False, "message": "Invalid pre-authentication session."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('email') != email_clean or payload.get('purpose') != 'OWNER_2FA':
            return Response(
                {"success": False, "message": "Pre-authentication token mismatch."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.filter(id=payload.get('user_id'), email__iexact=email_clean).first()
        if not user or not user.is_active:
            return Response(
                {"success": False, "message": "User account not found or disabled."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Cross-user isolation check
        if not (user.is_platform_owner or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com'):
            return Response(
                {"success": False, "message": "Account is not a Platform Owner account."},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verify OTP code using existing secure EmailService
        success, message, otp_rec = EmailService.verify_otp(
            email=email_clean,
            candidate_otp=otp,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            user=user
        )

        if not success:
            AuditService.log(
                action=AuditLog.Action.OWNER_OTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": message},
                request=request
            )
            return Response(
                {"success": False, "message": message},
                status=status.HTTP_400_BAD_REQUEST
            )

        # OTP verified successfully!
        AuditService.log(
            action=AuditLog.Action.OWNER_OTP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        # Step 18: Check if Platform Owner has Microsoft Authenticator (TOTP) enabled
        from users.models import PlatformOwnerTOTP
        totp_config = PlatformOwnerTOTP.objects.filter(user=user).first()
        if totp_config and totp_config.enabled and totp_config.verified:
            # TOTP is enabled: DO NOT ISSUE JWT!
            # Return temporary authenticated challenge with pre_auth_token
            totp_pre_auth_token = signing.dumps(
                {
                    'user_id': user.id,
                    'email': user.email.lower(),
                    'purpose': 'OWNER_TOTP',
                    'stage': 'OWNER_TOTP',
                    'ts': timezone.now().timestamp()
                },
                salt='owner-totp-preauth-salt'
            )
            return Response(
                {
                    "success": True,
                    "requires_totp": True,
                    "email": user.email,
                    "pre_auth_token": totp_pre_auth_token,
                    "active_role": User.Role.PLATFORM_OWNER,
                    "roles": [User.Role.PLATFORM_OWNER],
                    "message": "Enter the 6-digit code from Microsoft Authenticator."
                },
                status=status.HTTP_200_OK
            )

        # Clear login failures upon full authentication (when TOTP is not yet configured)
        ip = AuditService.get_client_ip(request)
        SecurityMonitoringService.clear_failed_logins(ip, user.email)

        # Issue final JWT tokens with active_role = 'PLATFORM_OWNER'
        refresh = RefreshToken.for_user(user)
        refresh['roles'] = [User.Role.PLATFORM_OWNER]
        refresh['active_role'] = User.Role.PLATFORM_OWNER
        refresh.access_token['roles'] = [User.Role.PLATFORM_OWNER]
        refresh.access_token['active_role'] = User.Role.PLATFORM_OWNER

        AuditService.log(
            action=AuditLog.Action.OWNER_LOGIN_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"auth_method": "PASSWORD_AND_2FA"},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": "Platform Owner 2FA verification successful.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "active_role": User.Role.PLATFORM_OWNER,
                "roles": [User.Role.PLATFORM_OWNER],
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "phone": user.phone_number,
                    "role": User.Role.PLATFORM_OWNER,
                    "active_role": User.Role.PLATFORM_OWNER,
                    "roles": [User.Role.PLATFORM_OWNER],
                    "approval_status": getattr(user, 'approval_status', 'APPROVED'),
                    "email_verified": user.email_verified,
                }
            },
            status=status.HTTP_200_OK
        )


class ResendOwner2FAView(APIView):
    """
    POST /api/auth/owner/resend-2fa/
    Resends 6-digit 2FA verification code with cooldown and rate-limit enforcement.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Resend Platform Owner 2FA Code",
        description="Resends the 6-digit OTP code to the Platform Owner registered email.",
        request=Owner2FAResendSerializer,
        responses={
            200: OpenApiResponse(description="New OTP code sent."),
            400: OpenApiResponse(description="Invalid request or rate limit exceeded.")
        }
    )
    def post(self, request):
        serializer = Owner2FAResendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        email_clean = data['email'].strip().lower()
        pre_auth_token = data['pre_auth_token']

        # Validate pre-authentication token (allow slightly longer window for resends)
        try:
            payload = signing.loads(pre_auth_token, salt='owner-2fa-preauth-salt', max_age=600)
        except (signing.SignatureExpired, signing.BadSignature):
            return Response(
                {"success": False, "message": "Pre-authentication session expired or invalid. Please log in again."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if payload.get('email') != email_clean or payload.get('purpose') != 'OWNER_2FA':
            return Response(
                {"success": False, "message": "Pre-authentication token mismatch."},
                status=status.HTTP_400_BAD_REQUEST
            )

        user = User.objects.filter(id=payload.get('user_id'), email__iexact=email_clean).first()
        if not user or not user.is_active:
            return Response(
                {"success": False, "message": "User account not found or disabled."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Dispatch new OTP code
        sent, dispatch_msg, otp_rec = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            user=user
        )

        if not sent:
            return Response(
                {"success": False, "message": dispatch_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if "wait" in dispatch_msg or "limit" in dispatch_msg else status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_OTP_SENT,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "OWNER_2FA_RESENT", "otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        return Response(
            {"success": True, "message": "A new verification code has been sent to your registered email."},
            status=status.HTTP_200_OK
        )


class VerifyOwnerTOTPView(APIView):
    """
    POST /api/auth/owner/verify-totp/
    Final stage of Platform Owner login: verifies the 6-digit TOTP code
    from Microsoft Authenticator. Only after valid TOTP are full JWT tokens issued.
    """
    permission_classes = [permissions.AllowAny]

    @extend_schema(
        summary="Verify Platform Owner Microsoft Authenticator TOTP",
        description="Validates the 6-digit TOTP code and pre-auth token, then issues full JWT access and refresh tokens.",
        request=OwnerTOTPVerifySerializer,
        responses={
            200: OpenApiResponse(description="TOTP verified, full JWT issued."),
            400: OpenApiResponse(description="Invalid or expired challenge, or incorrect TOTP code.")
        }
    )
    def post(self, request):
        serializer = OwnerTOTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        pre_auth_token = data['pre_auth_token']
        code = data['code']

        # 1. Validate pre-auth token signature and expiration (max 5 minutes)
        try:
            payload = signing.loads(pre_auth_token, salt='owner-totp-preauth-salt', max_age=300)
        except signing.SignatureExpired:
            return Response(
                {"success": False, "message": "Authentication challenge expired. Please log in again."},
                status=status.HTTP_400_BAD_REQUEST
            )
        except signing.BadSignature:
            return Response(
                {"success": False, "message": "Invalid authentication challenge."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 2. Check stage and purpose
        if payload.get('purpose') != 'OWNER_TOTP' or payload.get('stage') != 'OWNER_TOTP':
            return Response(
                {"success": False, "message": "Invalid authentication stage."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 3. Verify user identity
        user_id = payload.get('user_id')
        user_email = payload.get('email', '').strip().lower()
        user = User.objects.filter(id=user_id, email__iexact=user_email).first()
        if not user or not user.is_active:
            return Response(
                {"success": False, "message": "User account not found or disabled."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 4. Verify Platform Owner role
        if not (user.is_platform_owner or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com'):
            return Response(
                {"success": False, "message": "Account is not a Platform Owner account."},
                status=status.HTTP_403_FORBIDDEN
            )

        # 5. Verify TOTP code via OwnerTOTPService
        valid, msg = OwnerTOTPService.verify_login_code(user, code, request=request)
        if not valid:
            return Response(
                {"success": False, "message": msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Clear login failures upon full authentication
        ip = AuditService.get_client_ip(request)
        SecurityMonitoringService.clear_failed_logins(ip, user.email)

        # Issue full JWT tokens with active_role = 'PLATFORM_OWNER'
        refresh = RefreshToken.for_user(user)
        refresh['roles'] = [User.Role.PLATFORM_OWNER]
        refresh['active_role'] = User.Role.PLATFORM_OWNER
        refresh.access_token['roles'] = [User.Role.PLATFORM_OWNER]
        refresh.access_token['active_role'] = User.Role.PLATFORM_OWNER

        AuditService.log(
            action=AuditLog.Action.OWNER_LOGIN_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"auth_method": "PASSWORD_GMAIL_OTP_AND_TOTP"},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": "Platform Owner authentication successful.",
                "access": str(refresh.access_token),
                "refresh": str(refresh),
                "active_role": User.Role.PLATFORM_OWNER,
                "roles": [User.Role.PLATFORM_OWNER],
                "user": {
                    "id": user.id,
                    "name": user.name,
                    "email": user.email,
                    "phone": user.phone_number,
                    "role": User.Role.PLATFORM_OWNER,
                    "active_role": User.Role.PLATFORM_OWNER,
                    "roles": [User.Role.PLATFORM_OWNER],
                    "approval_status": getattr(user, 'approval_status', 'APPROVED'),
                    "email_verified": user.email_verified,
                }
            },
            status=status.HTTP_200_OK
        )


SETUP_TOKEN_SALT = 'owner-initial-password-setup-salt'
SETUP_TOKEN_MAX_AGE = 300  # 5 minutes per stage


def _validate_owner_for_password_setup(email_str: str) -> tuple[bool, str, User | None]:
    """
    Step 19: Validates that the requested email belongs strictly to the single
    Platform Owner account (garibhokya@gmail.com) with active=True,
    email_verified=True, exactly one active PLATFORM_OWNER role, and no secondary roles.
    """
    clean_email = str(email_str or '').strip().lower()
    if clean_email != 'garibhokya@gmail.com':
        return False, "This setup mechanism is restricted exclusively to the authorized Platform Owner.", None

    users = User.objects.filter(email__iexact=clean_email)
    if users.count() != 1:
        return False, "Platform Owner account not found or duplicated.", None

    user = users.first()
    if not user.is_active:
        return False, "Platform Owner account is deactivated.", None

    if not user.email_verified:
        return False, "Platform Owner account is not verified.", None

    active_roles = UserRole.objects.filter(user=user, is_active=True)
    if active_roles.count() != 1 or active_roles.first().role != User.Role.PLATFORM_OWNER:
        return False, "Account does not have strictly unique PLATFORM_OWNER role authorization.", None

    if not (getattr(user, 'is_platform_owner', False) or user.has_role(User.Role.PLATFORM_OWNER)):
        return False, "Account is not authorized as Platform Owner.", None

    return True, "", user


def _decode_owner_setup_stage_token(stage_token: str, expected_stages: list[str]) -> tuple[bool, str, dict | None, User | None]:
    """
    Validates stage token signature, expiration, purpose, expected stage, and replay nonce.
    """
    try:
        payload = signing.loads(stage_token, salt=SETUP_TOKEN_SALT, max_age=SETUP_TOKEN_MAX_AGE)
    except signing.SignatureExpired:
        return False, "Setup challenge token has expired. Please restart the setup process.", None, None
    except signing.BadSignature:
        return False, "Invalid or tampered setup challenge token.", None, None

    if payload.get('purpose') != 'OWNER_INITIAL_PASSWORD_SETUP':
        return False, "Invalid challenge purpose.", None, None

    stage = payload.get('stage')
    if stage not in expected_stages:
        return False, f"Invalid setup stage ({stage}). Expected stage: {', '.join(expected_stages)}.", None, None

    nonce = payload.get('nonce')
    if not nonce or cache.get(f"owner_setup_nonce_used_{nonce}"):
        return False, "This setup challenge token has already been used. Please request a new code.", None, None

    email = payload.get('email', '').strip().lower()
    user_id = payload.get('user_id')

    valid, err_msg, user = _validate_owner_for_password_setup(email)
    if not valid or not user or user.id != user_id:
        return False, err_msg or "Platform Owner validation failed.", None, None

    return True, "", payload, user


def _mint_owner_setup_stage_token(user: User, stage_name: str) -> str:
    nonce = secrets.token_hex(16)
    return signing.dumps(
        {
            'user_id': user.id,
            'email': user.email.lower(),
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': stage_name,
            'nonce': nonce,
            'ts': timezone.now().timestamp(),
        },
        salt=SETUP_TOKEN_SALT
    )


class OwnerPasswordSetupRequestView(APIView):
    """
    POST /api/auth/owner/password-setup/request/
    Stage 1: Validates the Platform Owner identity (garibhokya@gmail.com)
    and dispatches a 6-digit Gmail OTP.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Request Platform Owner Initial Password Setup",
        description="Initiates secure setup for the Platform Owner. Dispatches a 6-digit OTP to the registered Gmail.",
        request=OwnerPasswordSetupRequestSerializer,
        responses={
            200: OpenApiResponse(description="OTP sent to registered Gmail address."),
            400: OpenApiResponse(description="Invalid request or unauthorized account.")
        }
    )
    def post(self, request):
        serializer = OwnerPasswordSetupRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']

        valid, err_msg, user = _validate_owner_for_password_setup(email)
        if not valid or not user:
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_FAILURE,
                actor_email=str(email).strip().lower(),
                target_model='User',
                metadata={"reason": "UNAUTHORIZED_OR_INVALID_OWNER_ACCOUNT", "error": err_msg},
                request=request
            )
            return Response(
                {"success": False, "message": err_msg or "Unauthorized for Platform Owner password setup."},
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_STARTED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "STARTED"},
            request=request
        )

        # Dispatch 6-digit OTP to Platform Owner Gmail
        sent, dispatch_msg, otp_rec = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_SETUP,
            user=user
        )

        if not sent:
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": dispatch_msg},
                request=request
            )
            return Response(
                {"success": False, "message": dispatch_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if ("wait" in dispatch_msg or "limit" in dispatch_msg) else status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_SENT,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        stage_token = _mint_owner_setup_stage_token(user, 'GMAIL_OTP_PENDING')

        return Response(
            {
                "success": True,
                "message": "A 6-digit verification code has been dispatched to your Platform Owner Gmail address.",
                "stage": "GMAIL_OTP_PENDING",
                "stage_token": stage_token,
                "email": user.email,
            },
            status=status.HTTP_200_OK
        )


class OwnerPasswordSetupResendEmailView(APIView):
    """
    POST /api/auth/owner/password-setup/resend-email/
    Resends 6-digit Gmail OTP for Platform Owner initial password setup.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Resend Platform Owner Setup Gmail OTP",
        description="Resends the 6-digit setup code to the registered Platform Owner Gmail.",
        request=OwnerPasswordSetupResendEmailSerializer,
        responses={
            200: OpenApiResponse(description="New OTP code dispatched."),
            400: OpenApiResponse(description="Invalid stage token or rate limit exceeded.")
        }
    )
    def post(self, request):
        serializer = OwnerPasswordSetupResendEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage_token = serializer.validated_data['stage_token']

        valid, err_msg, payload, user = _decode_owner_setup_stage_token(
            stage_token,
            expected_stages=['GMAIL_OTP_PENDING']
        )
        if not valid or not user:
            return Response(
                {"success": False, "message": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Invalidate previous token nonce
        cache.set(f"owner_setup_nonce_used_{payload['nonce']}", 1, timeout=SETUP_TOKEN_MAX_AGE * 2)

        sent, dispatch_msg, otp_rec = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_SETUP,
            user=user
        )

        if not sent:
            return Response(
                {"success": False, "message": dispatch_msg},
                status=status.HTTP_429_TOO_MANY_REQUESTS if ("wait" in dispatch_msg or "limit" in dispatch_msg) else status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_SENT,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": "RESENT", "otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        new_stage_token = _mint_owner_setup_stage_token(user, 'GMAIL_OTP_PENDING')

        return Response(
            {
                "success": True,
                "message": "A new verification code has been dispatched to your Gmail address.",
                "stage": "GMAIL_OTP_PENDING",
                "stage_token": new_stage_token,
            },
            status=status.HTTP_200_OK
        )


class OwnerPasswordSetupVerifyEmailView(APIView):
    """
    POST /api/auth/owner/password-setup/verify-email/
    Stage 2: Verifies Gmail OTP.
    Checks whether Microsoft Authenticator (TOTP) is enrolled:
    - If enrolled: advances to TOTP_VERIFICATION_PENDING.
    - If not enrolled: initiates TOTP enrollment and advances to TOTP_ENROLLMENT_PENDING.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Verify Platform Owner Setup Gmail OTP",
        description="Validates the 6-digit OTP sent to Gmail and prepares the Authenticator verification stage.",
        request=OwnerPasswordSetupVerifyEmailSerializer,
        responses={
            200: OpenApiResponse(description="Gmail OTP verified successfully."),
            400: OpenApiResponse(description="Invalid or expired OTP.")
        }
    )
    def post(self, request):
        serializer = OwnerPasswordSetupVerifyEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage_token = serializer.validated_data['stage_token']
        code = serializer.validated_data['code']

        valid, err_msg, payload, user = _decode_owner_setup_stage_token(
            stage_token,
            expected_stages=['GMAIL_OTP_PENDING']
        )
        if not valid or not user:
            return Response(
                {"success": False, "message": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verify Gmail OTP code
        otp_valid, otp_msg, otp_rec = EmailService.verify_otp(
            email=user.email,
            candidate_otp=code,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_SETUP
        )

        if not otp_valid:
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": otp_msg},
                request=request
            )
            return Response(
                {"success": False, "message": otp_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"otp_id": otp_rec.id if otp_rec else None},
            request=request
        )

        # Consume stage token nonce
        cache.set(f"owner_setup_nonce_used_{payload['nonce']}", 1, timeout=SETUP_TOKEN_MAX_AGE * 2)

        # Check Microsoft Authenticator (TOTP) enrollment status
        totp_config = PlatformOwnerTOTP.objects.filter(user=user).first()
        is_enrolled = bool(totp_config and totp_config.enabled and totp_config.verified)

        if is_enrolled:
            next_stage = 'TOTP_VERIFICATION_PENDING'
            new_stage_token = _mint_owner_setup_stage_token(user, next_stage)
            return Response(
                {
                    "success": True,
                    "message": "Gmail verification successful. Please enter the 6-digit code from Microsoft Authenticator.",
                    "stage": next_stage,
                    "totp_enrolled": True,
                    "stage_token": new_stage_token,
                },
                status=status.HTTP_200_OK
            )
        else:
            # Securely initiate TOTP enrollment for the Owner
            enrollment_data = OwnerTOTPService.initiate_enrollment(user, request=request)
            next_stage = 'TOTP_ENROLLMENT_PENDING'
            new_stage_token = _mint_owner_setup_stage_token(user, next_stage)
            return Response(
                {
                    "success": True,
                    "message": "Gmail verification successful. Microsoft Authenticator is not yet enrolled. Scan the QR code and enter the 6-digit code to complete setup.",
                    "stage": next_stage,
                    "totp_enrolled": False,
                    "enrollment": enrollment_data,
                    "stage_token": new_stage_token,
                },
                status=status.HTTP_200_OK
            )


class OwnerPasswordSetupVerifyTOTPView(APIView):
    """
    POST /api/auth/owner/password-setup/verify-totp/
    Stage 3: Verifies Microsoft Authenticator code (enrollment confirmation or login code).
    Upon success, issues stage token for FULL_MFA_VERIFIED.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Verify Microsoft Authenticator for Owner Password Setup",
        description="Validates Microsoft Authenticator 6-digit TOTP code and grants authorization to choose a new password.",
        request=OwnerPasswordSetupVerifyTOTPSerializer,
        responses={
            200: OpenApiResponse(description="Authenticator code verified, ready to set password."),
            400: OpenApiResponse(description="Invalid or expired code.")
        }
    )
    def post(self, request):
        serializer = OwnerPasswordSetupVerifyTOTPSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage_token = serializer.validated_data['stage_token']
        code = serializer.validated_data['code']

        valid, err_msg, payload, user = _decode_owner_setup_stage_token(
            stage_token,
            expected_stages=['TOTP_VERIFICATION_PENDING', 'TOTP_ENROLLMENT_PENDING']
        )
        if not valid or not user:
            return Response(
                {"success": False, "message": err_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        stage = payload.get('stage')

        if stage == 'TOTP_ENROLLMENT_PENDING':
            totp_valid, totp_msg = OwnerTOTPService.confirm_enrollment(user, code, request=request)
        else:
            totp_config = PlatformOwnerTOTP.objects.filter(user=user).first()
            if not (totp_config and totp_config.enabled and totp_config.verified):
                AuditService.log(
                    action=AuditLog.Action.OWNER_INITIAL_PASSWORD_TOTP_FAILED,
                    actor=user,
                    actor_email=user.email,
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"reason": "TOTP_NOT_ENROLLED"},
                    request=request
                )
                return Response(
                    {"success": False, "message": "Microsoft Authenticator is not enrolled."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            totp_valid, totp_msg = OwnerTOTPService.verify_login_code(user, code, request=request)

        if not totp_valid:
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_TOTP_FAILED,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": totp_msg},
                request=request
            )
            return Response(
                {"success": False, "message": totp_msg},
                status=status.HTTP_400_BAD_REQUEST
            )

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_TOTP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"stage": stage},
            request=request
        )

        # Invalidate previous token nonce
        cache.set(f"owner_setup_nonce_used_{payload['nonce']}", 1, timeout=SETUP_TOKEN_MAX_AGE * 2)

        next_stage = 'FULL_MFA_VERIFIED'
        new_stage_token = _mint_owner_setup_stage_token(user, next_stage)

        return Response(
            {
                "success": True,
                "message": "Microsoft Authenticator verification successful. You may now set your new password.",
                "stage": next_stage,
                "stage_token": new_stage_token,
            },
            status=status.HTTP_200_OK
        )


class OwnerPasswordSetupCompleteView(APIView):
    """
    POST /api/auth/owner/password-setup/complete/
    Stage 4: Establishes the new Platform Owner password chosen by the human owner.
    Strictly verifies FULL_MFA_VERIFIED stage token, enforces Django password validation,
    commits with set_password(), and invalidates all existing sessions/tokens.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'auth'

    @extend_schema(
        summary="Set New Platform Owner Password",
        description="Establishes new password after full 2FA completion. Revokes all existing sessions.",
        request=OwnerPasswordSetupCompleteSerializer,
        responses={
            200: OpenApiResponse(description="Password successfully set."),
            400: OpenApiResponse(description="Invalid request or validation failure.")
        }
    )
    def post(self, request):
        serializer = OwnerPasswordSetupCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage_token = serializer.validated_data['stage_token']
        new_password = serializer.validated_data['new_password']

        valid, err_msg, payload, user = _decode_owner_setup_stage_token(
            stage_token,
            expected_stages=['FULL_MFA_VERIFIED']
        )
        if not valid or not user:
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_FAILURE,
                actor_email=payload.get('email', '') if payload else '',
                target_model='User',
                metadata={"reason": err_msg or "INVALID_MFA_STAGE_TOKEN"},
                request=request
            )
            return Response(
                {"success": False, "message": err_msg or "Authorization invalid. Please complete 2FA verification first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Enforce that Microsoft Authenticator is verified and active (zero security downgrade)
        totp_config = PlatformOwnerTOTP.objects.filter(user=user).first()
        if not (totp_config and totp_config.enabled and totp_config.verified):
            AuditService.log(
                action=AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_FAILURE,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"reason": "TOTP_NOT_ACTIVE"},
                request=request
            )
            return Response(
                {
                    "success": False,
                    "message": "Microsoft Authenticator (TOTP) must be enabled and verified before setting a new password."
                },
                status=status.HTTP_400_BAD_REQUEST
            )

        # Update password using Django's set_password()
        user.set_password(new_password)
        user.email_verified = True
        user.save()

        # Invalidate stage token nonce immediately to prevent replay
        cache.set(f"owner_setup_nonce_used_{payload['nonce']}", 1, timeout=SETUP_TOKEN_MAX_AGE * 2)

        # Revoke all outstanding JWT tokens across all sessions
        try:
            tokens = OutstandingToken.objects.filter(user=user)
            for tok in tokens:
                BlacklistedToken.objects.get_or_create(token=tok)
        except Exception:
            pass

        AuditService.log(
            action=AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_SUCCESS,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"method": "GMAIL_OTP_AND_MICROSOFT_AUTHENTICATOR"},
            request=request
        )

        AuditService.log(
            action=AuditLog.Action.PASSWORD_CHANGE,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"role": "PLATFORM_OWNER", "flow": "INITIAL_PASSWORD_SETUP"},
            request=request
        )

        return Response(
            {
                "success": True,
                "message": "Platform Owner password has been successfully established and all previous sessions have been revoked. Please log in using your new password, Gmail OTP, and Microsoft Authenticator."
            },
            status=status.HTTP_200_OK
        )
