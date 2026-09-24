from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.utils import timezone
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from shops.models import Shop
from products.models import Product, Category
from inventory.models import Inventory, InventoryTransaction
from orders.models import Order, OrderItem, Payment, Refund
from printing.models import PrintingOrder
from delivery.models import Delivery
from predictions.models import DemandPrediction, PurchaseRecommendation

User = get_user_model()


class AnalyticsBaseTestCase(TestCase):
    """
    Base test case creating multi-tenant merchant, student, and admin fixtures.
    """
    def setUp(self):
        self.client = APIClient()

        # Users
        self.admin_user = User.objects.create_superuser(
            username='admin_bi',
            email='admin_bi@campus.edu',
            password='Password123!',
            role='ADMIN'
        )

        self.merchant_a = User.objects.create_user(
            username='merchant_a',
            email='merchant_a@campus.edu',
            password='Password123!',
            role='SHOP_OWNER'
        )

        self.merchant_b = User.objects.create_user(
            username='merchant_b',
            email='merchant_b@campus.edu',
            password='Password123!',
            role='SHOP_OWNER'
        )

        self.student_1 = User.objects.create_user(
            username='student_1',
            email='student_1@campus.edu',
            password='Password123!',
            role='STUDENT'
        )

        self.student_2 = User.objects.create_user(
            username='student_2',
            email='student_2@campus.edu',
            password='Password123!',
            role='STUDENT'
        )

        # Shops
        self.shop_a = Shop.objects.create(
            owner=self.merchant_a,
            name="Alpha Stationery & Xerox",
            slug="alpha-stationery-xerox",
            address="Campus Block A",
            contact_phone="9876543210",
            is_active=True
        )

        self.shop_b = Shop.objects.create(
            owner=self.merchant_b,
            name="Beta Books & Supplies",
            slug="beta-books-supplies",
            address="Campus Block B",
            contact_phone="9876543211",
            is_active=True
        )

        # Categories & Products for Shop A
        self.cat_notebooks = Category.objects.create(name="Notebooks", slug="notebooks")
        self.cat_pens = Category.objects.create(name="Pens & Writing", slug="pens-writing")

        self.prod_a1 = Product.objects.create(
            shop=self.shop_a,
            category=self.cat_notebooks,
            name="Classmate Spiral Notebook",
            slug="classmate-spiral-notebook",
            sku="NB-SP-01",
            price=Decimal('80.00'),
            is_active=True
        )

        self.prod_a2 = Product.objects.create(
            shop=self.shop_a,
            category=self.cat_pens,
            name="Gel Pen Blue Pack",
            slug="gel-pen-blue-pack",
            sku="PEN-GEL-02",
            price=Decimal('50.00'),
            is_active=True
        )

        # Inventories for Shop A
        self.inv_a1 = Inventory.objects.create(
            shop=self.shop_a,
            product=self.prod_a1,
            current_stock=50,
            unit_cost=Decimal('50.00'),
            minimum_stock=10,
            reorder_level=15,
            maximum_stock=100
        )

        self.inv_a2 = Inventory.objects.create(
            shop=self.shop_a,
            product=self.prod_a2,
            current_stock=2,  # Low stock
            unit_cost=Decimal('30.00'),
            minimum_stock=5,
            reorder_level=10,
            maximum_stock=80
        )

        # Create Orders for Shop A
        now = timezone.now()
        self.order_completed = Order.objects.create(
            customer=self.student_1,
            shop=self.shop_a,
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            subtotal=Decimal('210.00'),
            discount_amount=Decimal('10.00'),
            delivery_fee=Decimal('15.00'),
            total_amount=Decimal('215.00')
        )
        OrderItem.objects.create(
            order=self.order_completed,
            product=self.prod_a1,
            quantity=2,
            unit_price=Decimal('80.00'),
            total_price=Decimal('160.00')
        )
        OrderItem.objects.create(
            order=self.order_completed,
            product=self.prod_a2,
            quantity=1,
            unit_price=Decimal('50.00'),
            total_price=Decimal('50.00')
        )

        # Payment for completed order
        self.pay_1 = Payment.objects.create(
            order=self.order_completed,
            user=self.student_1,
            shop=self.shop_a,
            amount=Decimal('215.00'),
            status=Payment.Status.CAPTURED,
            idempotency_key="TEST-PAY-001"
        )

        # Pending order
        self.order_pending = Order.objects.create(
            customer=self.student_2,
            shop=self.shop_a,
            status=Order.Status.PENDING,
            payment_status=Order.PaymentStatus.PENDING,
            subtotal=Decimal('80.00'),
            discount_amount=Decimal('0.00'),
            delivery_fee=Decimal('0.00'),
            total_amount=Decimal('80.00')
        )
        OrderItem.objects.create(
            order=self.order_pending,
            product=self.prod_a1,
            quantity=1,
            unit_price=Decimal('80.00'),
            total_price=Decimal('80.00')
        )

        # Cancelled order (must not count towards revenue)
        self.order_cancelled = Order.objects.create(
            customer=self.student_1,
            shop=self.shop_a,
            status=Order.Status.CANCELLED,
            payment_status=Order.PaymentStatus.FAILED,
            subtotal=Decimal('50.00'),
            discount_amount=Decimal('0.00'),
            delivery_fee=Decimal('0.00'),
            total_amount=Decimal('50.00')
        )

        # Refund on completed order
        self.refund_1 = Refund.objects.create(
            payment=self.pay_1,
            order=self.order_completed,
            amount=Decimal('25.00'),
            reason="Partial damage",
            status=Refund.Status.COMPLETED,
            requested_by=self.student_1
        )

        # Printing Order for Shop A
        self.print_order = PrintingOrder.objects.create(
            order=self.order_completed,
            shop=self.shop_a,
            color_mode=PrintingOrder.ColorMode.BW,
            paper_size=PrintingOrder.PaperSize.A4,
            print_sides=PrintingOrder.PrintSides.DOUBLE_SIDED,
            binding_type=PrintingOrder.BindingType.SPIRAL,
            total_pages=20,
            copies=2,
            price=Decimal('70.00'),
            status=PrintingOrder.PrintingStatus.COMPLETED,
            completed_at=now
        )


