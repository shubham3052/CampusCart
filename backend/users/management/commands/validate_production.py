"""
backend/users/management/commands/validate_production.py
Automated Production Readiness & Pre-flight Configuration Validator.
Detects misconfigurations, security vulnerabilities, and deployment gaps safely
without leaking secrets or credentials.
"""

from django.core.management.base import BaseCommand
from django.conf import settings
from django.db import connection
from pathlib import Path
import os


class Command(BaseCommand):
    help = "Performs an automated pre-flight production configuration and security audit."

    def add_arguments(self, parser):
        parser.add_argument(
            '--strict',
            action='store_true',
            help='Exit with error code 1 if any warning or failure is discovered.',
        )

    def handle(self, *args, **options):
        strict_mode = options['strict']
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 80))
        self.stdout.write(self.style.MIGRATE_HEADING("[*] SMART STATIONERY — PRODUCTION CONFIGURATION AUDIT"))
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 80))

        results = []
        fail_count = 0
        warn_count = 0

        def record(category, item, status, message):
            nonlocal fail_count, warn_count
            if status == "FAIL":
                fail_count += 1
            elif status == "WARN":
                warn_count += 1
            results.append((category, item, status, message))

        # ----------------------------------------------------------------------
        # 1. CORE DJANGO & DEBUG
        # ----------------------------------------------------------------------
        if getattr(settings, 'DEBUG', False):
            record("Core", "DEBUG Setting", "WARN", "DEBUG=True is active. Must be set to False in production.")
        else:
            record("Core", "DEBUG Setting", "PASS", "DEBUG is False (production-safe).")

        secret_key = getattr(settings, 'SECRET_KEY', '')
        if not secret_key or secret_key.startswith('django-insecure-') or len(secret_key) < 50:
            record("Core", "SECRET_KEY", "FAIL", "SECRET_KEY is insecure or shorter than 50 characters. Provide via environment variable.")
        else:
            record("Core", "SECRET_KEY", "PASS", "SECRET_KEY meets entropy requirements (>50 chars, production key).")

        allowed_hosts = getattr(settings, 'ALLOWED_HOSTS', [])
        if not allowed_hosts or '*' in allowed_hosts:
            record("Core", "ALLOWED_HOSTS", "FAIL", "Wildcard '*' or empty ALLOWED_HOSTS detected. Configure explicit FQDNs.")
        else:
            record("Core", "ALLOWED_HOSTS", "PASS", f"Configured hosts: {len(allowed_hosts)} explicit host(s).")

        # ----------------------------------------------------------------------
        # 2. CORS & CSRF TRUSTED ORIGINS
        # ----------------------------------------------------------------------
        if getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False):
            record("Security", "CORS Policy", "WARN", "CORS_ALLOW_ALL_ORIGINS=True. Must be False in production with explicit origins.")
        else:
            cors_origins = getattr(settings, 'CORS_ALLOWED_ORIGINS', [])
            record("Security", "CORS Policy", "PASS", f"CORS restricted to {len(cors_origins)} trusted origins.")

        csrf_origins = getattr(settings, 'CSRF_TRUSTED_ORIGINS', [])
        if not csrf_origins:
            record("Security", "CSRF Origins", "WARN", "CSRF_TRUSTED_ORIGINS is empty. HTTPS requests with Origin header may fail.")
        else:
            record("Security", "CSRF Origins", "PASS", f"CSRF trusted origins configured ({len(csrf_origins)} origin(s)).")

        # ----------------------------------------------------------------------
        # 3. SSL / HTTPS SECURITY
        # ----------------------------------------------------------------------
        ssl_redirect = getattr(settings, 'SECURE_SSL_REDIRECT', False)
        session_secure = getattr(settings, 'SESSION_COOKIE_SECURE', False)
        csrf_secure = getattr(settings, 'CSRF_COOKIE_SECURE', False)
        hsts_seconds = getattr(settings, 'SECURE_HSTS_SECONDS', 0)

        if not ssl_redirect:
            record("Security", "HTTPS Redirect", "WARN", "SECURE_SSL_REDIRECT is False. Ensure reverse proxy terminates HTTPS or enable.")
        else:
            record("Security", "HTTPS Redirect", "PASS", "SECURE_SSL_REDIRECT is True.")

        if not session_secure or not csrf_secure:
            record("Security", "Cookie Flags", "WARN", "SESSION_COOKIE_SECURE or CSRF_COOKIE_SECURE is False. Required for HTTPS.")
        else:
            record("Security", "Cookie Flags", "PASS", "Secure cookie flags (SESSION & CSRF) are active.")

        if hsts_seconds < 2592000:
            record("Security", "HSTS Header", "WARN", f"SECURE_HSTS_SECONDS ({hsts_seconds}) is low. Recommend >= 31536000.")
        else:
            record("Security", "HSTS Header", "PASS", f"HSTS configured ({hsts_seconds}s).")

        nosniff = getattr(settings, 'SECURE_CONTENT_TYPE_NOSNIFF', False)
        xframe = getattr(settings, 'X_FRAME_OPTIONS', '')
        if nosniff and xframe == 'DENY':
            record("Security", "Headers", "PASS", "nosniff and X-Frame-Options=DENY headers active.")
        else:
            record("Security", "Headers", "WARN", "Review security headers (nosniff / X-Frame-Options).")

        # ----------------------------------------------------------------------
        # 4. DATABASE CONNECTIVITY
        # ----------------------------------------------------------------------
        db_engine = settings.DATABASES.get('default', {}).get('ENGINE', '')
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            record("Database", "Connectivity", "PASS", f"Connected to active database (engine: {db_engine.split('.')[-1]}).")
        except Exception as e:
            record("Database", "Connectivity", "FAIL", "Failed to connect to configured default database.")

        # ----------------------------------------------------------------------
        # 5. STORAGE & STATIC ASSETS
        # ----------------------------------------------------------------------
        static_root = Path(getattr(settings, 'STATIC_ROOT', ''))
        record("Assets", "STATIC_ROOT", "PASS" if static_root else "WARN", str(static_root) if static_root else "STATIC_ROOT not configured")

        media_root = Path(getattr(settings, 'MEDIA_ROOT', ''))
        if media_root.exists() or media_root.parent.exists():
            record("Storage", "MEDIA_ROOT", "PASS", f"Media directory accessible ({media_root}).")
        else:
            record("Storage", "MEDIA_ROOT", "WARN", f"Media root path does not exist: {media_root}")

        # ----------------------------------------------------------------------
        # 6. EMAIL CONFIGURATION
        # ----------------------------------------------------------------------
        email_backend = getattr(settings, 'EMAIL_BACKEND', '')
        if 'console' in email_backend.lower():
            record("Email", "Backend", "WARN", "Console EmailBackend active. In production, configure SMTP backend.")
        else:
            record("Email", "Backend", "PASS", f"Configured backend: {email_backend.split('.')[-1]}")

        # ----------------------------------------------------------------------
        # 7. PAYMENT GATEWAY
        # ----------------------------------------------------------------------
        payment_gw = getattr(settings, 'PAYMENT_GATEWAY', 'SANDBOX')
        if payment_gw == 'SANDBOX':
            record("Payment", "Provider Mode", "WARN", "PAYMENT_GATEWAY is SANDBOX. Set to RAZORPAY / STRIPE with live keys for real transactions.")
        else:
            record("Payment", "Provider Mode", "PASS", f"Live payment provider active: {payment_gw}")

        # ----------------------------------------------------------------------
        # 8. RATE LIMITING & JWT
        # ----------------------------------------------------------------------
        drf_throttles = settings.REST_FRAMEWORK.get('DEFAULT_THROTTLE_RATES', {})
        if 'auth' in drf_throttles and 'otp' in drf_throttles:
            record("Throttling", "Rate Limits", "PASS", f"Scoped throttles active: auth ({drf_throttles['auth']}), otp ({drf_throttles['otp']}).")
        else:
            record("Throttling", "Rate Limits", "WARN", "Missing fine-grained auth/otp throttle rates.")

        # ----------------------------------------------------------------------
        # DISPLAY RESULTS TABLE
        # ----------------------------------------------------------------------
        self.stdout.write(f"\n{'CATEGORY':<14} | {'CHECK ITEM':<20} | {'STATUS':<6} | {'DETAILS'}")
        self.stdout.write("-" * 80)
        for cat, item, stat, msg in results:
            if stat == "PASS":
                stat_str = self.style.SUCCESS(stat)
            elif stat == "WARN":
                stat_str = self.style.WARNING(stat)
            else:
                stat_str = self.style.ERROR(stat)
            self.stdout.write(f"{cat:<14} | {item:<20} | {stat_str:<15} | {msg}")

        self.stdout.write("=" * 80)
        summary_msg = f"Audit Summary: {len(results) - fail_count - warn_count} PASS, {warn_count} WARN, {fail_count} FAIL"
        if fail_count > 0:
            self.stdout.write(self.style.ERROR(f"[X] {summary_msg}"))
            if strict_mode:
                raise SystemExit(1)
        elif warn_count > 0:
            self.stdout.write(self.style.WARNING(f"[!] {summary_msg}"))
            if strict_mode:
                raise SystemExit(1)
        else:
            self.stdout.write(self.style.SUCCESS(f"[OK] {summary_msg} — ALL CHECKS PASSED!"))
