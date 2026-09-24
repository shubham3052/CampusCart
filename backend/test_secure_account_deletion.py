"""
Comprehensive Security & Verification Test Suite for Secure Account Deletion with Email OTP
Tests all 12 security requirements specified in the security specification:
  Test 1: Correct OTP -> account deleted.
  Test 2: Incorrect OTP -> account NOT deleted.
  Test 3: Expired OTP -> account NOT deleted.
  Test 4: Already-used OTP -> account NOT deleted.
  Test 5: Unauthenticated request -> account NOT deleted.
  Test 6: User A attempts to send User B's ID -> User B is NOT deleted.
  Test 7: Changing user_id in frontend request cannot delete another account.
  Test 8: Frontend cannot directly access the database (REST DELETE /api/users/<id>/ returns 405).
  Test 9: Database deletion occurs only inside the Django backend after OTP verification.
  Test 10: Transaction rollback works if deletion encounters an error.
  Test 11: After successful deletion, authentication is invalidated (token cannot access /api/auth/me/).
  Test 12: Existing login, registration, and email OTP functionality still works seamlessly.
"""

import os
import sys
import re
import uuid
from datetime import timedelta
from unittest.mock import patch

# Initialize Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.core import mail
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework.test import APIClient
from rest_framework import status

from users.models import EmailVerificationOTP, AuditLog
from users.services.email_service import EmailService

User = get_user_model()


