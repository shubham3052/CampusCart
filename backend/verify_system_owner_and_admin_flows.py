"""
Comprehensive Verification Script for Flows A through O:
System Owner + Admin Management End-to-End Functional & Security Audit.
"""

import os
import sys
import re
import uuid

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(BASE_DIR)
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from django.core import mail
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


def verify_all_flows():
    print("=" * 80)
    print("VERIFYING SYSTEM OWNER + ADMIN MANAGEMENT FLOWS (A through O)")
    print("=" * 80)

    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    passed = 0
    total = 0

    def assert_flow(condition, flow_name):
        nonlocal passed, total
        total += 1
        if condition:
            passed += 1
            print(f"  [PASS] {flow_name}")
        else:
            print(f"  [FAIL] {flow_name}")
            raise AssertionError(f"Flow verification failed: {flow_name}")

    client = APIClient()

    # Ensure System Owner exists with application password
    owner_email = "garibhokya@gmail.com"
    owner_app_password = "OwnerSecretAppPass2026!"
    owner, _ = User.objects.get_or_create(
        email=owner_email,
        defaults={
            "username": owner_email,
            "role": User.Role.PLATFORM_OWNER,
            "is_staff": True,
            "is_superuser": True,
            "email_verified": True,
            "is_active": True,
        }
    )
    owner.role = User.Role.PLATFORM_OWNER
    owner.is_staff = True
    owner.is_superuser = True
    owner.email_verified = True
    owner.is_active = True
    owner.set_password(owner_app_password)
    owner.save()

    # Setup baseline entities for RBAC checks
    student = User.objects.create_user(
        username=f"student_{uuid.uuid4().hex[:6]}@campus.edu",
        email=f"student_{uuid.uuid4().hex[:6]}@campus.edu",
        password="StudentPass2026!",
        role=User.Role.STUDENT,
        email_verified=True,
        is_active=True
    )
    shop_owner = User.objects.create_user(
        username=f"merchant_{uuid.uuid4().hex[:6]}@campus.edu",
        email=f"merchant_{uuid.uuid4().hex[:6]}@campus.edu",
        password="MerchantPass2026!",
        role=User.Role.SHOP_OWNER,
        email_verified=True,
        is_active=True
    )
    courier = User.objects.create_user(
        username=f"courier_{uuid.uuid4().hex[:6]}@campus.edu",
        email=f"courier_{uuid.uuid4().hex[:6]}@campus.edu",
        password="CourierPass2026!",
        role=User.Role.DELIVERY_AGENT,
        email_verified=True,
        is_active=True
    )

    # --------------------------------------------------------------------------
    # Flow A: Owner login
    # --------------------------------------------------------------------------
    print("\n--- Flow A: System Owner Login ---")
    owner_login = client.post('/api/auth/login/', {
        'email': owner_email,
        'password': owner_app_password
    }, format='json')
    assert_flow(owner_login.status_code == status.HTTP_200_OK, "Owner logs in successfully via /api/auth/login/")
    assert_flow("access" in owner_login.data, "Owner receives valid JWT access token")
    assert_flow(owner_login.data['user']['role'] == 'PLATFORM_OWNER', "User role is confirmed PLATFORM_OWNER")
    owner_jwt = owner_login.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {owner_jwt}')

    # --------------------------------------------------------------------------
    # Flow B: Owner opens Admin Management
    # --------------------------------------------------------------------------
    print("\n--- Flow B: Owner Opens Admin Management ---")
    owner_admins_res = client.get('/api/admin/management/admins/')
    assert_flow(owner_admins_res.status_code == status.HTTP_200_OK, "Owner accesses /api/admin/management/admins/ -> 200 OK")
    owner_po_admins = client.get('/api/platform-owner/admins/')
    assert_flow(owner_po_admins.status_code == status.HTTP_200_OK, "Owner accesses /api/platform-owner/admins/ -> 200 OK")

    # --------------------------------------------------------------------------
    # Flow C & D: Owner invites Admin & Admin receives OTP/email
    # --------------------------------------------------------------------------
    print("\n--- Flow C & D: Owner Invites Admin & OTP Email Dispatched ---")
    mail.outbox = []
    invited_email = f"verified_admin_{uuid.uuid4().hex[:6]}@campus.edu"
    invite_res = client.post('/api/admin/management/invite/', {
        'email': invited_email,
        'name': 'Dr. Alok Nath',
        'department': 'Campus Operations'
    }, format='json')

    assert_flow(invite_res.status_code == status.HTTP_201_CREATED, "Owner invites Admin -> 201 Created")
    assert_flow(invite_res.data.get('success') is True, "Success flag is True")
    assert_flow("otp" not in invite_res.data, "CRITICAL: Raw OTP is NOT leaked in API response")
    assert_flow(len(mail.outbox) == 1, "OTP email dispatched to outbox")

    dispatched_email = mail.outbox[-1]
    assert_flow(dispatched_email.to == [invited_email], f"Sent strictly to invited email ({invited_email})")
    assert_flow(settings.DEFAULT_FROM_EMAIL in dispatched_email.from_email or "garibhokya" in dispatched_email.from_email, "Sent from configured sender")
    assert_flow("Administrator Invitation" in dispatched_email.subject, "Subject identifies Administrator Invitation")
    otp_code = re.search(r'\b(\d{6})\b', dispatched_email.body).group(1)

    # --------------------------------------------------------------------------
    # Flow E: Admin verifies invitation
    # --------------------------------------------------------------------------
    print("\n--- Flow E: Admin Verifies Invitation ---")
    client.credentials()  # Unauthenticated invitee
    verify_res = client.post('/api/admin/management/invitations/verify/', {
        'email': invited_email,
        'otp': otp_code
    }, format='json')
    assert_flow(verify_res.status_code == status.HTTP_200_OK, "Admin verifies 6-digit OTP -> 200 OK")
    assert_flow("invitation_token" in verify_res.data, "Receives signed invitation token")
    inv_token = verify_res.data['invitation_token']

    # --------------------------------------------------------------------------
    # Flow F: Admin creates password
    # --------------------------------------------------------------------------
    print("\n--- Flow F: Admin Creates Application Password ---")
    admin_pass = "AdminAppSecure2026!"
    set_pwd_res = client.post('/api/admin/management/invitations/set-password/', {
        'email': invited_email,
        'invitation_token': inv_token,
        'password': admin_pass,
        'confirm_password': admin_pass
    }, format='json')
    assert_flow(set_pwd_res.status_code == status.HTTP_200_OK, "Admin sets password -> 200 OK")
    new_admin_user = User.objects.get(email=invited_email)
    assert_flow(new_admin_user.is_active is True, "Admin account is now ACTIVE")
    assert_flow(new_admin_user.email_verified is True, "Admin email is marked VERIFIED")
    assert_flow(new_admin_user.role == User.Role.ADMIN, "Role is ADMIN")

    # --------------------------------------------------------------------------
    # Flow G: Admin logs in
    # --------------------------------------------------------------------------
    print("\n--- Flow G: Admin Logs In ---")
    admin_login = client.post('/api/auth/login/', {
        'email': invited_email,
        'password': admin_pass
    }, format='json')
    assert_flow(admin_login.status_code == status.HTTP_200_OK, "Admin logs in -> 200 OK")
    admin_jwt = admin_login.data['access']
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_jwt}')

    # --------------------------------------------------------------------------
    # Flow H: Admin accesses permitted features
    # --------------------------------------------------------------------------
    print("\n--- Flow H: Admin Accesses Permitted Features ---")
    admin_dir = client.get('/api/admin/management/admins/')
    assert_flow(admin_dir.status_code == status.HTTP_200_OK, "Admin accesses /api/admin/management/admins/ -> 200 OK")
    admin_prof = client.get('/api/users/profile/')
    assert_flow(admin_prof.status_code == status.HTTP_200_OK, "Admin accesses /api/users/profile/ -> 200 OK")

    # --------------------------------------------------------------------------
    # Flow I & J: Owner changes status / deactivates Admin
    # --------------------------------------------------------------------------
    print("\n--- Flow I & J: Owner Deactivates Admin ---")
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {owner_jwt}')
    deact_res = client.post(f'/api/admin/management/admins/{new_admin_user.id}/toggle-status/')
    assert_flow(deact_res.status_code == status.HTTP_200_OK, "Owner deactivates Admin -> 200 OK")
    assert_flow(deact_res.data['is_active'] is False, "Status returned is inactive")
    assert_flow(User.objects.get(id=new_admin_user.id).is_active is False, "Database reflects is_active = False")

    # --------------------------------------------------------------------------
    # Flow K: Deactivated Admin cannot access protected APIs or log in
    # --------------------------------------------------------------------------
    print("\n--- Flow K: Deactivated Admin Blocked from Protected APIs & Login ---")
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_jwt}')
    deact_access = client.get('/api/admin/management/admins/')
    assert_flow(deact_access.status_code in [status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN], "Deactivated admin blocked from APIs -> 401/403")

    client.credentials()
    deact_login = client.post('/api/auth/login/', {
        'email': invited_email,
        'password': admin_pass
    }, format='json')
    assert_flow(deact_login.status_code == status.HTTP_400_BAD_REQUEST, "Deactivated admin cannot log in -> 400 Bad Request")
    assert_flow("disabled" in str(deact_login.data).lower(), "Notice confirms account is disabled")

    # --------------------------------------------------------------------------
    # Flow L: Admin cannot access Owner pages/APIs
    # --------------------------------------------------------------------------
    print("\n--- Flow L: Admin Strictly Blocked from Owner-Only APIs ---")
    # Reactivate admin for RBAC boundary testing
    new_admin_user.is_active = True
    new_admin_user.save()
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_jwt}')

    owner_api_stats = client.get('/api/platform-owner/dashboard-stats/')
    assert_flow(owner_api_stats.status_code == status.HTTP_403_FORBIDDEN, "Admin calling /api/platform-owner/dashboard-stats/ -> 403 Forbidden")
    owner_api_admins = client.get('/api/platform-owner/admins/')
    assert_flow(owner_api_admins.status_code == status.HTTP_403_FORBIDDEN, "Admin calling /api/platform-owner/admins/ -> 403 Forbidden")

    # --------------------------------------------------------------------------
    # Flow M: Normal user (STUDENT) cannot access Admin or Owner APIs
    # --------------------------------------------------------------------------
    print("\n--- Flow M: Student Strictly Blocked from Admin & Owner APIs ---")
    client.force_authenticate(user=student)
    assert_flow(client.get('/api/admin/management/admins/').status_code == status.HTTP_403_FORBIDDEN, "Student blocked from /api/admin/management/admins/ -> 403")
    assert_flow(client.post('/api/admin/management/invite/', {'email': 'x@x.com'}).status_code == status.HTTP_403_FORBIDDEN, "Student blocked from invite -> 403")
    assert_flow(client.get('/api/platform-owner/dashboard-stats/').status_code == status.HTTP_403_FORBIDDEN, "Student blocked from /api/platform-owner/ -> 403")

    # --------------------------------------------------------------------------
    # Flow N: Shop Owner cannot access Admin or Owner APIs
    # --------------------------------------------------------------------------
    print("\n--- Flow N: Shop Owner Strictly Blocked from Admin & Owner APIs ---")
    client.force_authenticate(user=shop_owner)
    assert_flow(client.get('/api/admin/management/admins/').status_code == status.HTTP_403_FORBIDDEN, "Shop Owner blocked from /api/admin/management/admins/ -> 403")
    assert_flow(client.get('/api/platform-owner/dashboard-stats/').status_code == status.HTTP_403_FORBIDDEN, "Shop Owner blocked from /api/platform-owner/ -> 403")

    # --------------------------------------------------------------------------
    # Flow O: Delivery Partner cannot access Admin or Owner APIs
    # --------------------------------------------------------------------------
    print("\n--- Flow O: Delivery Courier Strictly Blocked from Admin & Owner APIs ---")
    client.force_authenticate(user=courier)
    assert_flow(client.get('/api/admin/management/admins/').status_code == status.HTTP_403_FORBIDDEN, "Courier blocked from /api/admin/management/admins/ -> 403")
    assert_flow(client.get('/api/platform-owner/dashboard-stats/').status_code == status.HTTP_403_FORBIDDEN, "Courier blocked from /api/platform-owner/ -> 403")

    # --------------------------------------------------------------------------
    # Flow P: System Owner Protection Checks
    # --------------------------------------------------------------------------
    print("\n--- Flow P: System Owner Permanent Protection ---")
    client.force_authenticate(user=new_admin_user)
    owner_deact_attempt = client.post(f'/api/admin/management/admins/{owner.id}/toggle-status/')
    assert_flow(owner_deact_attempt.status_code == status.HTTP_403_FORBIDDEN, "Admin attempting to deactivate Owner -> 403 Forbidden")
    assert_flow(User.objects.get(id=owner.id).is_active is True, "Owner is_active is preserved as True")

    # Clean up test user records
    student.delete()
    shop_owner.delete()
    courier.delete()
    new_admin_user.delete()

    print("\n" + "=" * 80)
    print(f"ALL {passed}/{total} END-TO-END FLOW CHECKS (A through P) PASSED! (100%)")
    print("=" * 80)


if __name__ == '__main__':
    verify_all_flows()
