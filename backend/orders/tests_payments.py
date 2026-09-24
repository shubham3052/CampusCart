import hmac
import hashlib
from decimal import Decimal
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from shops.models import Shop
from products.models import Product, Category
from inventory.models import Inventory
from orders.models import Order, OrderItem, Payment, Refund
from orders.services.payment_service import PaymentService
from orders.services.refund_service import RefundService
from orders.services.reconciliation_service import ReconciliationService
from orders.services.payment_providers.factory import get_payment_provider

User = get_user_model()


class Step25PaymentRefundTests(APITestCase):
    """
    Comprehensive verification suite for Step 25:
    Payment, Refund, Idempotency, Gateway Abstraction, Cash Management & Reconciliation.
    """

    def setUp(self):
        # 1. Users
        self.student = User.objects.create_user(
            username="student_rahul",
            email="rahul@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Rahul Sharma",
            phone_number="9876543210",
        )
        self.other_student = User.objects.create_user(
            username="student_priya",
            email="priya@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Priya Patel",
            phone_number="9876543211",
        )
        self.shop_owner = User.objects.create_user(
            username="shop_owner_ramesh",
            email="ramesh@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Ramesh Gupta",
            phone_number="9876543212",
        )
        self.other_shop_owner = User.objects.create_user(
            username="shop_owner_suresh",
            email="suresh@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Suresh Patel",
            phone_number="9876543213",
        )
        self.delivery_agent = User.objects.create_user(
            username="agent_vikram",
            email="vikram@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Vikram Singh",
            phone_number="9876543214",
        )
        self.admin = User.objects.create_superuser(
            username="admin_super",
            email="admin@campus.edu",
            password="TestPassword123!",
            role=User.Role.ADMIN,
            name="Admin Superuser",
            phone_number="9876543215",
        )

        # 2. Shops
        self.shop = Shop.objects.create(
            name="Campus Tech Stationery",
            slug="campus-tech-stationery",
            owner=self.shop_owner,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address="Block B Campus",
            campus_location="Block B Campus Center",
            contact_phone="9876543212",
            contact_email="tech@campus.edu",
            is_active=True,
            is_online_enabled=True,
            is_cod_enabled=True,
            is_pickup_cash_enabled=True,
            commission_rate=Decimal("10.00"),
        )
        self.other_shop = Shop.objects.create(
            name="Campus Arts Store",
            slug="campus-arts-store",
            owner=self.other_shop_owner,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address="Block C Campus",
            campus_location="Block C Arts Building",
            contact_phone="9876543213",
            contact_email="arts@campus.edu",
            is_active=True,
            is_online_enabled=False,
            is_cod_enabled=False,
            is_pickup_cash_enabled=True,
            commission_rate=Decimal("5.00"),
        )

        # 3. Product & Inventory
        self.category = Category.objects.create(name="Calculators", slug="calculators", is_active=True)
        self.product = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name="Scientific Calculator fx-991EX",
            slug="scientific-calc-fx991ex",
            sku="CASIO-001",
            price=Decimal("1000.00"),
            is_active=True,
        )
        self.inventory = Inventory.objects.create(
            shop=self.shop,
            product=self.product,
            current_stock=50,
            reserved_stock=0,
            minimum_stock=5,
            reorder_level=10,
        )

    def _create_test_order(self, customer=None, shop=None, total_amount=Decimal("1000.00"), payment_method="ONLINE", status="PENDING"):
        return Order.objects.create(
            customer=customer or self.student,
            shop=shop or self.shop,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.PICKUP,
            status=status,
            payment_status=Order.PaymentStatus.PENDING,
            payment_method=payment_method,
            subtotal=total_amount,
            delivery_fee=Decimal("0.00"),
            discount_amount=Decimal("0.00"),
            total_amount=total_amount,
        )

    # -------------------------------------------------------------
    # 1. ONLINE PAYMENT & INTENT TESTS
    # -------------------------------------------------------------
    def test_online_payment_intent_creation(self):
        """Student initiates online payment intent. Checks commission split & gateway order."""
        order = self._create_test_order()
        self.client.force_authenticate(user=self.student)

        response = self.client.post("/api/payments/create-intent/", {
            "order_id": order.id,
            "payment_method": "ONLINE",
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        payment_data = response.data["payment"]
        session_data = response.data["session"]

        self.assertEqual(Decimal(str(payment_data["amount"])), Decimal("1000.00"))
        self.assertEqual(payment_data["payment_method"], "ONLINE")
        self.assertEqual(payment_data["status"], "PENDING")
        # 10% commission on 1000 = 100 platform_fee, 900 merchant_payout
        self.assertEqual(Decimal(str(payment_data["platform_fee"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(payment_data["merchant_payout"])), Decimal("900.00"))
        self.assertTrue(session_data["gateway_order_id"].startswith("mock_order_"))

    def test_online_payment_verification_success(self):
        """Cryptographic HMAC signature verification succeeds and captures payment."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]
        session = init_res["session"]

        provider = get_payment_provider()
        gateway_payment_id = f"pay_mock_{payment.id}"
        valid_signature = provider.generate_signature(session["gateway_order_id"], gateway_payment_id)

        self.client.force_authenticate(user=self.student)
        response = self.client.post(f"/api/payments/{payment.id}/verify/", {
            "gateway_order_id": session["gateway_order_id"],
            "gateway_payment_id": gateway_payment_id,
            "gateway_signature": valid_signature,
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        # Reload payment and order
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CAPTURED)
        self.assertIsNotNone(payment.paid_at)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)
        self.assertEqual(order.status, Order.Status.CONFIRMED)

    def test_payment_verification_invalid_signature(self):
        """Forged or tampered signature is rejected and payment marked FAILED."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]
        session = init_res["session"]

        self.client.force_authenticate(user=self.student)
        response = self.client.post(f"/api/payments/{payment.id}/verify/", {
            "gateway_order_id": session["gateway_order_id"],
            "gateway_payment_id": "pay_mock_123",
            "gateway_signature": "invalid_forged_hmac_signature",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.FAILED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.FAILED)

    # -------------------------------------------------------------
    # 2. IDEMPOTENCY & RETRY TESTS
    # -------------------------------------------------------------
    def test_payment_idempotency_double_capture(self):
        """Verifying an already CAPTURED payment returns success gracefully without duplicate capture."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]
        session = init_res["session"]

        provider = get_payment_provider()
        gateway_payment_id = f"pay_mock_{payment.id}"
        valid_signature = provider.generate_signature(session["gateway_order_id"], gateway_payment_id)

        # First verification
        res1 = PaymentService.verify_payment(payment.id, {
            "gateway_order_id": session["gateway_order_id"],
            "gateway_payment_id": gateway_payment_id,
            "gateway_signature": valid_signature,
        }, self.student)
        self.assertTrue(res1["success"])

        # Second verification with exact same payload
        res2 = PaymentService.verify_payment(payment.id, {
            "gateway_order_id": session["gateway_order_id"],
            "gateway_payment_id": gateway_payment_id,
            "gateway_signature": valid_signature,
        }, self.student)
        self.assertTrue(res2["success"])
        self.assertTrue(res2.get("already_processed", False))

    def test_payment_retry_flow(self):
        """Retrying a failed payment session generates a new session without duplicating the order."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]
        payment.status = Payment.Status.FAILED
        payment.save()
        order.payment_status = Order.PaymentStatus.FAILED
        order.save()

        initial_order_count = Order.objects.count()

        self.client.force_authenticate(user=self.student)
        response = self.client.post(f"/api/payments/{payment.id}/retry/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        # Confirm no duplicate order was created
        self.assertEqual(Order.objects.count(), initial_order_count)
        new_payment_id = response.data["payment"]["id"]
        self.assertNotEqual(new_payment_id, payment.id)

    # -------------------------------------------------------------
    # 3. WEBHOOK SECURITY TESTS
    # -------------------------------------------------------------
    def test_webhook_payment_captured_success(self):
        """Valid webhook signature captures a pending payment."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]
        session = init_res["session"]

        provider = get_payment_provider()
        payload_str = (
            f'{{"event":"payment.captured","payload":{{"payment":{{"entity":'
            f'{{"id":"pay_mock_webhook_{payment.id}","order_id":"{session["gateway_order_id"]}","amount":100000}}}}}}}}'
        )
        valid_webhook_sig = provider.generate_webhook_signature(payload_str.encode('utf-8'))

        response = self.client.post(
            "/api/payments/webhook/",
            data=payload_str,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=valid_webhook_sig
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        payment.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CAPTURED)

    def test_webhook_forged_signature_rejected(self):
        """Invalid webhook signature returns HTTP 400."""
        payload_str = '{"event":"payment.captured"}'
        response = self.client.post(
            "/api/payments/webhook/",
            data=payload_str,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE="tampered_signature"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 4. CASH PAYMENTS (COD & PICKUP CASH)
    # -------------------------------------------------------------
    def test_cash_collection_by_shop_owner(self):
        """Shop owner collects cash on pickup. Audited with collected_by."""
        order = self._create_test_order(payment_method="PICKUP_CASH")
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="PICKUP_CASH")
        payment = init_res["payment"]

        self.client.force_authenticate(user=self.shop_owner)
        response = self.client.post(f"/api/payments/{payment.id}/mark-cash-collected/", {
            "notes": "Cash ₹1000 collected at counter."
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])

        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.CAPTURED)
        self.assertEqual(payment.collected_by, self.shop_owner)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)

    def test_unauthorized_student_cannot_mark_cash_collected(self):
        """Students cannot mark their own cash payments collected."""
        order = self._create_test_order(payment_method="COD")
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="COD")
        payment = init_res["payment"]

        self.client.force_authenticate(user=self.student)
        response = self.client.post(f"/api/payments/{payment.id}/mark-cash-collected/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["success"])

    # -------------------------------------------------------------
    # 5. REFUND LIFECYCLE TESTS
    # -------------------------------------------------------------
    def test_student_refund_request_and_staff_approval(self):
        """Student requests partial refund, shop owner approves and processes via gateway."""
        order = self._create_test_order()
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]

        # Capture payment
        provider = get_payment_provider()
        sig = provider.generate_signature(payment.gateway_order_id, f"pay_mock_{payment.id}")
        PaymentService.verify_payment(payment.id, {
            "gateway_order_id": payment.gateway_order_id,
            "gateway_payment_id": f"pay_mock_{payment.id}",
            "gateway_signature": sig
        }, self.student)

        # Student requests ₹400 refund
        self.client.force_authenticate(user=self.student)
        req_res = self.client.post("/api/refunds/", {
            "order_id": order.id,
            "amount": "400.00",
            "reason": "Accidental purchase of extra accessories"
        })
        self.assertEqual(req_res.status_code, status.HTTP_201_CREATED)
        refund_id = req_res.data["id"]
        self.assertEqual(req_res.data["status"], "REQUESTED")

        # Shop owner approves refund
        self.client.force_authenticate(user=self.shop_owner)
        app_res = self.client.post(f"/api/refunds/{refund_id}/approve/")
        self.assertEqual(app_res.status_code, status.HTTP_200_OK)
        self.assertEqual(app_res.data["status"], "COMPLETED")

        # Verify order and payment partial refund statuses
        order.refresh_from_db()
        payment.refresh_from_db()
        self.assertEqual(order.payment_status, Order.PaymentStatus.PARTIALLY_REFUNDED)
        self.assertEqual(payment.status, Payment.Status.PARTIALLY_REFUNDED)

    def test_excessive_refund_request_rejected(self):
        """Attempt to refund more than original captured amount is rejected."""
        order = self._create_test_order(total_amount=Decimal("500.00"))
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]

        provider = get_payment_provider()
        sig = provider.generate_signature(payment.gateway_order_id, f"pay_mock_{payment.id}")
        PaymentService.verify_payment(payment.id, {
            "gateway_order_id": payment.gateway_order_id,
            "gateway_payment_id": f"pay_mock_{payment.id}",
            "gateway_signature": sig
        }, self.student)

        # Attempt to refund ₹600 on a ₹500 order
        self.client.force_authenticate(user=self.student)
        res = self.client.post("/api/refunds/", {
            "order_id": order.id,
            "amount": "600.00",
            "reason": "Trying to refund more than paid"
        })
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds", res.data["error"])

    def test_order_cancellation_auto_refund(self):
        """Cancelling a paid pending order automatically issues a full refund."""
        order = self._create_test_order(total_amount=Decimal("1000.00"))
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]

        provider = get_payment_provider()
        sig = provider.generate_signature(payment.gateway_order_id, f"pay_mock_{payment.id}")
        PaymentService.verify_payment(payment.id, {
            "gateway_order_id": payment.gateway_order_id,
            "gateway_payment_id": f"pay_mock_{payment.id}",
            "gateway_signature": sig
        }, self.student)

        # Reset order status to PENDING so student can cancel
        order.refresh_from_db()
        order.status = Order.Status.PENDING
        order.save(update_fields=['status'])

        self.client.force_authenticate(user=self.student)
        cancel_res = self.client.post(f"/api/orders/{order.id}/cancel/", {"reason": "Course dropped"})
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertTrue(cancel_res.data["success"])
        self.assertIsNotNone(cancel_res.data.get("refund"))

        # Verify refund was auto-completed and payment status updated to REFUNDED
        payment.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(payment.status, Payment.Status.REFUNDED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.REFUNDED)

    # -------------------------------------------------------------
    # 6. TRANSACTION RECONCILIATION & ANOMALIES
    # -------------------------------------------------------------
    def test_reconciliation_detects_anomalies(self):
        """Reconciliation service detects unpaid orders marked PAID and amount mismatches."""
        # Create an anomalous order: marked PAID without a captured Payment record
        anomalous_order = self._create_test_order(payment_method="ONLINE")
        anomalous_order.payment_status = Order.PaymentStatus.PAID
        anomalous_order.save()

        recon = ReconciliationService.run_reconciliation()
        self.assertGreaterEqual(recon["total_anomalies"], 1)
        anomaly_types = [d["type"] for d in recon["discrepancies"]]
        self.assertIn("PAID_ORDER_WITHOUT_PAYMENT", anomaly_types)

    # -------------------------------------------------------------
    # 7. SECURITY & MULTI-TENANCY ISOLATION
    # -------------------------------------------------------------
    def test_security_user_and_shop_isolation(self):
        """Other students cannot view payments; Shop Owner A cannot view or approve Shop Owner B's payments."""
        order = self._create_test_order(customer=self.student, shop=self.shop)
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]

        # Other student tries to retrieve payment
        self.client.force_authenticate(user=self.other_student)
        res1 = self.client.get(f"/api/payments/{payment.id}/")
        self.assertEqual(res1.status_code, status.HTTP_404_NOT_FOUND)

        # Other shop owner tries to view payment
        self.client.force_authenticate(user=self.other_shop_owner)
        res2 = self.client.get(f"/api/payments/{payment.id}/")
        self.assertEqual(res2.status_code, status.HTTP_404_NOT_FOUND)

    def test_shop_payment_method_disabled_validation(self):
        """Attempting to initiate an online payment on a shop with online payments disabled fails."""
        order = self._create_test_order(shop=self.other_shop)  # other_shop has is_online_enabled=False

        self.client.force_authenticate(user=self.student)
        response = self.client.post("/api/payments/create-intent/", {
            "order_id": order.id,
            "payment_method": "ONLINE",
        })
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not configured for online payments", response.data["error"])

    # -------------------------------------------------------------
    # 8. ANALYTICS METRICS
    # -------------------------------------------------------------
    def test_financial_analytics(self):
        """Shop owner and Admin access analytics with correct revenue and commission totals."""
        order = self._create_test_order(total_amount=Decimal("1000.00"))
        init_res = PaymentService.initialize_payment(order, self.student, payment_method="ONLINE")
        payment = init_res["payment"]

        provider = get_payment_provider()
        sig = provider.generate_signature(payment.gateway_order_id, f"pay_mock_{payment.id}")
        PaymentService.verify_payment(payment.id, {
            "gateway_order_id": payment.gateway_order_id,
            "gateway_payment_id": f"pay_mock_{payment.id}",
            "gateway_signature": sig
        }, self.student)

        # Shop Owner Analytics
        self.client.force_authenticate(user=self.shop_owner)
        res = self.client.get("/api/payments/analytics/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["captured_count"], 1)
        self.assertEqual(res.data["gross_revenue"], 1000.00)
        self.assertEqual(res.data["platform_revenue"], 100.00)
        self.assertEqual(res.data["merchant_payouts"], 900.00)
