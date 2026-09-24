from datetime import date, time, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from users.models import User
from shops.models import Shop, ShopFavorite, Offer
from products.models import Product, Category, Review, Wishlist
from inventory.models import Inventory
from orders.models import Order, OrderItem, Coupon, CouponUsage, Complaint, ComplaintMessage
from notifications.models import Notification, NotificationPreference

User = get_user_model()


class Step24CustomerEngagementTests(APITestCase):
    """
    Automated regression and acceptance tests for Step 24:
    Reviews, Ratings, Wishlist, Favorites, Offers, Coupons, Complaints, and Notification Preferences.
    """
    def setUp(self):
        # 1. Users
        self.student = User.objects.create_user(
            username="student_aarav",
            email="aarav@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Aarav Sharma",
            phone_number="9876543220",
        )
        self.other_student = User.objects.create_user(
            username="student_zoya",
            email="zoya@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Zoya Khan",
            phone_number="9876543221",
        )
        self.shop_owner_1 = User.objects.create_user(
            username="merchant_vijay",
            email="vijay@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Vijay Kumar",
            phone_number="9876543222",
        )
        self.shop_owner_2 = User.objects.create_user(
            username="merchant_sunil",
            email="sunil@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Sunil Verma",
            phone_number="9876543223",
        )
        self.admin = User.objects.create_user(
            username="admin_dean",
            email="dean@campus.edu",
            password="TestPassword123!",
            role=User.Role.ADMIN,
            name="Campus Dean",
            phone_number="9876543224",
        )

        # 2. Shops
        self.shop_1 = Shop.objects.create(
            name="Vijay Campus Stationery",
            slug="vijay-campus-stationery",
            owner=self.shop_owner_1,
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            campus_location="Main Library Arcade",
            address="Ground Floor, Central Library",
            contact_phone="9876543222",
            contact_email="vijay@campus.edu",
            opening_time=time(8, 0),
            closing_time=time(21, 0),
            is_active=True,
        )
        self.shop_2 = Shop.objects.create(
            name="Sunil Xerox & Prints",
            slug="sunil-xerox-prints",
            owner=self.shop_owner_2,
            shop_type=Shop.ShopType.PRINTING_XEROX,
            campus_location="Engineering Quadrangle",
            address="Block B, Engineering Dept",
            contact_phone="9876543223",
            contact_email="sunil@campus.edu",
            opening_time=time(9, 0),
            closing_time=time(20, 0),
            is_active=True,
        )

        # 3. Categories & Products
        self.category = Category.objects.create(
            name="Notebooks & Diaries",
            slug="notebooks-diaries",
            is_active=True
        )
        self.product_1 = Product.objects.create(
            shop=self.shop_1,
            category=self.category,
            name="Classmate 200pg Ruled Notebook",
            slug="classmate-200pg-notebook",
            sku="NB-CLM-200",
            price=Decimal("80.00"),
            unit=Product.Unit.PIECE,
            is_active=True
        )
        self.inventory_1 = Inventory.objects.create(
            product=self.product_1,
            shop=self.shop_1,
            current_stock=100,
            minimum_stock=10,
            reorder_level=20,
            unit_cost=Decimal("50.00"),
            is_active=True
        )

        self.product_2 = Product.objects.create(
            shop=self.shop_2,
            category=self.category,
            name="Spiral Bound Project Journal",
            slug="spiral-project-journal",
            sku="PJ-SPR-001",
            price=Decimal("150.00"),
            unit=Product.Unit.PIECE,
            is_active=True
        )
        self.inventory_2 = Inventory.objects.create(
            product=self.product_2,
            shop=self.shop_2,
            current_stock=50,
            minimum_stock=5,
            reorder_level=10,
            unit_cost=Decimal("90.00"),
            is_active=True
        )

    # ----------------------------------------------------
    # PART 1 & 2: REVIEWS & RATINGS (VERIFIED PURCHASES)
    # ----------------------------------------------------
    def test_unverified_purchase_review_rejected(self):
        """Students who never purchased product cannot review it."""
        self.client.force_authenticate(user=self.student)
        res = self.client.post('/api/reviews/', {
            "product": self.product_1.id,
            "rating": 5,
            "comment": "Best notebook on campus!"
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("verified", str(res.data).lower())

    def test_verified_purchase_review_and_duplicate_prevention(self):
        """Students with completed order can submit review; duplicate submission is blocked."""
        # Create completed order
        order = Order.objects.create(
            customer=self.student,
            shop=self.shop_1,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.PICKUP,
            status=Order.Status.COMPLETED,
            subtotal=Decimal("80.00"),
            total_amount=Decimal("80.00")
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_1,
            quantity=1,
            unit_price=Decimal("80.00"),
            total_price=Decimal("80.00")
        )

        self.client.force_authenticate(user=self.student)
        # 1. First review succeeds
        res = self.client.post('/api/reviews/', {
            "product": self.product_1.id,
            "rating": 5,
            "comment": "Excellent high-quality paper."
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['rating'], 5)
        self.assertEqual(res.data['status'], 'APPROVED')

        # 2. Duplicate review fails
        res_dup = self.client.post('/api/reviews/', {
            "product": self.product_1.id,
            "rating": 4,
            "comment": "Posting another review."
        })
        self.assertEqual(res_dup.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Rating summary aggregation
        res_sum = self.client.get(f'/api/reviews/summary/?product={self.product_1.id}')
        self.assertEqual(res_sum.status_code, status.HTTP_200_OK)
        self.assertEqual(res_sum.data['average_rating'], 5.0)
        self.assertEqual(res_sum.data['review_count'], 1)
        self.assertEqual(res_sum.data['distribution'].get('5', res_sum.data['distribution'].get(5)), 1)

    def test_review_moderation_and_report_workflow(self):
        """Admins can moderate reviews; users can report suspicious reviews."""
        # Setup existing approved review
        order = Order.objects.create(
            customer=self.student,
            shop=self.shop_1,
            status=Order.Status.COMPLETED,
            subtotal=Decimal("80.00"),
            total_amount=Decimal("80.00")
        )
        OrderItem.objects.create(
            order=order,
            product=self.product_1,
            quantity=1,
            unit_price=Decimal("80.00"),
            total_price=Decimal("80.00")
        )
        review = Review.objects.create(
            user=self.student,
            product=self.product_1,
            shop=self.shop_1,
            order=order,
            rating=5,
            comment="Great item!",
            status=Review.Status.APPROVED
        )

        # 1. Other student reports review
        self.client.force_authenticate(user=self.other_student)
        rep_res = self.client.post(f'/api/reviews/{review.id}/report/', {
            "reason": "Off-topic content"
        })
        self.assertEqual(rep_res.status_code, status.HTTP_200_OK)
        review.refresh_from_db()
        self.assertTrue(review.is_reported)
        self.assertEqual(review.status, Review.Status.REPORTED)

        # 2. Admin moderates and hides review
        self.client.force_authenticate(user=self.admin)
        mod_res = self.client.post(f'/api/reviews/{review.id}/moderate/', {
            "status": "HIDDEN",
            "moderation_notes": "Hidden pending inquiry"
        })
        self.assertEqual(mod_res.status_code, status.HTTP_200_OK)
        review.refresh_from_db()
        self.assertEqual(review.status, Review.Status.HIDDEN)

    # ----------------------------------------------------
    # PART 4 & 5: WISHLIST & SHOP FAVORITES
    # ----------------------------------------------------
    def test_wishlist_toggle_and_privacy_isolation(self):
        """Students can add/toggle wishlist items; data remains strictly isolated."""
        self.client.force_authenticate(user=self.student)
        
        # 1. Toggle Add
        res_add = self.client.post('/api/wishlist/toggle/', {"product_id": self.product_1.id})
        self.assertEqual(res_add.status_code, status.HTTP_200_OK)
        self.assertTrue(res_add.data['in_wishlist'])

        # Check in wishlist
        res_chk = self.client.get(f'/api/wishlist/check/?product={self.product_1.id}')
        self.assertTrue(res_chk.data['is_wishlisted'])

        # 2. Privacy Isolation: other student's wishlist list endpoint is empty
        self.client.force_authenticate(user=self.other_student)
        res_other = self.client.get('/api/wishlist/')
        self.assertEqual(res_other.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res_other.data), 0)

        # 3. Toggle Remove
        self.client.force_authenticate(user=self.student)
        res_rem = self.client.post('/api/wishlist/toggle/', {"product_id": self.product_1.id})
        self.assertFalse(res_rem.data['in_wishlist'])

    def test_shop_favorite_toggle_and_check(self):
        """Students can bookmark favorite vendors."""
        self.client.force_authenticate(user=self.student)
        # Toggle Add
        res = self.client.post('/api/favorites/shops/toggle/', {"shop_id": self.shop_1.id})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_favorite'])

        # Check
        chk = self.client.get(f'/api/favorites/shops/check/?shop={self.shop_1.id}')
        self.assertTrue(chk.data['is_favorite'])

        # Toggle Remove
        res_rem = self.client.post('/api/favorites/shops/toggle/', {"shop_id": self.shop_1.id})
        self.assertFalse(res_rem.data['is_favorite'])

    # ----------------------------------------------------
    # PART 6: OFFERS & SHOP ISOLATION
    # ----------------------------------------------------
    def test_merchant_offer_crud_and_boundary_safety(self):
        """Shop owners can create offers for their own shop, but not other shops."""
        self.client.force_authenticate(user=self.shop_owner_1)

        # 1. Valid offer creation
        now = timezone.now()
        res = self.client.post('/api/offers/', {
            "shop": self.shop_1.id,
            "title": "Semester Kickoff 15% Off",
            "description": "Get 15% discount on all stationery",
            "discount_type": Offer.DiscountType.PERCENTAGE,
            "discount_value": "15.00",
            "min_order_value": "100.00",
            "max_discount": "50.00",
            "start_date": (now - timedelta(days=1)).isoformat(),
            "end_date": (now + timedelta(days=14)).isoformat(),
            "is_active": True
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        # 2. Attempting to create offer for Shop 2 (unauthorized)
        res_unauth = self.client.post('/api/offers/', {
            "shop": self.shop_2.id,
            "title": "Unauthorized Cross-Shop Offer",
            "discount_type": Offer.DiscountType.PERCENTAGE,
            "discount_value": "20.00",
            "start_date": now.isoformat(),
            "end_date": (now + timedelta(days=5)).isoformat()
        })
        self.assertEqual(res_unauth.status_code, status.HTTP_403_FORBIDDEN)

    # ----------------------------------------------------
    # PART 7 & 8: COUPONS & CHECKOUT INTEGRATION
    # ----------------------------------------------------
    def test_coupon_validation_and_backend_discount_calculation(self):
        """Authoritative coupon validation and backend calculation prevents client manipulation."""
        now = timezone.now()
        coupon = Coupon.objects.create(
            code="STUDENT25",
            title="Student 25% Off",
            shop=self.shop_1,
            discount_type=Coupon.DiscountType.PERCENTAGE,
            discount_value=Decimal("25.00"),
            min_order_amount=Decimal("100.00"),
            max_discount=Decimal("50.00"),
            valid_from=now - timedelta(days=1),
            valid_until=now + timedelta(days=7),
            usage_limit=10,
            per_user_limit=1,
            is_active=True
        )

        self.client.force_authenticate(user=self.student)

        # 1. Test validate endpoint
        val_res = self.client.post('/api/coupons/validate/', {
            "code": "STUDENT25",
            "shop": self.shop_1.id,
            "items": [{"product_id": self.product_1.id, "quantity": 2, "price": "80.00"}]
        }, format='json')
        self.assertEqual(val_res.status_code, status.HTTP_200_OK)
        # Subtotal: 160. 25% of 160 = 40. Under max 50.
        self.assertEqual(val_res.data['discount_amount'], 40.0)
        self.assertEqual(val_res.data['final_amount'], 120.0)

        # 2. Multi-shop safety: coupon for shop 1 applied to shop 2 fails
        val_shop2 = self.client.post('/api/coupons/validate/', {
            "code": "STUDENT25",
            "shop": self.shop_2.id,
            "items": [{"product_id": self.product_2.id, "quantity": 1, "price": "150.00"}]
        }, format='json')
        self.assertEqual(val_shop2.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Order creation with coupon
        order_res = self.client.post('/api/orders/', {
            "shop": self.shop_1.id,
            "fulfillment_type": Order.FulfillmentType.PICKUP,
            "coupon_code": "STUDENT25",
            "items": [{"product_id": self.product_1.id, "quantity": 2}]
        }, format='json')
        self.assertEqual(order_res.status_code, status.HTTP_201_CREATED)
        order_data = order_res.data.get('order', order_res.data)
        self.assertEqual(float(order_data['discount_amount']), 40.0)
        self.assertEqual(float(order_data['total_amount']), 120.0)
        self.assertEqual(order_data['applied_coupon_code'], "STUDENT25")

        # 4. Per-user limit enforcement: second order with same coupon fails
        dup_coupon_order = self.client.post('/api/orders/', {
            "shop": self.shop_1.id,
            "fulfillment_type": Order.FulfillmentType.PICKUP,
            "coupon_code": "STUDENT25",
            "items": [{"product_id": self.product_1.id, "quantity": 2}]
        }, format='json')
        self.assertEqual(dup_coupon_order.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("maximum allowable times", str(dup_coupon_order.data))

    # ----------------------------------------------------
    # PART 10 & 11: CUSTOMER COMPLAINTS / GRIEVANCES
    # ----------------------------------------------------
    def test_complaint_lifecycle_and_admin_resolution(self):
        """Students can submit grievances, participate in discussion, and admins can resolve."""
        self.client.force_authenticate(user=self.student)

        # 1. Student creates grievance
        res = self.client.post('/api/complaints/', {
            "shop": self.shop_1.id,
            "category": Complaint.Category.SHOP,
            "subject": "Store was closed during scheduled opening hours",
            "description": "Arrived at 9:30 AM but shop shutter was down."
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        complaint_id = res.data['id']
        self.assertEqual(res.data['status'], 'OPEN')

        # 2. Add message to thread
        msg_res = self.client.post(f'/api/complaints/{complaint_id}/add-message/', {
            "message": "Attaching photo proof of shop door."
        })
        self.assertEqual(msg_res.status_code, status.HTTP_201_CREATED)

        # 3. Privacy check: other student cannot access
        self.client.force_authenticate(user=self.other_student)
        unauth_get = self.client.get(f'/api/complaints/{complaint_id}/')
        self.assertEqual(unauth_get.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Admin resolves grievance
        self.client.force_authenticate(user=self.admin)
        resolve_res = self.client.post(f'/api/complaints/{complaint_id}/resolve/', {
            "resolution": "Merchant issued a formal warning and updated roster."
        })
        self.assertEqual(resolve_res.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_res.data['status'], 'RESOLVED')
        self.assertEqual(resolve_res.data['resolution'], "Merchant issued a formal warning and updated roster.")

    # ----------------------------------------------------
    # PART 12: NOTIFICATION PREFERENCES
    # ----------------------------------------------------
    def test_customer_notification_preferences(self):
        """Users can toggle preferences; critical order/delivery alerts remain mandatory."""
        self.client.force_authenticate(user=self.student)

        # 1. Read default preferences
        get_res = self.client.get('/api/notification-preferences/my-preferences/')
        self.assertEqual(get_res.status_code, status.HTTP_200_OK)
        self.assertTrue(get_res.data['order_updates'])
        self.assertTrue(get_res.data['offers_promotions'])

        # 2. Update preference to disable promo offers
        put_res = self.client.patch('/api/notification-preferences/my-preferences/', {
            "offers_promotions": False,
            "order_updates": False  # Attempt to disable critical order notices
        })
        self.assertEqual(put_res.status_code, status.HTTP_200_OK)
        self.assertFalse(put_res.data['offers_promotions'])
        # Critical order notices must stay True!
        self.assertTrue(put_res.data['order_updates'])

        # 3. Verify backend enforcement via helper
        self.assertFalse(NotificationPreference.is_allowed_for(self.student, Notification.NotificationType.OFFER_ALERT))
        self.assertTrue(NotificationPreference.is_allowed_for(self.student, Notification.NotificationType.ORDER_STATUS))
