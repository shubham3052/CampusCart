from django.test import TestCase
from django.utils import timezone
from datetime import timedelta, date
from decimal import Decimal
from rest_framework.test import APIClient
from rest_framework import status

from users.models import User
from shops.models import Shop
from products.models import Product, Category, Review
from inventory.models import Inventory
from orders.models import Order, OrderItem
from printing.models import ShopPrintingConfig
from academics.models import Institution, AcademicCalendar, AcademicEventImpact, StudentAcademicProfile
from recommendations.models import RecommendationInteraction, RecommendationFeedback, RecommendationConfig
from recommendations.services.recommendation_engine import RecommendationEngine
from recommendations.services.general_recommender import get_buy_again_recommendations
from recommendations.services.collaborative_recommender import get_frequently_bought_together
from recommendations.services.content_recommender import get_similar_products
from recommendations.services.popularity_recommender import get_popular_products, get_trending_products
from recommendations.services.academic_recommender import get_academic_recommendations
from recommendations.utils.scoring import exponential_recency_decay, calculate_weighted_hybrid_score
from recommendations.utils.diversity import diversify_recommendations, deduplicate_across_sections
from recommendations.utils.filters import find_in_stock_alternatives


class RecommendationEngineComprehensiveTests(TestCase):
    """
    Exhaustive test suite for Step 20: Complete Academic + General Recommendation Engine.
    Validates statistical models, user isolation, stock awareness, and API contracts.
    """

    def setUp(self):
        self.client = APIClient()

        # 1. Users
        self.admin = User.objects.create_superuser(username="admin_user", email="admin@campus.edu", password="password123")
        self.owner = User.objects.create_user(username="shop_owner", email="owner@store.com", password="password123", role=User.Role.SHOP_OWNER)
        self.student_a = User.objects.create_user(username="student_a", email="sa@college.edu", password="password123", role=User.Role.STUDENT)
        self.student_b = User.objects.create_user(username="student_b", email="sb@other.edu", password="password123", role=User.Role.STUDENT)

        # 2. Colleges & Academic Profiles
        self.inst_a = Institution.objects.create(name="College Alpha", code="COL-A")
        self.inst_b = Institution.objects.create(name="College Beta", code="COL-B")
        self.profile_a = StudentAcademicProfile.objects.create(
            student=self.student_a, institution=self.inst_a, course="BCA", semester_number=6
        )

        # 3. Shops
        self.shop_a = Shop.objects.create(
            owner=self.owner, name="Alpha Campus Stationery", slug="alpha-campus-stationery",
            institution=self.inst_a, contact_phone="9998887771"
        )
        self.shop_b_owner = User.objects.create_user(username="owner_b", email="ob@store.com", password="password123", role=User.Role.SHOP_OWNER)
        self.shop_b = Shop.objects.create(
            owner=self.shop_b_owner, name="Beta Campus Store", slug="beta-campus-store",
            institution=self.inst_b, contact_phone="9998887772"
        )

        # 4. Printing config
        ShopPrintingConfig.objects.create(
            shop=self.shop_a, is_printing_enabled=True,
            bw_rate_per_page=Decimal('1.50'), color_rate_per_page=Decimal('5.00')
        )

        # 5. Categories
        self.cat_pens = Category.objects.create(name="Pens & Writing", slug="pens-writing")
        self.cat_books = Category.objects.create(name="Notebooks", slug="notebooks")
        self.cat_files = Category.objects.create(name="Project Files", slug="project-files")

        # 6. Products
        self.prod_pen = Product.objects.create(
            shop=self.shop_a, category=self.cat_pens, name="Pilot V7 Rollerball Pen",
            slug="pilot-v7-pen", sku="PEN-V7", price=Decimal('70.00'), brand="Pilot"
        )
        self.prod_notebook = Product.objects.create(
            shop=self.shop_a, category=self.cat_books, name="Classmate Long Notebook 200 Pages",
            slug="classmate-long-notebook", sku="NOTE-200", price=Decimal('90.00'), brand="Classmate"
        )
        self.prod_file = Product.objects.create(
            shop=self.shop_a, category=self.cat_files, name="Hardbound Project File Cover",
            slug="hardbound-project-file", sku="FILE-HARD", price=Decimal('120.00'), brand="Classmate"
        )
        self.prod_similar_book = Product.objects.create(
            shop=self.shop_a, category=self.cat_books, name="Navneet Premium Spiral Notebook 200 Pages",
            slug="navneet-spiral-notebook", sku="NOTE-NAV-200", price=Decimal('95.00'), brand="Navneet"
        )

        # Alternative product in shop B
        self.prod_pen_b = Product.objects.create(
            shop=self.shop_b, category=self.cat_pens, name="Pilot V7 Rollerball Pen",
            slug="pilot-v7-pen-b", sku="PEN-V7-B", price=Decimal('72.00'), brand="Pilot"
        )

        # 7. Inventory
        Inventory.objects.create(shop=self.shop_a, product=self.prod_pen, current_stock=50, reserved_stock=0)
        Inventory.objects.create(shop=self.shop_a, product=self.prod_notebook, current_stock=30, reserved_stock=0)
        Inventory.objects.create(shop=self.shop_a, product=self.prod_file, current_stock=25, reserved_stock=0)
        Inventory.objects.create(shop=self.shop_a, product=self.prod_similar_book, current_stock=40, reserved_stock=0)
        Inventory.objects.create(shop=self.shop_b, product=self.prod_pen_b, current_stock=15, reserved_stock=0)

        # 8. Upcoming Academic Event for College Alpha
        today = timezone.now().date()
        self.event_proj = AcademicCalendar.objects.create(
            institution=self.inst_a,
            title="Capstone Project Submission",
            event_type=AcademicCalendar.EventType.PROJECT_SUBMISSION,
            importance=AcademicCalendar.Importance.CRITICAL,
            start_date=today + timedelta(days=5),
            end_date=today + timedelta(days=6)
        )
        AcademicEventImpact.objects.create(
            event=self.event_proj,
            category=self.cat_files,
            impact_type=AcademicEventImpact.ImpactType.INCREASE,
            impact_strength=AcademicEventImpact.ImpactStrength.HIGH
        )

    # -------------------------------------------------------------
    # 1. Buy Again & Recency Decay Tests
    # -------------------------------------------------------------
    def test_buy_again_recency_and_count(self):
        # Create completed order for student A
        order = Order.objects.create(
            customer=self.student_a, shop=self.shop_a, status=Order.Status.COMPLETED
        )
        OrderItem.objects.create(order=order, product=self.prod_pen, quantity=2, unit_price=Decimal('70.00'), total_price=Decimal('140.00'))
        OrderItem.objects.create(order=order, product=self.prod_notebook, quantity=1, unit_price=Decimal('90.00'), total_price=Decimal('90.00'))

        buy_again = get_buy_again_recommendations(self.student_a, limit=5)
        self.assertEqual(len(buy_again), 2)
        prod_ids = [item['id'] for item in buy_again]
        self.assertIn(self.prod_pen.id, prod_ids)
        self.assertIn(self.prod_notebook.id, prod_ids)
        self.assertEqual(buy_again[0]['reason_code'], 'BUY_AGAIN')
        self.assertIn("purchased this", buy_again[0]['reason_text'])

    def test_exponential_recency_decay_mathematics(self):
        # 0 days ago -> 1.0
        self.assertAlmostEqual(exponential_recency_decay(0.0, halflife_days=30), 1.0, places=2)
        # 30 days ago -> 0.5
        self.assertAlmostEqual(exponential_recency_decay(30.0, halflife_days=30), 0.5, places=2)
        # 60 days ago -> 0.25
        self.assertAlmostEqual(exponential_recency_decay(60.0, halflife_days=30), 0.25, places=2)

    # -------------------------------------------------------------
    # 2. Frequently Bought Together (Co-occurrence) Tests
    # -------------------------------------------------------------
    def test_frequently_bought_together_co_occurrence(self):
        # Order with Notebook + Pen
        o1 = Order.objects.create(customer=self.student_a, shop=self.shop_a, status=Order.Status.COMPLETED)
        OrderItem.objects.create(order=o1, product=self.prod_notebook, quantity=1, unit_price=Decimal('90.00'), total_price=Decimal('90.00'))
        OrderItem.objects.create(order=o1, product=self.prod_pen, quantity=1, unit_price=Decimal('70.00'), total_price=Decimal('70.00'))

        freq_items = get_frequently_bought_together(self.prod_notebook.id, limit=3)
        self.assertTrue(len(freq_items) >= 1)
        self.assertEqual(freq_items[0]['product_id'], self.prod_pen.id)
        self.assertEqual(freq_items[0]['reason_code'], 'FREQUENTLY_BOUGHT')
        self.assertIn("Classmate Long Notebook", freq_items[0]['reason_text'])

    # -------------------------------------------------------------
    # 3. Content-Based TF-IDF Product Similarity Tests
    # -------------------------------------------------------------
    def test_tfidf_product_similarity(self):
        similar = get_similar_products(self.prod_notebook.id, limit=2)
        self.assertTrue(len(similar) >= 1)
        # Navneet Notebook should rank top because both are 200 Pages notebooks in Notebooks category
        self.assertEqual(similar[0]['product_id'], self.prod_similar_book.id)
        self.assertEqual(similar[0]['recommendation_type'], 'SIMILAR_PRODUCTS')
        self.assertIn("similar", similar[0]['reason_text'].lower())

    # -------------------------------------------------------------
    # 4. Popularity & Trending Tests
    # -------------------------------------------------------------
    def test_popular_and_trending_scoring(self):
        # Generate some orders for the pen
        o = Order.objects.create(customer=self.student_a, shop=self.shop_a, status=Order.Status.COMPLETED)
        OrderItem.objects.create(order=o, product=self.prod_pen, quantity=5, unit_price=Decimal('70.00'), total_price=Decimal('350.00'))

        popular = get_popular_products(limit=5)
        self.assertTrue(len(popular) >= 1)
        self.assertEqual(popular[0]['product_id'], self.prod_pen.id)

        trending = get_trending_products(limit=5)
        self.assertTrue(len(trending) >= 1)

    # -------------------------------------------------------------
    # 5. Academic Recommendations & College Isolation
    # -------------------------------------------------------------
    def test_academic_recommendations_and_isolation(self):
        # Student A is enrolled in College Alpha which has Capstone Project in 5 days
        acad_a = get_academic_recommendations(self.student_a, limit=5)
        self.assertTrue(acad_a['has_academic_events'])
        self.assertEqual(acad_a['upcoming_event']['title'], "Capstone Project Submission")
        self.assertTrue(len(acad_a['products']) >= 1)
        self.assertEqual(acad_a['products'][0]['product_id'], self.prod_file.id)
        self.assertIn("Capstone Project Submission in 5 days", acad_a['products'][0]['reason_text'])

        # Student B is in College Beta -> should NOT receive College Alpha's internal capstone event
        acad_b = get_academic_recommendations(self.student_b, limit=5)
        self.assertFalse(acad_b['has_academic_events'])

    # -------------------------------------------------------------
    # 6. Inventory Filtering & Out of Stock Alternatives
    # -------------------------------------------------------------
    def test_inventory_filtering_and_alternatives(self):
        # Set Shop A pen stock to 0
        inv_pen = Inventory.objects.get(shop=self.shop_a, product=self.prod_pen)
        inv_pen.current_stock = 0
        inv_pen.save()

        # Calling find_in_stock_alternatives on prod_pen should find prod_pen_b in Shop B
        alts = find_in_stock_alternatives(self.prod_pen, limit=2)
        self.assertTrue(len(alts) >= 1)
        self.assertEqual(alts[0]['product_id'], self.prod_pen_b.id)
        self.assertEqual(alts[0]['shop_name'], "Beta Campus Store")

    # -------------------------------------------------------------
    # 7. Category Diversification & Deduplication Tests
    # -------------------------------------------------------------
    def test_category_diversification_and_deduplication(self):
        items = [
            {'product_id': 1, 'category_id': 10, 'name': 'Book 1'},
            {'product_id': 2, 'category_id': 10, 'name': 'Book 2'},
            {'product_id': 3, 'category_id': 10, 'name': 'Book 3'},
            {'product_id': 4, 'category_id': 10, 'name': 'Book 4'},
            {'product_id': 5, 'category_id': 20, 'name': 'Pen 1'},
            {'product_id': 6, 'category_id': 30, 'name': 'File 1'},
        ]
        # Max 40% ratio on 6 items = ceil(6 * 0.4) = 3 per category max
        diversified = diversify_recommendations(items, max_per_category_ratio=0.40)
        cat_10_count = sum(1 for i in diversified[:4] if i['category_id'] == 10)
        self.assertTrue(cat_10_count <= 3)

        # Deduplication against seen IDs
        seen = {1, 2}
        deduped = deduplicate_across_sections(seen, items)
        deduped_ids = [d['product_id'] for d in deduped]
        self.assertNotIn(1, deduped_ids)
        self.assertNotIn(2, deduped_ids)
        self.assertIn(3, deduped_ids)

    # -------------------------------------------------------------
    # 8. Engagement Tracking & Feedback API Tests
    # -------------------------------------------------------------
    def test_interaction_tracking_and_feedback(self):
        self.client.force_authenticate(user=self.student_a)

        # Track click
        res_track = self.client.post('/api/recommendations/track/', {
            'product': self.prod_pen.id,
            'shop': self.shop_a.id,
            'recommendation_type': 'PERSONALIZED',
            'action': 'CLICKED'
        }, format='json')
        self.assertEqual(res_track.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RecommendationInteraction.objects.count(), 1)

        # Submit negative feedback
        res_fb = self.client.post('/api/recommendations/feedback/', {
            'product': self.prod_pen.id,
            'feedback_type': 'NOT_INTERESTED',
            'comment': 'Already bought a pack elsewhere'
        }, format='json')
        self.assertEqual(res_fb.status_code, status.HTTP_200_OK)
        self.assertEqual(RecommendationFeedback.objects.count(), 1)

    # -------------------------------------------------------------
    # 9. REST API Endpoints Verification
    # -------------------------------------------------------------
    def test_api_endpoints_contracts(self):
        self.client.force_authenticate(user=self.student_a)

        # Home endpoint
        res_home = self.client.get('/api/recommendations/home/')
        self.assertEqual(res_home.status_code, status.HTTP_200_OK)
        self.assertTrue(res_home.data['success'])
        self.assertIn('recommended_for_you', res_home.data)
        self.assertIn('buy_again', res_home.data)
        self.assertIn('academic_recommendations', res_home.data)
        self.assertIn('trending', res_home.data)
        self.assertIn('popular', res_home.data)

        # Personalized endpoint
        res_pers = self.client.get('/api/recommendations/personalized/')
        self.assertEqual(res_pers.status_code, status.HTTP_200_OK)

        # Similar endpoint
        res_sim = self.client.get(f'/api/recommendations/similar/{self.prod_notebook.id}/')
        self.assertEqual(res_sim.status_code, status.HTTP_200_OK)

        # Frequently bought
        res_freq = self.client.get(f'/api/recommendations/frequently-bought/?product_id={self.prod_notebook.id}')
        self.assertEqual(res_freq.status_code, status.HTTP_200_OK)

        # Admin Analytics
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get('/api/recommendations/admin-analytics/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertIn('click_through_rate_pct', res_admin.data)
