from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from users.models import User
from shops.models import Shop
from products.models import Product, Category, PriceAlert
from inventory.models import Inventory
from orders.models import Order, OrderItem
from products.services.shopping_intelligence_service import ShoppingIntelligenceService

User = get_user_model()


class Step23ShoppingIntelligenceTests(APITestCase):
    def setUp(self):
        # 1. Users
        self.student = User.objects.create_user(
            username="student_sneha",
            email="sneha@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Sneha Rao",
            phone_number="9876543220",
        )
        self.owner_a = User.objects.create_user(
            username="owner_alpha",
            email="alpha@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Alpha Shop Owner",
            phone_number="9876543221",
        )
        self.owner_b = User.objects.create_user(
            username="owner_beta",
            email="beta@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Beta Shop Owner",
            phone_number="9876543222",
        )

        # 2. Shops
        self.shop_a = Shop.objects.create(
            name="Alpha Stationery & Xerox",
            slug="alpha-stationery-xerox",
            owner=self.owner_a,
            shop_type=Shop.ShopType.PRINTING_XEROX,
            address="North Gate Complex",
            contact_phone="9876543221",
            contact_email="alpha@campus.edu",
            is_active=True,
        )
        self.shop_b = Shop.objects.create(
            name="Beta University Book Depot",
            slug="beta-university-book-depot",
            owner=self.owner_b,
            shop_type=Shop.ShopType.BOOK_STATIONERY,
            address="South Gate Arcade",
            contact_phone="9876543222",
            contact_email="beta@campus.edu",
            is_active=True,
        )

        # 3. Category & Products
        self.category_notebooks = Category.objects.create(name="Notebooks", slug="notebooks", is_active=True)

        # Product in Shop A: ₹50.00
        self.notebook_a = Product.objects.create(
            shop=self.shop_a,
            category=self.category_notebooks,
            name="Classmate 200 Page Single Line Notebook",
            slug="classmate-200-page-notebook-a",
            sku="NB-001-A",
            price=Decimal("50.00"),
            is_active=True,
        )
        Inventory.objects.create(
            shop=self.shop_a,
            product=self.notebook_a,
            current_stock=25,
            reserved_stock=0,
        )

        # Identical Product in Shop B: ₹45.00 (Cheaper!)
        self.notebook_b = Product.objects.create(
            shop=self.shop_b,
            category=self.category_notebooks,
            name="Classmate 200 Page Single Line Notebook",
            slug="classmate-200-page-notebook-b",
            sku="NB-001-B",
            price=Decimal("45.00"),
            is_active=True,
        )
        Inventory.objects.create(
            shop=self.shop_b,
            product=self.notebook_b,
            current_stock=40,
            reserved_stock=0,
        )

        # Similar alternative product in Shop A: ₹42.00
        self.notebook_alt = Product.objects.create(
            shop=self.shop_a,
            category=self.category_notebooks,
            name="Navneet 180 Page Long Book",
            slug="navneet-180-page-long-book",
            sku="NB-002-A",
            price=Decimal("42.00"),
            is_active=True,
        )
        Inventory.objects.create(
            shop=self.shop_a,
            product=self.notebook_alt,
            current_stock=30,
            reserved_stock=0,
        )

    def test_cross_shop_price_comparison(self):
        """Test product price comparison across shops correctly identifies lowest price."""
        self.client.force_authenticate(user=self.student)
        url = f"/api/products/{self.notebook_a.id}/price_comparison/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(data["product_id"], self.notebook_a.id)
        self.assertGreaterEqual(len(data["comparisons"]), 2)

        # Shop B should be flagged as lowest price (₹45 < ₹50)
        comparisons = {item["shop_name"]: item for item in data["comparisons"]}
        self.assertIn("Beta University Book Depot", comparisons)
        self.assertIn("Alpha Stationery & Xerox", comparisons)

        beta_entry = comparisons["Beta University Book Depot"]
        self.assertTrue(beta_entry["is_lowest_price"])
        self.assertEqual(Decimal(str(beta_entry["price"])), Decimal("45.00"))

        alpha_entry = comparisons["Alpha Stationery & Xerox"]
        self.assertFalse(alpha_entry["is_lowest_price"])
        self.assertEqual(Decimal(str(alpha_entry["price"])), Decimal("50.00"))

    def test_out_of_stock_alternatives_discovery(self):
        """Test that an out-of-stock product returns in-stock alternatives from other shops and same category."""
        # Mark notebook A as out of stock
        inv_a = Inventory.objects.get(product=self.notebook_a)
        inv_a.current_stock = 0
        inv_a.save()

        self.client.force_authenticate(user=self.student)
        url = f"/api/products/{self.notebook_a.id}/alternatives/"
        response = self.client.get(url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        alternatives = response.data.get("alternatives", [])
        self.assertGreaterEqual(len(alternatives), 1)

        # Shop B's notebook should be suggested as IDENTICAL_OTHER_SHOP
        shop_b_alt = next((a for a in alternatives if a["product_id"] == self.notebook_b.id), None)
        self.assertIsNotNone(shop_b_alt)
        self.assertEqual(shop_b_alt["match_type"], "IDENTICAL_OTHER_SHOP")
        self.assertTrue(shop_b_alt["in_stock"])
        self.assertEqual(Decimal(str(shop_b_alt["price"])), Decimal("45.00"))

    def test_buy_again_with_reorder_cadence(self):
        """Test Buy Again intelligence with purchase frequency and reorder recommendation."""
        # Create 2 past completed orders with 30-day interval
        now = timezone.now()
        order1 = Order.objects.create(
            customer=self.student,
            shop=self.shop_a,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.PICKUP,
            status=Order.Status.COMPLETED,
            total_amount=Decimal("100.00"),
            payment_status=Order.PaymentStatus.PAID,
        )
        Order.objects.filter(id=order1.id).update(created_at=now - timedelta(days=60))
        OrderItem.objects.create(
            order=order1,
            product=self.notebook_a,
            quantity=2,
            unit_price=Decimal("50.00"),
            total_price=Decimal("100.00"),
        )

        order2 = Order.objects.create(
            customer=self.student,
            shop=self.shop_a,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.PICKUP,
            status=Order.Status.COMPLETED,
            total_amount=Decimal("100.00"),
            payment_status=Order.PaymentStatus.PAID,
        )
        Order.objects.filter(id=order2.id).update(created_at=now - timedelta(days=30))
        OrderItem.objects.create(
            order=order2,
            product=self.notebook_a,
            quantity=2,
            unit_price=Decimal("50.00"),
            total_price=Decimal("100.00"),
        )

        buy_again_items = ShoppingIntelligenceService.get_buy_again_items(self.student)
        self.assertGreaterEqual(len(buy_again_items), 1)

        item = buy_again_items[0]
        self.assertEqual(item["product_id"], self.notebook_a.id)
        self.assertEqual(item["total_purchased_count"], 2)
        # 30 days have elapsed since last purchase, average interval is 30 days -> due for reorder!
        self.assertTrue(item["due_for_reorder"])
        self.assertIn("days based on your reorder history", item["reorder_cadence_note"])

        # Also verifies price comparison: Shop B has it for ₹45 vs current ₹50
        self.assertIsNotNone(item["better_price_alternative"])
        self.assertEqual(item["better_price_alternative"]["savings_per_unit"], 5.0)

    def test_price_alert_creation_and_notification(self):
        """Test student setting a price alert on a product."""
        self.client.force_authenticate(user=self.student)

        # Set price alert for Notebook A to ₹40 (current is ₹50)
        url = f"/api/products/{self.notebook_a.id}/price_alert/"
        payload = {"target_price": "40.00"}
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["alert_set"])

        alert = PriceAlert.objects.get(user=self.student, product=self.notebook_a)
        self.assertEqual(alert.target_price, Decimal("40.00"))
        self.assertTrue(alert.active)

        # Now simulate price drop to ₹38
        self.notebook_a.price = Decimal("38.00")
        self.notebook_a.save()

        notified_count = ShoppingIntelligenceService.check_and_trigger_price_alerts(self.notebook_a)
        self.assertEqual(notified_count, 1)

        alert.refresh_from_db()
        self.assertFalse(alert.active)
        self.assertIsNotNone(alert.notified_at)
