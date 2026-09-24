"""
Automated Test Suite for STEP 7: Authentication & Role-Based Access Control (RBAC).

Tests:
1. Unauthenticated Endpoint Access & Rejections
2. Registration API (Success, Duplicate Email, Weak Password, Admin Role Rejection)
3. Login API (Valid Credentials, Wrong Password, Non-existent Email)
4. Token Refresh (Valid Refresh, Rotated Refresh, Invalid Token)
5. Current User API (/api/auth/me/)
6. Logout & Token Blacklisting
7. Student Permissions & Cross-User Isolation (Order & Note Privacy)
8. Shop Owner Permissions & Cross-Shop Isolation (Cross-Shop Order & Stock Protection)
9. Admin Universal Access
"""

import os
import time
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from shops.models import Shop
from products.models import Category, Product
from inventory.models import Inventory
from orders.models import Order, OrderItem
from academics.models import AcademicCalendar, StudentNote
from decimal import Decimal

User = get_user_model()
client = APIClient()

def authenticate(user):
    """Helper to set JWT Authorization header for an APIClient."""
    refresh = RefreshToken.for_user(user)
    token = str(refresh.access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return str(refresh), token

def clear_auth():
    """Helper to clear credentials."""
    client.credentials()

def run_tests():
    print("=" * 70)
    print("STARTING STEP 7 AUTHENTICATION & RBAC AUTOMATED TEST SUITE")
    print("=" * 70)

    # -------------------------------------------------------------
    # 1. Unauthenticated Endpoint Tests
    # -------------------------------------------------------------
    clear_auth()
    res = client.get('/api/auth/me/')
    assert res.status_code == 401, f"Expected 401 for /api/auth/me/, got {res.status_code}"
    print("[PASS] 1.1 GET /api/auth/me/ without token -> 401 Unauthorized")

    res = client.get('/api/orders/')
    assert res.status_code == 401, f"Expected 401 for /api/orders/, got {res.status_code}"
    print("[PASS] 1.2 GET /api/orders/ without token -> 401 Unauthorized")

    res = client.get('/api/inventory/')
    assert res.status_code == 401, f"Expected 401 for /api/inventory/, got {res.status_code}"
    print("[PASS] 1.3 GET /api/inventory/ without token -> 401 Unauthorized")

    res = client.get('/api/shops/')
    assert res.status_code == 200, f"Expected 200 for public shops, got {res.status_code}"
    print("[PASS] 1.4 GET /api/shops/ public browseable -> 200 OK")

    res = client.get('/api/products/')
    assert res.status_code == 200, f"Expected 200 for public products, got {res.status_code}"
    print("[PASS] 1.5 GET /api/products/ public browseable -> 200 OK")

    # -------------------------------------------------------------
    # 2. Registration API Tests
    # -------------------------------------------------------------
    ts = int(time.time())
    test_student_email = f"test_student_{ts}@campus.edu"
    User.objects.filter(email=test_student_email).delete()

    # 2.1 Successful Student Registration
    student_payload = {
        "name": "Rahul Verma",
        "email": test_student_email,
        "phone": f"98{str(ts)[-8:]}",
        "password": "SecureStudentPass2026!",
        "role": "STUDENT",
        "college_id": f"CS-{str(ts)[-4:]}",
        "department": "Computer Science",
        "hostel_block": "Block C",
        "room_number": "204"
    }
    res = client.post('/api/auth/register/', student_payload, format='json')
    assert res.status_code == 201, f"Student registration failed: {res.data}"
    assert 'access' in res.data and 'refresh' in res.data, "Tokens missing from register response"
    assert res.data['user']['email'] == test_student_email
    assert res.data['user']['role'] == 'STUDENT'
    assert 'password' not in res.data['user']
    print("[PASS] 2.1 POST /api/auth/register/ (Student) -> 201 Created with JWT Tokens")

    # 2.2 Duplicate Email Rejection
    res = client.post('/api/auth/register/', student_payload, format='json')
    assert res.status_code == 400, f"Expected 400 for duplicate email, got {res.status_code}"
    print("[PASS] 2.2 POST /api/auth/register/ (Duplicate Email) -> 400 Bad Request")

    # 2.3 Password Strength Validation (<8 characters or no digits)
    weak_pw_payload = {
        "name": "Weak User",
        "email": "weak_pw_test@campus.edu",
        "password": "short",
        "role": "STUDENT"
    }
    res = client.post('/api/auth/register/', weak_pw_payload, format='json')
    assert res.status_code == 400, f"Expected 400 for weak password, got {res.status_code}"
    print("[PASS] 2.3 POST /api/auth/register/ (Weak Password) -> 400 Bad Request")

    # 2.4 Block Self-Registration as ADMIN
    admin_reg_payload = {
        "name": "Hacker Admin",
        "email": "hacker_admin@campus.edu",
        "password": "SecurePassword123!",
        "role": "ADMIN"
    }
    res = client.post('/api/auth/register/', admin_reg_payload, format='json')
    assert res.status_code == 400, f"Expected 400 for ADMIN registration attempt, got {res.status_code}"
    print("[PASS] 2.4 POST /api/auth/register/ (Attempt role=ADMIN) -> 400 Forbidden / Rejected")

    # 2.5 Successful Shop Owner Registration
    test_vendor_email = f"test_vendor_{ts}@campus.edu"
    User.objects.filter(email=test_vendor_email).delete()
    vendor_payload = {
        "name": "Suresh Stationery",
        "email": test_vendor_email,
        "phone": f"97{str(ts)[-8:]}",
        "password": "SecureVendorPass2026!",
        "role": "SHOP_OWNER"
    }
    res = client.post('/api/auth/register/', vendor_payload, format='json')
    assert res.status_code == 201, f"Vendor registration failed: {res.data}"
    assert res.data['user']['role'] == 'SHOP_OWNER'
    print("[PASS] 2.5 POST /api/auth/register/ (Shop Owner) -> 201 Created with JWT Tokens")

    # -------------------------------------------------------------
    # 3. Login API Tests
    # -------------------------------------------------------------
    # 3.1 Successful Login
    res = client.post('/api/auth/login/', {
        "email": test_student_email,
        "password": "SecureStudentPass2026!"
    }, format='json')
    assert res.status_code == 200, f"Login failed: {res.data}"
    assert 'access' in res.data and 'refresh' in res.data
    assert res.data['user']['email'] == test_student_email
    assert 'password' not in res.data['user']
    saved_access = res.data['access']
    saved_refresh = res.data['refresh']
    print("[PASS] 3.1 POST /api/auth/login/ (Valid Credentials) -> 200 OK with Tokens")

    # 3.2 Wrong Password
    res = client.post('/api/auth/login/', {
        "email": test_student_email,
        "password": "WrongPassword123!"
    }, format='json')
    assert res.status_code == 400, f"Expected 400 for bad password, got {res.status_code}"
    print("[PASS] 3.2 POST /api/auth/login/ (Wrong Password) -> 400 Bad Request")

    # 3.3 Non-existent Email
    res = client.post('/api/auth/login/', {
        "email": "nobody@campus.edu",
        "password": "AnyPassword123!"
    }, format='json')
    assert res.status_code == 400, f"Expected 400 for non-existent user, got {res.status_code}"
    print("[PASS] 3.3 POST /api/auth/login/ (Non-existent Email) -> 400 Bad Request")

    # -------------------------------------------------------------
    # 4. Token Refresh Tests
    # -------------------------------------------------------------
    res = client.post('/api/auth/token/refresh/', {"refresh": saved_refresh}, format='json')
    assert res.status_code == 200, f"Token refresh failed: {res.data}"
    assert 'access' in res.data, "New access token missing from refresh response"
    new_access = res.data['access']
    new_refresh = res.data.get('refresh', saved_refresh)
    print("[PASS] 4.1 POST /api/auth/token/refresh/ -> 200 OK with refreshed tokens")

    # -------------------------------------------------------------
    # 5. Current User API (/api/auth/me/)
    # -------------------------------------------------------------
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_access}')
    res = client.get('/api/auth/me/')
    assert res.status_code == 200, f"Current user failed: {res.data}"
    assert res.data['email'] == test_student_email
    assert res.data['role'] == 'STUDENT'
    print("[PASS] 5.1 GET /api/auth/me/ (Authenticated) -> 200 OK with User Profile")

    # -------------------------------------------------------------
    # 6. Logout & Token Blacklisting
    # -------------------------------------------------------------
    res = client.post('/api/auth/logout/', {"refresh": new_refresh}, format='json')
    assert res.status_code == 200, f"Logout failed: {res.data}"
    print("[PASS] 6.1 POST /api/auth/logout/ -> 200 OK (Token blacklisted)")

    # Subsequent refresh attempt with blacklisted token MUST fail
    res = client.post('/api/auth/token/refresh/', {"refresh": new_refresh}, format='json')
    assert res.status_code == 401, f"Expected 401 for blacklisted token refresh, got {res.status_code}"
    print("[PASS] 6.2 POST /api/auth/token/refresh/ with blacklisted token -> 401 Unauthorized")

    # -------------------------------------------------------------
    # 7. Role-Based Permissions & Isolation Setup
    # -------------------------------------------------------------
    print("\nSetting up isolated test data for RBAC & Cross-Entity testing...")
    # Seed users
    admin_user = User.objects.filter(role=User.Role.ADMIN).first()
    if not admin_user:
        admin_user = User.objects.create(
            username="admin_rbac_test",
            email="admin_rbac_test@campus.edu",
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True
        )
        admin_user.set_password("AdminPass2026!")
        admin_user.save()

    student_a = User.objects.get(email=test_student_email)

    student_b, _ = User.objects.get_or_create(
        email="student_b@campus.edu",
        defaults={"username": "student_b", "role": User.Role.STUDENT, "phone_number": "9876543222"}
    )
    student_b.set_password("StudentPassB2026!")
    student_b.save()

    owner_1 = User.objects.get(email=test_vendor_email)

    owner_2, _ = User.objects.get_or_create(
        email="owner_2@campus.edu",
        defaults={"username": "owner_2", "role": User.Role.SHOP_OWNER, "phone_number": "9876543233"}
    )
    owner_2.set_password("OwnerPass22026!")
    owner_2.save()

    # Create 2 distinct shops
    shop_1, _ = Shop.objects.get_or_create(
        owner=owner_1,
        defaults={
            "name": f"Alpha Stationery Shop {ts}",
            "slug": f"alpha-stationery-{ts}",
            "shop_type": Shop.ShopType.COLLEGE_STATIONERY,
            "address": "Campus North",
            "contact_phone": "9876543211",
            "is_active": True
        }
    )

    shop_2, _ = Shop.objects.get_or_create(
        owner=owner_2,
        defaults={
            "name": "Beta Stationery Shop 2",
            "slug": "beta-stationery-2",
            "shop_type": Shop.ShopType.BOOK_STATIONERY,
            "address": "Campus South",
            "contact_phone": "9876543233",
            "is_active": True
        }
    )

    category, _ = Category.objects.get_or_create(name="Notebooks", defaults={"slug": "notebooks"})

    prod_1, _ = Product.objects.get_or_create(
        shop=shop_1,
        name="Shop 1 Spiral Notebook",
        defaults={"sku": "S1-NB-001", "price": Decimal("60.00"), "category": category, "is_active": True}
    )

    prod_2, _ = Product.objects.get_or_create(
        shop=shop_2,
        name="Shop 2 Drawing Book",
        defaults={"sku": "S2-DB-001", "price": Decimal("80.00"), "category": category, "is_active": True}
    )

    inv_1, _ = Inventory.objects.get_or_create(
        shop=shop_1,
        product=prod_1,
        defaults={"current_stock": 100, "reorder_threshold": 10}
    )

    inv_2, _ = Inventory.objects.get_or_create(
        shop=shop_2,
        product=prod_2,
        defaults={"current_stock": 50, "reorder_threshold": 5}
    )

    order_1, _ = Order.objects.get_or_create(
        customer=student_a,
        shop=shop_1,
        defaults={"subtotal": Decimal("60.00"), "total_amount": Decimal("60.00"), "status": Order.Status.PENDING}
    )

    order_2, _ = Order.objects.get_or_create(
        customer=student_b,
        shop=shop_2,
        defaults={"subtotal": Decimal("80.00"), "total_amount": Decimal("80.00"), "status": Order.Status.PENDING}
    )

    # -------------------------------------------------------------
    # 8. Student Permissions & Cross-User Isolation
    # -------------------------------------------------------------
    authenticate(student_a)

    # 8.1 Student A lists orders -> Sees Order 1, cannot see Order 2
    res = client.get('/api/orders/')
    assert res.status_code == 200
    order_ids = [o['id'] for o in res.data['results']] if 'results' in res.data else [o['id'] for o in res.data]
    assert order_1.id in order_ids, "Student A should see their own order"
    assert order_2.id not in order_ids, "Student A must NOT see Student B's order"
    print("[PASS] 8.1 Student Queryset Filtering: Student A sees only their own orders")

    # 8.2 Student A attempts to access Student B's order directly -> 404 Not Found (filtered out)
    res = client.get(f'/api/orders/{order_2.id}/')
    assert res.status_code in [403, 404], f"Expected 403 or 404, got {res.status_code}"
    print("[PASS] 8.2 Cross-User Order Isolation: Student A accessing Student B's order -> DENIED")

    # 8.3 Student A attempts to modify order status -> 403 Forbidden
    res = client.patch(f'/api/orders/{order_1.id}/', {"status": "CONFIRMED"}, format='json')
    assert res.status_code == 403, f"Expected 403 for student modifying status, got {res.status_code}"
    print("[PASS] 8.3 Student cannot modify order status -> 403 Forbidden")

    # 8.4 Student A attempts to access inventory -> 403 Forbidden
    res = client.get('/api/inventory/')
    assert res.status_code == 403, f"Expected 403 for student accessing inventory, got {res.status_code}"
    print("[PASS] 8.4 Student accessing /api/inventory/ -> 403 Forbidden")

    # 8.5 Student A attempts to adjust stock -> 403 Forbidden
    res = client.post(f'/api/inventory/{inv_1.id}/adjust-stock/', {"quantity_change": 5, "transaction_type": "RESTOCK"}, format='json')
    assert res.status_code == 403, f"Expected 403 for student adjusting stock, got {res.status_code}"
    print("[PASS] 8.5 Student adjusting stock -> 403 Forbidden")

    # 8.6 Student A manages notes (isolated from Student B)
    note = StudentNote.objects.create(student=student_a, title="Rahul Note", content="Secret study notes")
    authenticate(student_b)
    res = client.get('/api/notes/')
    assert res.status_code == 200
    note_ids = [n['id'] for n in res.data['results']] if 'results' in res.data else [n['id'] for n in res.data]
    assert note.id not in note_ids, "Student B must NOT see Student A's notes"
    print("[PASS] 8.6 Student Note Isolation: Student B cannot see Student A's private notes")

    # -------------------------------------------------------------
    # 9. Shop Owner Permissions & Cross-Shop Isolation
    # -------------------------------------------------------------
    authenticate(owner_1)

    # 9.1 Shop Owner 1 lists orders -> Sees Order 1 (Shop 1), does NOT see Order 2 (Shop 2)
    res = client.get('/api/orders/')
    assert res.status_code == 200
    owner_order_ids = [o['id'] for o in res.data['results']] if 'results' in res.data else [o['id'] for o in res.data]
    assert order_1.id in owner_order_ids, "Shop Owner 1 should see Shop 1's orders"
    assert order_2.id not in owner_order_ids, "Shop Owner 1 must NOT see Shop 2's orders"
    print("[PASS] 9.1 Shop Owner Queryset Scoping: Shop Owner 1 sees only Shop 1 orders")

    # 9.2 Shop Owner 1 directly accessing Shop 2's order -> Denied (404/403)
    res = client.get(f'/api/orders/{order_2.id}/')
    assert res.status_code in [403, 404], f"Expected 403/404 for cross-shop order access, got {res.status_code}"
    print("[PASS] 9.2 Cross-Shop Order Access: Shop Owner 1 accessing Shop 2's order -> DENIED")

    # 9.3 Shop Owner 1 modifying Shop 1's order status -> Allowed
    res = client.patch(f'/api/orders/{order_1.id}/', {"status": "CONFIRMED"}, format='json')
    assert res.status_code == 200, f"Shop Owner 1 should be able to confirm Shop 1 order: {res.data}"
    print("[PASS] 9.3 Shop Owner modifying own shop order status -> 200 OK")

    # 9.4 Shop Owner 1 views inventory -> Sees only Shop 1 inventory
    res = client.get('/api/inventory/')
    assert res.status_code == 200
    inv_ids = [i['id'] for i in res.data['results']] if 'results' in res.data else [i['id'] for i in res.data]
    assert inv_1.id in inv_ids, "Owner 1 should see Shop 1 inventory"
    assert inv_2.id not in inv_ids, "Owner 1 must NOT see Shop 2 inventory"
    print("[PASS] 9.4 Shop Owner Inventory Scoping: Owner 1 sees only Shop 1 inventory")

    # 9.5 Shop Owner 1 attempting to adjust Shop 2's inventory -> Denied (403/404)
    res = client.post(f'/api/inventory/{inv_2.id}/adjust-stock/', {"quantity_change": 10, "transaction_type": "RESTOCK"}, format='json')
    assert res.status_code in [403, 404], f"Expected 403/404 for cross-shop stock adjustment, got {res.status_code}"
    print("[PASS] 9.5 Cross-Shop Inventory Adjustment: Owner 1 adjusting Shop 2 stock -> DENIED")

    # 9.6 Shop Owner 1 attempting to modify Shop 2 settings -> 403 Forbidden
    res = client.patch(f'/api/shops/{shop_2.id}/', {"name": "Hacked Shop Name"}, format='json')
    assert res.status_code == 403, f"Expected 403 for modifying another shop, got {res.status_code}"
    print("[PASS] 9.6 Cross-Shop Modification: Owner 1 modifying Shop 2 -> 403 Forbidden")

    # -------------------------------------------------------------
    # 10. Admin Universal Permissions
    # -------------------------------------------------------------
    authenticate(admin_user)

    # 10.1 Admin lists orders -> Sees BOTH Order 1 and Order 2
    res = client.get('/api/orders/')
    assert res.status_code == 200
    all_order_ids = [o['id'] for o in res.data['results']] if 'results' in res.data else [o['id'] for o in res.data]
    assert order_1.id in all_order_ids and order_2.id in all_order_ids, "Admin must see all orders"
    print("[PASS] 10.1 Admin Universal Access: Admin sees all orders across all shops")

    # 10.2 Admin lists inventory -> Sees all shops' inventory
    res = client.get('/api/inventory/')
    assert res.status_code == 200
    all_inv_ids = [i['id'] for i in res.data['results']] if 'results' in res.data else [i['id'] for i in res.data]
    assert inv_1.id in all_inv_ids and inv_2.id in all_inv_ids, "Admin must see all inventory"
    print("[PASS] 10.2 Admin Universal Access: Admin sees all inventory records")

    # 10.3 Admin creates academic calendar event -> 201 Created
    res = client.post('/api/academic/', {
        "title": "Semester Final Examinations 2026",
        "event_type": "FINAL_EXAM",
        "start_date": "2026-11-15",
        "end_date": "2026-11-30",
        "semester": "Fall 2026",
        "description": "Final exam schedule for all departments"
    }, format='json')
    assert res.status_code == 201, f"Admin academic event creation failed: {res.data}"
    print("[PASS] 10.3 Admin Platform Management: Admin creates Academic Calendar event -> 201 Created")

    # 10.4 Student attempts to create academic calendar event -> 403 Forbidden
    authenticate(student_a)
    res = client.post('/api/academic/', {
        "title": "Student Holiday",
        "event_type": "HOLIDAY",
        "start_date": "2026-12-01",
        "end_date": "2026-12-02",
        "semester": "Fall 2026"
    }, format='json')
    assert res.status_code == 403, f"Expected 403 for student modifying academic calendar, got {res.status_code}"
    print("[PASS] 10.4 Student cannot modify Academic Calendar -> 403 Forbidden")

    print("\n" + "=" * 70)
    print("ALL STEP 7 AUTHENTICATION & RBAC TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == '__main__':
    run_tests()
