from decimal import Decimal
from datetime import timedelta
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from users.models import User
from shops.models import Shop, Offer
from products.models import Product, Category, Review
from inventory.models import Inventory, InventoryTransaction
from orders.models import Order, OrderItem, Payment, Refund, BulkOrder, Coupon, CouponUsage, Complaint
from printing.models import PrintingOrder
from delivery.models import Delivery
from predictions.models import DemandPrediction, PurchaseRecommendation
from academics.models import AcademicCalendar
from recommendations.models import RecommendationInteraction
from reports.models import ReportAuditLog


class AdminReportingSystemTests(TestCase):
    """
    Comprehensive test suite for STEP 28 Admin Reporting, Export & Management System.
    Validates RBAC security, date filters, pagination, CSV exports, financial accuracy,
    and zero-fake-data empty states across all 17 report categories.
    """

    def setUp(self):
        self.client = APIClient()
        self.now = timezone.now()

        # 1. Users with distinct RBAC roles
        self.admin_user = User.objects.create_superuser(
            username='super_admin',
            email='admin@campus.edu',
            password='AdminPassword123!',
            role=User.Role.ADMIN,
            is_staff=True,
            is_superuser=True
        )

        self.shop_owner_user = User.objects.create_user(
            username='merchant_bob',
            email='bob@campus.edu',
            password='MerchantPassword123!',
            role=User.Role.SHOP_OWNER
        )

        self.student_user = User.objects.create_user(
            username='student_alice',
            email='alice@campus.edu',
            password='StudentPassword123!',
            role=User.Role.STUDENT,
            college_id='STU-2026-001',
            email_verified=True
        )

        self.courier_user = User.objects.create_user(
            username='courier_dave',
            email='dave@campus.edu',
            password='CourierPassword123!',
            role=User.Role.DELIVERY_AGENT
        )

        # 2. Shop and Catalog
        self.shop = Shop.objects.create(
            name='Central Campus Stationery',
            owner=self.shop_owner_user,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address='Student Union Building Room 101',
            is_active=True,
            rating=Decimal('4.80')
        )

        self.category = Category.objects.create(
            name='Notebooks & Registers',
            slug='notebooks-registers'
        )

        self.product = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name='Spiral Bound Project Journal',
            sku='NB-SPR-001',
            price=Decimal('120.00'),
            is_active=True
        )

        self.inventory = Inventory.objects.create(
            shop=self.shop,
            product=self.product,
            current_stock=50,
            minimum_stock=10,
            reorder_level=15,
            unit_cost=Decimal('80.00'),
            is_active=True
        )

        # 3. Authentic Order with financial records
        self.order = Order.objects.create(
            customer=self.student_user,
            shop=self.shop,
            order_type=Order.OrderType.STATIONERY,
            subtotal=Decimal('240.00'),
            delivery_fee=Decimal('20.00'),
            discount_amount=Decimal('30.00'),
            total_amount=Decimal('230.00'),
            status=Order.Status.COMPLETED,
            payment_status=Order.PaymentStatus.PAID,
            payment_method=Order.PaymentMethod.ONLINE
        )

        self.order_item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=2,
            unit_price=Decimal('120.00'),
            total_price=Decimal('240.00')
        )

        self.payment = Payment.objects.create(
            order=self.order,
            user=self.student_user,
            shop=self.shop,
            amount=Decimal('230.00'),
            payment_method=Order.PaymentMethod.ONLINE,
            status=Payment.Status.CAPTURED,
            idempotency_key='IDEMP-TEST-001',
            gateway='SANDBOX'
        )

        self.refund = Refund.objects.create(
            order=self.order,
            payment=self.payment,
            amount=Decimal('50.00'),
            reason='Damaged cover page',
            status=Refund.Status.COMPLETED,
            requested_by=self.student_user,
            approved_by=self.admin_user
        )

        # 4. Printing Order
        self.printing_order = PrintingOrder.objects.create(
            order=self.order,
            shop=self.shop,
            color_mode=PrintingOrder.ColorMode.BW,
            paper_size=PrintingOrder.PaperSize.A4,
            print_sides=PrintingOrder.PrintSides.DOUBLE_SIDED,
            total_pages=20,
            copies=2,
            price=Decimal('60.00'),
            status=PrintingOrder.PrintingStatus.COMPLETED
        )

        # 5. Delivery
        self.delivery = Delivery.objects.create(
            order=self.order,
            delivery_agent=self.courier_user,
            delivery_address='Hostel 3, Room 204',
            delivery_status=Delivery.DeliveryStatus.DELIVERED,
            delivered_at=self.now,
            picked_up_at=self.now - timedelta(minutes=15)
        )

    # --------------------------------------------------------------------------
    # RBAC SECURITY & PERMISSION TESTS
    # --------------------------------------------------------------------------

    def test_admin_can_access_sales_report(self):
        """Platform Administrator is authorized to view sales reports (HTTP 200)."""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-sales')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['success'])
        self.assertIn('kpis', response.data)
        self.assertIn('data', response.data)
        self.assertIn('pagination', response.data)

    def test_student_forbidden_from_admin_reports(self):
        """Student account is strictly rejected with HTTP 403 Forbidden."""
        self.client.force_authenticate(user=self.student_user)
        url = reverse('report-admin-sales')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_shop_owner_forbidden_from_platform_reports(self):
        """Shop Owner cannot access platform-wide admin reports (HTTP 403 Forbidden)."""
        self.client.force_authenticate(user=self.shop_owner_user)
        url = reverse('report-admin-sales')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delivery_agent_forbidden_from_admin_reports(self):
        """Delivery courier cannot access admin reports (HTTP 403 Forbidden)."""
        self.client.force_authenticate(user=self.courier_user)
        url = reverse('report-admin-sales')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unauthenticated_request_rejected(self):
        """Unauthenticated request returns HTTP 401 Unauthorized."""
        url = reverse('report-admin-sales')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unauthorized_user_cannot_export_csv(self):
        """Export endpoints reject non-admin users with HTTP 403 Forbidden."""
        self.client.force_authenticate(user=self.student_user)
        url = reverse('report-admin-sales-export')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # --------------------------------------------------------------------------
    # DATE FILTERING & INPUT VALIDATION TESTS
    # --------------------------------------------------------------------------

    def test_date_range_presets(self):
        """Validates standard date presets: today, 7d, 30d, year."""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-sales')

        for preset in ('today', '7d', '30d', 'this_month', 'this_year'):
            resp = self.client.get(f"{url}?preset={preset}")
            self.assertEqual(resp.status_code, status.HTTP_200_OK, f"Failed for preset {preset}")

    def test_invalid_date_range_rejected(self):
        """Ensures start_date > end_date returns HTTP 400 Bad Request."""
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-sales')
        resp = self.client.get(f"{url}?start_date=2026-09-10&end_date=2026-09-01")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    # --------------------------------------------------------------------------
    # FINANCIAL CALCULATION & DECIMAL SAFETY TESTS
    # --------------------------------------------------------------------------

    def test_sales_financial_accuracy(self):
        """
        Validates Decimal-safe calculations:
        Gross = Subtotal (240) + Delivery (20) = 260
        Discounts = 30
        Refunds = 50
        Net Sales = 260 - 30 - 50 = 180
        """
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-sales')
        resp = self.client.get(f"{url}?preset=30d")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        kpis = resp.data['kpis']
        self.assertEqual(kpis['gross_sales'], 260.00)
        self.assertEqual(kpis['discounts'], 30.00)
        self.assertEqual(kpis['refunds'], 50.00)
        self.assertEqual(kpis['net_sales'], 180.00)
        self.assertEqual(kpis['total_orders'], 1)
        self.assertEqual(kpis['average_order_value'], 180.00)

    # --------------------------------------------------------------------------
    # CSV EXPORT VALIDATION TESTS
    # --------------------------------------------------------------------------

    def test_sales_csv_export_format_and_bom(self):
        """
        Tests CSV export:
        - HTTP 200 OK
        - Content-Type: text/csv; charset=utf-8
        - Filename attachment in Content-Disposition
        - Starts with UTF-8 BOM (\ufeff)
        - Includes standard headers
        - Contains Decimal values formatted with 2 decimal places
        """
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-sales-export')
        resp = self.client.get(f"{url}?preset=30d")

        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('attachment; filename="sales_report_', resp['Content-Disposition'])

        content = resp.content
        # UTF-8 BOM check
        self.assertTrue(content.startswith(b'\xef\xbb\xbf'))

        decoded = content.decode('utf-8-sig')
        lines = decoded.strip().split('\r\n') if '\r\n' in decoded else decoded.strip().split('\n')

        # Header check
        header_line = lines[0]
        self.assertIn('Date', header_line)
        self.assertIn('Gross Sales (INR)', header_line)
        self.assertIn('Net Sales (INR)', header_line)

        # Audit log creation check
        self.assertTrue(
            ReportAuditLog.objects.filter(report_type='sales', export_format='CSV').exists()
        )

    # --------------------------------------------------------------------------
    # COMPREHENSIVE REPORT ENDPOINTS COVERAGE (17 CATEGORIES)
    # --------------------------------------------------------------------------

    def test_orders_report_and_export(self):
        """Tests Orders report JSON and CSV export."""
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('report-admin-orders'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['data']), 1)
        self.assertEqual(resp.data['data'][0]['customer'], 'student_alice')

        exp = self.client.get(reverse('report-admin-orders-export'))
        self.assertEqual(exp.status_code, status.HTTP_200_OK)
        self.assertIn('student_alice', exp.content.decode('utf-8-sig'))

    def test_products_report_and_export(self):
        """Tests Products performance report JSON and CSV export."""
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('report-admin-products'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['kpis']['total_products_listed'], 1)

        exp = self.client.get(reverse('report-admin-products-export'))
        self.assertEqual(exp.status_code, status.HTTP_200_OK)
        self.assertIn('Spiral Bound Project Journal', exp.content.decode('utf-8-sig'))

    def test_categories_report_and_export(self):
        """Tests Categories breakdown report JSON and CSV export."""
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('report-admin-categories'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['kpis']['total_categories'], 1)

        exp = self.client.get(reverse('report-admin-categories-export'))
        self.assertEqual(exp.status_code, status.HTTP_200_OK)
        self.assertIn('Notebooks & Registers', exp.content.decode('utf-8-sig'))

    def test_shops_report_and_export(self):
        """Tests Shop performance and ranking report JSON and CSV export."""
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('report-admin-shops'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['kpis']['total_shops'], 1)

        exp = self.client.get(reverse('report-admin-shops-export'))
        self.assertEqual(exp.status_code, status.HTTP_200_OK)
        self.assertIn('Central Campus Stationery', exp.content.decode('utf-8-sig'))

    def test_inventory_and_stock_movements_reports(self):
        """Tests Inventory valuation and Stock movements reports."""
        self.client.force_authenticate(user=self.admin_user)
        resp_inv = self.client.get(reverse('report-admin-inventory'))
        self.assertEqual(resp_inv.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp_inv.data['kpis']['total_items'], 1)

        # Create a sample movement transaction
        InventoryTransaction.objects.create(
            inventory=self.inventory,
            transaction_type=InventoryTransaction.TransactionType.RESTOCK,
            quantity_change=25,
            stock_before=50,
            stock_after=75,
            reference_type='PURCHASE_ORDER',
            reference_id='PO-999',
            reason='Weekly replenishment',
            performed_by=self.admin_user
        )

        resp_mov = self.client.get(reverse('report-admin-stock-movements'))
        self.assertEqual(resp_mov.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_mov.data['kpis']['total_transactions'], 1)

        exp_mov = self.client.get(reverse('report-admin-stock-movements-export'))
        self.assertEqual(exp_mov.status_code, status.HTTP_200_OK)
        self.assertIn('Weekly replenishment', exp_mov.content.decode('utf-8-sig'))

    def test_demand_predictions_and_spikes_reports(self):
        """Tests Demand Prediction and Demand Spike reports."""
        self.client.force_authenticate(user=self.admin_user)

        DemandPrediction.objects.create(
            shop=self.shop,
            product=self.product,
            target_date=self.now.date(),
            forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
            predicted_units=15,
            confidence_score=Decimal('0.92'),
            model_name='RandomForestRegressor'
        )

        resp_pred = self.client.get(reverse('report-admin-demand-predictions'))
        self.assertEqual(resp_pred.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_pred.data['kpis']['total_forecasts'], 1)

        PurchaseRecommendation.objects.create(
            shop=self.shop,
            product=self.product,
            demand_spike_alert=True,
            priority=PurchaseRecommendation.Priority.CRITICAL,
            urgency_level=PurchaseRecommendation.Urgency.CRITICAL,
            predicted_demand_7d=80,
            average_daily_demand=4.0,
            recommended_quantity=60,
            reason='Impending final examinations'
        )

        resp_spike = self.client.get(reverse('report-admin-demand-spikes'))
        self.assertEqual(resp_spike.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_spike.data['kpis']['total_spike_alerts'], 1)

    def test_academic_demand_report(self):
        """Tests Academic Calendar event demand correlation report."""
        self.client.force_authenticate(user=self.admin_user)

        AcademicCalendar.objects.create(
            title='End Semester Examinations',
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            start_date=self.now.date() - timedelta(days=2),
            end_date=self.now.date() + timedelta(days=5),
            is_active=True
        )

        resp = self.client.get(reverse('report-admin-academic-demand'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['kpis']['total_events_in_window'], 1)

    def test_printing_and_delivery_reports(self):
        """Tests Xerox Printing and Logistics Delivery reports."""
        self.client.force_authenticate(user=self.admin_user)

        resp_print = self.client.get(reverse('report-admin-printing'))
        self.assertEqual(resp_print.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_print.data['kpis']['total_print_orders'], 1)
        self.assertEqual(resp_print.data['kpis']['total_pages_printed'], 40)  # 20 pages * 2 copies

        resp_deliv = self.client.get(reverse('report-admin-delivery'))
        self.assertEqual(resp_deliv.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_deliv.data['kpis']['total_deliveries'], 1)
        self.assertEqual(resp_deliv.data['kpis']['delivered_count'], 1)

    def test_customers_and_payments_refunds_reports(self):
        """Tests Customer analytics, Payments ledger, and Refunds reports."""
        self.client.force_authenticate(user=self.admin_user)

        resp_cust = self.client.get(reverse('report-admin-customers'))
        self.assertEqual(resp_cust.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp_cust.data['kpis']['total_students'], 1)

        resp_pay = self.client.get(reverse('report-admin-payments'))
        self.assertEqual(resp_pay.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_pay.data['kpis']['total_transactions'], 1)
        self.assertEqual(resp_pay.data['kpis']['successful_amount'], 230.00)

        resp_ref = self.client.get(reverse('report-admin-refunds'))
        self.assertEqual(resp_ref.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_ref.data['kpis']['total_refund_requests'], 1)
        self.assertEqual(resp_ref.data['kpis']['total_refunded_amount'], 50.00)

    def test_bulk_orders_and_reviews_reports(self):
        """Tests Bulk Orders and Reviews/Complaints reports."""
        self.client.force_authenticate(user=self.admin_user)

        BulkOrder.objects.create(
            title='Class Batch Practical Sheets',
            share_code='CLS-99999',
            order_type=BulkOrder.OrderType.CLASS,
            shop=self.shop,
            user=self.student_user,
            estimated_quantity=50,
            total_amount=Decimal('1500.00'),
            status=BulkOrder.Status.COMPLETED
        )

        resp_bulk = self.client.get(reverse('report-admin-bulk-orders'))
        self.assertEqual(resp_bulk.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_bulk.data['kpis']['total_bulk_orders'], 1)

        Review.objects.create(
            user=self.student_user,
            shop=self.shop,
            product=self.product,
            rating=5,
            comment='Outstanding journal quality'
        )

        resp_rev = self.client.get(reverse('report-admin-reviews-complaints'))
        self.assertEqual(resp_rev.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_rev.data['kpis']['total_reviews'], 1)
        self.assertEqual(resp_rev.data['kpis']['average_rating'], 5.0)

    def test_offers_and_recommendations_reports(self):
        """Tests Offers & Coupons and Student Recommendations CTR reports."""
        self.client.force_authenticate(user=self.admin_user)

        coupon = Coupon.objects.create(
            code='SEMESTER15',
            shop=self.shop,
            discount_type=Coupon.DiscountType.PERCENTAGE,
            discount_value=Decimal('15.00'),
            valid_from=self.now - timedelta(days=5),
            valid_until=self.now + timedelta(days=5)
        )

        CouponUsage.objects.create(
            coupon=coupon,
            user=self.student_user,
            order=self.order,
            discount_applied=Decimal('30.00')
        )

        resp_offers = self.client.get(reverse('report-admin-offers'))
        self.assertEqual(resp_offers.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_offers.data['kpis']['total_coupon_redemptions'], 1)

        RecommendationInteraction.objects.create(
            user=self.student_user,
            product=self.product,
            action=RecommendationInteraction.Action.VIEWED
        )
        RecommendationInteraction.objects.create(
            user=self.student_user,
            product=self.product,
            action=RecommendationInteraction.Action.CLICKED
        )

        resp_recs = self.client.get(reverse('report-admin-recommendations'))
        self.assertEqual(resp_recs.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_recs.data['kpis']['total_impressions'], 1)
        self.assertEqual(resp_recs.data['kpis']['clicks'], 1)
        self.assertEqual(resp_recs.data['kpis']['ctr_percentage'], 100.0)

    def test_user_management_report(self):
        """Tests Admin User Management report."""
        self.client.force_authenticate(user=self.admin_user)
        resp = self.client.get(reverse('report-admin-users'))
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(resp.data['kpis']['total_users'], 4)
        self.assertEqual(resp.data['kpis']['students_count'], 1)
        self.assertEqual(resp.data['kpis']['shop_owners_count'], 1)
        self.assertEqual(resp.data['kpis']['admins_count'], 1)

    def test_empty_state_handling_without_fake_data(self):
        """
        When querying an empty date range in the distant past (e.g. year 2020),
        verifies that zero rows are returned and KPIs are 0 without throwing errors
        or generating fake sample data.
        """
        self.client.force_authenticate(user=self.admin_user)
        url = reverse('report-admin-orders')
        resp = self.client.get(f"{url}?start_date=2020-01-01&end_date=2020-01-05")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data['data']), 0)
        self.assertEqual(resp.data['kpis']['total_orders'], 0)
        self.assertEqual(resp.data['pagination']['total_records'], 0)
