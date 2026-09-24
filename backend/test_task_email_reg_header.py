"""
Comprehensive Backend Test Suite: Email Registration, OTP Verification, Login, and Logout
Testing CampusCart Email Authentication Lifecycle
"""
import os
import sys
import uuid
import django

# Initialize Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from users.models import EmailVerificationOTP

User = get_user_model()

def run_tests():
    print("=" * 80)
    print("STARTING EMAIL REGISTRATION, OTP VERIFICATION, LOGIN & LOGOUT TEST SUITE")
    print("=" * 80)

    client = APIClient()
    import random
    unique_suffix = uuid.uuid4().hex[:8]
    test_email = f"student_{unique_suffix}@campus.edu"
    test_password = "SecurePassword123!"
    test_phone = f"987{random.randint(1000000, 9999999)}"
    test_name = "Alex Campus"

    # 1. Invalid Email Registration Attempt
    print("\n--- 1. Testing Invalid Email Rejection ---")
    res = client.post('/api/auth/register/', {
        "name": test_name,
        "email": "not-an-email",
        "password": test_password,
        "role": "STUDENT",
    }, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST, f"Expected 400, got {res.status_code}"
    print(f"[PASS] 1.1 Invalid email 'not-an-email' strictly rejected with 400 Bad Request.")

    # 2. Valid Email Registration
    print("\n--- 2. Testing Valid Email Registration & OTP Dispatch ---")
    res = client.post('/api/auth/register/', {
        "name": test_name,
        "email": test_email,
        "phone": test_phone,
        "password": test_password,
        "role": "STUDENT",
        "college_id": "STU-2026-99",
        "department": "Computer Science",
        "hostel_block": "Hostel Block C",
        "room_number": "304",
    }, format='json')

    assert res.status_code == status.HTTP_201_CREATED, f"Expected 201, got {res.status_code}: {res.data}"
    data = res.data
    assert data.get('success') is True, "Expected success: True"
    assert "access" in data, "Expected access token in response"
    assert "refresh" in data, "Expected refresh token in response"
    assert data['user']['email'] == test_email.lower(), "User email mismatch"
    assert data['user']['role'] == "STUDENT", "User role mismatch"
    assert data['user']['email_verified'] is False, "New user should start unverified"
    print(f"[PASS] 2.1 User successfully registered with email '{test_email}' (Role: STUDENT, email_verified: False).")

    # 3. Duplicate Email Rejection
    print("\n--- 3. Testing Duplicate Email Rejection ---")
    dup_res = client.post('/api/auth/register/', {
        "name": "Imposter User",
        "email": test_email.upper(),  # Test case-insensitivity
        "password": test_password,
        "role": "STUDENT",
    }, format='json')
    assert dup_res.status_code == status.HTTP_400_BAD_REQUEST, f"Expected 400 for duplicate, got {dup_res.status_code}"
    assert "email" in dup_res.data or "message" in dup_res.data, "Expected email error message"
    print(f"[PASS] 3.1 Duplicate email registration correctly rejected with 400 Bad Request.")

    # 4. OTP Generation Verification
    print("\n--- 4. Testing OTP Record Creation & Expiration ---")
    otp_record = EmailVerificationOTP.objects.filter(
        email=test_email.lower(),
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
        is_verified=False
    ).order_by('-created_at').first()

    assert otp_record is not None, "Expected active OTP record in database"
    assert not otp_record.is_expired, "OTP should not be expired immediately"
    print(f"[PASS] 4.1 6-digit OTP record found for '{test_email}' (Attempts: {otp_record.attempts}/{otp_record.max_attempts}).")

    # 5. Invalid OTP Submission
    print("\n--- 5. Testing Invalid OTP Code Handling ---")
    bad_otp_res = client.post('/api/auth/email/verify-otp/', {
        "email": test_email,
        "otp": "000000",
        "purpose": "EMAIL_VERIFICATION",
    }, format='json')
    assert bad_otp_res.status_code == status.HTTP_400_BAD_REQUEST, f"Expected 400, got {bad_otp_res.status_code}"
    print(f"[PASS] 5.1 Incorrect OTP '000000' rejected with 400 Bad Request.")

    # 6. Valid OTP Verification
    print("\n--- 6. Testing Valid OTP Verification ---")
    # For testing, we can simulate candidate OTP by finding the matching digit sequence
    # or generate a fresh OTP with known code
    # EmailService stores PBKDF2 hash. Let's create a known test code:
    test_code = "654321"
    otp_record.set_otp(test_code)
    otp_record.save()

    good_otp_res = client.post('/api/auth/email/verify-otp/', {
        "email": test_email,
        "otp": test_code,
        "purpose": "EMAIL_VERIFICATION",
    }, format='json')

    assert good_otp_res.status_code == status.HTTP_200_OK, f"Expected 200, got {good_otp_res.status_code}: {good_otp_res.data}"
    user_obj = User.objects.get(email=test_email.lower())
    assert user_obj.email_verified is True, "User email_verified should now be True"
    print(f"[PASS] 6.1 Valid OTP '{test_code}' accepted. User.email_verified is now True.")

    # 7. One-Time Use Guard
    print("\n--- 7. Testing OTP Single-Use Enforcement ---")
    reused_res = client.post('/api/auth/email/verify-otp/', {
        "email": test_email,
        "otp": test_code,
        "purpose": "EMAIL_VERIFICATION",
    }, format='json')
    assert reused_res.status_code == status.HTTP_400_BAD_REQUEST, "Reusing verified OTP must be rejected"
    print(f"[PASS] 7.1 Reusing previously verified OTP correctly rejected (single-use enforced).")

    # 8. Login with Email and Password
    print("\n--- 8. Testing Login with Verified Email Credentials ---")
    login_res = client.post('/api/auth/login/', {
        "email": test_email,
        "password": test_password,
    }, format='json')
    assert login_res.status_code == status.HTTP_200_OK, f"Expected 200, got {login_res.status_code}"
    login_data = login_res.data
    access_token = login_data.get('access') or login_data.get('tokens', {}).get('access')
    refresh_token = login_data.get('refresh') or login_data.get('tokens', {}).get('refresh')
    assert access_token is not None, "Expected access token in login response"
    assert refresh_token is not None, "Expected refresh token in login response"
    assert login_data['user']['email_verified'] is True, "Login response shows email_verified=True"
    print(f"[PASS] 8.1 Login succeeded; JWT access and refresh tokens minted for '{test_email}'.")

    # 9. Authenticated Profile Access (/api/auth/me/)
    print("\n--- 9. Testing Profile Access with Access Token ---")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
    me_res = client.get('/api/auth/me/')
    assert me_res.status_code == status.HTTP_200_OK, f"Expected 200, got {me_res.status_code}"
    assert me_res.data['email'] == test_email.lower()
    assert me_res.data['role'] == "STUDENT"
    print(f"[PASS] 9.1 /api/auth/me/ returned authenticated student profile: {me_res.data['name']} ({me_res.data['role']}).")

    # 10. Logout and Token Revocation
    print("\n--- 10. Testing Logout and Token Blacklisting ---")
    logout_res = client.post('/api/auth/logout/', {
        "refresh": refresh_token
    }, format='json')
    assert logout_res.status_code == status.HTTP_200_OK, f"Expected 200, got {logout_res.status_code}"
    print(f"[PASS] 10.1 Logout endpoint successfully revoked and blacklisted refresh token.")

    # 11. Attempt Refresh with Blacklisted Token
    print("\n--- 11. Verifying Blacklisted Token Cannot Be Refreshed ---")
    client.credentials()  # Clear auth header
    refresh_res = client.post('/api/auth/token/refresh/', {
        "refresh": refresh_token
    }, format='json')
    assert refresh_res.status_code == status.HTTP_401_UNAUTHORIZED, f"Expected 401 for blacklisted token, got {refresh_res.status_code}"
    print(f"[PASS] 11.1 Blacklisted refresh token cannot be refreshed (401 Unauthorized).")

    print("\n" + "=" * 80)
    print("ALL 11 EMAIL REGISTRATION, OTP, LOGIN & LOGOUT TESTS PASSED 100%!")
    print("=" * 80)

if __name__ == '__main__':
    run_tests()
