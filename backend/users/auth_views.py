from django.db import transaction
from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse
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
)
from .serializers import UserSerializer
from users.services.email_service import EmailService
from users.models import EmailVerificationOTP, AuditLog
from users.services.audit_service import AuditService
from users.services.security_service import SecurityMonitoringService


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
        serializer = UserSerializer(request.user)
        return Response({
            "id": request.user.id,
            "name": request.user.name,
            "email": request.user.email,
            "email_verified": request.user.email_verified,
            "role": request.user.role,
            "phone": request.user.phone_number,
            "college_id": request.user.college_id,
            "department": request.user.department,
            "hostel_block": request.user.hostel_block,
            "room_number": request.user.room_number,
        })


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
        user = request.user if request.user.is_authenticated else None

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
        user = request.user if request.user.is_authenticated else None

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
        user = request.user if request.user.is_authenticated else None

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

