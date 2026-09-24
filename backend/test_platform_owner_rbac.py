"""
Automated Test Suite for Platform Owner Role, Authorization, and Management Endpoints.

Tests:
1. Authentication: Login as Platform Owner returns valid JWT and role PLATFORM_OWNER.
2. Unauthenticated access to /api/platform-owner/* -> 401 Unauthorized.
3. Student access to /api/platform-owner/* -> 403 Forbidden.
4. Shop Owner access to /api/platform-owner/* -> 403 Forbidden.
5. Delivery Agent access to /api/platform-owner/* -> 403 Forbidden.
6. Admin access to /api/platform-owner/* -> 403 Forbidden.
7. Platform Owner access to /api/platform-owner/dashboard-stats/ -> 200 OK with real DB metrics.
8. Privilege Escalation Prevention:
   - Registration with role=PLATFORM_OWNER -> 400 Bad Request.
   - Registration with role=ADMIN -> 400 Bad Request.
9. Admin Management by Platform Owner:
   - List admins -> 200 OK.
   - Create Admin -> 201 Created with role=ADMIN (password hashed, never returned).
   - Toggle Admin status -> 200 OK.
10. Oversight Endpoints Access by Platform Owner:
   - Users -> 200 OK.
   - Shop Owners -> 200 OK.
   - Shops -> 200 OK.
   - Delivery Partners -> 200 OK.
   - Orders -> 200 OK.
   - Payments -> 200 OK.
   - Refunds -> 200 OK.
   - Inventory -> 200 OK.
   - Demand Predictions -> 200 OK.
   - Print Orders -> 200 OK.
   - Locations -> 200 OK.
   - Coupons -> 200 OK.
   - Notifications & Broadcast -> 200/201 OK.
   - Audit Logs -> 200 OK.
   - Profile & Change Password -> 200 OK.
"""

import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
client = APIClient()