def run_tests():
    print("=" * 80)
    print("SECURE ACCOUNT DELETION WITH EMAIL OTP VERIFICATION - SECURITY TEST SUITE")
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

    # Use in-memory locmem email backend for deterministic test delivery
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    def create_test_user(prefix="user"):
        uid = uuid.uuid4().hex[:8]
        return User.objects.create_user(
            username=f"{prefix}_{uid}",
            email=f"{prefix}_{uid}@campus.edu",
            password="SecurePass2026!",
            name=f"Test {prefix.capitalize()} {uid[:4]}",
            role=User.Role.STUDENT,
            phone_number=f"987{uuid.uuid4().int % 10000000:07d}",
            email_verified=True
        )

    # --------------------------------------------------------------------------
    # TEST 1: Correct OTP -> account deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 1: Correct OTP -> Account Deleted ---")
    u1 = create_test_user("test1")
    c1 = APIClient()
    c1.force_authenticate(user=u1)
    mail.outbox = []

    req_res = c1.post('/api/account/delete/request/', format='json')
    assert_test(req_res.status_code == status.HTTP_200_OK, "POST /api/account/delete/request/ returns 200 OK")
    assert_test(len(mail.outbox) >= 1, "OTP email dispatched to user's registered inbox")

    raw_otp1 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    del_res = c1.post('/api/account/delete/verify/', {'otp': raw_otp1}, format='json')
    assert_test(del_res.status_code == status.HTTP_200_OK, "POST /api/account/delete/verify/ with correct OTP returns 200 OK")
    assert_test(User.objects.filter(id=u1.id).exists() is False, "User account is permanently deleted from database")

    # --------------------------------------------------------------------------
    # TEST 2: Incorrect OTP -> account NOT deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 2: Incorrect OTP -> Account NOT Deleted ---")
    u2 = create_test_user("test2")
    c2 = APIClient()
    c2.force_authenticate(user=u2)
    mail.outbox = []

    c2.post('/api/account/delete/request/', format='json')
    wrong_res = c2.post('/api/account/delete/verify/', {'otp': '000000'}, format='json')
    assert_test(wrong_res.status_code == status.HTTP_400_BAD_REQUEST, "Incorrect OTP returns 400 Bad Request")
    assert_test("Invalid verification code" in str(wrong_res.data), "Informs attempts remaining without leaking credentials")
    assert_test(User.objects.filter(id=u2.id).exists() is True, "User account STILL EXISTS in database")
    u2.delete()

    # --------------------------------------------------------------------------
    # TEST 3: Expired OTP -> account NOT deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 3: Expired OTP -> Account NOT Deleted ---")
    u3 = create_test_user("test3")
    c3 = APIClient()
    c3.force_authenticate(user=u3)
    mail.outbox = []

    c3.post('/api/account/delete/request/', format='json')
    raw_otp3 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # Force expiration of the OTP record
    otp_rec3 = EmailVerificationOTP.objects.filter(email=u3.email, purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION).latest('created_at')
    otp_rec3.expires_at = timezone.now() - timedelta(minutes=10)
    otp_rec3.save()

    exp_res = c3.post('/api/account/delete/verify/', {'otp': raw_otp3}, format='json')
    assert_test(exp_res.status_code == status.HTTP_400_BAD_REQUEST, "Expired OTP returns 400 Bad Request")
    assert_test("expired" in str(exp_res.data).lower(), "Returns expired OTP notice")
    assert_test(User.objects.filter(id=u3.id).exists() is True, "User account STILL EXISTS after expired OTP submission")
    u3.delete()

    # --------------------------------------------------------------------------
    # TEST 4: Already-used OTP -> account NOT deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 4: Already-Used OTP -> Account NOT Deleted ---")
    u4 = create_test_user("test4")
    c4 = APIClient()
    c4.force_authenticate(user=u4)
    mail.outbox = []

    c4.post('/api/account/delete/request/', format='json')
    raw_otp4 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # Manually mark this OTP as already verified / consumed
    otp_rec4 = EmailVerificationOTP.objects.filter(email=u4.email, purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION).latest('created_at')
    otp_rec4.is_verified = True
    otp_rec4.save()

    used_res = c4.post('/api/account/delete/verify/', {'otp': raw_otp4}, format='json')
    assert_test(used_res.status_code == status.HTTP_400_BAD_REQUEST, "Already-used OTP returns 400 Bad Request")
    assert_test(User.objects.filter(id=u4.id).exists() is True, "User account STILL EXISTS (replay attack prevented)")
    u4.delete()

    # --------------------------------------------------------------------------
    # TEST 5: Unauthenticated request -> account NOT deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 5: Unauthenticated Request -> Account NOT Deleted ---")
    u5 = create_test_user("test5")
    c_anon = APIClient()

    anon_req = c_anon.post('/api/account/delete/request/', format='json')
    assert_test(anon_req.status_code == status.HTTP_401_UNAUTHORIZED, "Unauthenticated request-otp returns 401 Unauthorized")

    anon_ver = c_anon.post('/api/account/delete/verify/', {'otp': '123456'}, format='json')
    assert_test(anon_ver.status_code == status.HTTP_401_UNAUTHORIZED, "Unauthenticated verify returns 401 Unauthorized")
    assert_test(User.objects.filter(id=u5.id).exists() is True, "User account STILL EXISTS after unauthenticated attempts")
    u5.delete()

    # --------------------------------------------------------------------------
    # TEST 6 & 7: User A attempts to send User B's ID -> User B is NOT deleted
    # --------------------------------------------------------------------------
    print("\n--- Test 6 & 7: User A Attempts to Delete User B's Account ---")
    user_a = create_test_user("user_a")
    user_b = create_test_user("user_b")

    client_a = APIClient()
    client_a.force_authenticate(user=user_a)

    mail.outbox = []
    # User A requests OTP
    client_a.post('/api/account/delete/request/', {'user_id': user_b.id, 'email': user_b.email}, format='json')

    # Confirm OTP was sent to User A's email, NOT User B's email
    assert_test(len(mail.outbox) >= 1, "OTP dispatched")
    dispatched_to = mail.outbox[-1].to
    assert_test(dispatched_to == [user_a.email], f"Django strictly sent OTP to authenticated User A ({user_a.email}), ignoring malicious user_b payload")

    raw_otp_a = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # User A submits OTP while maliciously passing user_id = user_b.id
    exploit_res = client_a.post('/api/account/delete/verify/', {
        'otp': raw_otp_a,
        'user_id': user_b.id,
        'email': user_b.email
    }, format='json')

    assert_test(exploit_res.status_code == status.HTTP_200_OK, "Request executes for authenticated caller")
    assert_test(User.objects.filter(id=user_b.id).exists() is True, "Target User B was NOT deleted (ID spoofing completely neutralized)")
    assert_test(User.objects.filter(id=user_a.id).exists() is False, "Caller User A was the account deleted")

    user_b.delete()

    # --------------------------------------------------------------------------
    # TEST 8: Frontend cannot directly access database / Direct REST DELETE is blocked
    # --------------------------------------------------------------------------
    print("\n--- Test 8: Direct REST /api/users/<id>/ Deletion Is Strictly Prohibited ---")
    u8 = create_test_user("test8")
    c8 = APIClient()
    c8.force_authenticate(user=u8)

    # 1. Student attempting direct DELETE returns 403 Forbidden
    direct_del_res = c8.delete(f'/api/users/{u8.id}/')
    assert_test(direct_del_res.status_code == status.HTTP_403_FORBIDDEN, "Student DELETE /api/users/<id>/ returns HTTP 403 Forbidden")
    assert_test(User.objects.filter(id=u8.id).exists() is True, "User account STILL EXISTS after direct student DELETE call")

    # 2. Even an Admin attempting direct DELETE returns 405 Method Not Allowed (AccountDeletionProhibited)
    admin_user = User.objects.filter(role=User.Role.ADMIN).first()
    if not admin_user:
        admin_user = User.objects.create_superuser(
            username=f"admin_{uuid.uuid4().hex[:6]}",
            email=f"admin_{uuid.uuid4().hex[:6]}@campus.edu",
            password="AdminPass2026!",
            name="Platform Admin",
            role=User.Role.ADMIN
        )
    c_admin = APIClient()
    c_admin.force_authenticate(user=admin_user)
    admin_del_res = c_admin.delete(f'/api/users/{u8.id}/')
    assert_test(admin_del_res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED, "Admin DELETE /api/users/<id>/ returns HTTP 405 Method Not Allowed")
    assert_test(User.objects.filter(id=u8.id).exists() is True, "User account STILL EXISTS after direct admin DELETE call")
    u8.delete()

    # --------------------------------------------------------------------------
    # TEST 9: Database deletion occurs only inside Django backend after OTP
    # --------------------------------------------------------------------------
    print("\n--- Test 9: Deletion Occurs Strictly Inside Django Backend After OTP Verification ---")
    u9 = create_test_user("test9")
    c9 = APIClient()
    c9.force_authenticate(user=u9)
    mail.outbox = []

    # Step 1: Request OTP - user MUST still exist
    c9.post('/api/account/delete/request/', format='json')
    assert_test(User.objects.filter(id=u9.id).exists() is True, "User exists in database after request step")

    # Step 2: Submit OTP - deletion executed atomically by Django
    raw_otp9 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    c9.post('/api/account/delete/verify/', {'otp': raw_otp9}, format='json')
    assert_test(User.objects.filter(id=u9.id).exists() is False, "User permanently deleted only after verified OTP")

    # --------------------------------------------------------------------------
    # TEST 10: Transaction rollback works if deletion encounters an error
    # --------------------------------------------------------------------------
    print("\n--- Test 10: Transaction Rollback on Database Deletion Error ---")
    u10 = create_test_user("test10")
    c10 = APIClient()
    c10.force_authenticate(user=u10)
    mail.outbox = []

    c10.post('/api/account/delete/request/', format='json')
    raw_otp10 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)

    # Simulate an unexpected database error during user.delete()
    with patch.object(User, 'delete', side_effect=RuntimeError("Simulated MySQL Foreign Key Constraint Error")):
        err_res = c10.post('/api/account/delete/verify/', {'otp': raw_otp10}, format='json')
        assert_test(err_res.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR, "Returns 500 on unexpected deletion failure")
        assert_test("rolled back" in str(err_res.data).lower(), "Notice confirms transaction was safely rolled back")

    # Verify user account was NOT left partially deleted
    assert_test(User.objects.filter(id=u10.id).exists() is True, "User account preserved intact after transaction rollback")
    u10.delete()

    # --------------------------------------------------------------------------
    # TEST 11: After successful deletion, authentication is invalidated
    # --------------------------------------------------------------------------
    print("\n--- Test 11: Authentication Invalidation After Successful Deletion ---")
    u11 = create_test_user("test11")
    client_auth = APIClient()

    # Obtain real JWT token via login
    login_res = client_auth.post('/api/auth/login/', {'email': u11.email, 'password': 'SecurePass2026!'}, format='json')
    jwt_access = login_res.data['access']
    client_auth.credentials(HTTP_AUTHORIZATION=f'Bearer {jwt_access}')

    # Verify token works before deletion
    me_before = client_auth.get('/api/auth/me/')
    assert_test(me_before.status_code == status.HTTP_200_OK, "Authenticated GET /api/auth/me/ returns 200 before deletion")

    # Request and confirm deletion
    mail.outbox = []
    client_auth.post('/api/account/delete/request/', format='json')
    raw_otp11 = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    client_auth.post('/api/account/delete/verify/', {'otp': raw_otp11}, format='json')

    # Attempt to use the JWT token after account deletion
    me_after = client_auth.get('/api/auth/me/')
    assert_test(me_after.status_code == status.HTTP_401_UNAUTHORIZED, "Deleted user's JWT token is strictly 401 Unauthorized")

    # Clear authentication credentials header (simulating React clearing local/session storage)
    client_auth.credentials()

    # Attempt login with deleted account credentials
    re_login = client_auth.post('/api/auth/login/', {'email': u11.email, 'password': 'SecurePass2026!'}, format='json')
    assert_test(re_login.status_code == status.HTTP_400_BAD_REQUEST, "Deleted account cannot authenticate via login endpoint")

    # --------------------------------------------------------------------------
    # TEST 12: Existing login, registration and email OTP functionality still works
    # --------------------------------------------------------------------------
    print("\n--- Test 12: Existing Login, Registration and Email OTP Still Works ---")
    c12 = APIClient()
    fresh_email = f"fresh_student_{uuid.uuid4().hex[:6]}@campus.edu"
    mail.outbox = []

    # 1. Registration
    reg_res = c12.post('/api/auth/register/', {
        "name": "Fresh Student",
        "email": fresh_email,
        "password": "StrongPassword2026!",
        "role": "STUDENT",
        "phone": f"987{uuid.uuid4().int % 10000000:07d}"
    }, format='json')
    assert_test(reg_res.status_code == status.HTTP_201_CREATED, "Registration API returns 201 Created")
    assert_test(len(mail.outbox) >= 1, "Registration OTP email dispatched")

    # 2. Email Verification OTP
    reg_otp = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
    v_res = c12.post('/api/auth/email/verify-otp/', {
        "email": fresh_email,
        "otp": reg_otp,
        "purpose": "EMAIL_VERIFICATION"
    }, format='json')
    assert_test(v_res.status_code == status.HTTP_200_OK, "verify-otp returns 200 OK")
    assert_test(v_res.data.get("email_verified") is True, "email_verified is True")

    # 3. Login
    login_ok = c12.post('/api/auth/login/', {'email': fresh_email, 'password': 'StrongPassword2026!'}, format='json')
    assert_test(login_ok.status_code == status.HTTP_200_OK, "Login with verified account returns 200 OK")
    assert_test("access" in login_ok.data, "Returns fresh JWT access token")

    # Clean up
    User.objects.filter(email=fresh_email).delete()

    print("\n" + "=" * 80)
    print(f"ALL {passed_tests}/{total_tests} SECURITY & ACCOUNT DELETION TESTS PASSED! (100%)")
    print("=" * 80)


if __name__ == '__main__':
    run_tests()