class ShopOwnerAnalyticsAPITests(AnalyticsBaseTestCase):
    """
    Validates all Shop Owner BI endpoints, financial accuracy, and date filtering.
    """
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.merchant_a)

    def test_shop_overview_kpis_and_financial_integrity(self):
        """
        Gross Sales = Subtotal (210 + 80) + Delivery (15 + 0) = 305.00
        Discounts = 10.00
        Refunds = 25.00
        Net Revenue = 305.00 - 10.00 - 25.00 = 270.00
        Valid Orders = 2 (completed + pending, cancelled excluded)
        AOV = 270.00 / 2 = 135.00
        """
        response = self.client.get('/api/analytics/shop/overview/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        kpis = response.data['kpis']
        self.assertEqual(Decimal(str(kpis['gross_sales'])), Decimal('305.00'))
        self.assertEqual(Decimal(str(kpis['discount_amount'])), Decimal('10.00'))
        self.assertEqual(Decimal(str(kpis['refund_amount'])), Decimal('25.00'))
        self.assertEqual(Decimal(str(kpis['net_revenue'])), Decimal('270.00'))
        self.assertEqual(Decimal(str(kpis['average_order_value'])), Decimal('135.00'))

        self.assertEqual(kpis['completed_orders'], 1)
        self.assertEqual(kpis['pending_orders'], 1)
        self.assertEqual(kpis['cancelled_orders'], 1)
        self.assertEqual(kpis['total_orders'], 3)
        self.assertEqual(kpis['unique_customers'], 2)

    def test_shop_sales_daily_series(self):
        """
        Validates contiguous calendar time series output.
        """
        response = self.client.get('/api/analytics/shop/sales/?preset=7d')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        series = response.data['series']
        self.assertEqual(len(series), 7)
        # Today should have orders > 0
        today_entry = series[-1]
        self.assertGreaterEqual(today_entry['orders'], 1)
        self.assertGreater(today_entry['net_sales'], 0.0)

    def test_shop_orders_status_distribution(self):
        response = self.client.get('/api/analytics/shop/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['total_orders'], 3)
        self.assertGreater(data['completion_rate'], 0)
        self.assertGreater(data['cancellation_rate'], 0)

    def test_shop_products_ranking_and_velocity(self):
        response = self.client.get('/api/analytics/shop/products/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        top_rev = response.data['top_by_revenue']
        self.assertTrue(len(top_rev) > 0)
        self.assertEqual(top_rev[0]['product_id'], self.prod_a1.id)

        perf_matrix = response.data['performance_matrix']
        self.assertTrue(len(perf_matrix) >= 2)
        prod_a1_perf = next(p for p in perf_matrix if p['product_id'] == self.prod_a1.id)
        self.assertEqual(prod_a1_perf['units_sold'], 3)

    def test_shop_inventory_health(self):
        response = self.client.get('/api/analytics/shop/inventory/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        health = response.data['health']
        self.assertEqual(health['total_products'], 2)
        self.assertEqual(health['total_stock_units'], 52)  # 50 + 2
        self.assertEqual(health['low_stock_count'], 1)     # prod_a2 has 2 <= minimum_stock 5
        self.assertEqual(Decimal(str(health['inventory_value'])), Decimal('2560.00'))  # (50*50) + (2*30)

    def test_shop_printing_analytics(self):
        response = self.client.get('/api/analytics/shop/printing/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['total_print_orders'], 1)
        self.assertEqual(data['pages_printed'], 40)  # 20 pages * 2 copies
        self.assertEqual(data['copies_printed'], 2)
        self.assertEqual(data['binding_orders_count'], 2)

    def test_shop_customers_analytics(self):
        response = self.client.get('/api/analytics/shop/customers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        self.assertEqual(data['unique_customers'], 2)
        self.assertEqual(data['new_customers'], 2)


class AnalyticsSecurityAndIsolationTests(AnalyticsBaseTestCase):
    """
    Verifies multi-tenant isolation, IDOR prevention, and role-based access control.
    """
    def test_shop_owner_cannot_access_another_shop_analytics(self):
        """
        Shop Owner A cannot query Shop Owner B's shop ID.
        """
        self.client.force_authenticate(user=self.merchant_a)
        response = self.client.get(f'/api/analytics/shop/overview/?shop={self.shop_b.id}')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_access_shop_analytics(self):
        self.client.force_authenticate(user=self.student_1)
        response = self.client.get('/api/analytics/shop/overview/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_access_admin_analytics(self):
        self.client.force_authenticate(user=self.student_1)
        response = self.client.get('/api/analytics/admin/overview/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_shop_owner_cannot_access_admin_analytics(self):
        self.client.force_authenticate(user=self.merchant_a)
        response = self.client.get('/api/analytics/admin/overview/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_rejected(self):
        response = self.client.get('/api/analytics/shop/overview/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AdminPlatformAnalyticsAPITests(AnalyticsBaseTestCase):
    """
    Validates SuperAdmin system-wide BI and multi-shop comparison views.
    """
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.admin_user)

    def test_admin_overview_aggregations(self):
        response = self.client.get('/api/analytics/admin/overview/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        kpis = response.data['platform_kpis']
        self.assertEqual(kpis['total_shops'], 2)
        self.assertGreaterEqual(kpis['total_users'], 5)
        self.assertEqual(kpis['total_orders'], 3)
        self.assertEqual(Decimal(str(kpis['net_revenue'])), Decimal('270.00'))

        streams = response.data['revenue_streams']
        self.assertIn('stationery', streams)
        self.assertIn('printing', streams)
        self.assertIn('delivery', streams)

        comparison = response.data['shop_comparison']
        self.assertEqual(len(comparison), 2)
        self.assertEqual(comparison[0]['shop_id'], self.shop_a.id)

    def test_admin_shops_comparison_endpoint(self):
        response = self.client.get('/api/analytics/admin/shops/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('shops', response.data)
        self.assertEqual(len(response.data['shops']), 2)


class StudentPersonalAnalyticsAPITests(AnalyticsBaseTestCase):
    """
    Validates student private spending and activity summary.
    """
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(user=self.student_1)

    def test_student_personal_summary(self):
        response = self.client.get('/api/analytics/student/summary/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        data = response.data
        # student_1 has 2 orders: 1 completed (215.00) and 1 cancelled
        self.assertEqual(data['total_orders'], 2)
        self.assertEqual(Decimal(str(data['total_spent'])), Decimal('215.00'))
        self.assertEqual(data['total_print_orders'], 1)
        self.assertEqual(data['pages_printed'], 40)


class EmptyShopAnalyticsTests(TestCase):
    """
    Verifies that a brand new shop with zero transactions produces clean empty states
    without raising zero-division errors.
    """
    def setUp(self):
        self.merchant_empty = User.objects.create_user(
            username='merchant_empty',
            email='empty@campus.edu',
            password='Password123!',
            role='SHOP_OWNER'
        )
        self.shop_empty = Shop.objects.create(
            owner=self.merchant_empty,
            name="Empty Campus Store",
            slug="empty-campus-store",
            address="Campus Block C",
            contact_phone="9999999999",
            is_active=True
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.merchant_empty)

    def test_empty_shop_overview(self):
        response = self.client.get('/api/analytics/shop/overview/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        kpis = response.data['kpis']
        self.assertEqual(Decimal(str(kpis['gross_sales'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(kpis['net_revenue'])), Decimal('0.00'))
        self.assertEqual(Decimal(str(kpis['average_order_value'])), Decimal('0.00'))
        self.assertEqual(kpis['total_orders'], 0)

        health = response.data['inventory_health']
        self.assertEqual(health['total_products'], 0)
        self.assertEqual(health['turnover_ratio'], 0.0)
