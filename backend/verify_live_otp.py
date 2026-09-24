"""
Script to verify a user-supplied 6-digit OTP
via Django Backend (POST /api/auth/email/verify-otp/ and EmailService).
"""

import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from users.models import EmailVerificationOTP

User = get_user_model()
RECIPIENT = sys.argv[2].strip() if len(sys.argv) > 2 else os.getenv("TEST_RECIPIENT_EMAIL", "student@example.com")


def verify(candidate_otp: str):
    print("=" * 80)
    print("VERIFYING LIVE OTP THROUGH DJANGO BACKEND")
    print(f"Target Email: {RECIPIENT}")
    print(f"Candidate OTP: {candidate_otp}")
    print("=" * 80)

    client = APIClient()
    response = client.post('/api/auth/email/verify-otp/', {
        "email": RECIPIENT,
        "otp": candidate_otp,
        "purpose": "EMAIL_VERIFICATION"
    }, format='json')

    print(f"HTTP Status: {response.status_code}")
    print(f"Response Data: {response.data}")

    # Inspect user in DB
    user = User.objects.get(email__iexact=RECIPIENT)
    print(f"Database email_verified: {user.email_verified}")

    if response.status_code == status.HTTP_200_OK and user.email_verified:
        print("\n[SUCCESS] Email successfully verified in Django database!")
    else:
        print(f"\n[FAILED] Verification did not succeed: {response.data.get('message')}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python verify_live_otp.py <6-digit-otp> [recipient_email]")
        sys.exit(1)
    verify(sys.argv[1].strip())
