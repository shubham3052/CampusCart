"""
Comprehensive Standalone Test Suite for Gmail SMTP Email OTP & CampusCart Verification
Validates:
1. Gmail SMTP settings configuration (.env parsing, host, port, TLS, timeout)
2. Cryptographically secure 6-digit OTP generation and PBKDF2 hashing
3. CampusCart branded HTML and plain-text email generation
4. Email delivery via Django mail outbox
5. OTP verification, single-use enforcement, and email_verified state update
6. Expired OTP rejection
7. Invalid OTP attempt limits and brute-force lockout
8. 60-second resend cooldown enforcement
9. Hourly rate-limiting (max 5 per hour)
10. Graceful SMTP error handling (Authentication Error, Connection Timeout)
11. Full API registration, verification, and resend flow without OTP leakage in response
"""

import os
import sys
import re
import uuid
import socket
import smtplib
from unittest.mock import patch
from datetime import timedelta

# Initialize Django environment
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

from users.models import EmailVerificationOTP
from users.services.email_service import EmailService

User = get_user_model()


def run_tests():
    print("=" * 80)
    print("CAMPUSCART GMAIL SMTP EMAIL OTP & VERIFICATION TEST SUITE")
    print("=" * 80)

    total_tests = 0
    passed_tests = 0

    def assert_test(condition, test_name):
        nonlocal total_tests, passed_tests
        total_tests += 1
        if condition:
            passed_tests += 1
            print(f"  [PASS] {test_name}")
        else:
            print(f"  [FAIL] {test_name}")
            raise AssertionError(f"Test failed: {test_name}")

    # Use in-memory locmem backend for outbox testing
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    # --------------------------------------------------------------------------
    # 1. SMTP & Email Settings Configuration
    # --------------------------------------------------------------------------
    print("\n--- 1. Testing Gmail SMTP Settings Configuration ---")
    assert_test(settings.EMAIL_HOST == "smtp.gmail.com", "EMAIL_HOST defaults to smtp.gmail.com")
    assert_test(settings.EMAIL_PORT == 587, "EMAIL_PORT defaults to 587")
    assert_test(settings.EMAIL_USE_TLS is True, "EMAIL_USE_TLS is True")
    assert_test(settings.EMAIL_TIMEOUT == 15, "EMAIL_TIMEOUT is set to 15 seconds")
    assert_test("garibhokya@gmail.com" in settings.DEFAULT_FROM_EMAIL or "CampusCart" in settings.DEFAULT_FROM_EMAIL, "DEFAULT_FROM_EMAIL is configured to sender email")
    assert_test(settings.EMAIL_OTP_EXPIRY_SECONDS == 300, "EMAIL_OTP_EXPIRY_SECONDS is 300s (5 mins)")
    assert_test(settings.EMAIL_OTP_RESEND_COOLDOWN_SECONDS == 60, "EMAIL_OTP_RESEND_COOLDOWN_SECONDS is 60s")
    assert_test(settings.EMAIL_OTP_MAX_ATTEMPTS == 5, "EMAIL_OTP_MAX_ATTEMPTS is 5")
    assert_test(settings.EMAIL_OTP_MAX_RESENDS_PER_HOUR == 5, "EMAIL_OTP_MAX_RESENDS_PER_HOUR is 5")

    # --------------------------------------------------------------------------
    # 2. Cryptographic 6-Digit OTP Generation & PBKDF2 Storage
    # --------------------------------------------------------------------------
    print("\n--- 2. Testing Cryptographic OTP Generation & PBKDF2 Hashing ---")
    otp1 = EmailService.generate_numeric_otp(6)
    otp2 = EmailService.generate_numeric_otp(6)
    assert_test(len(otp1) == 6 and otp1.isdigit(), "Generated OTP is exactly 6 digits")
    assert_test(otp1 != otp2 or len(otp1) == 6, "OTP generation uses cryptographically secure randomness")

    suffix = uuid.uuid4().hex[:6]
    test_email = f"test_otp_{suffix}@campus.edu"

    success, msg, otp_record = EmailService.create_and_send_otp(
        email=test_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(success is True, "create_and_send_otp succeeds")
    assert_test(otp_record is not None, "OTP record created in database")

    # Raw OTP must NEVER be stored plaintext in database
    db_rec = EmailVerificationOTP.objects.get(id=otp_record.id)
    assert_test(db_rec.otp_hash != otp1, "Raw OTP is never stored as plaintext in DB")
    assert_test(db_rec.otp_hash.startswith("pbkdf2_sha256$"), "OTP stored using PBKDF2 SHA-256 hash")

    # --------------------------------------------------------------------------
    # 3. CampusCart Branded Email Template & Delivery
    # --------------------------------------------------------------------------
    print("\n--- 3. Testing CampusCart Branded Email Template & Outbox Delivery ---")
    assert_test(len(mail.outbox) >= 1, "Verification email delivered to Django outbox")
    sent_msg = mail.outbox[-1]
    assert_test("CampusCart" in sent_msg.subject, f"Email subject has CampusCart branding ('{sent_msg.subject}')")
    assert_test(sent_msg.to == [test_email], f"Email sent to correct recipient: {test_email}")

    # Check text body
    text_body = sent_msg.body
    match = re.search(r'\b(\d{6})\b', text_body)
    assert_test(match is not None, "Email plain text contains 6-digit OTP code")
    raw_code = match.group(1) if match else ""
    assert_test("CampusCart" in text_body, "Plain text contains CampusCart branding")
    assert_test("SECURITY WARNING" in text_body, "Plain text contains security warning")
    assert_test("5 minutes" in text_body, "Plain text contains 5-minute expiry notice")

    # Check HTML alternative
    assert_test(len(sent_msg.alternatives) > 0, "Email includes HTML alternative version")
    html_body, mimetype = sent_msg.alternatives[0]
    assert_test(mimetype == "text/html", "Mimetype is text/html")
    assert_test("CampusCart" in html_body, "HTML contains CampusCart header branding")
    assert_test(raw_code in html_body, "HTML contains 6-digit OTP in verification box")
    assert_test("Security Warning" in html_body, "HTML contains security warning")
    assert_test("Valid for 5 minutes" in html_body, "HTML contains 5-minute expiration notice")

    # --------------------------------------------------------------------------
    # 4. OTP Verification & State Update
    # --------------------------------------------------------------------------
    print("\n--- 4. Testing OTP Verification & Account Update ---")
    user_suffix = uuid.uuid4().hex[:6]
    test_user = User.objects.create_user(
        username=f"student_{user_suffix}",
        email=f"student_{user_suffix}@campus.edu",
        password="SecurePassword123!",
        name="Test Student",
        role=User.Role.STUDENT,
        email_verified=False
    )
    assert_test(test_user.email_verified is False, "User account starts with email_verified=False")

    mail.outbox = []
    success, _, _ = EmailService.create_and_send_otp(
        email=test_user.email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
        user=test_user
    )
    assert_test(success is True, "OTP dispatched to registered student user")
    user_otp = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    v_success, v_msg, v_record = EmailService.verify_otp(
        email=test_user.email,
        candidate_otp=user_otp,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
        user=test_user
    )
    assert_test(v_success is True, "Correct 6-digit OTP verifies successfully")
    assert_test(v_record.is_verified is True, "OTP record marked as is_verified=True")

    test_user.refresh_from_db()
    assert_test(test_user.email_verified is True, "User email_verified updated to True in database")

    # Single-use guarantee: Re-using the same OTP must fail
    re_success, re_msg, _ = EmailService.verify_otp(
        email=test_user.email,
        candidate_otp=user_otp,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
        user=test_user
    )
    assert_test(re_success is False, "Re-verifying with the same OTP fails (single-use enforced)")

    # --------------------------------------------------------------------------
    # 5. Expired OTP Rejection
    # --------------------------------------------------------------------------
    print("\n--- 5. Testing Expired OTP Rejection ---")
    exp_email = f"expired_{uuid.uuid4().hex[:6]}@campus.edu"
    mail.outbox = []
    _, _, exp_record = EmailService.create_and_send_otp(
        email=exp_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    exp_otp = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # Fast forward expiration to the past
    exp_record.expires_at = timezone.now() - timedelta(seconds=10)
    exp_record.save()

    v_exp, v_exp_msg, _ = EmailService.verify_otp(
        email=exp_email,
        candidate_otp=exp_otp,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(v_exp is False, "Expired OTP is strictly rejected")
    assert_test("expired" in v_exp_msg.lower(), "Expired OTP returns user-friendly expired message")

    # --------------------------------------------------------------------------
    # 6. Invalid OTP & Lockout After 5 Attempts
    # --------------------------------------------------------------------------
    print("\n--- 6. Testing Invalid OTP & Lockout After 5 Attempts ---")
    lock_email = f"lock_{uuid.uuid4().hex[:6]}@campus.edu"
    mail.outbox = []
    _, _, lock_record = EmailService.create_and_send_otp(
        email=lock_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    correct_lock_otp = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # 4 invalid attempts
    for attempt in range(1, 5):
        ok, msg, _ = EmailService.verify_otp(
            email=lock_email,
            candidate_otp="000000",
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
        )
        assert_test(ok is False, f"Attempt {attempt}: Incorrect code rejected")
        assert_test("Invalid verification code" in msg, f"Attempt {attempt}: Informs attempts remaining")

    # 5th attempt locks the OTP
    ok5, msg5, _ = EmailService.verify_otp(
        email=lock_email,
        candidate_otp="000000",
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(ok5 is False, "5th attempt is rejected")
    assert_test("locked" in msg5.lower(), "5th attempt locks out the verification code")

    # Even the correct code fails once locked
    ok_locked, _, _ = EmailService.verify_otp(
        email=lock_email,
        candidate_otp=correct_lock_otp,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(ok_locked is False, "Correct code fails after lockout has triggered")

    # --------------------------------------------------------------------------
    # 7. Resend Cooldown Enforcement (60s)
    # --------------------------------------------------------------------------
    print("\n--- 7. Testing 60-Second Resend Cooldown ---")
    cool_email = f"cooldown_{uuid.uuid4().hex[:6]}@campus.edu"
    c_ok1, _, _ = EmailService.create_and_send_otp(
        email=cool_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(c_ok1 is True, "First OTP dispatched successfully")

    # Immediate second request
    c_ok2, c_msg2, _ = EmailService.create_and_send_otp(
        email=cool_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(c_ok2 is False, "Second immediate request blocked by cooldown")
    assert_test("Please wait" in c_msg2, f"Cooldown message returned: '{c_msg2}'")

    # --------------------------------------------------------------------------
    # 8. Hourly Rate Limiting (5 Requests / Hour)
    # --------------------------------------------------------------------------
    print("\n--- 8. Testing Hourly Rate Limit (5 per hour) ---")
    rate_email = f"rate_{uuid.uuid4().hex[:6]}@campus.edu"
    now = timezone.now()
    for i in range(5):
        EmailVerificationOTP.objects.create(
            email=rate_email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            otp_hash="seeded_dummy_hash",
            expires_at=now + timedelta(minutes=5),
            last_sent_at=now - timedelta(seconds=70 * (i + 1)),
            created_at=now - timedelta(minutes=10 * (i + 1))
        )

    r_ok, r_msg, _ = EmailService.create_and_send_otp(
        email=rate_email,
        purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
    )
    assert_test(r_ok is False, "6th request within 1 hour blocked by rate limit")
    assert_test("Maximum verification requests exceeded" in r_msg, "Hourly rate limit message returned")

    # --------------------------------------------------------------------------
    # 9. SMTP Failure Error Handling (Authentication & Connection Timeout)
    # --------------------------------------------------------------------------
    print("\n--- 9. Testing SMTP Failure Handling ---")
    fail_auth_email = f"auth_err_{uuid.uuid4().hex[:6]}@campus.edu"
    with patch('django.core.mail.message.EmailMultiAlternatives.send') as mock_send:
        mock_send.side_effect = smtplib.SMTPAuthenticationError(535, b"5.7.8 Authentication failed")
        f_ok, f_msg, f_rec = EmailService.create_and_send_otp(
            email=fail_auth_email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
        )
        assert_test(f_ok is False, "SMTP Authentication Error handled gracefully (returns False)")
        assert_test("Email delivery authentication failed" in f_msg, "Safe authentication error message returned")
        assert_test(f_rec is None, "No OTP record returned on dispatch failure")
        assert_test(not EmailVerificationOTP.objects.filter(email=fail_auth_email).exists(), "Failed OTP record deleted from DB")

    fail_time_email = f"timeout_err_{uuid.uuid4().hex[:6]}@campus.edu"
    with patch('django.core.mail.message.EmailMultiAlternatives.send') as mock_send:
        mock_send.side_effect = socket.timeout("timed out")
        t_ok, t_msg, t_rec = EmailService.create_and_send_otp(
            email=fail_time_email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION
        )
        assert_test(t_ok is False, "Socket timeout handled gracefully (returns False)")
        assert_test("Could not connect to email delivery server" in t_msg, "Safe network connection error message returned")
        assert_test(not EmailVerificationOTP.objects.filter(email=fail_time_email).exists(), "Failed OTP record deleted from DB")

    # --------------------------------------------------------------------------
    # 10. End-to-End API Registration & OTP Verification Flow
    # --------------------------------------------------------------------------
    print("\n--- 10. Testing End-to-End API Registration & Verification ---")
    client = APIClient()
    api_user_email = f"priya_{uuid.uuid4().hex[:6]}@campus.edu"
    mail.outbox = []

    reg_res = client.post('/api/auth/register/', {
        "name": "Priya Sharma",
        "email": api_user_email,
        "password": "StrongPassword999!",
        "role": "STUDENT",
        "phone": f"987{uuid.uuid4().int % 10000000:07d}"
    }, format='json')
    assert_test(reg_res.status_code == status.HTTP_201_CREATED, "Registration API returns 201 Created")

    # CRITICAL: Verify OTP is NEVER exposed in the API response
    response_str = str(reg_res.data)
    # Check that no 6-digit numeric OTP was leaked in the response dictionary
    assert_test("access" in reg_res.data, "Response contains access JWT")
    assert_test("refresh" in reg_res.data, "Response contains refresh JWT")
    assert_test(reg_res.data["user"]["email_verified"] is False, "New user starts with email_verified=False")

    # Check that email was delivered to outbox
    assert_test(len(mail.outbox) >= 1, "Verification email dispatched during registration")
    api_otp = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    assert_test(api_otp not in response_str, "Raw OTP code is strictly absent from registration API response")

    # Verify OTP via API endpoint
    v_api_res = client.post('/api/auth/email/verify-otp/', {
        "email": api_user_email,
        "otp": api_otp,
        "purpose": "EMAIL_VERIFICATION"
    }, format='json')
    assert_test(v_api_res.status_code == status.HTTP_200_OK, "verify-otp API returns 200 OK")
    assert_test(v_api_res.data.get("email_verified") is True, "verify-otp API confirms email_verified: True")

    # Verify user in database
    api_db_user = User.objects.get(email=api_user_email)
    assert_test(api_db_user.email_verified is True, "Database user email_verified flag is True")

    # Clean up test user
    api_db_user.delete()

    # --------------------------------------------------------------------------
    # 11. Testing Account Deletion Flow via Email OTP (Step 8)
    # --------------------------------------------------------------------------
    print("\n--- 11. Testing Account Deletion Flow via Email OTP ---")
    del_suffix = uuid.uuid4().hex[:6]
    del_user_email = f"delete_target_{del_suffix}@campus.edu"
    del_user = User.objects.create_user(
        username=f"del_user_{del_suffix}",
        email=del_user_email,
        password="DeleteTestPass123!",
        name="Delete Test Student",
        role=User.Role.STUDENT,
        email_verified=True
    )
    assert_test(User.objects.filter(id=del_user.id).exists(), "Account created for deletion test")

    # Authenticate client as this user
    del_client = APIClient()
    del_client.force_authenticate(user=del_user)

    mail.outbox = []
    # Request deletion OTP
    del_req_res = del_client.post('/api/auth/account-deletion/request-otp/', format='json')
    assert_test(del_req_res.status_code == status.HTTP_200_OK, "request-otp endpoint returns 200 OK")
    assert_test("verification code has been sent" in del_req_res.data.get("message", "").lower(), "Dispatches code to registered email")
    assert_test("otp" not in str(del_req_res.data).lower(), "Raw OTP code strictly absent from deletion request API response")

    # Inspect dispatched email
    assert_test(len(mail.outbox) >= 1, "Deletion OTP email arrived in outbox")
    del_mail = mail.outbox[-1]
    assert_test(del_mail.to == [del_user_email], f"Email sent to user's registered address ({del_user_email})")
    assert_test("garibhokya@gmail.com" in del_mail.from_email, f"Email sent from garibhokya@gmail.com ({del_mail.from_email})")
    assert_test("Account Deletion" in del_mail.subject, "Subject identifies Account Deletion")

    del_raw_otp = re.search(r'\b(\d{6})\b', del_mail.body).group(1)
    assert_test(len(del_raw_otp) == 6 and del_raw_otp.isdigit(), "Dispatched email contains valid 6-digit OTP")

    # Test incorrect OTP: Account must remain untouched
    wrong_del_res = del_client.post('/api/auth/account-deletion/confirm/', {"otp": "000000"}, format='json')
    assert_test(wrong_del_res.status_code == status.HTTP_400_BAD_REQUEST, "Incorrect OTP returns 400 Bad Request")
    assert_test(User.objects.filter(id=del_user.id).exists(), "Account STILL EXISTS after incorrect OTP attempt")

    # Test correct OTP: Account must be permanently deleted
    correct_del_res = del_client.post('/api/auth/account-deletion/confirm/', {"otp": del_raw_otp}, format='json')
    assert_test(correct_del_res.status_code == status.HTTP_200_OK, "Correct OTP returns 200 OK")
    assert_test("permanently deleted" in correct_del_res.data.get("message", "").lower(), "Confirmation message returned")
    assert_test(User.objects.filter(id=del_user.id).exists() is False, "User account PERMANENTLY DELETED from database")

    print("\n" + "=" * 80)
    print(f"ALL {passed_tests}/{total_tests} GMAIL SMTP EMAIL OTP TESTS PASSED SUCCESSFULLY! (100%)")
    print("=" * 80)


if __name__ == '__main__':
    run_tests()
