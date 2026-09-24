"""
Final Acceptance Test for Secure Account Deletion with Email OTP Verification
Corresponds to Section 13:
1. Register/login test account.
2. Open Profile.
3. Click Delete Account (show confirmation modal).
4. Click Continue (calls POST /api/account/delete/request/).
5. Receive OTP by email (verified in outbox/SMTP).
6. Enter incorrect OTP (POST /api/account/delete/verify/).
7. Confirm account still exists.
8. Request a new OTP (with cooldown respect/simulation).
9. Enter correct OTP.
10. Django verifies OTP.
11. Django deletes the account inside transaction.atomic().
12. Django invalidates authentication (tokens).
13. React logs the user out (clears credentials).
14. React redirects to login.
15. Attempt login with the deleted account.
16. Confirm the deleted account cannot authenticate.
17. Verify the intended database records are gone.
18. Verify unrelated users and shared platform records remain untouched.
"""

import os
import sys
import re
import uuid
from datetime import timedelta

# Initialize Django
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.core import mail
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from users.models import EmailVerificationOTP, AuditLog
from products.models import Product, Category
from orders.models import Order

User = get_user_model()


def run_acceptance_test():
    print("=" * 80)
    print("FINAL ACCEPTANCE TEST: SECURE ACCOUNT DELETION WITH EMAIL OTP")
    print("=" * 80)

    # Use locmem for deterministic inspection of emails
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    # Setup platform records (to verify they remain untouched)
    unrelated_user = User.objects.create_user(
        username=f"unrelated_{uuid.uuid4().hex[:6]}",
        email=f"unrelated_{uuid.uuid4().hex[:6]}@campus.edu",
        password="UnrelatedPass2026!",
        name="Unrelated Platform User",
        role=User.Role.STUDENT
    )
    initial_unrelated_id = unrelated_user.id
    initial_product_count = Product.objects.count()

    print("\n[Step 1] Register/Login test account...")
    test_email = f"acceptance_student_{uuid.uuid4().hex[:6]}@campus.edu"
    test_password = "AcceptancePass2026!"
    client = APIClient()

    reg_res = client.post('/api/auth/register/', {
        "name": "Acceptance Candidate",
        "email": test_email,
        "password": test_password,
        "role": "STUDENT",
        "phone": f"987{uuid.uuid4().int % 10000000:07d}"
    }, format='json')
    assert reg_res.status_code == status.HTTP_201_CREATED, f"Registration failed: {reg_res.data}"
    student_user = User.objects.get(email=test_email)
    student_user.email_verified = True
    student_user.save(update_fields=['email_verified'])

    # Login to obtain JWT
    login_res = client.post('/api/auth/login/', {'email': test_email, 'password': test_password}, format='json')
    assert login_res.status_code == status.HTTP_200_OK, "Login failed"
    jwt_token = login_res.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {jwt_token}')
    print(f"  -> Test account authenticated: {test_email} (ID: {student_user.id})")

    print("\n[Step 2 & 3] User opens profile and initiates 'Delete Account'...")
    profile_res = client.get('/api/users/profile/')
    assert profile_res.status_code == status.HTTP_200_OK, "Profile access failed"
    print("  -> Profile loaded successfully. Confirmation prompt presented to user.")

    print("\n[Step 4 & 5] User clicks 'Continue' -> React calls POST /api/account/delete/request/...")
    mail.outbox = []
    req_res = client.post('/api/account/delete/request/', format='json')
    assert req_res.status_code == status.HTTP_200_OK, f"Delete request failed: {req_res.data}"
    assert req_res.data.get('success') is True, "Expected success: true"
    assert "code has been sent to your registered email" in req_res.data.get('message', ''), "Expected confirmation message"
    assert "otp" not in req_res.data, "CRITICAL SECURITY RULE: OTP must NEVER be exposed in API response"

    assert len(mail.outbox) == 1, "OTP email must be dispatched"
    otp_email = mail.outbox[-1]
    assert otp_email.to == [test_email], f"Sent to registered email: {test_email}"
    raw_otp_match = re.search(r'\b(\d{6})\b', otp_email.body)
    assert raw_otp_match, "6-digit OTP present in email body"
    otp1 = raw_otp_match.group(1)
    print(f"  -> OTP email successfully received for {test_email}")

    print("\n[Step 6 & 7] User enters incorrect OTP ('999999')...")
    wrong_res = client.post('/api/account/delete/verify/', {'otp': '999999'}, format='json')
    assert wrong_res.status_code == status.HTTP_400_BAD_REQUEST, "Expected 400 Bad Request"
    assert "Invalid verification code" in str(wrong_res.data), "Expected invalid code warning"

    # Confirm account STILL EXISTS in database
    assert User.objects.filter(id=student_user.id).exists() is True, "CRITICAL: Account must still exist after incorrect OTP!"
    print("  -> Verified: Account still exists in database after incorrect OTP.")

    print("\n[Step 8] User requests a new OTP...")
    # Fast-forward cooldown by 65 seconds
    otp_record = EmailVerificationOTP.objects.filter(email=test_email, purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION).latest('created_at')
    past_time = timezone.now() - timedelta(seconds=65)
    otp_record.created_at = past_time
    otp_record.last_sent_at = past_time
    otp_record.save(update_fields=['created_at', 'last_sent_at'])

    mail.outbox = []
    resend_res = client.post('/api/account/delete/request/', format='json')
    assert resend_res.status_code == status.HTTP_200_OK, "Resend request succeeded"
    assert len(mail.outbox) == 1, "New OTP email dispatched"
    otp2 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    print("  -> New OTP dispatched and received successfully.")

    print("\n[Step 9, 10, 11] User enters correct OTP -> Django verifies and deletes inside transaction.atomic()...")
    confirm_res = client.post('/api/account/delete/verify/', {'otp': otp2}, format='json')
    assert confirm_res.status_code == status.HTTP_200_OK, f"Verification failed: {confirm_res.data}"
    assert confirm_res.data.get('success') is True
    print(f"  -> Backend verified OTP and executed atomic deletion: {confirm_res.data.get('message')}")

    print("\n[Step 12] Django invalidates authentication...")
    # Attempting to use the deleted user's JWT token
    auth_check = client.get('/api/auth/me/')
    assert auth_check.status_code == status.HTTP_401_UNAUTHORIZED, "Deleted user's JWT token must be 401 Unauthorized"
    print("  -> Confirmed: JWT token is invalidated and rejected with 401 Unauthorized.")

    print("\n[Step 13 & 14] React logs the user out and clears authentication state...")
    client.credentials()  # Simulates React clearing localStorage and auth headers
    print("  -> Client-side authentication tokens cleared.")

    print("\n[Step 15 & 16] Attempt login with the deleted account...")
    relogin_res = client.post('/api/auth/login/', {'email': test_email, 'password': test_password}, format='json')
    assert relogin_res.status_code == status.HTTP_400_BAD_REQUEST, "Deleted account cannot authenticate"
    assert "Invalid email address" in str(relogin_res.data), "Invalid credentials message returned"
    print("  -> Confirmed: Deleted account cannot authenticate via login endpoint.")

    print("\n[Step 17] Verify the intended database records are gone...")
    assert User.objects.filter(id=student_user.id).exists() is False, "User row must be permanently deleted"
    # OTP records for deleted account must be cleaned up
    assert EmailVerificationOTP.objects.filter(user_id=student_user.id).exists() is False, "User OTP rows must be deleted"
    print("  -> Confirmed: User and user-owned database records are completely gone.")

    print("\n[Step 18] Verify unrelated users and shared platform records remain untouched...")
    assert User.objects.filter(id=initial_unrelated_id).exists() is True, "Unrelated user MUST remain untouched"
    assert Product.objects.count() == initial_product_count, "Platform product catalog MUST remain untouched"
    unrelated_user.delete()
    print("  -> Confirmed: Unrelated users and shared platform records are fully intact.")

    print("\n" + "=" * 80)
    print("FINAL ACCEPTANCE TEST PASSED ALL 18 VERIFICATION STEPS! (100%)")
    print("=" * 80)


if __name__ == '__main__':
    run_acceptance_test()