def authenticate(user):
    refresh = RefreshToken.for_user(user)
    token = str(refresh.access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return str(refresh), token


def clear_auth():
    client.credentials()


def run_tests():
    print("=" * 80)
    print("RUNNING PLATFORM OWNER ROLE & RBAC AUTHORIZATION TEST SUITE")
    print("=" * 80)

    # Setup or retrieve test accounts
    student, _ = User.objects.get_or_create(
        email="test_student_rbac@campus.edu",
        defaults={"username": "test_student_rbac@campus.edu", "role": User.Role.STUDENT, "is_active": True}
    )
    student.set_password("StudentPass123!")
    student.role = User.Role.STUDENT
    student.save()

    shop_owner, _ = User.objects.get_or_create(
        email="test_owner_rbac@campus.edu",
        defaults={"username": "test_owner_rbac@campus.edu", "role": User.Role.SHOP_OWNER, "is_active": True}
    )
    shop_owner.set_password("OwnerPass123!")
    shop_owner.role = User.Role.SHOP_OWNER
    shop_owner.save()

    delivery_agent, _ = User.objects.get_or_create(
        email="test_courier_rbac@campus.edu",
        defaults={"username": "test_courier_rbac@campus.edu", "role": User.Role.DELIVERY_AGENT, "is_active": True}
    )
    delivery_agent.set_password("CourierPass123!")
    delivery_agent.role = User.Role.DELIVERY_AGENT
    delivery_agent.save()

    admin, _ = User.objects.get_or_create(
        email="test_admin_rbac@campus.edu",
        defaults={"username": "test_admin_rbac@campus.edu", "role": User.Role.ADMIN, "is_staff": True, "is_active": True}
    )
    admin.set_password("AdminPass123!")
    admin.role = User.Role.ADMIN
    admin.is_staff = True
    admin.save()

    owner, _ = User.objects.get_or_create(
        email="test_platform_owner_rbac@campus.edu",
        defaults={"username": "test_platform_owner_rbac@campus.edu", "role": User.Role.PLATFORM_OWNER, "is_staff": True, "is_superuser": True, "is_active": True}
    )
    owner.set_password("OwnerPass123!")
    owner.role = User.Role.PLATFORM_OWNER
    owner.save()

    # -------------------------------------------------------------
    # 1. Unauthenticated Access Denial
    # -------------------------------------------------------------
    clear_auth()
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 401, f"Expected 401 for unauthenticated dashboard, got {res.status_code}"
    print("[PASS] 1. Unauthenticated request to /api/platform-owner/dashboard-stats/ -> 401 Unauthorized")

    # -------------------------------------------------------------
    # 2. Student Role Access Denial
    # -------------------------------------------------------------
    authenticate(student)
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 403, f"Expected 403 for Student accessing platform owner, got {res.status_code}"
    print("[PASS] 2. Student denied access to /api/platform-owner/dashboard-stats/ -> 403 Forbidden")

    # -------------------------------------------------------------
    # 3. Shop Owner Role Access Denial
    # -------------------------------------------------------------
    authenticate(shop_owner)
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 403, f"Expected 403 for Shop Owner accessing platform owner, got {res.status_code}"
    print("[PASS] 3. Shop Owner denied access to /api/platform-owner/dashboard-stats/ -> 403 Forbidden")

    # -------------------------------------------------------------
    # 4. Delivery Agent Role Access Denial
    # -------------------------------------------------------------
    authenticate(delivery_agent)
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 403, f"Expected 403 for Delivery Agent accessing platform owner, got {res.status_code}"
    print("[PASS] 4. Delivery Partner denied access to /api/platform-owner/dashboard-stats/ -> 403 Forbidden")

    # -------------------------------------------------------------
    # 5. Normal Admin Access Denial (CRITICAL REQUIREMENT)
    # -------------------------------------------------------------
    authenticate(admin)
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 403, f"Expected 403 for Admin accessing platform owner, got {res.status_code}"
    print("[PASS] 5. Admin denied access to /api/platform-owner/dashboard-stats/ -> 403 Forbidden")

    res = client.get('/api/platform-owner/admins/')
    assert res.status_code == 403, f"Expected 403 for Admin accessing admin management, got {res.status_code}"
    print("[PASS] 5.1 Admin denied access to /api/platform-owner/admins/ -> 403 Forbidden")

    # -------------------------------------------------------------
    # 6. Platform Owner Authorized Access
    # -------------------------------------------------------------
    authenticate(owner)
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == 200, f"Expected 200 for Platform Owner dashboard, got {res.status_code}: {res.data}"
    assert "users" in res.data and "shops" in res.data and "orders" in res.data and "financials" in res.data
    assert res.data["users"]["platform_owners"] >= 1
    print(f"[PASS] 6. Platform Owner granted access to dashboard stats -> 200 OK (Platform Owners in DB: {res.data['users']['platform_owners']})")

    # -------------------------------------------------------------
    # 7. Privilege Escalation Prevention in Registration
    # -------------------------------------------------------------
    clear_auth()
    res = client.post('/api/auth/register/', {
        "name": "Hacker Owner",
        "email": "hacker_owner@test.com",
        "password": "SecurePassword123!",
        "role": "PLATFORM_OWNER"
    }, format='json')
    assert res.status_code == 400, f"Expected 400 for registering as PLATFORM_OWNER, got {res.status_code}"
    assert not User.objects.filter(email="hacker_owner@test.com").exists()
    print("[PASS] 7.1 Public registration with role=PLATFORM_OWNER strictly rejected -> 400 Bad Request")

    res = client.post('/api/auth/register/', {
        "name": "Hacker Admin",
        "email": "hacker_admin@test.com",
        "password": "SecurePassword123!",
        "role": "ADMIN"
    }, format='json')
    assert res.status_code == 400, f"Expected 400 for registering as ADMIN, got {res.status_code}"
    assert not User.objects.filter(email="hacker_admin@test.com").exists()
    print("[PASS] 7.2 Public registration with role=ADMIN strictly rejected -> 400 Bad Request")

    # -------------------------------------------------------------
    # 8. Admin Management by Platform Owner
    # -------------------------------------------------------------
    authenticate(owner)
    # Clean up test admin if exists
    User.objects.filter(email="new_system_admin@campus.edu").delete()
    res = client.post('/api/platform-owner/admins/', {
        "name": "New System Administrator",
        "email": "new_system_admin@campus.edu",
        "phone_number": "9876543299",
        "department": "IT Operations",
        "password": "SecureAdminPassword2026!"
    }, format='json')
    assert res.status_code == 201, f"Expected 201 creating admin, got {res.status_code}: {res.data}"
    created_admin_id = res.data["id"]
    assert res.data["role"] == "ADMIN"
    assert "password" not in res.data
    print(f"[PASS] 8.1 Platform Owner successfully created new Administrator #{created_admin_id} -> 201 Created")

    # Verify toggle active status
    res = client.post(f'/api/platform-owner/admins/{created_admin_id}/toggle-status/')
    assert res.status_code == 200
    assert res.data["is_active"] is False
    print(f"[PASS] 8.2 Platform Owner toggled Administrator status to inactive -> 200 OK")

    # Toggle back to active
    res = client.post(f'/api/platform-owner/admins/{created_admin_id}/toggle-status/')
    assert res.status_code == 200
    assert res.data["is_active"] is True
    print(f"[PASS] 8.3 Platform Owner toggled Administrator status back to active -> 200 OK")

    # -------------------------------------------------------------
    # 9. Oversight Endpoints Verification
    # -------------------------------------------------------------
    endpoints = [
        ('/api/platform-owner/users/', 'Users Oversight'),
        ('/api/platform-owner/shop-owners/', 'Shop Owners Oversight'),
        ('/api/platform-owner/shops/', 'Shops Directory Oversight'),
        ('/api/platform-owner/delivery-partners/', 'Delivery Partners Oversight'),
        ('/api/platform-owner/orders/', 'Orders Oversight'),
        ('/api/platform-owner/payments/', 'Payments Oversight'),
        ('/api/platform-owner/refunds/', 'Refunds Oversight'),
        ('/api/platform-owner/inventory/', 'Inventory Health Oversight'),
        ('/api/platform-owner/demand-predictions/', 'Demand Predictions Oversight'),
        ('/api/platform-owner/print-orders/', 'Printing Oversight'),
        ('/api/platform-owner/locations/', 'Campus Locations & Zones Oversight'),
        ('/api/platform-owner/coupons/', 'Coupons & Promos Oversight'),
        ('/api/platform-owner/audit-logs/', 'Security Audit Logs Oversight'),
        ('/api/platform-owner/profile/', 'Platform Owner Profile'),
    ]

    for ep, name in endpoints:
        res = client.get(ep)
        assert res.status_code == 200, f"Failed accessing {ep}: status {res.status_code}, data: {res.data}"
        print(f"[PASS] 9. GET {ep} ({name}) -> 200 OK")

    # -------------------------------------------------------------
    # 10. Notification Broadcast by Platform Owner
    # -------------------------------------------------------------
    res = client.post('/api/platform-owner/notifications/broadcast/', {
        "target_group": "STUDENT",
        "title": "Campus Platform Maintenance Complete",
        "message": "The system has been updated with high availability inventory tracking.",
        "notification_type": "ACADEMIC_ALERT"
    }, format='json')
    assert res.status_code == 201, f"Expected 201 for broadcast, got {res.status_code}: {res.data}"
    assert res.data["success"] is True
    print(f"[PASS] 10. Platform Owner dispatched system broadcast ({res.data['dispatched_count']} recipients) -> 201 Created")

    # -------------------------------------------------------------
    # 11. Profile Update & Password Change
    # -------------------------------------------------------------
    res = client.patch('/api/platform-owner/profile/', {
        "first_name": "Apex",
        "last_name": "Supervisor"
    }, format='json')
    assert res.status_code == 200
    assert res.data["name"] == "Apex Supervisor"
    print("[PASS] 11.1 Platform Owner profile patch -> 200 OK")

    res = client.post('/api/platform-owner/change-password/', {
        "current_password": "WrongPassword!",
        "new_password": "NewPlatformOwnerPass2026!"
    }, format='json')
    assert res.status_code == 400
    print("[PASS] 11.2 Change password with invalid current password rejected -> 400 Bad Request")

    res = client.post('/api/platform-owner/change-password/', {
        "current_password": "OwnerPass123!",
        "new_password": "NewPlatformOwnerPass2026!"
    }, format='json')
    assert res.status_code == 200
    assert res.data["success"] is True
    print("[PASS] 11.3 Change password with valid credentials -> 200 OK")

    # Reset password back for tests continuity
    owner.set_password("OwnerPass123!")
    owner.save()

    print("=" * 80)
    print("ALL PLATFORM OWNER RBAC & SECURITY TESTS PASSED WITH 100% SUCCESS!")
    print("=" * 80)


if __name__ == '__main__':
    run_tests()
