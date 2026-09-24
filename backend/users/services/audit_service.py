from typing import Optional, Any, Dict
from django.utils import timezone
from users.models import AuditLog


class AuditService:
    """
    Central service for recording platform security audit logs.
    Ensures that credentials, passwords, tokens, OTPs, and payment secrets
    are strictly scrubbed before persistence.
    """

    SENSITIVE_KEY_PATTERNS = {
        'password', 'passwd', 'secret', 'token', 'otp', 'otp_code', 'code',
        'key', 'card', 'cvv', 'pan', 'signature', 'credential', 'auth_header',
        'access_token', 'refresh_token', 'session_id'
    }

    @classmethod
    def get_client_ip(cls, request) -> Optional[str]:
        """
        Extracts genuine client IP address taking reverse proxies into account.
        """
        if not request:
            return None
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')

    @classmethod
    def get_user_agent(cls, request) -> str:
        if not request:
            return ''
        return request.META.get('HTTP_USER_AGENT', '')[:500]

    @classmethod
    def sanitize_metadata(cls, data: Any) -> Any:
        """
        Recursively scans dictionaries and lists to scrub any sensitive credentials.
        """
        if isinstance(data, dict):
            sanitized = {}
            for k, v in data.items():
                lower_k = str(k).lower()
                if any(pat in lower_k for pat in cls.SENSITIVE_KEY_PATTERNS):
                    sanitized[k] = '[REDACTED]'
                else:
                    sanitized[k] = cls.sanitize_metadata(v)
            return sanitized
        elif isinstance(data, list):
            return [cls.sanitize_metadata(item) for item in data]
        elif isinstance(data, (str, int, float, bool)) or data is None:
            return data
        else:
            return str(data)

    @classmethod
    def log(
        cls,
        action: str,
        actor=None,
        actor_email: str = '',
        target_model: str = '',
        target_id: str = '',
        ip_address: Optional[str] = None,
        user_agent: str = '',
        metadata: Optional[Dict[str, Any]] = None,
        request=None
    ) -> Optional[AuditLog]:
        """
        Persists a sanitized audit log record.
        """
        try:
            if request:
                if not actor and hasattr(request, 'user') and request.user.is_authenticated:
                    actor = request.user
                if not ip_address:
                    ip_address = cls.get_client_ip(request)
                if not user_agent:
                    user_agent = cls.get_user_agent(request)

            resolved_email = actor_email
            if not resolved_email and actor and hasattr(actor, 'email'):
                resolved_email = actor.email

            clean_metadata = cls.sanitize_metadata(metadata or {})

            return AuditLog.objects.create(
                actor=actor if (actor and hasattr(actor, 'is_authenticated') and actor.is_authenticated) else None,
                actor_email=resolved_email or '',
                action=action,
                target_model=str(target_model),
                target_id=str(target_id),
                ip_address=ip_address,
                user_agent=user_agent,
                metadata=clean_metadata,
                timestamp=timezone.now()
            )
        except Exception:
            # Audit logging failure should never crash the primary application flow
            return None

    @classmethod
    def log_auth(cls, action: str, request, user=None, email: str = '', details: Optional[Dict[str, Any]] = None):
        """
        Convenience wrapper for authentication events.
        """
        cls.log(
            action=action,
            actor=user,
            actor_email=email or (user.email if user and hasattr(user, 'email') else ''),
            target_model='User',
            target_id=str(user.id) if user and hasattr(user, 'id') else '',
            metadata=details or {},
            request=request
        )

    @classmethod
    def log_security_event(cls, action: str, request=None, target=None, details: Optional[Dict[str, Any]] = None, actor=None):
        """
        Convenience wrapper for security-sensitive object events.
        """
        target_model = target.__class__.__name__ if target else ''
        target_id = str(getattr(target, 'id', '')) if target else ''
        cls.log(
            action=action,
            actor=actor,
            target_model=target_model,
            target_id=target_id,
            metadata=details or {},
            request=request
        )
