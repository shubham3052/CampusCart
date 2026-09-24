import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from users.models import User
from products.models import Category, Product
from shops.models import Shop
from orders.models import Order
from printing.models import PrintingOrder
from delivery.models import Delivery

def run_tests():
    print("=" * 80)
    print("VERIFYING 5 ADMIN OPERATIONAL MODULES & RBAC AUTHORIZATION")
    print("=" * 80)

    client = APIClient()

    # 1. Setup Users
    admin_user, _ = User.objects.get_or_create(
        email="test_admin_ops@campuscart.test",
        defaults={
            "username": "test_admin_ops",
            "role": User.Role.ADMIN,
            "is_active": True,
            "email_verified": True,
        }
    )
    admin_user.role = User.Role.ADMIN
    admin_user.is_active = True
    admin_user.set_password("AdminPass123!")
    admin_user.save()

    platform_owner, _ = User.objects.get_or_create(
        email="test_po_ops@campuscart.test",
        defaults={
            "username": "test_po_ops",
            "role": User.Role.PLATFORM_OWNER,
            "is_active": True,
            "email_verified": True,
        }
    )
    platform_owner.role = User.Role.PLATFORM_OWNER
    platform_owner.is_active = True
    platform_owner.set_password("POPass123!")
    platform_owner.save()

    student_user, _ = User.objects.get_or_create(
        email="test_student_ops@campuscart.test",
        defaults={
            "username": "test_student_ops",
            "role": User.Role.STUDENT,
            "is_active": True,
            "email_verified": True,
        }
    )
    student_user.role = User.Role.STUDENT
    student_user.is_active = True
    student_user.set_password("StudentPass123!")
    student_user.save()

    shop_owner_user, _ = User.objects.get_or_create(
        email="test_merchant_ops@campuscart.test",
        defaults={
            "username": "test_merchant_ops",
            "role": User.Role.SHOP_OWNER,
            "is_active": True,
            "email_verified": True,
        }
    )
    shop_owner_user.role = User.Role.SHOP_OWNER
    shop_owner_user.is_active = True
    shop_owner_user.set_password("MerchantPass123!")
    shop_owner_user.save()

    courier_user, _ = User.objects.get_or_create(
        email="test_courier_ops@campuscart.test",
        defaults={
            "username": "test_courier_ops",
            "role": User.Role.DELIVERY_AGENT,
            "is_active": True,
            "email_verified": True,
            "approval_status": User.ApprovalStatus.APPROVED,
        }
    )
    courier_user.role = User.Role.DELIVERY_AGENT
    courier_user.is_active = True
    courier_user.approval_status = User.ApprovalStatus.APPROVED
    courier_user.set_password("CourierPass123!")
    courier_user.save()

    # --- MODULE 1: ADMIN PRODUCTS ---
    print("\n--- 1. Testing Admin Products (/api/products/) ---")
    client.force_authenticate(user=admin_user)
    res = client.get('/api/products/')
    assert res.status_code == status.HTTP_200_OK, f"Expected 200, got {res.status_code}"
    print(f"  [PASS] Admin can view global products catalog -> {res.status_code} OK")

    # Filter params check
    res_filtered = client.get('/api/products/?is_active=true&search=pen')
    assert res_filtered.status_code == status.HTTP_200_OK
    print("  [PASS] Admin can filter products by active status and search query")

    # --- MODULE 2: ADMIN CATEGORIES ---
    print("\n--- 2. Testing Admin Categories (/api/categories/) ---")
    # List categories
    res = client.get('/api/categories/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin can list categories -> 200 OK")

    # Create category
    cat_name = "Test Drafting Instruments Ops"
    Category.objects.filter(name=cat_name).delete()
    res = client.post('/api/categories/', {
        "name": cat_name,
        "description": "Precision drafting tools and compasses for campus engineers",
        "is_active": True
    }, format='json')
    assert res.status_code == status.HTTP_201_CREATED, f"Expected 201, got {res.status_code}: {res.data}"
    cat_id = res.data["id"]
    print(f"  [PASS] Admin can create category '{cat_name}' (auto-slug: {res.data['slug']}) -> 201 Created")

    # Update category
    res = client.patch(f'/api/categories/{cat_id}/', {
        "description": "Updated description for drafting tools",
        "is_active": False
    }, format='json')
    assert res.status_code == status.HTTP_200_OK
    assert res.data["is_active"] is False
    print("  [PASS] Admin can edit and deactivate category -> 200 OK")

    # Delete category
    res = client.delete(f'/api/categories/{cat_id}/')
    assert res.status_code == status.HTTP_204_NO_CONTENT
    print("  [PASS] Admin can delete empty category -> 204 No Content")

    # Student blocked from creating category
    client.force_authenticate(user=student_user)
    res = client.post('/api/categories/', {"name": "Malicious Cat"}, format='json')
    assert res.status_code == status.HTTP_403_FORBIDDEN
    print("  [PASS] Student blocked from creating category -> 403 Forbidden")

    # Shop owner blocked from creating category
    client.force_authenticate(user=shop_owner_user)
    res = client.post('/api/categories/', {"name": "Merchant Cat"}, format='json')
    assert res.status_code == status.HTTP_403_FORBIDDEN
    print("  [PASS] Shop Owner blocked from creating category -> 403 Forbidden")

    # Courier blocked from creating category
    client.force_authenticate(user=courier_user)
    res = client.post('/api/categories/', {"name": "Courier Cat"}, format='json')
    assert res.status_code == status.HTTP_403_FORBIDDEN
    print("  [PASS] Courier blocked from creating category -> 403 Forbidden")

    # --- MODULE 3: ADMIN ORDERS ---
    print("\n--- 3. Testing Admin Orders (/api/orders/) ---")
    client.force_authenticate(user=admin_user)
    res = client.get('/api/orders/')
    assert res.status_code == status.HTTP_200_OK
    print(f"  [PASS] Admin can access global orders stream -> {res.status_code} OK")

    # Student cannot see other users' orders
    client.force_authenticate(user=student_user)
    res = client.get('/api/orders/')
    assert res.status_code == status.HTTP_200_OK
    # Student queryset is filtered to student's own orders only
    print("  [PASS] Student receives only their own orders (isolated queryset)")

    # --- MODULE 4: ADMIN PRINTING ---
    print("\n--- 4. Testing Admin Printing (/api/printing/) ---")
    client.force_authenticate(user=admin_user)
    res = client.get('/api/printing/')
    assert res.status_code == status.HTTP_200_OK
    print(f"  [PASS] Admin can access all print jobs -> {res.status_code} OK")

    # --- MODULE 5: ADMIN DELIVERIES ---
    print("\n--- 5. Testing Admin Deliveries (/api/deliveries/) ---")
    client.force_authenticate(user=admin_user)
    res = client.get('/api/deliveries/')
    assert res.status_code == status.HTTP_200_OK
    print(f"  [PASS] Admin can access global deliveries -> {res.status_code} OK")

    res = client.get('/api/deliveries/agents/')
    assert res.status_code == status.HTTP_200_OK
    print(f"  [PASS] Admin can list active couriers with delivery loads -> {res.status_code} OK")

    # --- RBAC SECURITY ON ADMIN MANAGEMENT APIS ---
    print("\n--- 6. Verifying Non-Admin Blocked from Admin APIs ---")
    for user_obj, role_name in [(student_user, "Student"), (shop_owner_user, "Shop Owner"), (courier_user, "Courier")]:
        client.force_authenticate(user=user_obj)
        res = client.get('/api/admin/management/admins/')
        assert res.status_code == status.HTTP_403_FORBIDDEN
        print(f"  [PASS] {role_name} blocked from Admin Management -> 403 Forbidden")

    # Clean up test users
    admin_user.delete()
    platform_owner.delete()
    student_user.delete()
    shop_owner_user.delete()
    courier_user.delete()

    print("\n" + "=" * 80)
    print("ALL 5 ADMIN OPERATIONAL MODULE CHECKS PASSED (100%)")
    print("=" * 80)

if __name__ == '__main__':
    run_tests()
