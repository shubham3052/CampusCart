import re
from rest_framework import serializers
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.core import signing
from django.utils import timezone
from users.models import EmailVerificationOTP, AuditLog
from users.services.email_service import EmailService
from users.services.audit_service import AuditService

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password

User = get_user_model()


class RegisterSerializer(serializers.Serializer):
    """
    Public Registration Serializer.
    Enforces password hashing, email uniqueness, and blocks public ADMIN registration.
    """
    name = serializers.CharField(max_length=150, required=True, trim_whitespace=True)
    email = serializers.EmailField(required=True)
    phone = serializers.CharField(max_length=15, required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        min_length=8
    )
    role = serializers.CharField(
        default=User.Role.STUDENT,
        required=False,
        help_text="Public accounts can register as STUDENT or SHOP_OWNER"
    )
    college_id = serializers.CharField(max_length=50, required=False, allow_blank=True)
    department = serializers.CharField(max_length=100, required=False, allow_blank=True)
    hostel_block = serializers.CharField(max_length=50, required=False, allow_blank=True)
    room_number = serializers.CharField(max_length=20, required=False, allow_blank=True)

    def validate_email(self, value):
        email_clean = value.strip().lower()
        if email_clean == 'garibhokya@gmail.com':
            raise serializers.ValidationError("An account with this email address already exists.")
        existing = User.objects.filter(email__iexact=email_clean).first()
        if existing:
            if not existing.email_verified:
                raise serializers.ValidationError(
                    "An account with this email address already exists but is unverified. "
                    "Please log in using your registered credentials to complete verification or request a new code."
                )
            raise serializers.ValidationError("An account with this email address already exists.")
        return email_clean

    def validate_role(self, value):
        role_clean = str(value).strip().upper()
        if role_clean in [User.Role.ADMIN, 'ADMIN']:
            raise serializers.ValidationError("Public self-registration as an Administrator is strictly forbidden.")
        if role_clean in [User.Role.PLATFORM_OWNER, 'PLATFORM_OWNER']:
            raise serializers.ValidationError("Public self-registration as Platform Owner is strictly forbidden.")
        if role_clean not in [User.Role.STUDENT, User.Role.SHOP_OWNER, User.Role.DELIVERY_AGENT]:
            raise serializers.ValidationError(
                f"Invalid role '{value}'. Public accounts can only register as 'STUDENT', 'SHOP_OWNER', or 'DELIVERY_AGENT'."
            )
        return role_clean

    def validate_phone(self, value):
        if value:
            clean = re.sub(r'[\s\-()]', '', str(value))
            if not re.match(r'^\+?[0-9]{10,15}$', clean):
                raise serializers.ValidationError("Phone number must contain between 10 and 15 digits.")
            existing = User.objects.filter(phone_number=clean).first()
            if existing:
                if not existing.email_verified:
                    raise serializers.ValidationError(
                        "An account with this phone number already exists but is unverified. "
                        "Please log in using your registered credentials to complete verification."
                    )
                raise serializers.ValidationError("An account with this phone number already exists.")
            return clean
        return None

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'\d', value):
            raise serializers.ValidationError("Password must contain at least one numerical digit.")
        try:
            validate_password(value)
        except serializers.ValidationError:
            raise
        except Exception as e:
            # Fall back to custom message or list of errors
            messages = getattr(e, 'messages', [str(e)])
            raise serializers.ValidationError(messages)
        return value

    def create(self, validated_data):
        name = validated_data.get('name', '').strip()
        email = validated_data['email'].strip().lower()
        password = validated_data['password']
        role = validated_data.get('role', User.Role.STUDENT)

        parts = name.split(' ', 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ''

        # Use email as default username
        username = email

        # Couriers start with PENDING approval status until approved by an Admin
        approval_status = (
            User.ApprovalStatus.PENDING
            if role == User.Role.DELIVERY_AGENT
            else User.ApprovalStatus.APPROVED
        )

        user = User(
            username=username,
            email=email,
            first_name=first_name,
            last_name=last_name,
            role=role,
            approval_status=approval_status,
            phone_number=validated_data.get('phone') or None,
            college_id=validated_data.get('college_id', ''),
            department=validated_data.get('department', ''),
            hostel_block=validated_data.get('hostel_block', ''),
            room_number=validated_data.get('room_number', ''),
            email_verified=False,  # Accounts start UNVERIFIED until email OTP is confirmed
            is_active=True
        )
        # CRITICAL: Passwords must NEVER be stored as plain text. Use Django hashing.
        user.set_password(password)
        user.save()

        # Automatically dispatch email verification OTP to registered address
        from users.services.email_service import EmailService
        from users.models import EmailVerificationOTP
        sent, email_msg, _ = EmailService.create_and_send_otp(
            email=user.email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            user=user
        )
        if not sent:
            user._email_dispatch_error = email_msg
        return user


class LoginSerializer(serializers.Serializer):
    """
    Multi-Identifier JWT Authentication Login Serializer.
    Supports login via email, mobile phone number, or username.
    Returns Access + Refresh JWT tokens along with safe User metadata.
    """
    email = serializers.CharField(
        required=True,
        trim_whitespace=True,
        help_text="Registered email address, 10-digit mobile number, or username"
    )
    password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )

    def validate(self, attrs):
        raw_identifier = attrs.get('email', '').strip()
        password = attrs.get('password', '')

        if not raw_identifier or not password:
            raise serializers.ValidationError("Please provide both identifier and password.")

        user = None

        # 1. Check if input contains '@' (standard email format)
        if '@' in raw_identifier:
            user = User.objects.filter(email__iexact=raw_identifier.lower()).first()

        # 2. Check if input is a phone number (numeric digits with optional leading '+')
        clean_phone = re.sub(r'[\s\-()]', '', raw_identifier)
        if not user and re.match(r'^\+?[0-9]{10,15}$', clean_phone):
            # Check exact phone match
            user = User.objects.filter(phone_number=clean_phone).first()
            # If not found, check if last 10 digits match existing phone record
            if not user and len(clean_phone) >= 10:
                user = User.objects.filter(phone_number__endswith=clean_phone[-10:]).first()

        # 3. Fallback: Lookup by username
        if not user:
            user = User.objects.filter(username__iexact=raw_identifier).first()

        # 4. Fallback: Lookup by email even without '@' symbol (e.g. unusual format)
        if not user:
            user = User.objects.filter(email__iexact=raw_identifier.lower()).first()

        if not user or not user.check_password(password):
            raise serializers.ValidationError("Invalid email address, mobile number, or password.")

        if not user.is_active:
            raise serializers.ValidationError("This user account has been disabled. Please contact the administrator.")

        # PLATFORM OWNER MANDATORY 2FA CHECK
        is_owner = (
            getattr(user, 'is_platform_owner', False)
            or user.has_role(User.Role.PLATFORM_OWNER)
            or user.email.lower() == 'garibhokya@gmail.com'
        )

        if is_owner:
            # Audit log password verification success
            AuditService.log(
                action=AuditLog.Action.OWNER_LOGIN_PASSWORD_SUCCESS,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"stage": "PASSWORD_VERIFIED"}
            )

            # Generate and dispatch 6-digit OTP using existing secure EmailService
            sent, dispatch_msg, otp_rec = EmailService.create_and_send_otp(
                email=user.email,
                purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
                user=user
            )

            if not sent:
                raise serializers.ValidationError(dispatch_msg)

            AuditService.log(
                action=AuditLog.Action.OWNER_OTP_SENT,
                actor=user,
                actor_email=user.email,
                target_model='User',
                target_id=str(user.id),
                metadata={"stage": "OWNER_2FA_DISPATCHED", "otp_id": otp_rec.id if otp_rec else None}
            )

            # Mint signed, time-limited pre-authentication token (valid 5 minutes)
            pre_auth_token = signing.dumps(
                {
                    'user_id': user.id,
                    'email': user.email.lower(),
                    'purpose': 'OWNER_2FA',
                    'ts': timezone.now().timestamp()
                },
                salt='owner-2fa-preauth-salt'
            )

            # DO NOT return JWT access/refresh tokens before OTP verification!
            return {
                "requires_2fa": True,
                "email": user.email,
                "pre_auth_token": pre_auth_token,
                "role": User.Role.PLATFORM_OWNER,
                "active_role": User.Role.PLATFORM_OWNER,
                "roles": [User.Role.PLATFORM_OWNER],
                "message": "Platform Owner 2FA verification required. Enter the 6-digit code sent to your registered email.",
            }

        # Mint JWT Tokens for regular authenticated users
        active_role = getattr(user, 'active_role', user.role)
        roles = user.roles

        refresh = RefreshToken.for_user(user)
        refresh['roles'] = roles
        refresh['active_role'] = active_role
        refresh.access_token['roles'] = roles
        refresh.access_token['active_role'] = active_role

        data = {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "phone": user.phone_number,
                "role": active_role,
                "active_role": active_role,
                "roles": roles,
                "approval_status": getattr(user, 'approval_status', 'APPROVED'),
                "email_verified": user.email_verified,
                "college_id": user.college_id,
                "department": user.department,
                "hostel_block": user.hostel_block,
                "room_number": user.room_number,
            }
        }
        if not user.email_verified:
            data["requires_verification"] = True
            data["message"] = "Please verify your email before accessing all features."

        return data


