import re
import secrets
import smtplib
import socket
import logging
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.mail import EmailMultiAlternatives
from django.core import signing
from django.utils import timezone
from users.models import EmailVerificationOTP

logger = logging.getLogger(__name__)

User = get_user_model()


class EmailService:
    """
    Centralized email and OTP verification service for Smart Student Stationery.
    Handles cryptographically secure OTP generation, PBKDF2 hashing, rate-limiting,
    resend cooldowns, brute-force defenses, password resets, and email change verification.
    """

    @staticmethod
    def generate_numeric_otp(length: int = 6) -> str:
        """
        Generates a cryptographically secure numeric OTP using Python secrets.
        Never uses timestamps, user IDs, or predictable pseudorandom sequences.
        """
        return f"{secrets.randbelow(10 ** length):0{length}d}"

    @staticmethod
    def _mask_email(email: str) -> str:
        """
        Safely masks email addresses for diagnostic logging (e.g. j***e@domain.com)
        Preventing personal identifiable information (PII) leakage in logs.
        """
        if not email or '@' not in email:
            return "***"
        local, domain = email.split('@', 1)
        if len(local) <= 2:
            masked_local = local[0] + "*"
        else:
            masked_local = local[0] + "*" * (len(local) - 2) + local[-1]
        return f"{masked_local}@{domain}"

    @classmethod
    def create_and_send_otp(cls, email: str, purpose: str, user=None) -> tuple[bool, str, EmailVerificationOTP | None]:
        """
        Generates a 6-digit OTP, stores its PBKDF2 hash in the database,
        and dispatches a branded verification email.
        Enforces 60-second cooldown and 5 resends/hour rate limits.
        """
        email_clean = str(email).strip().lower()
        now = timezone.now()

        # Cooldown check: minimum interval between dispatches
        cooldown_seconds = getattr(settings, 'EMAIL_OTP_RESEND_COOLDOWN_SECONDS', 60)
        latest_otp = EmailVerificationOTP.objects.filter(
            email=email_clean,
            purpose=purpose,
            is_verified=False
        ).order_by('-created_at').first()

        if latest_otp and (now - latest_otp.last_sent_at).total_seconds() < cooldown_seconds:
            remaining = int(cooldown_seconds - (now - latest_otp.last_sent_at).total_seconds())
            return False, f"Please wait {remaining} seconds before requesting a new verification code.", None

        # Rate limit check: maximum attempts within a 1-hour window
        one_hour_ago = now - timedelta(hours=1)
        hourly_count = EmailVerificationOTP.objects.filter(
            email=email_clean,
            purpose=purpose,
            created_at__gte=one_hour_ago
        ).count()

        max_hourly = getattr(settings, 'EMAIL_OTP_MAX_RESENDS_PER_HOUR', 5)
        if hourly_count >= max_hourly:
            return False, "Maximum verification requests exceeded for this hour. Please try again later.", None

        # Invalidate previous unverified OTPs for this email and purpose to enforce single active OTP
        EmailVerificationOTP.objects.filter(
            email=email_clean,
            purpose=purpose,
            is_verified=False
        ).update(expires_at=now)

        # Generate cryptographically secure 6-digit OTP
        raw_otp = cls.generate_numeric_otp(6)

        # Calculate expiry
        expiry_seconds = getattr(settings, 'EMAIL_OTP_EXPIRY_SECONDS', 300)
        expires_at = now + timedelta(seconds=expiry_seconds)

        # Create record and hash OTP (NEVER store plaintext!)
        otp_record = EmailVerificationOTP(
            user=user,
            email=email_clean,
            purpose=purpose,
            expires_at=expires_at,
            max_attempts=getattr(settings, 'EMAIL_OTP_MAX_ATTEMPTS', 5),
            last_sent_at=now,
            resend_count=hourly_count
        )
        otp_record.set_otp(raw_otp)
        otp_record.save()

        # Dispatch email
        recipient_name = user.name if user and hasattr(user, 'name') and user.name else "Campus Member"
        sent, dispatch_msg = cls._send_email_dispatch(
            recipient_email=email_clean,
            recipient_name=recipient_name,
            raw_otp=raw_otp,
            purpose=purpose,
            expiry_minutes=max(1, expiry_seconds // 60)
        )

        if not sent:
            # Delete failed OTP record so cooldown/hourly rate limit doesn't lock user on server failure
            otp_record.delete()
            return False, dispatch_msg, None

        return True, "A 6-digit verification code has been sent to your email address.", otp_record

    @classmethod
    def verify_otp(cls, email: str, candidate_otp: str, purpose: str, user=None) -> tuple[bool, str, EmailVerificationOTP | None]:
        """
        Verifies a user-supplied OTP against the stored PBKDF2 hash.
        Guarantees one-time use, enforces maximum attempts, and validates expiration.
        """
        email_clean = str(email).strip().lower()
        now = timezone.now()

        otp_record = EmailVerificationOTP.objects.filter(
            email=email_clean,
            purpose=purpose,
            is_verified=False
        ).order_by('-created_at').first()

        if not otp_record:
            return False, "No active verification code found for this email. Please request a new code.", None

        # Verify OTP belongs to this specific authenticated user
        if user and otp_record.user and otp_record.user_id != user.id:
            return False, "This verification code was issued to a different account.", None

        if otp_record.is_expired:
            return False, "This verification code has expired. Please request a new one.", None

        if otp_record.attempts >= otp_record.max_attempts:
            return False, "Maximum verification attempts exceeded for this code. Please request a new one.", None

        # Verify candidate OTP using constant-time check
        if not otp_record.check_otp(candidate_otp):
            otp_record.attempts += 1
            otp_record.save(update_fields=['attempts', 'updated_at'])
            remaining = max(0, otp_record.max_attempts - otp_record.attempts)
            if remaining == 0:
                return False, "Maximum verification attempts exceeded. This code is now locked. Please request a new one.", None
            return False, f"Invalid verification code. {remaining} attempt(s) remaining.", None

        # Mark OTP as verified (one-time use)
        otp_record.is_verified = True
        otp_record.verified_at = now
        otp_record.save(update_fields=['is_verified', 'verified_at', 'updated_at'])

        # If this is account email verification, mark user's email as verified
        target_user = user or otp_record.user or User.objects.filter(email__iexact=email_clean).first()
        if target_user and purpose == EmailVerificationOTP.Purpose.EMAIL_VERIFICATION:
            target_user.email_verified = True
            target_user.save(update_fields=['email_verified', 'updated_at'])

        return True, "Verification successful.", otp_record

    @classmethod
    def request_password_reset(cls, email: str) -> tuple[bool, str]:
        """
        Initiates password reset via email OTP.
        Guarantees protection against account enumeration: returns generic message
        regardless of whether the account exists.
        """
        email_clean = str(email).strip().lower()
        user = User.objects.filter(email__iexact=email_clean).first()

        # If user exists and is active, dispatch OTP
        if user and user.is_active:
            cls.create_and_send_otp(
                email=email_clean,
                purpose=EmailVerificationOTP.Purpose.PASSWORD_RESET,
                user=user
            )

        # Always return identical confirmation to prevent account enumeration
        return True, "If an account with that email exists, a password reset code has been sent."

    @classmethod
    def verify_password_reset_otp(cls, email: str, candidate_otp: str) -> tuple[bool, str, str | None]:
        """
        Validates the password reset OTP and issues a cryptographically signed reset token.
        """
        success, message, otp_record = cls.verify_otp(
            email=email,
            candidate_otp=candidate_otp,
            purpose=EmailVerificationOTP.Purpose.PASSWORD_RESET
        )
        if not success:
            return False, message, None

        # Mint a signed reset token valid for 15 minutes
        reset_token = signing.dumps(
            {
                'email': str(email).strip().lower(),
                'purpose': 'PASSWORD_RESET',
                'otp_id': otp_record.id,
                'ts': timezone.now().timestamp()
            },
            salt='password-reset-salt'
        )
        return True, "Verification code confirmed. You may now set your new password.", reset_token

    @classmethod
    def confirm_password_reset(cls, email: str, reset_token: str, new_password: str) -> tuple[bool, str]:
        """
        Validates the signed reset token, checks password strength,
        and securely updates the user's password using Django's hasher.
        """
        email_clean = str(email).strip().lower()
        try:
            payload = signing.loads(reset_token, salt='password-reset-salt', max_age=900)  # 15 minutes
        except signing.SignatureExpired:
            return False, "Password reset session has expired. Please request a new code."
        except signing.BadSignature:
            return False, "Invalid password reset token."

        if payload.get('email') != email_clean or payload.get('purpose') != 'PASSWORD_RESET':
            return False, "Token does not match the provided email address."

        user = User.objects.filter(email__iexact=email_clean).first()
        if not user:
            return False, "User account not found."

        if len(new_password) < 8:
            return False, "Password must be at least 8 characters long."
        if not re.search(r'\d', new_password):
            return False, "Password must contain at least one numerical digit."

        try:
            validate_password(new_password, user=user)
        except Exception as e:
            messages = getattr(e, 'messages', [str(e)])
            return False, messages[0] if messages else "Password does not meet security requirements."

        # Securely set password and mark email verified if not already
        user.set_password(new_password)
        user.email_verified = True
        user.save()

        return True, "Password has been successfully updated. You may now log in."

    @classmethod
    def request_email_change(cls, user, new_email: str) -> tuple[bool, str]:
        """
        Initiates an email address update for an authenticated user.
        Dispatches an OTP to the candidate new email address.
        """
        new_email_clean = str(new_email).strip().lower()

        if new_email_clean == user.email.lower():
            return False, "New email address must be different from your current email address."

        if User.objects.filter(email__iexact=new_email_clean).exclude(id=user.id).exists():
            return False, "An account with this email address already exists."

        return cls.create_and_send_otp(
            email=new_email_clean,
            purpose=EmailVerificationOTP.Purpose.EMAIL_CHANGE,
            user=user
        )[:2]

    @classmethod
    def confirm_email_change(cls, user, new_email: str, candidate_otp: str) -> tuple[bool, str]:
        """
        Validates the OTP sent to the new email and commits the change to the user record.
        """
        new_email_clean = str(new_email).strip().lower()

        success, message, otp_record = cls.verify_otp(
            email=new_email_clean,
            candidate_otp=candidate_otp,
            purpose=EmailVerificationOTP.Purpose.EMAIL_CHANGE,
            user=user
        )
        if not success:
            return False, message

        # Verify that this OTP belongs to this specific user
        if otp_record.user_id and otp_record.user_id != user.id:
            return False, "Unauthorized: this verification code was issued to a different account."

        # Commit email update
        old_username = user.username
        user.email = new_email_clean
        # If username matches old email, update username to new email as well
        if old_username.lower() == user.email.lower() or '@' in old_username:
            user.username = new_email_clean
        user.email_verified = True
        user.save()

        return True, "Your email address has been successfully updated and verified."

    @classmethod
    def _send_email_dispatch(cls, recipient_email: str, recipient_name: str, raw_otp: str, purpose: str, expiry_minutes: int) -> tuple[bool, str]:
        """
        Renders and dispatches a multipart (HTML + Plain Text) CampusCart branded email.
        Catches and classifies SMTP / network exceptions without leaking sensitive credentials or raw OTP into system logs.
        Returns (success: bool, user_friendly_message: str).
        """
        subjects = {
            EmailVerificationOTP.Purpose.EMAIL_VERIFICATION: "CampusCart - Verify your Smart Stationery account",
            EmailVerificationOTP.Purpose.EMAIL_CHANGE: "CampusCart - Confirm your new email address",
            EmailVerificationOTP.Purpose.PASSWORD_RESET: "CampusCart - Reset your Smart Stationery account password",
            EmailVerificationOTP.Purpose.ACCOUNT_DELETION: "CampusCart - Account Deletion Verification Code",
            EmailVerificationOTP.Purpose.ADMIN_INVITATION: "CampusCart - Administrator Invitation & Verification Code",
        }
        subject = subjects.get(purpose, "CampusCart - 6-Digit Verification Code")

        purpose_descriptions = {
            EmailVerificationOTP.Purpose.EMAIL_VERIFICATION: "verifying your CampusCart account",
            EmailVerificationOTP.Purpose.EMAIL_CHANGE: "updating your account email address",
            EmailVerificationOTP.Purpose.PASSWORD_RESET: "resetting your account password",
            EmailVerificationOTP.Purpose.ACCOUNT_DELETION: "permanently deleting your CampusCart account",
            EmailVerificationOTP.Purpose.ADMIN_INVITATION: "activating your Administrator account",
        }
        purpose_desc = purpose_descriptions.get(purpose, "account verification")

        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'CampusCart <no-reply@campuscart.edu>')

        import urllib.parse
        frontend_base_url = getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:5174').rstrip('/')
        verification_url = f"{frontend_base_url}/admin/invitation/verify?email={urllib.parse.quote(recipient_email)}"

        if purpose == EmailVerificationOTP.Purpose.ADMIN_INVITATION:
            action_text = f"\nTo verify your invitation and set your administrator password, please visit:\n{verification_url}\n"
            action_html = f"""
      <div style="text-align: center; margin: 28px 0 20px;">
        <a href="{verification_url}" style="background-color: #4f46e5; color: #ffffff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35);">
          Verify Invitation &amp; Set Password &rarr;
        </a>
      </div>
      <div style="font-size: 12.5px; color: #64748b; text-align: center; word-break: break-all; margin-bottom: 20px;">
        Or open the verification page directly:<br>
        <a href="{verification_url}" style="color: #4f46e5; text-decoration: underline;">{verification_url}</a>
      </div>"""
        else:
            action_text = ""
            action_html = ""

        text_content = (
            f"Hello {recipient_name},\n\n"
            f"Your 6-digit CampusCart verification code for {purpose_desc} is:\n\n"
            f"    {raw_otp}\n\n"
            f"This code is valid for {expiry_minutes} minutes (single-use).\n"
            f"{action_text}\n"
            f"SECURITY WARNING: Never share this verification code with anyone. CampusCart staff, couriers, or shop owners will never ask for your code.\n\n"
            f"If you did not request this verification code, please safely disregard this email.\n\n"
            f"— CampusCart Team\n"
            f"Smart Student Stationery & Xerox Delivery Platform"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{subject}</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.08), 0 8px 10px -6px rgba(0,0,0,0.04); }}
    .header {{ background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%); padding: 32px 24px; text-align: center; color: #ffffff; }}
    .brand-title {{ margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.025em; }}
    .brand-subtitle {{ margin: 6px 0 0; font-size: 13px; font-weight: 500; opacity: 0.92; letter-spacing: 0.02em; }}
    .body {{ padding: 32px 28px; }}
    .greeting {{ font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 12px; }}
    .message {{ font-size: 14.5px; line-height: 1.6; color: #475569; margin-bottom: 24px; }}
    .otp-wrapper {{ background: #f8fafc; border: 2px dashed #3b82f6; border-radius: 12px; padding: 24px 16px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #1d4ed8; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; display: inline-block; padding-left: 10px; }}
    .expiry {{ font-size: 12.5px; color: #64748b; margin-top: 10px; font-weight: 600; }}
    .warning {{ background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 14px 16px; font-size: 12.5px; color: #92400e; margin-top: 28px; line-height: 1.55; }}
    .footer {{ background: #f8fafc; padding: 20px 24px; text-align: center; font-size: 11.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; line-height: 1.5; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 class="brand-title">CampusCart</h1>
      <p class="brand-subtitle">Smart Student Stationery &amp; Xerox Delivery</p>
    </div>
    <div class="body">
      <div class="greeting">Hello {recipient_name},</div>
      <div class="message">
        You requested a 6-digit verification code for <strong>{purpose_desc}</strong>.
        Please enter the code below to complete verification:
      </div>
      <div class="otp-wrapper">
        <div class="otp-code">{raw_otp}</div>
        <div class="expiry">Valid for {expiry_minutes} minutes &bull; Single-use only</div>
      </div>
      {action_html}
      <div class="warning">
        <strong>Security Warning:</strong> Never share this verification code with anyone. CampusCart staff, couriers, or shop owners will never ask for your code. If you did not make this request, please safely ignore this email.
      </div>
    </div>
    <div class="footer">
      &copy; 2026 CampusCart &bull; Campus Stationery &amp; Xerox Delivery Network<br>
      This is an automated security transmission. Please do not reply directly to this email.
    </div>
  </div>
</body>
</html>"""

        # Dispatch priority:
        # 1. Brevo HTTPS REST API (port 443) when BREVO_API_KEY is configured (allows sending to ANY recipient)
        brevo_key = str(getattr(settings, 'BREVO_API_KEY', '')).strip().strip('\'"')
        if brevo_key:
            return cls._dispatch_via_brevo_api(
                recipient_email=recipient_email,
                recipient_name=recipient_name,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )

        # 2. Resend HTTPS REST API (port 443) when RESEND_API_KEY / EMAIL_PROVIDER_API_KEY is configured
        resend_key = str(getattr(settings, 'RESEND_API_KEY', '') or getattr(settings, 'EMAIL_PROVIDER_API_KEY', '')).strip().strip('\'"')
        if resend_key:
            return cls._dispatch_via_https_api(
                recipient_email=recipient_email,
                subject=subject,
                text_content=text_content,
                html_content=html_content
            )

        # 3. Django EmailBackend fallback under automated tests or local development (DEBUG=True)
        import sys
        if 'test' in sys.argv or getattr(settings, 'DEBUG', False):
            return cls._dispatch_via_django_email(
                recipient_email=recipient_email,
                subject=subject,
                text_content=text_content,
                html_content=html_content,
                from_email=from_email
            )

        # 4. In production (DEBUG=False) without an API key:
        # Avoid hanging on blocked outbound SMTP socket connections (ports 25/465/587)
        masked_email = cls._mask_email(recipient_email)
        logger.error(
            "[EmailService] Outbound email failed for %s: RESEND_API_KEY or BREVO_API_KEY is not configured in server environment.",
            masked_email
        )
        return False, "Email delivery service is not configured. Please set RESEND_API_KEY or BREVO_API_KEY in Render environment variables."

    @classmethod
    def _dispatch_via_brevo_api(
        cls,
        recipient_email: str,
        recipient_name: str,
        subject: str,
        text_content: str,
        html_content: str
    ) -> tuple[bool, str]:
        """
        Dispatches email via Brevo (Sendinblue) HTTPS REST API (api.brevo.com/v3/smtp/email:443).
        Operates over port 443 HTTPS. Supports sending to ANY recipient email address on free tier.
        Never logs or exposes API keys or secrets.
        """
        import json
        import urllib.request
        import urllib.error

        api_key = str(getattr(settings, 'BREVO_API_KEY', '')).strip().strip('\'"')
        if not api_key:
            return False, "Brevo API key is not configured in server environment."

        from_addr = getattr(settings, 'EMAIL_FROM_ADDRESS', '').strip() or getattr(settings, 'DEFAULT_FROM_EMAIL', '').strip()
        from_name = getattr(settings, 'EMAIL_FROM_NAME', 'CampusCart').strip()
        if not from_addr or '@' not in from_addr:
            from_addr = 'garibhokya@gmail.com'

        payload = {
            "sender": {
                "name": from_name,
                "email": from_addr
            },
            "to": [
                {
                    "email": recipient_email,
                    "name": recipient_name
                }
            ],
            "subject": subject,
            "htmlContent": html_content,
            "textContent": text_content
        }

        masked_email = cls._mask_email(recipient_email)
        logger.info(
            "[EmailService] Dispatching OTP email to %s via Brevo HTTPS API (api.brevo.com:443)...",
            masked_email
        )

        req_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            'https://api.brevo.com/v3/smtp/email',
            data=req_bytes,
            headers={
                'api-key': api_key,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                logger.info(
                    "[EmailService] Brevo HTTPS API accepted email for %s (HTTP %d).",
                    masked_email,
                    resp.status
                )
                return True, "Verification email sent successfully."
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode('utf-8'))
                err_msg = err_body.get('message', str(e))
            except Exception:
                err_msg = str(e)

            logger.error("[EmailService] Brevo API Error (%d) for %s: %s", e.code, masked_email, err_msg)
            return False, f"Email delivery provider error: {err_msg}"
        except (socket.timeout, urllib.error.URLError, TimeoutError, OSError) as e:
            logger.error("[EmailService] Network error connecting to Brevo HTTPS API: %s", type(e).__name__)
            return False, "Could not connect to email delivery service. Please check your network connection."
        except Exception as e:
            logger.error("[EmailService] Unexpected error during Brevo email dispatch: %s", type(e).__name__)
            return False, "Unable to send verification email. Please try again later."



    @classmethod
    def _dispatch_via_https_api(
        cls,
        recipient_email: str,
        subject: str,
        text_content: str,
        html_content: str
    ) -> tuple[bool, str]:
        """
        Dispatches email via Resend HTTPS REST API (api.resend.com:443).
        Communicates strictly over HTTPS port 443, bypassing blocked outbound SMTP ports
        (25/465/587) on cloud hosts like Render Free.
        Never logs or exposes API keys or secrets.
        """
        import json
        import urllib.request
        import urllib.error

        api_key = str(getattr(settings, 'RESEND_API_KEY', '') or getattr(settings, 'EMAIL_PROVIDER_API_KEY', '')).strip().strip('\'"')
        if not api_key:
            return False, "Email delivery API key is not configured in server environment."

        from_addr = getattr(settings, 'EMAIL_FROM_ADDRESS', '').strip()
        from_name = getattr(settings, 'EMAIL_FROM_NAME', 'CampusCart').strip()

        if not from_addr:
            default_from = getattr(settings, 'DEFAULT_FROM_EMAIL', '').strip()
            if default_from and '@' in default_from and not any(d in default_from for d in ('example.com', 'campuscart.edu')):
                from_addr = default_from
            else:
                from_addr = 'onboarding@resend.dev'

        if '<' not in from_addr:
            sender_header = f"{from_name} <{from_addr}>"
        else:
            sender_header = from_addr

        payload = {
            "from": sender_header,
            "to": [recipient_email],
            "subject": subject,
            "text": text_content,
            "html": html_content
        }

        masked_email = cls._mask_email(recipient_email)
        logger.info(
            "[EmailService] Dispatching OTP email to %s via Resend HTTPS API (api.resend.com:443)...",
            masked_email
        )

        req_bytes = json.dumps(payload).encode('utf-8')
        req = urllib.request.Request(
            'https://api.resend.com/emails',
            data=req_bytes,
            headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json',
                'User-Agent': 'CampusCart-Backend/1.0'
            },
            method='POST'
        )

        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                logger.info(
                    "[EmailService] Resend HTTPS API accepted email for %s (HTTP %d).",
                    masked_email,
                    resp.status
                )
                return True, "Verification email sent successfully."
        except urllib.error.HTTPError as e:
            try:
                err_body = json.loads(e.read().decode('utf-8'))
                err_msg = err_body.get('message', str(e))
            except Exception:
                err_msg = str(e)

            logger.error("[EmailService] Resend API Error (%d) for %s: %s", e.code, masked_email, err_msg)
            if e.code in (401, 403):
                return False, f"Email delivery authentication failed: {err_msg}. Please verify provider API key configuration."
            elif e.code == 422:
                return False, f"Email delivery provider error: {err_msg}"
            return False, f"Email delivery service rejected the request: {err_msg}. Please try again later."
        except (socket.timeout, urllib.error.URLError, TimeoutError, OSError) as e:
            logger.error("[EmailService] Network error connecting to Resend HTTPS API: %s", type(e).__name__)
            return False, "Could not connect to email delivery service. Please check your network connection."
        except Exception as e:
            logger.error("[EmailService] Unexpected error during HTTPS email dispatch: %s", type(e).__name__)
            return False, "Unable to send verification email. Please try again later."

    @classmethod
    def _dispatch_via_django_email(
        cls,
        recipient_email: str,
        subject: str,
        text_content: str,
        html_content: str,
        from_email: str
    ) -> tuple[bool, str]:
        """
        Fallback email dispatch using Django's configured EMAIL_BACKEND.
        Used for local development (console backend), test suite (locmem outbox),
        or when an HTTPS API key is not configured.
        """
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=[recipient_email]
        )
        msg.attach_alternative(html_content, "text/html")

        backend_name = getattr(settings, 'EMAIL_BACKEND', '')
        is_console = 'console' in backend_name.lower()
        masked_email = cls._mask_email(recipient_email)

        if is_console:
            logger.info(
                "[EmailService Diagnostics] Dispatched OTP for %s using ConsoleBackend (check server terminal; "
                "Resend API key is not configured).",
                masked_email
            )
        else:
            logger.info(
                "[EmailService Diagnostics] Dispatched OTP for %s using Django EmailBackend (%s).",
                masked_email,
                backend_name
            )

        try:
            msg.send(fail_silently=False)
            return True, "Verification email sent successfully."
        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP Authentication Error while sending OTP: Check EMAIL_HOST_USER and Gmail App Password.")
            return False, "Email delivery authentication failed. Please verify your Gmail App Password configuration."
        except (smtplib.SMTPConnectError, socket.timeout, ConnectionRefusedError, OSError) as e:
            logger.error("SMTP Connection Error while sending OTP: %s", type(e).__name__)
            return False, "Could not connect to email delivery server. Please check your network connection."
        except smtplib.SMTPRecipientsRefused as e:
            logger.error("SMTP Recipient Refused: %s", type(e).__name__)
            return False, "The recipient email address was refused by the mail server. Please verify your email address."
        except Exception as e:
            logger.error("Email dispatch failed: %s", type(e).__name__)
            return False, "Unable to send verification email. Please try again later."

