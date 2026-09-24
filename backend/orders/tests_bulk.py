from datetime import date, time, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from users.models import User
from shops.models import Shop
from products.models import Product, Category, BulkPricingTier, PriceAlert
from inventory.models import Inventory
from orders.models import (
    BulkOrder,
    BulkOrderItem,
    BulkOrderParticipant,
    BulkOrderParticipantItem,
    BulkOrderAudit,
)
from orders.services.bulk_order_service import BulkOrderService

User = get_user_model()


class Step23BulkOrderingTests(APITestCase):
    def setUp(self):
        # 1. Users
        self.class_rep = User.objects.create_user(
            username="rep_rahul",
            email="rahul@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Rahul Sharma",
            phone_number="9876543210",
        )
        self.student_1 = User.objects.create_user(
            username="student_priya",
            email="priya@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Priya Patel",
            phone_number="9876543211",
        )
        self.student_2 = User.objects.create_user(
            username="student_amit",
            email="amit@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Amit Kumar",
            phone_number="9876543212",
        )
        self.shop_owner = User.objects.create_user(
            username="shopkeeper_ramesh",
            email="ramesh@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Ramesh Gupta",
            phone_number="9876543213",
        )

        # 2. Shop
        self.shop = Shop.objects.create(
            name="Campus Central Stationery",
            slug="campus-central-stationery",
            owner=self.shop_owner,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address="Campus Center Block A",
            contact_phone="9876543213",
            contact_email="shop@campus.edu",
            is_active=True,
            opening_time=time(8, 0),
            closing_time=time(20, 0),
        )

        # 3. Category & Products
        self.category = Category.objects.create(name="Notebooks & Files", slug="notebooks-files", is_active=True)
        self.product_file = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name="Hardbound Project File A4",
            slug="hardbound-project-file-a4",
            sku="HPF-001",
            price=Decimal("50.00"),
            is_active=True,
        )
        self.product_sheets = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name="Bond Paper A4 100 Sheets",
            slug="bond-paper-a4-100-sheets",
            sku="BPA4-001",
            price=Decimal("120.00"),
            is_active=True,
        )

        # 4. Inventory
        self.inv_file = Inventory.objects.create(
            shop=self.shop,
            product=self.product_file,
            current_stock=100,
            reserved_stock=0,
            reorder_level=10,
        )
        self.inv_sheets = Inventory.objects.create(
            shop=self.shop,
            product=self.product_sheets,
            current_stock=80,
            reserved_stock=0,
            reorder_level=10,
        )

        # 5. Bulk Pricing Tiers
        # File: 1-9 normal, 10-24 5% off, 25-49 10% off, 50+ 15% off
        BulkPricingTier.objects.create(
            product=self.product_file,
            shop=self.shop,
            min_quantity=10,
            max_quantity=24,
            discount_type=BulkPricingTier.DiscountType.PERCENTAGE,
            discount_value=Decimal("5.00"),
            is_active=True,
        )
        BulkPricingTier.objects.create(
            product=self.product_file,
            shop=self.shop,
            min_quantity=25,
            max_quantity=49,
            discount_type=BulkPricingTier.DiscountType.PERCENTAGE,
            discount_value=Decimal("10.00"),
            is_active=True,
        )
        BulkPricingTier.objects.create(
            product=self.product_file,
            shop=self.shop,
            min_quantity=50,
            max_quantity=None,
            discount_type=BulkPricingTier.DiscountType.PERCENTAGE,
            discount_value=Decimal("15.00"),
            is_active=True,
        )

    def test_create_bulk_order_with_tiers_and_discounts(self):
        """Test creating a class bulk order with volume pricing discount calculation."""
        self.client.force_authenticate(user=self.class_rep)

        payload = {
            "name": "BCA Final Project Submission Class Order",
            "description": "Class-wide bulk order for project files and bond sheets",
            "order_type": "CLASS",
            "shop": self.shop.id,
            "deadline": (timezone.now() + timedelta(days=3)).isoformat(),
            "participant_limit": 50,
            "delivery_method": "PICKUP",
            "items": [
                {"product_id": self.product_file.id, "quantity": 50},
                {"product_id": self.product_sheets.id, "quantity": 20},
            ],
        }

        url = "/api/bulk-orders/"
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        order_data = response.data
        self.assertEqual(order_data["order_type"], "CLASS")
        self.assertEqual(order_data["status"], "OPEN")
        self.assertTrue(order_data["share_code"].startswith("CLS-"))

        # Verify pricing:
        # File: 50 * 50 = 2500, tier >= 50 is 15% discount = 375 discount -> file subtotal 2125
        # Sheets: 20 * 120 = 2400, no discount tier -> 2400
        # Expected subtotal = 4900, discount = 375, total = 4525
        self.assertEqual(Decimal(order_data["subtotal"]), Decimal("4900.00"))
        self.assertEqual(Decimal(order_data["discount_amount"]), Decimal("375.00"))
        self.assertEqual(Decimal(order_data["total_amount"]), Decimal("4525.00"))

        # Verify owner is registered as participant with role OWNER
        bulk_order = BulkOrder.objects.get(id=order_data["id"])
        self.assertTrue(bulk_order.participants.filter(user=self.class_rep, role="OWNER").exists())

    def test_join_bulk_order_via_share_code(self):
        """Test student joining a bulk order using share code and specifying quantities."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Class Presentation Kit",
            order_type="CLASS",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 10}],
            participant_limit=30,
        )

        self.client.force_authenticate(user=self.student_1)
        join_url = f"/api/bulk-orders/{bulk_order.id}/join_by_code/"
        join_payload = {
            "share_code": bulk_order.share_code,
            "items": [{"product_id": self.product_file.id, "quantity": 5}],
            "notes": "Priya requested 5 files",
        }

        response = self.client.post(join_url, join_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["participant_count"], 2)

        # Verify student 1 is a participant with 5 units
        participant = BulkOrderParticipant.objects.get(bulk_order=bulk_order, user=self.student_1)
        self.assertEqual(participant.role, BulkOrderParticipant.ParticipantRole.PARTICIPANT)
        p_item = participant.items.get(bulk_order_item__product=self.product_file)
        self.assertEqual(p_item.quantity, 5)

        # Verify bulk order items aggregated: 10 (owner) + 5 (student_1) = 15
        bulk_order.refresh_from_db()
        file_item = bulk_order.items.get(product=self.product_file)
        self.assertEqual(file_item.quantity, 15)
        # 15 files falls into 10-24 tier (5% discount)
        self.assertEqual(file_item.discount_percentage, Decimal("5.00"))

    def test_atomic_stock_reservation_on_confirmation(self):
        """Test atomic stock reservation when owner confirms a bulk order."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Project Files Order",
            order_type="CLASS",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 40}],
        )

        self.client.force_authenticate(user=self.class_rep)
        confirm_url = f"/api/bulk-orders/{bulk_order.id}/confirm/"
        response = self.client.post(confirm_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "CONFIRMED")
        self.assertTrue(response.data["stock_reserved"])

        # Check inventory reserved_stock updated atomically
        self.inv_file.refresh_from_db()
        self.assertEqual(self.inv_file.reserved_stock, 40)
        self.assertEqual(self.inv_file.available_stock, 60)

    def test_insufficient_stock_prevents_confirmation(self):
        """Test confirmation fails gracefully if requested quantity exceeds available stock."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Huge Order",
            order_type="CLASS",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 150}],  # stock is only 100
        )

        self.client.force_authenticate(user=self.class_rep)
        confirm_url = f"/api/bulk-orders/{bulk_order.id}/confirm/"
        response = self.client.post(confirm_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Insufficient stock", response.data["error"])

        # Check inventory was not modified
        self.inv_file.refresh_from_db()
        self.assertEqual(self.inv_file.reserved_stock, 0)

    def test_cancel_bulk_order_releases_reserved_stock(self):
        """Test cancelling a confirmed bulk order safely releases reserved inventory."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Cancellable Order",
            order_type="PROJECT_TEAM",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 30}],
        )
        # Confirm and reserve stock
        BulkOrderService.confirm_bulk_order(bulk_order, self.class_rep)
        self.inv_file.refresh_from_db()
        self.assertEqual(self.inv_file.reserved_stock, 30)

        # Cancel order
        self.client.force_authenticate(user=self.class_rep)
        cancel_url = f"/api/bulk-orders/{bulk_order.id}/cancel/"
        response = self.client.post(cancel_url, {"reason": "Project postponed"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], "CANCELLED")
        self.assertFalse(response.data["stock_reserved"])

        # Check reserved stock released
        self.inv_file.refresh_from_db()
        self.assertEqual(self.inv_file.reserved_stock, 0)
        self.assertEqual(self.inv_file.available_stock, 100)

    def test_non_owner_cannot_confirm_or_cancel(self):
        """Security test: unauthorized student cannot confirm or cancel another student's bulk order."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Exclusive Rep Order",
            order_type="CLASS",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 10}],
        )
        BulkOrderParticipant.objects.create(
            bulk_order=bulk_order,
            user=self.student_1,
            role=BulkOrderParticipant.Role.PARTICIPANT,
        )

        self.client.force_authenticate(user=self.student_1)
        confirm_url = f"/api/bulk-orders/{bulk_order.id}/confirm/"
        response = self.client.post(confirm_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        cancel_url = f"/api/bulk-orders/{bulk_order.id}/cancel/"
        response = self.client.post(cancel_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_shop_owner_bulk_order_status_advancement(self):
        """Test shopkeeper accepting and progressing bulk order statuses."""
        bulk_order = BulkOrderService.create_bulk_order(
            creator=self.class_rep,
            name="Shop Processing Test Order",
            order_type="CLASS",
            shop=self.shop,
            deadline=timezone.now() + timedelta(days=2),
            items_data=[{"product_id": self.product_file.id, "quantity": 15}],
        )
        BulkOrderService.confirm_bulk_order(bulk_order, self.class_rep)

        self.client.force_authenticate(user=self.shop_owner)
        advance_url = f"/api/bulk-orders/{bulk_order.id}/advance_status/"

        # 1. Processing
        res = self.client.post(advance_url, {"status": "PROCESSING"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "PROCESSING")

        # 2. Ready
        res = self.client.post(advance_url, {"status": "READY"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "READY")

        # 3. Completed
        res = self.client.post(advance_url, {"status": "COMPLETED"}, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data["status"], "COMPLETED")
        self.inv_file.refresh_from_db()
        self.assertEqual(self.inv_file.current_stock, 85)  # 100 - 15 = 85
        self.assertEqual(self.inv_file.reserved_stock, 0)