class SwitchRoleSerializer(serializers.Serializer):
    """
    Input serializer for switching active role in a multi-role session.
    """
    role = serializers.CharField(
        required=False,
        help_text="Target role to activate (e.g. STUDENT, SHOP_OWNER, DELIVERY_AGENT, ADMIN)"
    )
    target_role = serializers.CharField(
        required=False,
        help_text="Alias for role"
    )

    def validate(self, attrs):
        role = attrs.get('role') or attrs.get('target_role')
        if not role:
            raise serializers.ValidationError("Role or target_role must be provided.")
        role_clean = str(role).strip().upper()
        if role_clean not in User.Role.values:
            raise serializers.ValidationError(f"Invalid role '{role}'. Allowed roles: {list(User.Role.values)}")
        attrs['role'] = role_clean
        return attrs


class LogoutSerializer(serializers.Serializer):
    """
    JWT Logout Serializer: Revokes and blacklists the client's refresh token.
    """
    refresh = serializers.CharField(required=True, help_text="Refresh token to invalidate")

    def validate(self, attrs):
        self.token = attrs['refresh']
        return attrs

    def save(self, **kwargs):
        try:
            token = RefreshToken(self.token)
            token.blacklist()
        except TokenError:
            raise serializers.ValidationError({"refresh": "Invalid or already blacklisted token."})


