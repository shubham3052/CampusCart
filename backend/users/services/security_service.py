from typing import Dict, Any, Optional
from django.core.cache import cache
from django.utils import timezone
from users.models import AuditLog
from users.services.audit_service import AuditService


class SecurityMonitoringService:
    """
    Step 26: Suspicious Activity Monitoring & Threshold Enforcement.
    Monitors failed authentication, OTP brute-force, and payment retry anomalies.
    Uses sliding-window counters via cache and alerts via AuditLog.
    """

    FAILED_LOGIN_THRESHOLD = 5
    FAILED_LOGIN_WINDOW_SECONDS = 900  # 15 minutes

    FAILED_OTP_THRESHOLD = 5
    FAILED_OTP_WINDOW_SECONDS = 600  # 10 minutes

    FAILED_PAYMENT_THRESHOLD = 4
    FAILED_PAYMENT_WINDOW_SECONDS = 1800  # 30 minutes

    @classmethod
    def record_failed_login(cls, ip: str, email: str = '', request=None) -> Dict[str, Any]:
        """
        Tracks failed login attempts per IP and per email.
        Triggers AuditLog alert when threshold is exceeded.
        """
        ip_key = f"sec_fail_login_ip_{ip}"
        email_key = f"sec_fail_login_email_{email.lower().strip()}" if email else None

        ip_fails = (cache.get(ip_key) or 0) + 1
        cache.set(ip_key, ip_fails, cls.FAILED_LOGIN_WINDOW_SECONDS)

        email_fails = 0
        if email_key:
            email_fails = (cache.get(email_key) or 0) + 1
            cache.set(email_key, email_fails, cls.FAILED_LOGIN_WINDOW_SECONDS)

        is_suspicious = (ip_fails >= cls.FAILED_LOGIN_THRESHOLD) or (email_fails >= cls.FAILED_LOGIN_THRESHOLD)

        if is_suspicious:
            AuditService.log(
                action=AuditLog.Action.SUSPICIOUS_ACTIVITY,
                actor_email=email,
                target_model='User',
                ip_address=ip,
                metadata={
                    "type": "EXCESSIVE_FAILED_LOGINS",
                    "ip_attempts": ip_fails,
                    "email_attempts": email_fails,
                    "threshold": cls.FAILED_LOGIN_THRESHOLD,
                    "window_seconds": cls.FAILED_LOGIN_WINDOW_SECONDS,
                },
                request=request
            )

        return {
            "is_suspicious": is_suspicious,
            "ip_attempts": ip_fails,
            "email_attempts": email_fails,
            "remaining_before_alert": max(0, cls.FAILED_LOGIN_THRESHOLD - max(ip_fails, email_fails)),
        }

    @classmethod
    def clear_failed_logins(cls, ip: str, email: str = ''):
        """
        Clears failed attempt counters upon successful login.
        """
        if ip:
            cache.delete(f"sec_fail_login_ip_{ip}")
        if email:
            cache.delete(f"sec_fail_login_email_{email.lower().strip()}")

    @classmethod
    def record_failed_otp(cls, ip: str, identifier: str = '', purpose: str = '', request=None) -> Dict[str, Any]:
        """
        Tracks repeated OTP verification failures to prevent brute-force attacks.
        """
        cache_key = f"sec_fail_otp_{ip}_{identifier}_{purpose}"
        fails = (cache.get(cache_key) or 0) + 1
        cache.set(cache_key, fails, cls.FAILED_OTP_WINDOW_SECONDS)

        is_suspicious = fails >= cls.FAILED_OTP_THRESHOLD

        if is_suspicious:
            AuditService.log(
                action=AuditLog.Action.SUSPICIOUS_ACTIVITY,
                ip_address=ip,
                target_model='OTPVerification',
                target_id=str(identifier),
                metadata={
                    "type": "EXCESSIVE_OTP_FAILURES",
                    "purpose": purpose,
                    "attempts": fails,
                    "threshold": cls.FAILED_OTP_THRESHOLD,
                },
                request=request
            )

        return {
            "is_suspicious": is_suspicious,
            "attempts": fails,
            "remaining_before_alert": max(0, cls.FAILED_OTP_THRESHOLD - fails),
        }

    @classmethod
    def record_failed_payment(cls, ip: str, user_id: str = '', order_id: str = '', request=None) -> Dict[str, Any]:
        """
        Monitors payment failure velocity to detect credit card or gateway testing attacks.
        """
        cache_key = f"sec_fail_pay_{ip}_{user_id}"
        fails = (cache.get(cache_key) or 0) + 1
        cache.set(cache_key, fails, cls.FAILED_PAYMENT_WINDOW_SECONDS)

        is_suspicious = fails >= cls.FAILED_PAYMENT_THRESHOLD

        if is_suspicious:
            AuditService.log(
                action=AuditLog.Action.SUSPICIOUS_ACTIVITY,
                ip_address=ip,
                target_model='Payment',
                target_id=str(order_id),
                metadata={
                    "type": "EXCESSIVE_PAYMENT_FAILURES",
                    "user_id": str(user_id),
                    "order_id": str(order_id),
                    "attempts": fails,
                    "threshold": cls.FAILED_PAYMENT_THRESHOLD,
                },
                request=request
            )

        return {
            "is_suspicious": is_suspicious,
            "attempts": fails,
        }
