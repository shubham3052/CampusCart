"""
Live Gmail SMTP Verification OTP Dispatcher
Dispatches verification OTP to target recipient
via Gmail SMTP (smtp.gmail.com:587 TLS).
"""

import os
import sys
import time

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.conf import settings
from django.contrib.auth import get_user_model
from users.models import EmailVerificationOTP
from users.services.email_service import EmailService

User = get_user_model()

RECIPIENT = sys.argv[1] if len(sys.argv) > 1 else os.getenv("TEST_RECIPIENT_EMAIL", "student@example.com")


def dispatch_test_otp():
    print("=" * 80)
    print("LIVE GMAIL SMTP EMAIL VERIFICATION / OTP DISPATCH")
    print("=" * 80)

    # 1. Verify SMTP Settings
    sender = getattr(settings, 'EMAIL_HOST_USER', '')
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', '')
    host = getattr(settings, 'EMAIL_HOST', '')
    port = getattr(settings, 'EMAIL_PORT', '')
    tls = getattr(settings, 'EMAIL_USE_TLS', False)
    backend = getattr(settings, 'EMAIL_BACKEND', '')

    print(f"SMTP Server: {host}:{port} (TLS: {tls})")
    print(f"Active Backend: {backend}")
    print(f"Sender Email: {sender} ({from_email})")
    print(f"Target Recipient: {RECIPIENT}")

    # 2. Retrieve recipient user from DB
    user = User.objects.filter(email__iexact=RECIPIENT).first()
    if not user:
        print(f"[ERROR] User with email {RECIPIENT} not found in database.")
        sys.exit(1)

    print(f"Recipient User Found: ID={user.id}, Name='{user.name}', Role={user.role}, Email Verified={user.email_verified}")

    # 3. Dispatch OTP via EmailService
    print("\nDispatching 6-digit verification OTP through Gmail SMTP...")
    start_time = time.time()
    
    success, message, otp_record = EmailService.create_and_send_otp(
        email=user.email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
        user=user
    )
    elapsed = (time.time() - start_time) * 1000

    if not success:
        print(f"\n[FAILED] Email dispatch failed in {elapsed:.2f}ms.")
        print(f"Error Message: {message}")
        sys.exit(1)

    print(f"\n[SUCCESS] Verification email successfully dispatched in {elapsed:.2f}ms via Gmail SMTP!")
    print(f"Django Report: {message}")
    print(f"OTP Record ID: {otp_record.id}")
    print(f"Expires At: {otp_record.expires_at} (in {getattr(settings, 'EMAIL_OTP_EXPIRY_SECONDS', 300) // 60} minutes)")
    print(f"Lockout Limit: {otp_record.max_attempts} attempts")
    print("=" * 80)
    print(f"Awaiting recipient to check inbox ({RECIPIENT}) and provide the 6-digit OTP.")
    print("=" * 80)


if __name__ == '__main__':
    dispatch_test_otp()
