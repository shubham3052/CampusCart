"""
STEP 8 Master Backend API Verification & Regression Suite.
Covers all 15 feature modules and security domains against the MySQL database.
"""

import os
import django
from decimal import Decimal
import io

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.files.uploadedfile import SimpleUploadedFile

from shops.models import Shop
from products.models import Category, Product, ShoppingList, ShoppingListItem
from inventory.models import Inventory, InventoryTransaction
from orders.models import Order, OrderItem
from printing.models import PrintingOrder, UploadedDocument
from delivery.models import PickupSlot, Delivery
from academics.models import AcademicCalendar, StudentNote, StudentTask
from predictions.models import DemandPrediction, PurchaseRecommendation, ProductRecommendation

User = get_user_model()
client = APIClient()

def authenticate(user):
    refresh = RefreshToken.for_user(user)
    token = str(refresh.access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return str(refresh), token

def clear_auth():
    client.credentials()

from django.conf import settings
from django.core import mail

def run_all_tests():
    print("=" * 75)
    print("RUNNING STEP 8 COMPREHENSIVE BACKEND API & SECURITY TEST SUITE")
    print("=" * 75)

    # Enforce in-memory email backend
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    # -------------------------------------------------------------
    # 1. Health Check
    # -------------------------------------------------------------
    clear_auth()
    res = client.get('/api/health/')
    assert res.status_code == 200, f"Health check failed: {res.data}"
    assert res.data['status'] == 'ok'
    assert res.data['message'] == 'Smart Stationery API is running'
    print("[PASS] 1. GET /api/health/ -> 200 OK")

    # -------------------------------------------------------------
    # 2. Authentication Testing (student@test.com, owner@test.com, admin@test.com)
    # Clean up dependent test entities safely
    test_emails = ["student@test.com", "owner@test.com", "admin@test.com", "student_b@test.com", "owner_b@test.com", "agent@test.com", "closed@test.com"]
    test_users = list(User.objects.filter(email__in=test_emails))
    if test_users:
        Order.objects.filter(customer__in=test_users).delete()
        Order.objects.filter(shop__owner__in=test_users).delete()
        Product.objects.filter(shop__owner__in=test_users).delete()
        Shop.objects.filter(owner__in=test_users).delete()
        User.objects.filter(id__in=[u.id for u in test_users]).delete()

    # 2.1 Student Registration & Verification
    student_payload = {
        "name": "Test Student",
        "email": "student@test.com",
        "phone": "9800000001",
        "password": "SecureStudentPass2026!",
        "role": "STUDENT"
    }
    res = client.post('/api/auth/register/', student_payload, format='json')
    assert res.status_code == 201, f"Student registration failed: {res.data}"
    student_user = User.objects.get(email="student@test.com")
    assert student_user.role == User.Role.STUDENT
    assert 'access' in res.data and 'refresh' in res.data
    student_access = res.data['access']
    student_refresh = res.data['refresh']
    print("[PASS] 2.1 Student Registration (student@test.com) -> Role: STUDENT verified")

    # 2.2 Shop Owner Registration & Verification
    owner_payload = {
        "name": "Test Shop Owner",
        "email": "owner@test.com",
        "phone": "9800000002",
        "password": "SecureOwnerPass2026!",
        "role": "SHOP_OWNER"
    }
    res = client.post('/api/auth/register/', owner_payload, format='json')
    assert res.status_code == 201, f"Owner registration failed: {res.data}"
    owner_user = User.objects.get(email="owner@test.com")
    assert owner_user.role == User.Role.SHOP_OWNER
    print("[PASS] 2.2 Shop Owner Registration (owner@test.com) -> Role: SHOP_OWNER verified")

    # 2.3 Admin Account Creation & Verification (Admin accounts created securely by admin/dev)
    admin_user = User.objects.create(
        username="admin_step8",
        email="admin@test.com",
        first_name="Platform",
        last_name="Administrator",
        role=User.Role.ADMIN,
        phone_number="9800000003",
        is_staff=True,
        is_superuser=True
    )
    admin_user.set_password("SecureAdminPass2026!")
    admin_user.save()
    assert admin_user.role == User.Role.ADMIN
    assert admin_user.is_admin is True
    print("[PASS] 2.3 Admin Account Creation (admin@test.com) -> Role: ADMIN verified")

    # 2.4 Login API Verification
    res = client.post('/api/auth/login/', {"email": "student@test.com", "password": "SecureStudentPass2026!"}, format='json')
    assert res.status_code == 200
    assert 'access' in res.data and 'refresh' in res.data
    assert res.data['user']['email'] == "student@test.com"
    assert 'password' not in res.data['user']
    print("[PASS] 2.4 Login API -> 200 OK (Tokens received, password safe)")

    # 2.5 Token Refresh & Current User
    res = client.post('/api/auth/token/refresh/', {"refresh": student_refresh}, format='json')
    assert res.status_code == 200
    new_student_access = res.data['access']

    client.credentials(HTTP_AUTHORIZATION=f'Bearer {new_student_access}')
    res = client.get('/api/auth/me/')
    assert res.status_code == 200
    assert res.data['email'] == "student@test.com"
    print("[PASS] 2.5 Token Refresh & GET /api/auth/me/ -> 200 OK")

    # -------------------------------------------------------------
    # 3 & 4. Role Permissions & Object-Level Security Testing
    # -------------------------------------------------------------
    # Setup Student A, Student B, Shop Owner A, Shop Owner B, Shop A, Shop B
    User.objects.filter(email__in=["student_b@test.com", "owner_b@test.com"]).delete()

    student_b = User.objects.create(username="student_b_step8", email="student_b@test.com", role=User.Role.STUDENT, phone_number="9800000004")
    student_b.set_password("StudentBPass2026!")
    student_b.save()

    owner_b = User.objects.create(username="owner_b_step8", email="owner_b@test.com", role=User.Role.SHOP_OWNER, phone_number="9800000005")
    owner_b.set_password("OwnerBPass2026!")
    owner_b.save()

    # Create Shop A (owned by owner_user) and Shop B (owned by owner_b)
    Shop.objects.filter(slug__in=["shop-a-step8", "shop-b-step8"]).delete()

    shop_a = Shop.objects.create(
        owner=owner_user,
        name="Campus Express Shop A",
        slug="shop-a-step8",
        shop_type=Shop.ShopType.COLLEGE_STATIONERY,
        address="Academic Complex North",
        contact_phone="9800000002",
        is_active=True
    )
    shop_b = Shop.objects.create(
        owner=owner_b,
        name="Campus Books Shop B",
        slug="shop-b-step8",
        shop_type=Shop.ShopType.BOOK_STATIONERY,
        address="Student Center South",
        contact_phone="9800000005",
        is_active=True
    )

    category, _ = Category.objects.get_or_create(slug="office-study", defaults={"name": "Office & Study Supplies"})

    prod_a = Product.objects.create(shop=shop_a, category=category, name="Shop A Ball Pen", sku="P-A-BALL", price=Decimal("12.00"), is_active=True)
    prod_b = Product.objects.create(shop=shop_b, category=category, name="Shop B Gel Pen", sku="P-B-GEL", price=Decimal("25.00"), is_active=True)

    inv_a = Inventory.objects.create(shop=shop_a, product=prod_a, current_stock=100, reorder_threshold=10)
    inv_b = Inventory.objects.create(shop=shop_b, product=prod_b, current_stock=50, reorder_threshold=5)

    order_a = Order.objects.create(customer=student_user, shop=shop_a, subtotal=Decimal("12.00"), total_amount=Decimal("12.00"), status=Order.Status.PENDING)

    # 4.1 Student B cannot access Student A's private order
    authenticate(student_b)
    res = client.get(f'/api/orders/{order_a.id}/')
    assert res.status_code in [403, 404], f"Expected 403 or 404, got {res.status_code}"
    print("[PASS] 4.1 Student B cannot access Student A's private order -> Protected")

    # 4.2 Shop Owner B cannot access Shop A's order
    authenticate(owner_b)
    res = client.get(f'/api/orders/{order_a.id}/')
    assert res.status_code in [403, 404], f"Expected 403 or 404, got {res.status_code}"
    print("[PASS] 4.2 Shop Owner B cannot access Shop A's order -> Protected")

    # 4.3 Shop Owner B cannot modify Shop A's products
    res = client.patch(f'/api/products/{prod_a.id}/', {"price": "99.00"}, format='json')
    assert res.status_code in [403, 404], f"Expected 403 or 404, got {res.status_code}"
    print("[PASS] 4.3 Shop Owner B cannot modify Shop A's products -> Protected")

    # 4.4 Shop Owner B cannot modify Shop A's inventory
    res = client.post(f'/api/inventory/{inv_a.id}/adjust-stock/', {"quantity_change": 10, "transaction_type": "RESTOCK"}, format='json')
    assert res.status_code in [403, 404], f"Expected 403 or 404, got {res.status_code}"
    print("[PASS] 4.4 Shop Owner B cannot modify Shop A's inventory -> Protected")

    # 4.5 Shop Owner A can access only Shop A data
    authenticate(owner_user)
    res = client.get(f'/api/orders/{order_a.id}/')
    assert res.status_code == 200, f"Owner A should access Shop A order: {res.data}"
    print("[PASS] 4.5 Shop Owner A can access Shop A data -> 200 OK")

    # 4.6 Admin can access both
    authenticate(admin_user)
    res_orders = client.get('/api/orders/')
    assert res_orders.status_code == 200
    res_inv = client.get('/api/inventory/')
    assert res_inv.status_code == 200
    print("[PASS] 4.6 Admin can access all shops and orders -> 200 OK")

    # -------------------------------------------------------------
    # 5. Product API Testing (CRUD & Validations)
    # -------------------------------------------------------------
    authenticate(owner_user)

    # 5.1 Valid Product Creation
    valid_prod_payload = {
        "shop": shop_a.id,
        "category": category.id,
        "name": "Premium Spiral Notebook",
        "sku": "NB-PREM-001",
        "price": "75.00",
        "brand": "Classmate",
        "unit": "PIECE",
        "is_active": True
    }
    res = client.post('/api/products/', valid_prod_payload, format='json')
    assert res.status_code == 201, f"Product create failed: {res.data}"
    created_prod_id = res.data['id']
    print("[PASS] 5.1 POST /api/products/ (Valid Product) -> 201 Created")

    # 5.2 Negative Price Rejection
    neg_price_payload = valid_prod_payload.copy()
    neg_price_payload['sku'] = "NB-NEG-PRICE"
    neg_price_payload['price'] = "-50.00"
    res = client.post('/api/products/', neg_price_payload, format='json')
    assert res.status_code == 400, f"Expected 400 for negative price, got {res.status_code}"
    print("[PASS] 5.2 POST /api/products/ (Negative Price) -> 400 Bad Request")

    # 5.3 Missing / Invalid Name
    no_name_payload = valid_prod_payload.copy()
    no_name_payload['name'] = ""
    res = client.post('/api/products/', no_name_payload, format='json')
    assert res.status_code == 400, f"Expected 400 for missing name, got {res.status_code}"
    print("[PASS] 5.3 POST /api/products/ (Missing Name) -> 400 Bad Request")

    # 5.4 Inactive Shop Rejection
    closed_shop = Shop.objects.create(
        owner=User.objects.create(username="closed_owner", email="closed@test.com", role=User.Role.SHOP_OWNER),
        name="Closed Bookstore", slug="closed-bookstore", contact_phone="9800000009", is_active=False
    )
    inact_shop_payload = valid_prod_payload.copy()
    inact_shop_payload['shop'] = closed_shop.id
    res = client.post('/api/products/', inact_shop_payload, format='json')
    assert res.status_code in [400, 403], f"Expected rejection for inactive shop, got {res.status_code}"
    print("[PASS] 5.4 POST /api/products/ (Inactive Shop) -> Rejected properly")

    # 5.5 Product GET & PATCH & DELETE
    res = client.get(f'/api/products/{created_prod_id}/')
    assert res.status_code == 200
    res = client.patch(f'/api/products/{created_prod_id}/', {"price": "80.00"}, format='json')
    assert res.status_code == 200
    assert Decimal(str(res.data['price'])) == Decimal("80.00")
    res = client.delete(f'/api/products/{created_prod_id}/')
    assert res.status_code == 204
    print("[PASS] 5.5 Product GET, PATCH & DELETE -> Validated")

    # -------------------------------------------------------------
    # 6. Inventory API Testing & Negative Stock Protection
    # -------------------------------------------------------------
    # Stock cannot become negative: current_stock = 5, attempt decrease by 10 -> rejected
    inv_test_prod = Product.objects.create(shop=shop_a, category=category, name="Test Marker", sku="MRK-001", price=Decimal("30.00"))
    inv_test = Inventory.objects.create(shop=shop_a, product=inv_test_prod, current_stock=5, reorder_threshold=10)

    # Attempt decrease by 10
    res = client.post(f'/api/inventory/{inv_test.id}/adjust-stock/', {"quantity_change": -10, "transaction_type": "AUDIT_CORRECTION"}, format='json')
    assert res.status_code == 400, f"Expected 400 for negative stock, got {res.status_code}"
    inv_test.refresh_from_db()
    assert inv_test.current_stock == 5, "Stock must remain unchanged"
    print("[PASS] 6.1 Stock Negative Protection (Current 5, Deduct 10) -> 400 Bad Request")

    # Successful stock increase
    res = client.post(f'/api/inventory/{inv_test.id}/adjust-stock/', {"quantity_change": 25, "transaction_type": "RESTOCK"}, format='json')
    assert res.status_code == 200
    inv_test.refresh_from_db()
    assert inv_test.current_stock == 30
    print("[PASS] 6.2 Stock Increase (+25) -> Current stock: 30")

    # Low-Stock Filtering
    res = client.get('/api/inventory/?status=low')
    assert res.status_code == 200
    print("[PASS] 6.3 Low-Stock Filtering Query (?status=low) -> 200 OK")

    # -------------------------------------------------------------
    # 7. Order API Testing (Multi-Product & Backend Total Calculation)
    # -------------------------------------------------------------
    authenticate(student_user)

    # Setup 3 products: Blue Pen (x2 @ 15.00 = 30.00), Notebook (x1 @ 50.00 = 50.00), Record File (x3 @ 40.00 = 120.00)
    # Total expected subtotal = 30 + 50 + 120 = 200.00
    p_pen = Product.objects.create(shop=shop_a, category=category, name="Blue Pen", sku="PEN-BLU-TEST", price=Decimal("15.00"), is_active=True)
    p_nb = Product.objects.create(shop=shop_a, category=category, name="Notebook", sku="NB-TEST", price=Decimal("50.00"), is_active=True)
    p_file = Product.objects.create(shop=shop_a, category=category, name="Record File", sku="FILE-TEST", price=Decimal("40.00"), is_active=True)

    inv_pen = Inventory.objects.create(shop=shop_a, product=p_pen, current_stock=50, reorder_threshold=5)
    inv_nb = Inventory.objects.create(shop=shop_a, product=p_nb, current_stock=30, reorder_threshold=5)
    inv_file = Inventory.objects.create(shop=shop_a, product=p_file, current_stock=20, reorder_threshold=5)

    multi_order_payload = {
        "shop": shop_a.id,
        "fulfillment_type": "PICKUP",
        "items": [
            {"product_id": p_pen.id, "quantity": 2},
            {"product_id": p_nb.id, "quantity": 1},
            {"product_id": p_file.id, "quantity": 3}
        ]
    }
    res = client.post('/api/orders/', multi_order_payload, format='json')
    assert res.status_code == 201, f"Multi-item order failed: {res.data}"
    order_data = res.data['order']
    created_order_id = order_data['id']

    # Verify backend calculates price from database
    assert Decimal(str(order_data['subtotal'])) == Decimal("200.00")
    assert Decimal(str(order_data['total_amount'])) == Decimal("200.00")

    # Verify atomic stock deductions
    inv_pen.refresh_from_db()
    inv_nb.refresh_from_db()
    inv_file.refresh_from_db()
    assert inv_pen.current_stock == 48
    assert inv_nb.current_stock == 29
    assert inv_file.current_stock == 17
    print("[PASS] 7.1 Multi-Item Order (Blue Pen x 2, Notebook x 1, Record File x 3) -> Subtotal $200.00 Calculated by Backend")

    # Empty order rejection
    res = client.post('/api/orders/', {"shop": shop_a.id, "items": []}, format='json')
    assert res.status_code == 400
    print("[PASS] 7.2 Empty Order Submission -> 400 Bad Request")

    # -------------------------------------------------------------
    # 8. Order Status Lifecycle & Invalid Transitions
    # -------------------------------------------------------------
    authenticate(owner_user)

    # Valid transition: PENDING -> CONFIRMED
    res = client.patch(f'/api/orders/{created_order_id}/', {"status": "CONFIRMED"}, format='json')
    assert res.status_code == 200
    assert res.data['status'] == "CONFIRMED"

    # Valid transition: CONFIRMED -> PREPARING
    res = client.patch(f'/api/orders/{created_order_id}/', {"status": "PREPARING"}, format='json')
    assert res.status_code == 200
    assert res.data['status'] == "PREPARING"

    # Valid transition: PREPARING -> READY
    res = client.patch(f'/api/orders/{created_order_id}/', {"status": "READY"}, format='json')
    assert res.status_code == 200
    assert res.data['status'] == "READY"

    # Illegal transition: READY -> PENDING (Reversed / Invalid)
    res = client.patch(f'/api/orders/{created_order_id}/', {"status": "PENDING"}, format='json')
    assert res.status_code == 400
    print("[PASS] 8.1 Order Workflow: PENDING -> CONFIRMED -> PREPARING -> READY -> Illegal Reset to PENDING Blocked")

    # Complete order with OTP verification
    otp_record = Order.objects.get(id=created_order_id).otps.filter(is_verified=False).order_by('-created_at').first()
    otp_val = otp_record.get_plaintext_otp() if otp_record else ''
    res = client.post(f'/api/orders/{created_order_id}/verify-otp/', {"otp_code": otp_val}, format='json')
    assert res.status_code == 200
    assert res.data['order']['status'] in ["PICKED_UP", "COMPLETED"]
    print(f"[PASS] 8.2 Order OTP Pickup Verification -> Status: {res.data['order']['status']}")

    # -------------------------------------------------------------
    # 9. Printing API Testing
    # -------------------------------------------------------------
    authenticate(student_user)

    # Standalone printing order parent
    print_parent_order = Order.objects.create(
        customer=student_user,
        shop=shop_a,
        order_type=Order.OrderType.PRINTING,
        subtotal=Decimal("40.00"),
        total_amount=Decimal("40.00")
    )
    print_job = PrintingOrder.objects.create(
        order=print_parent_order,
        shop=shop_a,
        color_mode=PrintingOrder.ColorMode.BW,
        paper_size=PrintingOrder.PaperSize.A4,
        total_pages=20,
        copies=2,
        price=Decimal("40.00"),
        status=PrintingOrder.PrintingStatus.WAITING
    )

    # Upload document to printing job
    test_pdf = SimpleUploadedFile("assignment.pdf", b"%PDF-1.4 dummy pdf content for testing", content_type="application/pdf")
    res = client.post(f'/api/printing/{print_job.id}/upload-document/', {"file": test_pdf, "page_count": 20}, format='multipart')
    assert res.status_code == 201
    print("[PASS] 9.1 Printing Document Upload (PDF, 20 Pages, 2 Copies) -> 201 Created")

    # Invalid printing values: pages=0 or copies=0 rejected
    res = client.post('/api/printing/', {"total_pages": 0, "copies": 0, "order": print_parent_order.id}, format='json')
    assert res.status_code == 400
    print("[PASS] 9.2 Invalid Printing Values (pages=0, copies=0) -> 400 Bad Request")

    # -------------------------------------------------------------
    # 10. Pickup Slot Capacity Testing
    # -------------------------------------------------------------
    slot = PickupSlot.objects.create(
        shop=shop_a,
        date="2026-09-12",
        start_time="14:00:00",
        end_time="15:00:00",
        capacity=10,
        booked_count=10, # Full capacity
        is_active=True
    )
    res = client.post('/api/orders/', {
        "shop": shop_a.id,
        "fulfillment_type": "PICKUP",
        "pickup_slot": slot.id,
        "items": [{"product_id": p_pen.id, "quantity": 1}]
    }, format='json')
    assert res.status_code == 400
    print("[PASS] 10.1 Pickup Slot Full Capacity Rejection (Capacity 10, Booked 10) -> 400 Bad Request")

    # -------------------------------------------------------------
    # 11. Delivery API Testing
    # -------------------------------------------------------------
    agent_user = User.objects.create(username="agent_step8", email="agent@test.com", role=User.Role.DELIVERY_AGENT, phone_number="9800000007")
    delivery_order = Order.objects.create(
        customer=student_user, shop=shop_a, fulfillment_type=Order.FulfillmentType.DELIVERY,
        delivery_address="Hostel B, Room 304", subtotal=Decimal("50.00"), total_amount=Decimal("65.00")
    )
    delivery = Delivery.objects.create(order=delivery_order, delivery_agent=agent_user, delivery_status="ASSIGNED")

    # Assigned delivery agent updates status
    authenticate(agent_user)
    res = client.patch(f'/api/deliveries/{delivery.id}/', {"delivery_status": "OUT_FOR_DELIVERY"}, format='json')
    assert res.status_code == 200
    assert res.data['delivery_status'] == "OUT_FOR_DELIVERY"
    print("[PASS] 11.1 Delivery Progress Update (ASSIGNED -> OUT_FOR_DELIVERY) -> 200 OK")

    # Unauthorized student attempts to update delivery status
    authenticate(student_user)
    res = client.patch(f'/api/deliveries/{delivery.id}/', {"delivery_status": "DELIVERED"}, format='json')
    assert res.status_code == 403
    print("[PASS] 11.2 Unauthorized Delivery Update by Student -> 403 Forbidden")

    # -------------------------------------------------------------
    # 12. Notes / Tasks / Shopping List Testing
    # -------------------------------------------------------------
    authenticate(student_user)

    # 12.1 Student Notes CRUD
    res = client.post('/api/notes/', {"title": "Maths Revision", "content": "Integration formulas chapter 4"}, format='json')
    assert res.status_code == 201
    note_id = res.data['id']
    res = client.get(f'/api/notes/{note_id}/')
    assert res.status_code == 200
    res = client.patch(f'/api/notes/{note_id}/', {"is_pinned": True}, format='json')
    assert res.status_code == 200 and res.data['is_pinned'] is True
    res = client.delete(f'/api/notes/{note_id}/')
    assert res.status_code == 204
    print("[PASS] 12.1 Student Study Notes CRUD -> Validated")

    # 12.2 Student Tasks CRUD & Completion
    res = client.post('/api/tasks/', {"title": "Submit Assignment", "priority": "HIGH", "deadline": "2026-09-20"}, format='json')
    assert res.status_code == 201
    task_id = res.data['id']
    res = client.patch(f'/api/tasks/{task_id}/', {"completed": True}, format='json')
    assert res.status_code == 200 and res.data['completed'] is True
    print("[PASS] 12.2 Student Academic Tasks CRUD & Completion -> Validated")

    # 12.3 Shopping List Lifecycle (Create, Add Item, Update Qty, Check, Remove)
    res = client.post('/api/shopping-lists/', {"name": "Mid-Sem Lab Supplies"}, format='json')
    assert res.status_code == 201
    slist_id = res.data['id']

    # Add item
    res = client.post(f'/api/shopping-lists/{slist_id}/add-item/', {"product_id": p_pen.id, "quantity": 3}, format='json')
    assert res.status_code == 201
    item_id = res.data['data']['id']

    # Update quantity & toggle check
    res = client.post(f'/api/shopping-lists/{slist_id}/update-item/', {"item_id": item_id, "quantity": 5, "is_checked": True}, format='json')
    assert res.status_code == 200
    assert res.data['data']['quantity'] == 5
    assert res.data['data']['is_checked'] is True

    # Remove item
    res = client.post(f'/api/shopping-lists/{slist_id}/remove-item/', {"item_id": item_id}, format='json')
    assert res.status_code == 200
    print("[PASS] 12.3 Shopping List (Create, Add Item, Update Qty, Mark Checked, Remove) -> Validated")

    # -------------------------------------------------------------
    # 13. Academic Calendar API Testing (All 8 Event Types)
    # -------------------------------------------------------------
    authenticate(admin_user)
    event_types = [
        "SEMESTER_START", "ASSIGNMENT", "INTERNAL_EXAM", "FINAL_EXAM",
        "PROJECT_SUBMISSION", "PRACTICAL", "HOLIDAY", "COLLEGE_EVENT"
    ]
    for et in event_types:
        res = client.post('/api/academic/', {
            "title": f"Test Event {et}",
            "event_type": et,
            "start_date": "2026-10-01",
            "end_date": "2026-10-05",
            "semester": "Fall 2026"
        }, format='json')
        assert res.status_code == 201, f"Failed for event_type {et}: {res.data}"
    print(f"[PASS] 13.1 Academic Calendar API -> Successfully validated all 8 event types: {', '.join(event_types)}")

    # -------------------------------------------------------------
    # 14. Demand Prediction API Testing
    # -------------------------------------------------------------
    authenticate(owner_user)
    DemandPrediction.objects.filter(shop=shop_a, product=p_pen).delete()
    DemandPrediction.objects.create(
        shop=shop_a,
        product=p_pen,
        target_date="2026-10-15",
        predicted_units=120,
        model_name="LinearRegression_v1",
        confidence_score=Decimal("0.89")
    )
    res = client.get('/api/demand-predictions/')
    assert res.status_code == 200
    pred_data = res.data['results'][0] if 'results' in res.data else res.data[0]
    assert pred_data['predicted_demand'] == 120
    assert pred_data['model_name'] == "LinearRegression_v1"
    print("[PASS] 14.1 Demand Prediction API Structure & Shop Owner Access -> 200 OK")

    # -------------------------------------------------------------
    # 15. Recommendation API Testing
    # -------------------------------------------------------------
    PurchaseRecommendation.objects.filter(shop=shop_a, product=p_pen).delete()
    PurchaseRecommendation.objects.create(
        shop=shop_a,
        product=p_pen,
        current_stock=10,
        predicted_demand=80,
        recommended_reorder_qty=70,
        urgency_level=PurchaseRecommendation.Urgency.HIGH,
        rationale="Upcoming Internal Exam surge will exhaust current pen stock."
    )
    res = client.get('/api/recommendations/shop-restock/')
    assert res.status_code == 200
    assert res.data['success'] is True
    assert len(res.data['recommendations']) >= 1
    rec = res.data['recommendations'][0]
    assert rec['urgency_level'] == "HIGH"
    assert rec['recommended_reorder_qty'] == 70
    print("[PASS] 15.1 Smart Restock Recommendation API -> 200 OK (Urgency: HIGH, Order Qty: 70)")

    print("\n" + "=" * 75)
    print("ALL 15 MODULES & SECURITY TESTS IN STEP 8 PASSED WITH 100% SUCCESS!")
    print("=" * 75)

if __name__ == '__main__':
    run_all_tests()
