from decimal import Decimal
from django.utils import timezone
from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from shops.models import Shop
from products.models import Category, Product
from inventory.models import (
    Inventory,
    InventoryTransaction,
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryReturn,
)
from inventory.sales_aggregation import get_daily_sales_series, get_product_velocity_ranking
from notifications.models import Notification

User = get_user_model()


class InventoryManagementTests(APITestCase):
    """
    Comprehensive Step 15 test suite:
    - Shop-isolated stock tracking & calculated statuses
    - Safe atomic stock adjustments & negative stock protection
    - Direct inbound receiving & damaged stock discard
    - Supplier management & shop isolation
    - Purchase Order full lifecycle & partial receipts
    - Concurrency test on final unit of stock
    - Clean historical sales time-series for future ML
    """

    def setUp(self):
        # 1. Users
        self.owner_a = User.objects.create_user(
            username="owner_alpha",
            email="owner_a@campus.edu",
            password="Password123!",
            role=User.Role.SHOP_OWNER
        )
        self.owner_b = User.objects.create_user(
            username="owner_beta",
            email="owner_b@campus.edu",
            password="Password123!",
            role=User.Role.SHOP_OWNER
        )
        self.student = User.objects.create_user(
            username="student_rahul",
            email="student_r@campus.edu",
            password="Password123!",
            role=User.Role.STUDENT
        )

        # 2. Shops
        self.shop_a = Shop.objects.create(
            owner=self.owner_a,
            name="Alpha Stationery & Xerox",
            slug="alpha-stationery",
            contact_phone="9876543210",
            is_active=True
        )
        self.shop_b = Shop.objects.create(
            owner=self.owner_b,
            name="Beta Book Depot",
            slug="beta-books",
            contact_phone="9876543211",
            is_active=True
        )

        # 3. Category & Products
        self.category = Category.objects.create(name="Writing Instruments", slug="writing-instruments")
        self.product_pen = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Blue Gel Pen",
            sku="PEN-BLUE-01",
            price=Decimal("20.00"),
            is_active=True
        )
        self.product_notebook = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Spiral Register 200 Pages",
            sku="REG-SPIRAL-01",
            price=Decimal("80.00"),
            is_active=True
        )

        # 4. Inventory records for Shop A
        self.inv_pen = Inventory.objects.create(
            shop=self.shop_a,
            product=self.product_pen,
            current_stock=100,
            reserved_stock=10,
            minimum_stock=15,
            reorder_level=25,
            maximum_stock=200,
            unit_cost=Decimal("12.00")
        )

    def test_stock_calculations_and_status(self):
        """Test available stock, stock valuation, and rule-based status badges."""
        self.assertEqual(self.inv_pen.available_stock, 90)
        self.assertEqual(self.inv_pen.stock_value, Decimal("1200.00"))
        self.assertEqual(self.inv_pen.stock_status, 'IN_STOCK')
        self.assertFalse(self.inv_pen.is_low_stock)
        self.assertFalse(self.inv_pen.is_out_of_stock)

        # Test low stock threshold
        self.inv_pen.current_stock = 20
        self.inv_pen.save()
        self.assertTrue(self.inv_pen.is_low_stock)
        self.assertEqual(self.inv_pen.stock_status, 'LOW_STOCK')

        # Test out of stock
        self.inv_pen.current_stock = 0
        self.inv_pen.save()
        self.assertTrue(self.inv_pen.is_out_of_stock)
        self.assertEqual(self.inv_pen.stock_status, 'OUT_OF_STOCK')

        # Test overstocked
        self.inv_pen.current_stock = 250
        self.inv_pen.save()
        self.assertTrue(self.inv_pen.is_overstocked)
        self.assertEqual(self.inv_pen.stock_status, 'OVERSTOCKED')

    def test_stock_adjustment_atomic_and_negative_protection(self):
        """Test atomic stock adjustment (+/-), audit transaction creation, and negative block."""
        self.client.force_authenticate(user=self.owner_a)

        # 1. Negative deduction attempting to exceed balance
        res_fail = self.client.post(
            f"/api/inventory/{self.inv_pen.id}/adjust/",
            {"quantity_change": -150, "reason": "Physical count mismatch"},
            format='json'
        )
        self.assertEqual(res_fail.status_code, status.HTTP_400_BAD_REQUEST)
        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 100) # Unchanged

        # 2. Valid negative deduction
        res_ok = self.client.post(
            f"/api/inventory/{self.inv_pen.id}/adjust/",
            {"quantity_change": -5, "reason": "Storage count audit"},
            format='json'
        )
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)
        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 95)

        # Verify transaction audit log was created
        tx = InventoryTransaction.objects.filter(inventory=self.inv_pen).latest('id')
        self.assertEqual(tx.quantity_change, -5)
        self.assertEqual(tx.stock_before, 100)
        self.assertEqual(tx.stock_after, 95)
        self.assertEqual(tx.reference_type, 'MANUAL_ADJUSTMENT')
        self.assertEqual(tx.performed_by, self.owner_a)

    def test_direct_stock_receiving(self):
        """Test fast direct inbound stock receiving without formal PO."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "quantity": 50,
            "unit_cost": "11.50",
            "invoice_number": "INV-DIRECT-101",
            "notes": "Emergency pen shipment from local distributor"
        }
        res = self.client.post(f"/api/inventory/{self.inv_pen.id}/receive/", payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 150)
        self.assertEqual(self.inv_pen.unit_cost, Decimal("11.50"))

        tx = InventoryTransaction.objects.filter(inventory=self.inv_pen).latest('id')
        self.assertEqual(tx.transaction_type, InventoryTransaction.TransactionType.RESTOCK)
        self.assertEqual(tx.quantity_change, 50)
        self.assertEqual(tx.stock_before, 100)
        self.assertEqual(tx.stock_after, 150)
        self.assertEqual(tx.reference_id, "INV-DIRECT-101")

    def test_damaged_stock_process(self):
        """Test reporting damaged stock safely decreases on-hand count and records audit logs."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "quantity": 4,
            "reason": "Water leakage damage during heavy campus monsoon",
            "notes": "Discarded pens"
        }
        res = self.client.post(f"/api/inventory/{self.inv_pen.id}/damage/", payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 96)

        # Verify DAMAGE transaction logged
        tx = InventoryTransaction.objects.filter(inventory=self.inv_pen).latest('id')
        self.assertEqual(tx.transaction_type, InventoryTransaction.TransactionType.DAMAGE)
        self.assertEqual(tx.quantity_change, -4)
        self.assertEqual(tx.stock_after, 96)

        # Verify InventoryReturn logged
        ret = InventoryReturn.objects.filter(shop=self.shop_a, product=self.product_pen).latest('id')
        self.assertEqual(ret.return_type, InventoryReturn.ReturnType.DAMAGED)
        self.assertEqual(ret.quantity, 4)

    def test_supplier_crud_and_shop_isolation(self):
        """Verify strict tenant isolation for suppliers."""
        # Create Supplier for Shop A
        supplier_a = Supplier.objects.create(
            shop=self.shop_a,
            name="Reliable Wholesale Stationery Ltd",
            phone="9876500001",
            city="Ghaziabad"
        )

        # Owner B tries to access Shop A's supplier -> Should return 404
        self.client.force_authenticate(user=self.owner_b)
        res_get_b = self.client.get(f"/api/suppliers/{supplier_a.id}/")
        self.assertEqual(res_get_b.status_code, status.HTTP_404_NOT_FOUND)

        # Owner B tries to create supplier for Shop A -> Should be 403 Forbidden
        res_post_b = self.client.post(
            "/api/suppliers/",
            {"shop": self.shop_a.id, "name": "Intruder Supplier"},
            format='json'
        )
        self.assertEqual(res_post_b.status_code, status.HTTP_403_FORBIDDEN)

        # Student cannot access supplier endpoints at all
        self.client.force_authenticate(user=self.student)
        res_student = self.client.get("/api/suppliers/")
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

    def test_purchase_order_full_lifecycle_and_partial_receipt(self):
        """Test PO creation -> Placement -> Partial Receiving -> Full Receiving."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(
            shop=self.shop_a,
            name="Apex Paper Mills",
            phone="9876500002"
        )

        # 1. Create Draft Purchase Order with line items
        po_payload = {
            "shop": self.shop_a.id,
            "supplier": supplier.id,
            "notes": "Mid-semester restock order",
            "items_input": [
                {"product_id": self.product_pen.id, "quantity_ordered": 100, "unit_cost": "10.00"},
                {"product_id": self.product_notebook.id, "quantity_ordered": 50, "unit_cost": "45.00"}
            ]
        }
        res_create = self.client.post("/api/purchase-orders/", po_payload, format='json')
        self.assertEqual(res_create.status_code, status.HTTP_201_CREATED)
        po_id = res_create.data['id']

        po = PurchaseOrder.objects.get(id=po_id)
        self.assertEqual(po.status, PurchaseOrder.Status.DRAFT)
        self.assertEqual(po.subtotal, Decimal("3250.00")) # 100*10 + 50*45

        # 2. Place PO
        res_place = self.client.post(f"/api/purchase-orders/{po_id}/place/")
        self.assertEqual(res_place.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PLACED)

        # 3. Partial Receiving: 60 pens and 20 notebooks
        item_pen = po.items.get(product=self.product_pen)
        item_nb = po.items.get(product=self.product_notebook)

        receive_payload_1 = {
            "items": [
                {"item_id": item_pen.id, "quantity_to_receive": 60},
                {"item_id": item_nb.id, "quantity_to_receive": 20}
            ]
        }
        res_receive_1 = self.client.post(f"/api/purchase-orders/{po_id}/receive/", receive_payload_1, format='json')
        self.assertEqual(res_receive_1.status_code, status.HTTP_200_OK)

        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PARTIALLY_RECEIVED)

        # Check physical stock incremented
        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 160) # 100 initial + 60 received

        # 4. Final shipment: Receive remaining 40 pens and 30 notebooks
        receive_payload_2 = {
            "items": [
                {"item_id": item_pen.id, "quantity_to_receive": 40},
                {"item_id": item_nb.id, "quantity_to_receive": 30}
            ]
        }
        res_receive_2 = self.client.post(f"/api/purchase-orders/{po_id}/receive/", receive_payload_2, format='json')
        self.assertEqual(res_receive_2.status_code, status.HTTP_200_OK)

        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.RECEIVED)
        self.assertIsNotNone(po.received_date)

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 200) # 160 + 40

    def test_concurrency_race_condition_protection(self):
        """
        Concurrency test:
        Stock = 1. Two students simultaneously attempt to order the final item.
        First request succeeds, second request is rejected with Out of Stock.
        Stock must never reach -1.
        """
        # Set stock strictly to 1
        self.inv_pen.current_stock = 1
        self.inv_pen.reserved_stock = 0
        self.inv_pen.save()

        student_b = User.objects.create_user(
            username="student_priya",
            email="student_p@campus.edu",
            password="Password123!",
            role=User.Role.STUDENT
        )

        order_payload = {
            "shop": self.shop_a.id,
            "fulfillment_type": "PICKUP",
            "items": [{"product_id": self.product_pen.id, "quantity": 1}]
        }

        # First request succeeds
        self.client.force_authenticate(user=self.student)
        res_a = self.client.post("/api/orders/", order_payload, format='json')
        self.assertEqual(res_a.status_code, status.HTTP_201_CREATED)

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 0)

        # Second request attempts to buy the same item -> Must fail
        self.client.force_authenticate(user=student_b)
        res_b = self.client.post("/api/orders/", order_payload, format='json')
        self.assertEqual(res_b.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", str(res_b.data))

        # Re-verify stock remains exactly 0, never negative
        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 0)

    def test_low_stock_notification_dispatch(self):
        """Verify low-stock notification is dispatched when stock crosses threshold."""
        self.client.force_authenticate(user=self.owner_a)

        # Adjust stock down to 10 (reorder_level is 25)
        self.client.post(
            f"/api/inventory/{self.inv_pen.id}/adjust/",
            {"quantity_change": -90, "reason": "Massive sales surge"},
            format='json'
        )

        notifications = Notification.objects.filter(
            recipient=self.owner_a,
            notification_type=Notification.NotificationType.LOW_STOCK,
            reference_id=str(self.inv_pen.id)
        )
        self.assertTrue(notifications.exists())
        alert = notifications.latest('created_at')
        self.assertIn("Low Stock Alert", alert.title)

    def test_historical_sales_time_series_for_future_ml(self):
        """Test sales aggregation layer generates contiguous zero-filled daily vectors."""
        # Create a real SALE transaction today
        InventoryTransaction.objects.create(
            inventory=self.inv_pen,
            transaction_type=InventoryTransaction.TransactionType.SALE,
            quantity_change=-15,
            stock_before=100,
            stock_after=85,
            reference_type='ORDER',
            reference_id='ORDER_TEST_99'
        )

        series = get_daily_sales_series(shop_id=self.shop_a.id, days=7)
        self.assertEqual(len(series), 7)
        # Today's units sold should be 15
        today_entry = series[-1]
        self.assertEqual(today_entry['units_sold'], 15)

        # Check velocity ranking
        rankings = get_product_velocity_ranking(shop_id=self.shop_a.id, days=7)
        self.assertTrue(len(rankings) > 0)
        top_prod = rankings[0]
        self.assertEqual(top_prod['product_id'], self.product_pen.id)
        self.assertEqual(top_prod['units_sold'], 15)

    # ==================== STEP 16 TESTS ====================

    def test_step16_supplier_management_with_business_details_and_gst(self):
        """Test creating supplier with registered company name, GST tax_id, and shop isolation."""
        self.client.force_authenticate(user=self.owner_a)

        payload = {
            "shop": self.shop_a.id,
            "name": "Navneet Stationery Mart",
            "business_name": "Navneet Publications & Stationery Private Limited",
            "tax_id": "07AAAAA0000A1Z5",
            "contact_person": "Vikram Malhotra",
            "phone": "9811002233",
            "email": "vikram@navneetstationery.com",
            "city": "New Delhi",
            "state": "Delhi",
            "postal_code": "110001",
            "notes": "Primary campus distributor for premium registers and spiral notebooks"
        }
        res = self.client.post("/api/suppliers/", payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        sup_id = res.data['id']
        self.assertEqual(res.data['business_name'], "Navneet Publications & Stationery Private Limited")
        self.assertEqual(res.data['tax_id'], "07AAAAA0000A1Z5")

        # Owner B attempts to view Shop A's supplier -> 404
        self.client.force_authenticate(user=self.owner_b)
        res_b = self.client.get(f"/api/suppliers/{sup_id}/")
        self.assertEqual(res_b.status_code, status.HTTP_404_NOT_FOUND)

        # Student denied -> 403
        self.client.force_authenticate(user=self.student)
        res_s = self.client.get(f"/api/suppliers/{sup_id}/")
        self.assertEqual(res_s.status_code, status.HTTP_403_FORBIDDEN)

    def test_step16_supplier_product_mapping_and_preferred(self):
        """Test supplier-product mapping with price, MOQ, lead time, and duplicate prevention."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(
            shop=self.shop_a,
            name="Camlin Kokuyo Supplies",
            business_name="Kokuyo Camlin Ltd",
            tax_id="27AAACK0001B1ZZ"
        )

        mapping_payload = {
            "product_id": self.product_pen.id,
            "purchase_price": "11.20",
            "minimum_order_quantity": 50,
            "lead_time_days": 2,
            "is_preferred": True,
            "supplier_product_code": "CAM-GEL-BL01"
        }
        res = self.client.post(f"/api/suppliers/{supplier.id}/add-product/", mapping_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        sp = SupplierProduct.objects.get(supplier=supplier, product=self.product_pen)
        self.assertEqual(sp.purchase_price, Decimal("11.20"))
        self.assertEqual(sp.minimum_order_quantity, 50)
        self.assertEqual(sp.lead_time_days, 2)
        self.assertTrue(sp.is_preferred)

        # Duplicate check: calling again updates existing record without duplicate key error
        res_update = self.client.post(
            f"/api/suppliers/{supplier.id}/add-product/",
            {**mapping_payload, "purchase_price": "10.80"},
            format='json'
        )
        self.assertEqual(res_update.status_code, status.HTTP_200_OK)
        sp.refresh_from_db()
        self.assertEqual(sp.purchase_price, Decimal("10.80"))
        self.assertEqual(SupplierProduct.objects.filter(supplier=supplier, product=self.product_pen).count(), 1)

    def test_step16_supplier_performance_calculation_api(self):
        """Test operational supplier performance calculation computed from real POs."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(
            shop=self.shop_a,
            name="Hindustan Paper House",
            phone="9876500099"
        )

        # Create 1 completed PO and 1 placed PO
        po1 = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-TEST-PERF-01",
            status=PurchaseOrder.Status.RECEIVED,
            subtotal=Decimal("2000.00"),
            grand_total=Decimal("2000.00"),
            order_date=timezone.now().date() - timezone.timedelta(days=5),
            expected_date=timezone.now().date() - timezone.timedelta(days=2),
            received_date=timezone.now() - timezone.timedelta(days=3) # Delivered on-time
        )
        po2 = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-TEST-PERF-02",
            status=PurchaseOrder.Status.ORDERED,
            subtotal=Decimal("1500.00"),
            grand_total=Decimal("1500.00"),
            order_date=timezone.now().date() - timezone.timedelta(days=1),
            expected_date=timezone.now().date() + timezone.timedelta(days=2)
        )

        res = self.client.get(f"/api/suppliers/{supplier.id}/performance/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.data
        self.assertEqual(data['total_orders'], 2)
        self.assertEqual(data['completed_orders'], 1)
        self.assertEqual(data['open_orders'], 1)
        self.assertEqual(data['delayed_orders'], 0)
        self.assertEqual(data['total_purchase_value'], 3500.0)
        self.assertGreaterEqual(data['reliability_score'], 80.0)

    def test_step16_purchase_order_lifecycle_approval_and_invalid_transitions(self):
        """Test DRAFT -> PENDING_APPROVAL -> APPROVED -> ORDERED, rejection, and invalid status block."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(shop=self.shop_a, name="Bilt Graphics Papers")
        po = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-LIFECYCLE-01",
            status=PurchaseOrder.Status.DRAFT,
            subtotal=Decimal("500.00"),
            grand_total=Decimal("500.00")
        )

        # 1. Submit for approval -> PENDING_APPROVAL
        res_sub = self.client.post(f"/api/purchase-orders/{po.id}/submit-approval/")
        self.assertEqual(res_sub.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.PENDING_APPROVAL)

        # 2. Reject flow test on second draft
        po_rej = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-LIFECYCLE-02",
            status=PurchaseOrder.Status.PENDING_APPROVAL
        )
        res_rej = self.client.post(f"/api/purchase-orders/{po_rej.id}/reject/", {"reason": "Budget cap exceeded"}, format='json')
        self.assertEqual(res_rej.status_code, status.HTTP_200_OK)
        po_rej.refresh_from_db()
        self.assertEqual(po_rej.status, PurchaseOrder.Status.REJECTED)
        self.assertEqual(po_rej.rejection_reason, "Budget cap exceeded")

        # 3. Approve first PO -> APPROVED
        res_app = self.client.post(f"/api/purchase-orders/{po.id}/approve/")
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.APPROVED)
        self.assertEqual(po.approved_by, self.owner_a)
        self.assertIsNotNone(po.approved_at)

        # 4. Mark ordered -> ORDERED
        res_ord = self.client.post(f"/api/purchase-orders/{po.id}/order/")
        self.assertEqual(res_ord.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, PurchaseOrder.Status.ORDERED)

        # 5. Invalid transition: cannot approve an already ordered PO
        res_invalid = self.client.post(f"/api/purchase-orders/{po.id}/approve/")
        self.assertEqual(res_invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_step16_idempotent_partial_receiving_and_stock_updates(self):
        """Test partial receiving with idempotency key, audit costs, and duplicate suppression."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(shop=self.shop_a, name="Reynolds Writing Instruments")
        sp = SupplierProduct.objects.create(
            supplier=supplier,
            product=self.product_pen,
            shop=self.shop_a,
            purchase_price=Decimal("12.00")
        )

        po = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-IDEM-01",
            status=PurchaseOrder.Status.ORDERED
        )
        po_item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.product_pen,
            quantity_ordered=50,
            quantity_received=0,
            unit_cost=Decimal("12.50"),
            subtotal=Decimal("625.00"),
            total_cost=Decimal("625.00")
        )

        initial_stock = self.inv_pen.current_stock
        payload = {
            "items": [{"item_id": po_item.id, "quantity_to_receive": 25}],
            "notes": "First partial delivery",
            "idempotency_key": "IDEM-TOKEN-ABC-123"
        }

        # First receive request
        res1 = self.client.post(f"/api/purchase-orders/{po.id}/receive/", payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, initial_stock + 25)

        # Verify transaction logged with cost
        tx = InventoryTransaction.objects.filter(inventory=self.inv_pen).latest('id')
        self.assertEqual(tx.unit_cost, Decimal("12.50"))
        self.assertEqual(tx.total_cost, Decimal("312.50")) # 25 * 12.50

        # Verify SupplierProduct updated
        sp.refresh_from_db()
        self.assertEqual(sp.last_purchase_price, Decimal("12.50"))
        self.assertIsNotNone(sp.last_purchase_date)

        # Duplicate click with same idempotency token -> must NOT increment stock again
        res2 = self.client.post(f"/api/purchase-orders/{po.id}/receive/", payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data.get('idempotent_duplicate', False))

        self.inv_pen.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, initial_stock + 25) # Still 25, not 50

    def test_step16_over_receiving_and_negative_quantity_prevention(self):
        """Test over-receiving protection and negative quantity rejection."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(shop=self.shop_a, name="Standard Binders")
        po = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-VALID-01",
            status=PurchaseOrder.Status.ORDERED
        )
        item = PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.product_pen,
            quantity_ordered=20,
            quantity_received=0,
            unit_cost=Decimal("10.00"),
            subtotal=Decimal("200.00"),
            total_cost=Decimal("200.00")
        )

        # Attempt to receive 30 units (ordered 20) -> Must fail
        res_over = self.client.post(
            f"/api/purchase-orders/{po.id}/receive/",
            {"items": [{"item_id": item.id, "quantity_to_receive": 30}]},
            format='json'
        )
        self.assertEqual(res_over.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Remaining is only 20", str(res_over.data))

        # Attempt negative quantity -> Must fail
        res_neg = self.client.post(
            f"/api/purchase-orders/{po.id}/receive/",
            {"items": [{"item_id": item.id, "quantity_to_receive": -5}]},
            format='json'
        )
        self.assertEqual(res_neg.status_code, status.HTTP_400_BAD_REQUEST)

    def test_step16_product_cost_tracking_metrics(self):
        """Test historical purchase cost metrics calculation (last, avg, min, max)."""
        self.client.force_authenticate(user=self.owner_a)

        supplier = Supplier.objects.create(shop=self.shop_a, name="Classmate Enterprises")
        po = PurchaseOrder.objects.create(
            shop=self.shop_a,
            supplier=supplier,
            po_number="PO-COST-01",
            status=PurchaseOrder.Status.RECEIVED,
            received_date=timezone.now()
        )
        PurchaseOrderItem.objects.create(
            purchase_order=po,
            product=self.product_notebook,
            quantity_ordered=20,
            quantity_received=20,
            unit_cost=Decimal("50.00"),
            subtotal=Decimal("1000.00"),
            total_cost=Decimal("1000.00")
        )

        # Check cost history endpoint
        inv_nb = Inventory.objects.get_or_create(shop=self.shop_a, product=self.product_notebook)[0]
        res = self.client.get(f"/api/inventory/{inv_nb.id}/cost-history/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['last_cost'], 50.0)
        self.assertEqual(res.data['average_cost'], 50.0)
        self.assertEqual(res.data['lowest_cost'], 50.0)
        self.assertEqual(res.data['highest_cost'], 50.0)

    def test_step16_rule_based_supplier_ranking_and_recommendations(self):
        """Test rule-based supplier ranking considering price, lead-time, and reliability."""
        self.client.force_authenticate(user=self.owner_a)

        # Supplier 1: Cheap (₹9.00), but slow (5 days)
        sup1 = Supplier.objects.create(shop=self.shop_a, name="Budget Pens Co")
        SupplierProduct.objects.create(
            supplier=sup1,
            product=self.product_pen,
            shop=self.shop_a,
            purchase_price=Decimal("9.00"),
            lead_time_days=5,
            minimum_order_quantity=10
        )

        # Supplier 2: Slightly higher price (₹10.00), very fast (1 day), preferred
        sup2 = Supplier.objects.create(shop=self.shop_a, name="Express Delivery Pens")
        SupplierProduct.objects.create(
            supplier=sup2,
            product=self.product_pen,
            shop=self.shop_a,
            purchase_price=Decimal("10.00"),
            lead_time_days=1,
            minimum_order_quantity=10,
            is_preferred=True
        )

        res = self.client.get(f"/api/suppliers/recommend/?product_id={self.product_pen.id}&shop={self.shop_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rec = res.data.get('recommended_supplier')
        self.assertIsNotNone(rec)
        self.assertIn('explanation', rec)
        self.assertIn('Recommended Supplier:', res.data['reason'])

    def test_step16_reorder_recommendations_ml_boundary(self):
        """Test reorder recommendations foundation strictly returns predicted_demand: null for Step 17."""
        self.client.force_authenticate(user=self.owner_a)

        # Set pen stock below reorder level (current=10, reorder=25)
        self.inv_pen.current_stock = 10
        self.inv_pen.save()

        res = self.client.get(f"/api/inventory/reorder-recommendations/?shop={self.shop_a.id}")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        recs = res.data['recommendations']
        self.assertTrue(len(recs) > 0)

        pen_rec = next((r for r in recs if r['product_id'] == self.product_pen.id), None)
        self.assertIsNotNone(pen_rec)
        self.assertGreater(pen_rec['recommended_purchase_quantity'], 0)
        # Verify strict ML boundary
        self.assertIsNone(pen_rec['predicted_demand'])
        self.assertIn("Demand prediction not available yet", pen_rec['demand_prediction_status'])


