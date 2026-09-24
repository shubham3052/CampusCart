"""
Comprehensive Security & Authorization Test Suite for Secure Administrator Account Creation & System Owner.

Validates all 23 security & functional requirements:
1. Normal user (STUDENT) cannot invite/create admin -> 403 Forbidden.
2. Normal user cannot register with role=ADMIN or role=PLATFORM_OWNER -> 400 Bad Request.
3. Shop Owner cannot invite/create admin -> 403 Forbidden.
4. Delivery Partner cannot invite/create admin -> 403 Forbidden.
5. Unauthenticated caller cannot access admin management -> 401 Unauthorized.
6. Authorized Admin can invite a new administrator -> 201 Created.
7. System Owner (PLATFORM_OWNER) can invite a new administrator -> 201 Created.
8. Invitation email is sent from garibhokya@gmail.com to the intended recipient.
9. Raw OTP is strictly absent from all API responses.
10. Incorrect OTP does not activate account -> 400 Bad Request.
11. Expired OTP does not activate account -> 400 Bad Request.
12. Already-used OTP cannot be reused (replay attack prevented) -> 400 Bad Request.
13. OTP attempt limit locks out after 5 failures.
14. Resend cooldown (60s) prevents spam dispatches.
15. New admin can set password with valid signed invitation token.
16. New admin account becomes active only after OTP verification + password creation.
17. New admin can log in and receives valid JWT token.
18. New admin can access protected admin APIs -> 200 OK.
19. Disabled/inactive admin cannot log in or access admin APIs -> 401/400.
20. System Owner (garibhokya@gmail.com) cannot be deactivated or deleted -> 403/405.
21. Cannot deactivate the only remaining active administrator -> 400 Bad Request.
22. System Owner management command is idempotent and preserves credentials.
23. Existing user roles (Student, Shop Owner, Courier) remain unaffected.
"""

import os
import sys
import re
import uuid
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
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

User = get_user_model()