class SendEmailOTPSerializer(serializers.Serializer):
    """
    Serializer to request a new email verification code.
    """
    email = serializers.EmailField(required=False, help_text="Target email address (optional if authenticated)")
    purpose = serializers.ChoiceField(
        choices=['EMAIL_VERIFICATION', 'EMAIL_CHANGE', 'PASSWORD_RESET', 'ACCOUNT_DELETION'],
        default='EMAIL_VERIFICATION'
    )


class VerifyEmailOTPSerializer(serializers.Serializer):
    """
    Serializer to submit a 6-digit OTP code for verification.
    """
    email = serializers.EmailField(required=False, help_text="Email address associated with OTP (optional if authenticated)")
    otp = serializers.CharField(
        min_length=6,
        max_length=6,
        required=True,
        help_text="6-digit verification code"
    )
    purpose = serializers.ChoiceField(
        choices=['EMAIL_VERIFICATION', 'EMAIL_CHANGE', 'PASSWORD_RESET', 'ACCOUNT_DELETION'],
        default='EMAIL_VERIFICATION'
    )

    def validate_otp(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("OTP code must consist of exactly 6 numerical digits.")
        return val


class ResendEmailOTPSerializer(serializers.Serializer):
    """
    Serializer to request an OTP resend with rate-limit and cooldown enforcement.
    """
    email = serializers.EmailField(required=False)
    purpose = serializers.ChoiceField(
        choices=['EMAIL_VERIFICATION', 'EMAIL_CHANGE', 'PASSWORD_RESET', 'ACCOUNT_DELETION'],
        default='EMAIL_VERIFICATION'
    )


class ConfirmAccountDeletionSerializer(serializers.Serializer):
    """
    Serializer to submit 6-digit OTP code to authorize permanent account deletion.
    """
    otp = serializers.CharField(
        min_length=6,
        max_length=6,
        required=True,
        help_text="6-digit account deletion verification code"
    )

    def validate_otp(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("OTP code must consist of exactly 6 numerical digits.")
        return val


class RequestPasswordResetSerializer(serializers.Serializer):
    """
    Serializer for password reset requests. Prevents account enumeration.
    """
    email = serializers.EmailField(required=True)


class VerifyPasswordResetOTPSerializer(serializers.Serializer):
    """
    Serializer to verify password reset OTP and obtain a signed reset token.
    """
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_otp(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("OTP code must consist of exactly 6 numerical digits.")
        return val


class ConfirmPasswordResetSerializer(serializers.Serializer):
    """
    Serializer to complete password reset with verified reset token.
    """
    email = serializers.EmailField(required=True)
    reset_token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )

    def validate_new_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("Password must be at least 8 characters long.")
        if not re.search(r'\d', value):
            raise serializers.ValidationError("Password must contain at least one numerical digit.")
        try:
            validate_password(value)
        except Exception as e:
            messages = getattr(e, 'messages', [str(e)])
            raise serializers.ValidationError(messages[0] if messages else "Password does not meet complexity requirements.")
        return value


class RequestEmailChangeSerializer(serializers.Serializer):
    """
    Serializer for authenticated user requesting email change.
    """
    new_email = serializers.EmailField(required=True)

    def validate_new_email(self, value):
        email_clean = value.strip().lower()
        if User.objects.filter(email__iexact=email_clean).exists():
            raise serializers.ValidationError("An account with this email address already exists.")
        return email_clean


class ConfirmEmailChangeSerializer(serializers.Serializer):
    """
    Serializer to verify OTP sent to the new email and commit the change.
    """
    new_email = serializers.EmailField(required=True)
    otp = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_otp(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("OTP code must consist of exactly 6 numerical digits.")
        return val


class Owner2FAVerifySerializer(serializers.Serializer):
    """
    Input serializer for Platform Owner 2FA OTP verification.
    """
    email = serializers.EmailField(required=True)
    otp = serializers.CharField(min_length=6, max_length=6, required=True)
    pre_auth_token = serializers.CharField(required=True)

    def validate_otp(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Verification code must consist of exactly 6 digits.")
        return val


class Owner2FAResendSerializer(serializers.Serializer):
    """
    Input serializer for Platform Owner 2FA OTP resend.
    """
    email = serializers.EmailField(required=True)
    pre_auth_token = serializers.CharField(required=True)


class OwnerTOTPVerifySerializer(serializers.Serializer):
    """
    Input serializer for Platform Owner Microsoft Authenticator (TOTP) login verification.
    """
    pre_auth_token = serializers.CharField(required=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Authenticator code must consist of exactly 6 digits.")
        return val


class OwnerTOTPConfirmSerializer(serializers.Serializer):
    """
    Input serializer for Platform Owner confirming TOTP setup during enrollment.
    """
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Authenticator code must consist of exactly 6 digits.")
        return val


class OwnerTOTPResetSerializer(serializers.Serializer):
    """
    Input serializer for Platform Owner resetting TOTP.
    Requires account password + current authenticator code.
    """
    password = serializers.CharField(required=True, write_only=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Authenticator code must consist of exactly 6 digits.")
        return val


class OwnerPasswordChangeStartSerializer(serializers.Serializer):
    """
    Step 18A: Stage 1 input serializer for starting Platform Owner password change.
    Requires verifying the current password before sending Gmail OTP.
    """
    current_password = serializers.CharField(
        required=True,
        write_only=True,
        style={'input_type': 'password'}
    )


class OwnerPasswordChangeVerifyEmailSerializer(serializers.Serializer):
    """
    Step 18A: Stage 2 input serializer for verifying Gmail OTP.
    """
    stage_token = serializers.CharField(required=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Verification code must consist of exactly 6 digits.")
        return val


class OwnerPasswordChangeVerifyTOTPSerializer(serializers.Serializer):
    """
    Step 18A: Stage 3 input serializer for verifying Microsoft Authenticator TOTP.
    """
    stage_token = serializers.CharField(required=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Authenticator code must consist of exactly 6 digits.")
        return val


class OwnerPasswordChangeCompleteSerializer(serializers.Serializer):
    """
    Step 18A: Stage 4 input serializer for finalizing password change with new password.
    Requires signed challenge proving both Factor 1 (Gmail OTP) and Factor 2 (TOTP).
    """
    stage_token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )
    confirm_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )

    def validate(self, data):
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "New password and confirmation do not match."})

        if len(new_password) < 8:
            raise serializers.ValidationError({"new_password": "Password must be at least 8 characters long."})

        if not re.search(r'\d', new_password):
            raise serializers.ValidationError({"new_password": "Password must contain at least one numerical digit."})

        try:
            validate_password(new_password)
        except Exception as e:
            messages = getattr(e, 'messages', [str(e)])
            raise serializers.ValidationError({"new_password": messages[0] if messages else "Password does not meet complexity requirements."})

        return data


class OwnerPasswordSetupRequestSerializer(serializers.Serializer):
    """
    Step 19: Input serializer to request initial password setup for Platform Owner.
    Only the authorized Platform Owner email (garibhokya@gmail.com) can request setup.
    """
    email = serializers.EmailField(required=True)


class OwnerPasswordSetupVerifyEmailSerializer(serializers.Serializer):
    """
    Step 19: Input serializer to verify Gmail OTP code.
    """
    stage_token = serializers.CharField(required=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Verification code must consist of exactly 6 digits.")
        return val


class OwnerPasswordSetupResendEmailSerializer(serializers.Serializer):
    """
    Step 19: Input serializer to resend Gmail OTP code.
    """
    stage_token = serializers.CharField(required=True)


class OwnerPasswordSetupVerifyTOTPSerializer(serializers.Serializer):
    """
    Step 19: Input serializer to verify Microsoft Authenticator TOTP code.
    """
    stage_token = serializers.CharField(required=True)
    code = serializers.CharField(min_length=6, max_length=6, required=True)

    def validate_code(self, value):
        val = str(value).strip()
        if not re.match(r'^\d{6}$', val):
            raise serializers.ValidationError("Authenticator code must consist of exactly 6 digits.")
        return val


class OwnerPasswordSetupCompleteSerializer(serializers.Serializer):
    """
    Step 19: Input serializer to set new password after full 2FA verification.
    """
    stage_token = serializers.CharField(required=True)
    new_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )
    confirm_password = serializers.CharField(
        required=True,
        write_only=True,
        min_length=8,
        style={'input_type': 'password'}
    )

    def validate(self, data):
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_password')

        if new_password != confirm_password:
            raise serializers.ValidationError({"confirm_password": "New password and confirmation do not match."})

        if len(new_password) < 8:
            raise serializers.ValidationError({"new_password": "Password must be at least 8 characters long."})

        if not re.search(r'\d', new_password):
            raise serializers.ValidationError({"new_password": "Password must contain at least one numerical digit."})

        try:
            validate_password(new_password)
        except Exception as e:
            messages = getattr(e, 'messages', [str(e)])
            raise serializers.ValidationError({"new_password": messages[0] if messages else "Password does not meet complexity requirements."})

        return data
