import io
import re
from datetime import date, timedelta
from decimal import Decimal
from django.utils import timezone
from django.core import mail
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import status
from rest_framework.test import APITestCase

from shops.models import Shop
from products.models import Product, Category, Review
from inventory.models import Inventory
from orders.models import Order, OrderItem, Payment, Refund
from printing.models import PrintingOrder, ShopPrintingConfig
from delivery.models import PickupSlot, DeliverySlot, Delivery, DeliveryLocation
from delivery.services.location_service import DeliveryLocationService
from users.models import EmailVerificationOTP

User = get_user_model()

# Valid 1-page PDF fixture for upload testing
VALID_1PAGE_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
)


class Step29CompleteE2EQATestCase(APITestCase):
    """
    STEP 29: Complete QA, End-to-End System Validation, Regression & Failure Testing Suite.
    Validates:
    - Full Student Journey (Registration, OTP, Search, Delivery Checkout, Tracking, Delivery OTP, Review, Analytics)
    - Full Document Printing Lifecycle (PDF validation, Price Calculation, Queue, Pickup OTP, Completion)
    - Strict Multi-Tenant Shop Isolation (Shop A vs Shop B inventory, orders, documents, analytics)
    - High-Value Failure & Security Scenarios (Admin role injection, Velocity spoofing, Corrupted PDF, Out-of-stock)
    - Financial Precision & Concurrency Controls (Decimal preservation, Idempotency)
    """

    def setUp(self):
        mail.outbox = []

        # 1. Accounts
        self.student = User.objects.create_user(
            username="student_aarav@campus.edu",
            email="student_aarav@campus.edu",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            name="Aarav Sharma",
            phone_number="9876543210",
            email_verified=True,
        )
        self.other_student = User.objects.create_user(
            username="student_zara@campus.edu",
            email="student_zara@campus.edu",
            password="SecurePassword123!",
            role=User.Role.STUDENT,
            name="Zara Khan",
            phone_number="9876543211",
            email_verified=True,
        )
        self.shop_owner_a = User.objects.create_user(
            username="owner_alpha@campus.edu",
            email="owner_alpha@campus.edu",
            password="SecurePassword123!",
            role=User.Role.SHOP_OWNER,
            name="Alpha Merchant",
            phone_number="9876543212",
            email_verified=True,
        )
        self.shop_owner_b = User.objects.create_user(
            username="owner_beta@campus.edu",
            email="owner_beta@campus.edu",
            password="SecurePassword123!",
            role=User.Role.SHOP_OWNER,
            name="Beta Merchant",
            phone_number="9876543213",
            email_verified=True,
        )
        self.courier = User.objects.create_user(
            username="courier_vikram@campus.edu",
            email="courier_vikram@campus.edu",
            password="SecurePassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Vikram Express",
            phone_number="9876543214",
            email_verified=True,
        )
        self.admin = User.objects.create_superuser(
            username="admin_super@campus.edu",
            email="admin_super@campus.edu",
            password="SecurePassword123!",
            role=User.Role.ADMIN,
            name="Super Admin",
            phone_number="9876543215",
            email_verified=True,
        )

        # 2. Distinct Shops (Multi-Tenancy Isolation)
        self.shop_a = Shop.objects.create(
            name="Alpha Campus Stationery",
            slug="alpha-campus-stationery",
            owner=self.shop_owner_a,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address="Academic Block A, Ground Floor",
            campus_location="Block A",
            contact_phone="9876543212",
            contact_email="alpha@campus.edu",
            is_active=True,
            is_online_enabled=True,
            is_cod_enabled=True,
            is_pickup_cash_enabled=True,
            commission_rate=Decimal("5.00"),
        )
        self.shop_b = Shop.objects.create(
            name="Beta Campus Bookstore",
            slug="beta-campus-bookstore",
            owner=self.shop_owner_b,
            shop_type=Shop.ShopType.BOOK_STATIONERY,
            address="Library Complex, 1st Floor",
            campus_location="Library",
            contact_phone="9876543213",
            contact_email="beta@campus.edu",
            is_active=True,
            is_online_enabled=True,
            is_cod_enabled=True,
            is_pickup_cash_enabled=True,
            commission_rate=Decimal("5.00"),
        )

        # 3. Printing Configurations
        self.print_config_a = ShopPrintingConfig.objects.create(
            shop=self.shop_a,
            is_printing_enabled=True,
            bw_rate_per_page=Decimal("1.50"),
            color_rate_per_page=Decimal("6.00"),
            spiral_binding_price=Decimal("30.00"),
        )

        # 4. Products & Category
        self.category = Category.objects.create(name="Notebooks & Paper", slug="notebooks-paper", is_active=True)

        self.prod_a1 = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Executive Spiral Notebook 200 Pages",
            slug="executive-spiral-notebook-200-pages",
            sku="NOTE-200-A",
            price=Decimal("120.00"),
            is_active=True,
        )
        self.inv_a1 = Inventory.objects.create(
            shop=self.shop_a,
            product=self.prod_a1,
            current_stock=50,
            reorder_level=10,
            unit_cost=Decimal("70.00"),
        )

        self.prod_a_out_of_stock = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Limited Edition Engineering Stencil",
            slug="limited-edition-stencil",
            sku="STENCIL-LTD",
            price=Decimal("150.00"),
            is_active=True,
        )
        self.inv_a_out = Inventory.objects.create(
            shop=self.shop_a,
            product=self.prod_a_out_of_stock,
            current_stock=0,
            reorder_level=5,
            unit_cost=Decimal("90.00"),
        )

        self.prod_b1 = Product.objects.create(
            shop=self.shop_b,
            category=self.category,
            name="Hardcover Laboratory Journal",
            slug="hardcover-lab-journal",
            sku="LAB-JOURNAL-B",
            price=Decimal("180.00"),
            is_active=True,
        )
        self.inv_b1 = Inventory.objects.create(
            shop=self.shop_b,
            product=self.prod_b1,
            current_stock=30,
            reorder_level=5,
            unit_cost=Decimal("110.00"),
        )

        # 5. Slots
        tomorrow = date.today() + timedelta(days=1)
        self.pickup_slot_a = PickupSlot.objects.create(
            shop=self.shop_a,
            date=tomorrow,
            start_time="10:00:00",
            end_time="11:00:00",
            capacity=5,
            booked_count=0,
            is_active=True,
        )
        self.delivery_slot_a = DeliverySlot.objects.create(
            shop=self.shop_a,
            date=tomorrow,
            start_time="14:00:00",
            end_time="16:00:00",
            capacity=10,
            booked_count=0,
            is_active=True,
        )

    # =========================================================================
    # SCENARIO 1: STUDENT STATIONERY DELIVERY LIFECYCLE (END-TO-END)
    # =========================================================================
    def test_01_student_stationery_delivery_e2e_lifecycle(self):
        """
        Step 59 Scenario:
        Student registers -> verifies email OTP -> logs in -> browses shops ->
        selects product -> places delivery order -> inventory reserved/deducted ->
        shop prepares order -> delivery assigned -> courier updates GPS ->
        delivery OTP verified -> order completed -> review submitted -> analytics updated.
        """
        # A. Registration with Server-side Verification
        reg_payload = {
            "name": "New Student Candidate",
            "email": "candidate_student@campus.edu",
            "password": "Password123!",
            "role": "STUDENT",
            "phone": "9988776655",
            "college_id": "STU-2026-99",
            "department": "Computer Science",
            "hostel_block": "Hostel H4",
            "room_number": "412",
        }
        res_reg = self.client.post("/api/auth/register/", reg_payload, format="json")
        self.assertEqual(res_reg.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res_reg.data.get("success"))

        new_user = User.objects.get(email="candidate_student@campus.edu")
        self.assertFalse(new_user.email_verified)

        # B. Verify Email OTP from Outbox
        self.assertGreater(len(mail.outbox), 0)
        sent_email = mail.outbox[-1]
        match = re.search(r'\b(\d{6})\b', sent_email.body)
        self.assertIsNotNone(match)
        raw_otp = match.group(1)

        res_otp = self.client.post("/api/auth/email/verify-otp/", {
            "email": "candidate_student@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION",
        }, format="json")
        self.assertEqual(res_otp.status_code, status.HTTP_200_OK)
        new_user.refresh_from_db()
        self.assertTrue(new_user.email_verified)

        # C. Student Authentication & Product Discovery
        self.client.force_authenticate(user=self.student)
        res_shops = self.client.get("/api/shops/")
        self.assertEqual(res_shops.status_code, status.HTTP_200_OK)

        res_prods = self.client.get(f"/api/products/?shop={self.shop_a.id}")
        self.assertEqual(res_prods.status_code, status.HTTP_200_OK)

        # D. Delivery Order Placement
        initial_stock = self.inv_a1.current_stock
        order_payload = {
            "shop": self.shop_a.id,
            "fulfillment_type": "DELIVERY",
            "delivery_address": "Hostel H4, Room 302, Campus North",
            "delivery_slot": self.delivery_slot_a.id,
            "payment_method": "COD",
            "order_notes": "Please deliver after afternoon lectures.",
            "items": [
                {"product_id": self.prod_a1.id, "quantity": 2}
            ],
        }
        res_order = self.client.post("/api/orders/", order_payload, format="json")
        self.assertEqual(res_order.status_code, status.HTTP_201_CREATED)
        order_data = res_order.data["order"]
        order_id = order_data["id"]

        # Verify stock was deducted authoritative on backend
        self.inv_a1.refresh_from_db()
        self.assertEqual(self.inv_a1.current_stock, initial_stock - 2)

        order_obj = Order.objects.get(id=order_id)
        self.assertEqual(order_obj.subtotal, Decimal("240.00"))
        self.assertEqual(order_obj.delivery_fee, Decimal("15.00"))
        self.assertEqual(order_obj.total_amount, Decimal("255.00"))
        self.assertEqual(order_obj.status, Order.Status.PENDING)

        # E. Shop Owner Fulfillment: CONFIRMED -> PREPARING
        self.client.force_authenticate(user=self.shop_owner_a)
        res_confirm = self.client.patch(f"/api/orders/{order_id}/", {"status": "CONFIRMED"}, format="json")
        self.assertEqual(res_confirm.status_code, status.HTTP_200_OK)

        res_prepare = self.client.patch(f"/api/orders/{order_id}/", {"status": "PREPARING"}, format="json")
        self.assertEqual(res_prepare.status_code, status.HTTP_200_OK)
        order_obj.refresh_from_db()
        self.assertEqual(order_obj.status, Order.Status.PREPARING)

        # F. Delivery Assignment & Courier Transit
        delivery = Delivery.objects.get(order=order_obj)
        delivery.delivery_agent = self.courier
        delivery.delivery_status = Delivery.DeliveryStatus.ASSIGNED
        delivery.save()

        self.client.force_authenticate(user=self.courier)

        # Transition to OUT_FOR_DELIVERY
        res_out = self.client.post(f"/api/deliveries/{delivery.id}/out-for-delivery/")
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)

        # Record Courier GPS Location via /api/deliveries/location/
        loc_res = self.client.post("/api/deliveries/location/", {
            "delivery_id": delivery.id,
            "latitude": 28.5450,
            "longitude": 77.1915,
            "accuracy": 10.0,
            "speed": 12.5,
        }, format="json")
        self.assertEqual(loc_res.status_code, status.HTTP_200_OK)

        # Student retrieves delivery OTP
        self.client.force_authenticate(user=self.student)
        otp_res = self.client.get(f"/api/deliveries/{delivery.id}/delivery-otp/")
        self.assertEqual(otp_res.status_code, status.HTTP_200_OK)
        delivery_otp_code = otp_res.data["otp"]
        self.assertEqual(len(delivery_otp_code), 6)

        # G. Delivery Person Verifies Delivery OTP at Doorstep
        self.client.force_authenticate(user=self.courier)
        res_verify_del = self.client.post(f"/api/deliveries/{delivery.id}/verify-otp/", {
            "otp": delivery_otp_code
        }, format="json")
        self.assertEqual(res_verify_del.status_code, status.HTTP_200_OK)
        
        order_obj.refresh_from_db()
        self.assertEqual(order_obj.status, Order.Status.COMPLETED)

        # H. Student Reviews the Product
        self.client.force_authenticate(user=self.student)
        review_payload = {
            "product": self.prod_a1.id,
            "shop": self.shop_a.id,
            "order": order_obj.id,
            "rating": 5,
            "comment": "Superb notebook quality, paper is very smooth for fountain pens.",
        }
        res_review = self.client.post("/api/reviews/", review_payload, format="json")
        self.assertEqual(res_review.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Review.objects.filter(product=self.prod_a1, user=self.student).exists())

        # I. Admin Reporting & Analytics Visibility
        self.client.force_authenticate(user=self.admin)
        res_sales_report = self.client.get("/api/reports/admin/sales/?preset=today")
        self.assertEqual(res_sales_report.status_code, status.HTTP_200_OK)
        self.assertIn("kpis", res_sales_report.data)
        self.assertGreaterEqual(len(res_sales_report.data.get("data", [])), 1)
        self.assertGreaterEqual(res_sales_report.data.get("kpis", {}).get("total_orders", 0), 1)

    # =========================================================================
    # SCENARIO 2: STUDENT DOCUMENT PRINTING LIFECYCLE (END-TO-END)
    # =========================================================================
    def test_02_student_printing_pickup_e2e_lifecycle(self):
        """
        Step 59 Printing Scenario:
        Upload valid PDF -> calculate authoritative price -> submit print order ->
        shop queue -> shop marks PRINTING -> shop marks READY -> OTP generated ->
        shop verifies pickup OTP -> order marked COMPLETED.
        """
        self.client.force_authenticate(user=self.student)

        # A. Price Estimation
        est_payload = {
            "shop": self.shop_a.id,
            "total_pages": 20,
            "copies": 2,
            "color_mode": "BW",
            "paper_size": "A4",
            "print_sides": "DOUBLE_SIDED",
            "binding_type": "SPIRAL",
            "fulfillment_type": "PICKUP",
        }
        res_est = self.client.post("/api/printing/calculate-price/", est_payload, format="json")
        self.assertEqual(res_est.status_code, status.HTTP_200_OK)
        # Expected: 20 pages * 1.50 = 30.00 * 2 copies = 60.00 + (30.00 * 2 copies spiral) = 120.00
        self.assertEqual(Decimal(str(res_est.data["total_amount"])), Decimal("120.00"))

        # B. PDF Document Upload & Order Creation
        pdf_file = SimpleUploadedFile("assignment_final.pdf", VALID_1PAGE_PDF, content_type="application/pdf")

        create_payload = {
            "shop": self.shop_a.id,
            "fulfillment_type": "PICKUP",
            "pickup_slot": self.pickup_slot_a.id,
            "color_mode": "BW",
            "paper_size": "A4",
            "print_sides": "DOUBLE_SIDED",
            "binding_type": "SPIRAL",
            "copies": 1,
            "page_selection_type": "ALL",
            "file": pdf_file,
            "special_instructions": "Please staple front sheet before spiral binding.",
        }
        res_print = self.client.post("/api/printing/", create_payload, format="multipart")
        self.assertEqual(res_print.status_code, status.HTTP_201_CREATED)
        print_order_id = res_print.data["order"]["id"]

        print_job = PrintingOrder.objects.get(id=print_order_id)
        parent_order = print_job.order

        # C. Shop Owner Queue Processing
        self.client.force_authenticate(user=self.shop_owner_a)
        res_queue = self.client.get("/api/printing/")
        self.assertEqual(res_queue.status_code, status.HTTP_200_OK)
        queue_items = res_queue.data.get("results") if isinstance(res_queue.data, dict) else res_queue.data
        self.assertTrue(any(item["id"] == print_order_id for item in queue_items))

        # Transition: WAITING -> PRINTING
        res_start = self.client.patch(f"/api/printing/{print_order_id}/update-status/", {"status": "PRINTING"}, format="json")
        self.assertEqual(res_start.status_code, status.HTTP_200_OK)
        print_job.refresh_from_db()
        self.assertEqual(print_job.status, PrintingOrder.PrintingStatus.PRINTING)

        # Transition: PRINTING -> READY (Triggers Pickup OTP generation)
        res_ready = self.client.patch(f"/api/printing/{print_order_id}/update-status/", {"status": "READY"}, format="json")
        self.assertEqual(res_ready.status_code, status.HTTP_200_OK)
        print_job.refresh_from_db()
        self.assertEqual(print_job.status, PrintingOrder.PrintingStatus.READY)

        # Check pickup OTP exists
        pickup_otp_record = parent_order.otps.filter(is_verified=False).latest('created_at')
        raw_pickup_otp = pickup_otp_record.get_plaintext_otp()
        self.assertIsNotNone(raw_pickup_otp)

        # D. Counter Pickup OTP Verification by Shop Owner
        res_verify_pickup = self.client.post(
            f"/api/shop-owner/orders/{parent_order.id}/verify-pickup-otp/",
            {"otp": raw_pickup_otp},
            format="json"
        )
        self.assertEqual(res_verify_pickup.status_code, status.HTTP_200_OK)

        parent_order.refresh_from_db()
        self.assertEqual(parent_order.status, Order.Status.COMPLETED)

    # =========================================================================
    # SCENARIO 3: MULTI-TENANT SHOP ISOLATION & PRIVACY ASSURANCE
    # =========================================================================
    def test_03_cross_shop_multi_tenant_isolation(self):
        """
        Step 33 & 41: Shop Isolation Test.
        Verify Shop A cannot access Shop B's orders, inventory, documents, purchase data, or analytics.
        """
        # Create an order in Shop B
        order_b = Order.objects.create(
            customer=self.other_student,
            shop=self.shop_b,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.PICKUP,
            status=Order.Status.CONFIRMED,
            total_amount=Decimal("180.00"),
        )
        OrderItem.objects.create(
            order=order_b,
            product=self.prod_b1,
            quantity=1,
            unit_price=Decimal("180.00"),
            total_price=Decimal("180.00"),
        )

        # Authenticate as Shop Owner A
        self.client.force_authenticate(user=self.shop_owner_a)

        # 1. Orders Isolation: Shop A owner viewing orders should NOT see Shop B's orders
        res_orders = self.client.get("/api/orders/")
        self.assertEqual(res_orders.status_code, status.HTTP_200_OK)
        order_list = res_orders.data.get("results") if isinstance(res_orders.data, dict) else res_orders.data
        returned_ids = [o["id"] for o in order_list]
        self.assertNotIn(order_b.id, returned_ids)

        # 2. Direct Object IDOR Attack: Shop Owner A requesting Shop B's order detail
        res_idor = self.client.get(f"/api/orders/{order_b.id}/")
        self.assertIn(res_idor.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

        # 3. Inventory Modification IDOR: Shop Owner A trying to update Shop B's product inventory
        res_inv_tamper = self.client.patch(
            f"/api/inventory/{self.inv_b1.id}/",
            {"current_stock": 999},
            format="json"
        )
        self.assertIn(res_inv_tamper.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])
        self.inv_b1.refresh_from_db()
        self.assertEqual(self.inv_b1.current_stock, 30)  # Stock untouched

        # 4. Analytics Isolation: Shop Owner A cannot request Shop B's sales metrics (Guard raises 403)
        res_analytics = self.client.get(f"/api/analytics/shop/sales/?shop={self.shop_b.id}")
        self.assertEqual(res_analytics.status_code, status.HTTP_403_FORBIDDEN)

    # =========================================================================
    # SCENARIO 4: COMPREHENSIVE FAILURE & NEGATIVE SECURITY CONTROLS
    # =========================================================================
    def test_04_failure_scenarios_and_security_defenses(self):
        """
        Step 60: Rigorous negative testing of critical failure vectors.
        """
        # 1. Admin Role Injection Defense
        admin_injection_payload = {
            "name": "Attacker",
            "email": "attacker@campus.edu",
            "password": "Password123!",
            "role": "ADMIN",
        }
        res_inject = self.client.post("/api/auth/register/", admin_injection_payload, format="json")
        self.assertEqual(res_inject.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Public self-registration as an Administrator is strictly forbidden", str(res_inject.data))

        # 2. Invalid Credentials Login
        res_bad_login = self.client.post("/api/auth/login/", {
            "email": self.student.email,
            "password": "WrongPassword999!",
        }, format="json")
        self.assertIn(res_bad_login.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_401_UNAUTHORIZED])

        # 3. Invalid Email OTP
        res_bad_otp = self.client.post("/api/auth/email/verify-otp/", {
            "email": self.student.email,
            "otp": "000000",
            "purpose": "EMAIL_VERIFICATION",
        }, format="json")
        self.assertEqual(res_bad_otp.status_code, status.HTTP_400_BAD_REQUEST)

        # 4. Expired OTP Rejection
        expired_otp = EmailVerificationOTP.objects.create(
            user=self.other_student,
            email=self.other_student.email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            expires_at=timezone.now() - timedelta(minutes=10),
            is_verified=False,
        )
        expired_otp.set_otp("123456")
        expired_otp.save()

        res_expired = self.client.post("/api/auth/email/verify-otp/", {
            "email": self.other_student.email,
            "otp": "123456",
            "purpose": "EMAIL_VERIFICATION",
        }, format="json")
        self.assertEqual(res_expired.status_code, status.HTTP_400_BAD_REQUEST)

        # 5. Out-of-Stock Checkout Rejection
        self.client.force_authenticate(user=self.student)
        res_oos = self.client.post("/api/orders/", {
            "shop": self.shop_a.id,
            "fulfillment_type": "PICKUP",
            "payment_method": "COD",
            "items": [{"product_id": self.prod_a_out_of_stock.id, "quantity": 1}],
        }, format="json")
        self.assertEqual(res_oos.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", str(res_oos.data))

        # 6. Cross-Shop Mixed Items Rejection
        res_mixed = self.client.post("/api/orders/", {
            "shop": self.shop_a.id,
            "fulfillment_type": "PICKUP",
            "payment_method": "COD",
            "items": [
                {"product_id": self.prod_a1.id, "quantity": 1},
                {"product_id": self.prod_b1.id, "quantity": 1},  # Product from Shop B
            ],
        }, format="json")
        self.assertEqual(res_mixed.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("is not available in shop", str(res_mixed.data))

        # 7. Corrupted PDF Magic Bytes Rejection
        corrupted_file = SimpleUploadedFile("malicious.pdf", b"NOT_A_PDF_CONTENT", content_type="application/pdf")
        res_corrupt_pdf = self.client.post("/api/printing/", {
            "shop": self.shop_a.id,
            "fulfillment_type": "PICKUP",
            "color_mode": "BW",
            "paper_size": "A4",
            "print_sides": "SINGLE_SIDED",
            "binding_type": "NONE",
            "copies": 1,
            "file": corrupted_file,
        }, format="multipart")
        self.assertEqual(res_corrupt_pdf.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Magic bytes mismatch", str(res_corrupt_pdf.data))

        # 8. Courier GPS Noise Threshold Rejection (> 200m noise rejected with 400)
        delivery = Delivery.objects.create(
            order=Order.objects.create(
                customer=self.student,
                shop=self.shop_a,
                total_amount=Decimal("120.00"),
                status=Order.Status.CONFIRMED,
            ),
            delivery_agent=self.courier,
            delivery_status=Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
        )
        self.client.force_authenticate(user=self.courier)
        res_noise = self.client.post("/api/deliveries/location/", {
            "delivery_id": delivery.id,
            "latitude": 28.5450,
            "longitude": 77.1915,
            "accuracy": 350.0,  # > 200m noise rejected with 400
        }, format="json")
        self.assertEqual(res_noise.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # SCENARIO 5: FINANCIAL ACCURACY & CONCURRENCY SAFEGUARDS
    # =========================================================================
    def test_05_financial_accuracy_and_refund_idempotency(self):
        """
        Step 12, 13 & 48: Financial QA.
        Validates Decimal computation, payment initialization idempotency,
        and double-refund prevention.
        """
        self.client.force_authenticate(user=self.student)
        order = Order.objects.create(
            customer=self.student,
            shop=self.shop_a,
            total_amount=Decimal("360.00"),
            status=Order.Status.CONFIRMED,
            payment_status=Order.PaymentStatus.PAID,
            payment_method=Order.PaymentMethod.ONLINE,
        )

        # A. Idempotent Payment Session via /api/payments/create-intent/
        res_pay1 = self.client.post("/api/payments/create-intent/", {
            "order_id": order.id,
            "payment_method": "ONLINE",
            "idempotency_key": "step29-idempotency-token-12345",
        }, format="json")
        self.assertEqual(res_pay1.status_code, status.HTTP_200_OK)

        # Repeat identical request with same idempotency key
        res_pay2 = self.client.post("/api/payments/create-intent/", {
            "order_id": order.id,
            "payment_method": "ONLINE",
            "idempotency_key": "step29-idempotency-token-12345",
        }, format="json")
        self.assertEqual(res_pay2.status_code, status.HTTP_200_OK)
        # Verify only 1 Payment record created
        self.assertEqual(Payment.objects.filter(order=order).count(), 1)

        # B. Refund Execution with Decimal Precision via /api/refunds/
        self.client.force_authenticate(user=self.admin)
        payment_record = Payment.objects.filter(order=order).first()
        payment_record.status = Payment.Status.CAPTURED
        payment_record.save()

        # Partial Refund Rs. 150.50
        res_refund1 = self.client.post("/api/refunds/", {
            "order_id": order.id,
            "amount": "150.50",
            "reason": "Damaged items on receipt",
        }, format="json")
        self.assertEqual(res_refund1.status_code, status.HTTP_201_CREATED)
        order.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PaymentStatus.PARTIALLY_REFUNDED)

        # Over-refund rejection: remaining amount is 360.00 - 150.50 = 209.50
        res_over_refund = self.client.post("/api/refunds/", {
            "order_id": order.id,
            "amount": "250.00",  # Exceeds remaining 209.50
            "reason": "Attempting excess refund",
        }, format="json")
        self.assertEqual(res_over_refund.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds remaining refundable balance", str(res_over_refund.data))
