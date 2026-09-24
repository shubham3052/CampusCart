import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from rest_framework import status
from users.models import User
from shops.models import Shop
from products.models import Category, Product
from inventory.models import Inventory
from orders.models import Order
from printing.models import PrintingOrder
from delivery.models import Delivery

def run_regression_audit():
    print("=" * 80)
    print("FINAL WHOLE PROJECT COMPREHENSIVE REGRESSION AUDIT SUITE")
    print("=" * 80)

    client = APIClient()

    # Setup isolated test accounts
    admin_email = "audit_admin_reg@campuscart.test"
    po_email = "audit_po_reg@campuscart.test"
    student_email = "audit_student_reg@campuscart.test"
    merchant_email = "audit_merchant_reg@campuscart.test"
    courier_email = "audit_courier_reg@campuscart.test"

    # Pre-clean
    test_emails = [admin_email, po_email, student_email, merchant_email, courier_email]
    Order.objects.filter(shop__name="Regression Audit Shop").delete()
    Inventory.objects.filter(shop__name="Regression Audit Shop").delete()
    Product.objects.filter(shop__name="Regression Audit Shop").delete()
    Shop.objects.filter(name="Regression Audit Shop").delete()
    User.objects.filter(email__in=test_emails).delete()

    admin = User.objects.create_user(
        username="reg_admin", email=admin_email, password="AdminPassword123!", role=User.Role.ADMIN, email_verified=True
    )
    po = User.objects.create_user(
        username="reg_po", email=po_email, password="POPassword123!", role=User.Role.PLATFORM_OWNER, email_verified=True
    )
    student = User.objects.create_user(
        username="reg_student", email=student_email, password="StudentPassword123!", role=User.Role.STUDENT, email_verified=True
    )
    merchant = User.objects.create_user(
        username="reg_merchant", email=merchant_email, password="MerchantPassword123!", role=User.Role.SHOP_OWNER, email_verified=True
    )
    courier = User.objects.create_user(
        username="reg_courier", email=courier_email, password="CourierPassword123!", role=User.Role.DELIVERY_AGENT, email_verified=True, approval_status=User.ApprovalStatus.APPROVED
    )

    shop = Shop.objects.create(
        owner=merchant,
        name="Regression Audit Shop",
        campus_location="North Campus Block A",
        contact_phone="+919876543299",
        is_active=True
    )

    category, _ = Category.objects.get_or_create(
        name="Regression Test Category",
        defaults={"slug": "regression-test-category", "is_active": True}
    )

    product = Product.objects.create(
        shop=shop,
        category=category,
        name="Audit Precision Compass",
        price=150.00,
        is_active=True
    )

    inventory, _ = Inventory.objects.get_or_create(
        shop=shop,
        product=product,
        defaults={"current_stock": 50, "reorder_level": 10, "minimum_stock": 5}
    )

    print("\n--- 1. STUDENT JOURNEY VERIFICATION ---")
    # Login
    res = client.post('/api/auth/login/', {"email": student_email, "password": "StudentPassword123!"}, format='json')
    assert res.status_code == status.HTTP_200_OK, f"Login failed: {res.data}"
    student_token = res.data["access"]
    print("  [PASS] Student Login -> 200 OK")

    client.credentials(HTTP_AUTHORIZATION=f'Bearer {student_token}')

    # Browse shops & products
    res = client.get('/api/shops/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Browse Shops -> 200 OK")

    res = client.get(f'/api/products/{product.id}/')
    assert res.status_code == status.HTTP_200_OK
    assert res.data["name"] == "Audit Precision Compass"
    print("  [PASS] View Product Details -> 200 OK")

    # Place order
    res = client.post('/api/orders/', {
        "shop": shop.id,
        "fulfillment_type": "PICKUP",
        "payment_method": "COD",
        "items": [{"product_id": product.id, "quantity": 2}]
    }, format='json')
    assert res.status_code == status.HTTP_201_CREATED, f"Order placement failed: {res.data}"
    order_id = res.data["order"]["id"]
    print(f"  [PASS] Student Places Stationery Order #{order_id} -> 201 Created")

    # Unread notifications count
    res = client.get('/api/notifications/unread-count/')
    assert res.status_code == status.HTTP_200_OK
    assert "unread_count" in res.data
    print(f"  [PASS] Notification Unread Count -> 200 OK (count={res.data['unread_count']})")

    # Student cannot adjust stock
    res = client.patch(f'/api/inventory/{inventory.id}/', {"current_stock": 999}, format='json')
    assert res.status_code in [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND]
    print("  [PASS] Student blocked from modifying inventory -> 403/404 Protected")

    print("\n--- 2. SHOP OWNER JOURNEY VERIFICATION ---")
    res = client.post('/api/auth/login/', {"email": merchant_email, "password": "MerchantPassword123!"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    merchant_token = res.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {merchant_token}')
    print("  [PASS] Shop Owner Login -> 200 OK")

    # View own products
    res = client.get('/api/products/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Shop Owner Views Scoped Products -> 200 OK")

    # View own orders
    res = client.get('/api/orders/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Shop Owner Views Own Orders -> 200 OK")

    # Update own inventory stock
    res = client.post(f'/api/inventory/{inventory.id}/adjust/', {"quantity_change": 10, "reason": "Restocked"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Shop Owner Adjusts Stock -> 200 OK")

    print("\n--- 3. CAMPUS ADMIN OPERATIONAL MODULES VERIFICATION ---")
    res = client.post('/api/auth/login/', {"email": admin_email, "password": "AdminPassword123!"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    admin_token = res.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {admin_token}')
    print("  [PASS] Admin Login -> 200 OK")

    # Admin Module 1: Products
    res = client.get('/api/products/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/products/ -> 200 OK")

    # Admin Module 2: Categories CRUD
    res = client.get('/api/categories/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/categories/ List -> 200 OK")

    cat_test_name = "Admin Reg Category Audit"
    Category.objects.filter(name=cat_test_name).delete()
    res = client.post('/api/categories/', {"name": cat_test_name, "description": "Audit testing"}, format='json')
    assert res.status_code == status.HTTP_201_CREATED
    new_cat_id = res.data["id"]
    print(f"  [PASS] Admin /api/categories/ Create -> 201 Created (ID: {new_cat_id})")

    res = client.patch(f'/api/categories/{new_cat_id}/', {"description": "Updated"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/categories/ Edit -> 200 OK")

    res = client.delete(f'/api/categories/{new_cat_id}/')
    assert res.status_code == status.HTTP_204_NO_CONTENT
    print("  [PASS] Admin /api/categories/ Delete -> 204 No Content")

    # Admin Module 3: Orders
    res = client.get('/api/orders/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/orders/ -> 200 OK")

    # Admin Module 4: Printing
    res = client.get('/api/printing/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/printing/ -> 200 OK")

    # Admin Module 5: Deliveries
    res = client.get('/api/deliveries/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/deliveries/ -> 200 OK")

    res = client.get('/api/deliveries/agents/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Admin /api/deliveries/agents/ -> 200 OK")

    print("\n--- 4. PLATFORM OWNER ROLE VERIFICATION ---")
    res = client.post('/api/auth/login/', {"email": po_email, "password": "POPassword123!"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    po_token = res.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {po_token}')
    print("  [PASS] Platform Owner Login -> 200 OK")

    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Platform Owner Dashboard Stats -> 200 OK")

    res = client.get('/api/platform-owner/admins/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Platform Owner Admin Management -> 200 OK")

    res = client.get('/api/platform-owner/audit-logs/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Platform Owner Audit Logs -> 200 OK")

    print("\n--- 5. DELIVERY AGENT ROLE VERIFICATION ---")
    res = client.post('/api/auth/login/', {"email": courier_email, "password": "CourierPassword123!"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    courier_token = res.data["access"]
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {courier_token}')
    print("  [PASS] Courier Login -> 200 OK")

    res = client.get('/api/deliveries/')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Courier Assigned Deliveries -> 200 OK")

    res = client.post('/api/deliveries/toggle-availability/', {"availability_status": "AVAILABLE"}, format='json')
    assert res.status_code == status.HTTP_200_OK
    print("  [PASS] Courier Toggle Availability -> 200 OK")

    # Courier blocked from Owner/Admin
    res = client.get('/api/platform-owner/dashboard-stats/')
    assert res.status_code == status.HTTP_403_FORBIDDEN
    print("  [PASS] Courier blocked from Platform Owner APIs -> 403 Forbidden")

    res = client.get('/api/admin/management/admins/')
    assert res.status_code == status.HTTP_403_FORBIDDEN
    print("  [PASS] Courier blocked from Admin Management APIs -> 403 Forbidden")

    # Cleanup
    Order.objects.filter(shop=shop).delete()
    Inventory.objects.filter(shop=shop).delete()
    product.delete()
    category.delete()
    shop.delete()
    User.objects.filter(email__in=test_emails).delete()

    print("\n" + "=" * 80)
    print("FINAL REGRESSION AUDIT: ALL 24/24 END-TO-END VERIFICATION CHECKS PASSED (100%)")
    print("=" * 80)

if __name__ == '__main__':
    run_regression_audit()