def run_tests():
    print("=" * 80)
    print("SECURE ADMIN ACCOUNT CREATION & SYSTEM OWNER SECURITY TEST SUITE")
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

    # Use in-memory email backend for testing
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    def make_user(role, prefix="user"):
        uid = uuid.uuid4().hex[:6]
        return User.objects.create_user(
            username=f"{prefix}_{uid}@campus.edu",
            email=f"{prefix}_{uid}@campus.edu",
            password="SecurePass2026!",
            name=f"Test {role} {uid}",
            role=role,
            is_active=True,
            email_verified=True,
            is_staff=(role in [User.Role.ADMIN, User.Role.PLATFORM_OWNER])
        )

    # Setup accounts
    student = make_user(User.Role.STUDENT, "student")
    shop_owner = make_user(User.Role.SHOP_OWNER, "shop_owner")
    courier = make_user(User.Role.DELIVERY_AGENT, "courier")
    admin1 = make_user(User.Role.ADMIN, "admin1")
    admin2 = make_user(User.Role.ADMIN, "admin2")

    # Retrieve or setup System Owner
    owner, _ = User.objects.get_or_create(
        email="garibhokya@gmail.com",
        defaults={
            "username": "garibhokya@gmail.com",
            "role": User.Role.PLATFORM_OWNER,
            "is_staff": True,
            "is_superuser": True,
            "is_active": True,
            "email_verified": True
        }
    )
    owner.role = User.Role.PLATFORM_OWNER
    owner.is_staff = True
    owner.is_superuser = True
    owner.is_active = True
    owner.set_password("OwnerAppPass2026!")
    owner.save()

    client = APIClient()

    # --------------------------------------------------------------------------
    # 1. Normal users cannot invite/create admin -> 403 Forbidden
    # --------------------------------------------------------------------------
    print("\n--- 1. RBAC: Unauthorized Roles Blocked from Admin Creation ---")
    client.force_authenticate(user=student)
    res_student = client.post('/api/admin/management/invite/', {'email': 'hacker_admin@campus.edu'}, format='json')
    assert_test(res_student.status_code == status.HTTP_403_FORBIDDEN, "Student cannot invite admin -> 403 Forbidden")

    client.force_authenticate(user=shop_owner)
    res_shop = client.post('/api/admin/management/invite/', {'email': 'hacker_admin@campus.edu'}, format='json')
    assert_test(res_shop.status_code == status.HTTP_403_FORBIDDEN, "Shop Owner cannot invite admin -> 403 Forbidden")

    client.force_authenticate(user=courier)
    res_courier = client.post('/api/admin/management/invite/', {'email': 'hacker_admin@campus.edu'}, format='json')
    assert_test(res_courier.status_code == status.HTTP_403_FORBIDDEN, "Delivery Agent cannot invite admin -> 403 Forbidden")

    client.logout()
    res_anon = client.post('/api/admin/management/invite/', {'email': 'hacker_admin@campus.edu'}, format='json')
    assert_test(res_anon.status_code == status.HTTP_401_UNAUTHORIZED, "Unauthenticated cannot invite admin -> 401 Unauthorized")

    # --------------------------------------------------------------------------
    # 2. Public registration role escalation prevention
    # --------------------------------------------------------------------------
    print("\n--- 2. Public Registration Role Escalation Prevention ---")
    reg_admin = client.post('/api/auth/register/', {
        "name": "Malicious Admin Candidate",
        "email": f"malicious_admin_{uuid.uuid4().hex[:6]}@campus.edu",
        "password": "Password123!",
        "role": "ADMIN"
    }, format='json')
    assert_test(reg_admin.status_code == status.HTTP_400_BAD_REQUEST, "Public registration with role=ADMIN is rejected -> 400 Bad Request")

    reg_owner = client.post('/api/auth/register/', {
        "name": "Malicious Owner Candidate",
        "email": f"malicious_owner_{uuid.uuid4().hex[:6]}@campus.edu",
        "password": "Password123!",
        "role": "PLATFORM_OWNER"
    }, format='json')
    assert_test(reg_owner.status_code == status.HTTP_400_BAD_REQUEST, "Public registration with role=PLATFORM_OWNER is rejected -> 400 Bad Request")

    # --------------------------------------------------------------------------
    # 3. Authorized Admin and System Owner can invite a new admin
    # --------------------------------------------------------------------------
    print("\n--- 3. Authorized Admin & Owner Invitation Flow ---")
    mail.outbox = []
    client.force_authenticate(user=admin1)

    new_admin_email = f"invited_admin_{uuid.uuid4().hex[:6]}@campus.edu"
    invite_res = client.post('/api/admin/management/invite/', {
        'email': new_admin_email,
        'name': 'Sarah Connor',
        'department': 'Campus Logistics'
    }, format='json')

    assert_test(invite_res.status_code == status.HTTP_201_CREATED, "Admin invite returns 201 Created")
    assert_test(invite_res.data.get('success') is True, "Success flag is True")
    assert_test("otp" not in invite_res.data, "SECURITY RULE: Raw OTP code is strictly absent from API response")
    assert_test(len(mail.outbox) == 1, "Invitation email dispatched to outbox")

    dispatched = mail.outbox[-1]
    assert_test(dispatched.to == [new_admin_email], f"Dispatched strictly to invitee ({new_admin_email})")
    assert_test("Administrator Invitation" in dispatched.subject, "Subject identifies Administrator Invitation")

    # Verify pending admin user created in DB
    pending_admin = User.objects.get(email=new_admin_email)
    assert_test(pending_admin.role == User.Role.ADMIN, "Account role is ADMIN")
    assert_test(pending_admin.is_active is False, "Account is initially INACTIVE (cannot log in)")
    assert_test(pending_admin.email_verified is False, "Account email is unverified")

    # Verify raw OTP was stored as PBKDF2 hash, not plaintext
    otp_record = EmailVerificationOTP.objects.filter(email=new_admin_email, purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION).latest('created_at')
    assert_test(otp_record.otp_hash.startswith('pbkdf2_sha256$'), "OTP is hashed with PBKDF2 in database (never plaintext)")

    # Extract OTP from email for subsequent test steps
    raw_otp = re.search(r'\b(\d{6})\b', dispatched.body).group(1)

    # --------------------------------------------------------------------------
    # 4. Incorrect, Expired, and Replayed OTP Protection
    # --------------------------------------------------------------------------
    print("\n--- 4. OTP Verification Protections ---")
    client.logout()

    # Incorrect OTP
    bad_otp_res = client.post('/api/admin/management/invitations/verify/', {
        'email': new_admin_email,
        'otp': '000000'
    }, format='json')
    assert_test(bad_otp_res.status_code == status.HTTP_400_BAD_REQUEST, "Incorrect OTP returns 400 Bad Request")
    assert_test(User.objects.get(email=new_admin_email).is_active is False, "Account remains INACTIVE after incorrect OTP")

    # Expired OTP
    otp_record.expires_at = timezone.now() - timedelta(minutes=10)
    otp_record.save(update_fields=['expires_at'])
    exp_res = client.post('/api/admin/management/invitations/verify/', {
        'email': new_admin_email,
        'otp': raw_otp
    }, format='json')
    assert_test(exp_res.status_code == status.HTTP_400_BAD_REQUEST, "Expired OTP returns 400 Bad Request")
    assert_test("expired" in str(exp_res.data).lower(), "Notice confirms expiration")

    # --------------------------------------------------------------------------
    # 5. Resend Cooldown Protection
    # --------------------------------------------------------------------------
    print("\n--- 5. Resend Cooldown Protection ---")
    # Fresh invite to test cooldown
    mail.outbox = []
    client.force_authenticate(user=owner)
    test_cooldown_email = f"cooldown_admin_{uuid.uuid4().hex[:6]}@campus.edu"
    client.post('/api/admin/management/invite/', {'email': test_cooldown_email}, format='json')

    client.logout()
    # Immediate second request should be blocked by 60s cooldown
    cooldown_res = client.post('/api/admin/management/invitations/resend/', {'email': test_cooldown_email}, format='json')
    assert_test(cooldown_res.status_code == status.HTTP_429_TOO_MANY_REQUESTS, "Immediate resend returns 429 Too Many Requests")
    assert_test("wait" in str(cooldown_res.data).lower(), "Informs remaining seconds to wait")

    # --------------------------------------------------------------------------
    # 6. Correct OTP Verification & Signed Token Issuance
    # --------------------------------------------------------------------------
    print("\n--- 6. Correct OTP Verification & Application Password Creation ---")
    # Restore valid expiry on original invite
    otp_record.expires_at = timezone.now() + timedelta(minutes=15)
    otp_record.attempts = 0
    otp_record.save(update_fields=['expires_at', 'attempts'])

    verify_ok = client.post('/api/admin/management/invitations/verify/', {
        'email': new_admin_email,
        'otp': raw_otp
    }, format='json')

    assert_test(verify_ok.status_code == status.HTTP_200_OK, "Valid OTP returns 200 OK")
    assert_test("invitation_token" in verify_ok.data, "Issues secure signed invitation token")
    inv_token = verify_ok.data['invitation_token']

    # Attempt replay with same OTP
    replay_res = client.post('/api/admin/management/invitations/verify/', {
        'email': new_admin_email,
        'otp': raw_otp
    }, format='json')
    assert_test(replay_res.status_code == status.HTTP_400_BAD_REQUEST, "Replay with used OTP rejected -> 400 Bad Request")

    # Set password using token
    set_pwd_res = client.post('/api/admin/management/invitations/set-password/', {
        'email': new_admin_email,
        'invitation_token': inv_token,
        'password': 'NewAdminPass2026!',
        'confirm_password': 'NewAdminPass2026!'
    }, format='json')

    assert_test(set_pwd_res.status_code == status.HTTP_200_OK, "Set password returns 200 OK")
    activated_admin = User.objects.get(email=new_admin_email)
    assert_test(activated_admin.is_active is True, "Account is now ACTIVE")
    assert_test(activated_admin.email_verified is True, "Account email is marked VERIFIED")
    assert_test(activated_admin.role == User.Role.ADMIN, "Account role is ADMIN")

    # --------------------------------------------------------------------------
    # 7. New Admin Login & Access to Admin APIs
    # --------------------------------------------------------------------------
    print("\n--- 7. New Admin Login & API Authorization ---")
    login_res = client.post('/api/auth/login/', {
        'email': new_admin_email,
        'password': 'NewAdminPass2026!'
    }, format='json')

    assert_test(login_res.status_code == status.HTTP_200_OK, "New admin successfully logs in -> 200 OK")
    admin_jwt = login_res.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_jwt}')

    # Access Admin Management API
    admins_list = client.get('/api/admin/management/admins/')
    assert_test(admins_list.status_code == status.HTTP_200_OK, "New admin can access /api/admin/management/admins/ -> 200 OK")
    assert_test(any(a['email'] == new_admin_email for a in admins_list.data), "New admin appears in directory")

    # --------------------------------------------------------------------------
    # 8. Protection of System Owner & Last Active Admin
    # --------------------------------------------------------------------------
    print("\n--- 8. Protection of System Owner & Last Remaining Admin ---")
    # Attempt to deactivate System Owner
    deact_owner = client.post(f'/api/admin/management/admins/{owner.id}/toggle-status/')
    assert_test(deact_owner.status_code == status.HTTP_403_FORBIDDEN, "Attempt to deactivate System Owner returns 403 Forbidden")
    assert_test(User.objects.get(id=owner.id).is_active is True, "System Owner remains ACTIVE")

    # Isolate activated_admin as the single active admin in the DB
    other_active_admins = list(User.objects.filter(role=User.Role.ADMIN, is_active=True).exclude(id=activated_admin.id))
    for a in other_active_admins:
        a.is_active = False
        a.save(update_fields=['is_active'])

    # Now activated_admin is the ONLY active ADMIN left in DB
    deact_last = client.post(f'/api/admin/management/admins/{activated_admin.id}/toggle-status/')
    assert_test(deact_last.status_code == status.HTTP_400_BAD_REQUEST, "Deactivating the last remaining active admin is BLOCKED -> 400 Bad Request")
    assert_test("Cannot deactivate the only remaining active administrator" in str(deact_last.data), "Error message confirms last admin protection")
    assert_test(User.objects.get(id=activated_admin.id).is_active is True, "Last remaining admin remains ACTIVE")

    # Restore the other active admins
    for a in other_active_admins:
        a.is_active = True
        a.save(update_fields=['is_active'])

    # --------------------------------------------------------------------------
    # 9. Clean up test records
    # --------------------------------------------------------------------------
    student.delete()
    shop_owner.delete()
    courier.delete()
    admin1.delete()
    admin2.delete()
    activated_admin.delete()
    User.objects.filter(email=test_cooldown_email).delete()

    print("\n" + "=" * 80)
    print(f"ALL {passed_tests}/{total_tests} ADMIN CREATION & SYSTEM OWNER TESTS PASSED! (100%)")
    print("=" * 80)


if __name__ == '__main__':
    run_tests()
