from rest_framework.test import APITestCase
from rest_framework import status
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from decimal import Decimal

from shops.models import Shop
from products.models import Category, Product
from inventory.models import Inventory
from orders.models import Order
from delivery.models import PickupSlot
from academics.models import AcademicCalendar

User = get_user_model()

class AuthenticationTests(APITestCase):
    """
    Tests for /api/auth/ endpoints.
    """
    def setUp(self):
        self.reg_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        self.me_url = '/api/auth/me/'
        self.refresh_url = '/api/auth/token/refresh/'
        self.logout_url = '/api/auth/logout/'

    def test_health_check(self):
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['status'], 'ok')
        self.assertEqual(res.data['message'], 'Smart Stationery API is running')

    def test_registration_student_success(self):
        payload = {
            "name": "Arjun Kumar",
            "email": "arjun@test.com",
            "phone": "9876543210",
            "password": "SecurePassword123!",
            "role": "STUDENT"
        }
        res = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data['user']['email'], "arjun@test.com")
        self.assertEqual(res.data['user']['role'], "STUDENT")
        self.assertNotIn('password', res.data['user'])

    def test_registration_admin_blocked(self):
        payload = {
            "name": "Malicious Admin",
            "email": "hacker@test.com",
            "password": "SecurePassword123!",
            "role": "ADMIN"
        }
        res = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="hacker@test.com").exists())

    def test_registration_duplicate_email(self):
        payload = {
            "name": "Duplicate User",
            "email": "dup@test.com",
            "password": "SecurePassword123!",
            "role": "STUDENT"
        }
        res1 = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res1.status_code, status.HTTP_201_CREATED)
        res2 = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_success_and_refresh(self):
        user = User.objects.create(username="login_test", email="login@test.com", role=User.Role.STUDENT)
        user.set_password("LoginPass123!")
        user.save()

        res = self.client.post(self.login_url, {"email": "login@test.com", "password": "LoginPass123!"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)

        # Refresh token
        ref_res = self.client.post(self.refresh_url, {"refresh": res.data['refresh']}, format='json')
        self.assertEqual(ref_res.status_code, status.HTTP_200_OK)
        self.assertIn('access', ref_res.data)

    def test_login_wrong_password(self):
        user = User.objects.create(username="wrong_pw", email="wrong@test.com", role=User.Role.STUDENT)
        user.set_password("CorrectPass123!")
        user.save()

        res = self.client.post(self.login_url, {"email": "wrong@test.com", "password": "IncorrectPassword!"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_current_user_me(self):
        user = User.objects.create(username="me_user", email="me@test.com", role=User.Role.STUDENT)
        refresh = RefreshToken.for_user(user)

        # Without token -> 401
        res_unauth = self.client.get(self.me_url)
        self.assertEqual(res_unauth.status_code, status.HTTP_401_UNAUTHORIZED)

        # With Bearer token -> 200
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        res_auth = self.client.get(self.me_url)
        self.assertEqual(res_auth.status_code, status.HTTP_200_OK)
        self.assertEqual(res_auth.data['email'], "me@test.com")

    def test_logout_and_blacklisting(self):
        user = User.objects.create(username="logout_user", email="logout@test.com", role=User.Role.STUDENT)
        refresh = RefreshToken.for_user(user)
        refresh_str = str(refresh)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}')
        res = self.client.post(self.logout_url, {"refresh": refresh_str}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Refresh token must now be invalid
        ref_res = self.client.post(self.refresh_url, {"refresh": refresh_str}, format='json')
        self.assertEqual(ref_res.status_code, status.HTTP_401_UNAUTHORIZED)


class AuthorizationAndSecurityTests(APITestCase):
    """
    Tests for RBAC and Object-Level Security (Cross-User & Cross-Shop Isolation).
    """
    def setUp(self):
        # Admin
        self.admin = User.objects.create(username="admin_test", email="admin@test.com", role=User.Role.ADMIN, is_staff=True, is_superuser=True)
        self.admin.set_password("AdminPass123!")
        self.admin.save()

        # Students
        self.student_a = User.objects.create(username="student_a", email="student_a@test.com", role=User.Role.STUDENT)
        self.student_b = User.objects.create(username="student_b", email="student_b@test.com", role=User.Role.STUDENT)

        # Shop Owners
        self.owner_a = User.objects.create(username="owner_a", email="owner_a@test.com", role=User.Role.SHOP_OWNER)
        self.owner_b = User.objects.create(username="owner_b", email="owner_b@test.com", role=User.Role.SHOP_OWNER)

        # Shops
        self.shop_a = Shop.objects.create(owner=self.owner_a, name="Shop A", slug="shop-a", contact_phone="1111111111", is_active=True)
        self.shop_b = Shop.objects.create(owner=self.owner_b, name="Shop B", slug="shop-b", contact_phone="2222222222", is_active=True)

        # Category & Products
        self.cat = Category.objects.create(name="Paper", slug="paper")
        self.prod_a = Product.objects.create(shop=self.shop_a, category=self.cat, name="Paper A", sku="P-A-01", price=Decimal("10.00"), is_active=True)
        self.prod_b = Product.objects.create(shop=self.shop_b, category=self.cat, name="Paper B", sku="P-B-01", price=Decimal("20.00"), is_active=True)

        # Inventory
        self.inv_a = Inventory.objects.create(shop=self.shop_a, product=self.prod_a, current_stock=50, reorder_threshold=10)
        self.inv_b = Inventory.objects.create(shop=self.shop_b, product=self.prod_b, current_stock=30, reorder_threshold=5)

        # Order A (placed by Student A at Shop A)
        self.order_a = Order.objects.create(customer=self.student_a, shop=self.shop_a, subtotal=Decimal("10.00"), total_amount=Decimal("10.00"))

    def test_student_cannot_access_inventory(self):
        self.client.force_authenticate(user=self.student_a)
        res = self.client.get('/api/inventory/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_modify_shop(self):
        self.client.force_authenticate(user=self.student_a)
        res = self.client.patch(f'/api/shops/{self.shop_a.id}/', {"name": "Hacked Shop"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_b_cannot_access_student_a_order(self):
        self.client.force_authenticate(user=self.student_b)
        res = self.client.get(f'/api/orders/{self.order_a.id}/')
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_shop_owner_b_cannot_access_or_modify_shop_a_order(self):
        self.client.force_authenticate(user=self.owner_b)
        res_get = self.client.get(f'/api/orders/{self.order_a.id}/')
        self.assertIn(res_get.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        res_patch = self.client.patch(f'/api/orders/{self.order_a.id}/', {"status": "CONFIRMED"}, format='json')
        self.assertIn(res_patch.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_shop_owner_b_cannot_modify_shop_a_inventory(self):
        self.client.force_authenticate(user=self.owner_b)
        res = self.client.post(f'/api/inventory/{self.inv_a.id}/adjust-stock/', {"quantity_change": 10, "transaction_type": "RESTOCK"}, format='json')
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_shop_owner_a_can_update_own_order(self):
        self.client.force_authenticate(user=self.owner_a)
        res = self.client.patch(f'/api/orders/{self.order_a.id}/', {"status": "CONFIRMED"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_admin_can_access_all(self):
        self.client.force_authenticate(user=self.admin)
        res_orders = self.client.get('/api/orders/')
        self.assertEqual(res_orders.status_code, status.HTTP_200_OK)
        res_inv = self.client.get('/api/inventory/')
        self.assertEqual(res_inv.status_code, status.HTTP_200_OK)


class ProductAndInventoryTests(APITestCase):
    """
    Tests for Product CRUD, validation, and Inventory negative stock protection.
    """
    def setUp(self):
        self.owner = User.objects.create(username="owner_p", email="owner_p@test.com", role=User.Role.SHOP_OWNER)
        self.shop = Shop.objects.create(owner=self.owner, name="Owner Shop", slug="owner-shop", contact_phone="1234567890", is_active=True)
        self.inactive_shop = Shop.objects.create(
            owner=User.objects.create(username="owner_inact", email="inact@test.com", role=User.Role.SHOP_OWNER),
            name="Closed Shop", slug="closed-shop", contact_phone="1234567899", is_active=False
        )
        self.cat = Category.objects.create(name="Pens", slug="pens")
        self.client.force_authenticate(user=self.owner)

    def test_product_validation_negative_price(self):
        payload = {
            "shop": self.shop.id,
            "category": self.cat.id,
            "name": "Invalid Pen",
            "price": "-10.00",
            "sku": "PEN-NEG"
        }
        res = self.client.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_validation_missing_name(self):
        payload = {
            "shop": self.shop.id,
            "category": self.cat.id,
            "name": "",
            "price": "15.00",
            "sku": "PEN-NONAME"
        }
        res = self.client.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_product_validation_inactive_shop(self):
        payload = {
            "shop": self.inactive_shop.id,
            "category": self.cat.id,
            "name": "Inactive Pen",
            "price": "15.00",
            "sku": "PEN-INACT"
        }
        res = self.client.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stock_adjustment_negative_protection(self):
        prod = Product.objects.create(shop=self.shop, category=self.cat, name="Valid Pen", sku="PEN-VAL", price=Decimal("15.00"))
        inv = Inventory.objects.create(shop=self.shop, product=prod, current_stock=5, reorder_threshold=2)

        # Attempt to decrease by 10 when stock is 5
        res = self.client.post(f'/api/inventory/{inv.id}/adjust-stock/', {"quantity_change": -10, "transaction_type": "AUDIT_CORRECTION"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        inv.refresh_from_db()
        self.assertEqual(inv.current_stock, 5)

        # Successful stock addition
        res_add = self.client.post(f'/api/inventory/{inv.id}/adjust-stock/', {"quantity_change": 20, "transaction_type": "RESTOCK"}, format='json')
        self.assertEqual(res_add.status_code, status.HTTP_200_OK)
        inv.refresh_from_db()
        self.assertEqual(inv.current_stock, 25)


class OrderAndPickupTests(APITestCase):
    """
    Tests for Order placement, server-side price calculations, state transitions, and pickup capacity.
    """
    def setUp(self):
        self.owner = User.objects.create(username="owner_o", email="owner_o@test.com", role=User.Role.SHOP_OWNER)
        self.shop = Shop.objects.create(owner=self.owner, name="Order Shop", slug="order-shop", contact_phone="1234567890", is_active=True)
        self.cat = Category.objects.create(name="Stationery", slug="stationery")

        self.student = User.objects.create(username="student_o", email="student_o@test.com", role=User.Role.STUDENT)
        self.client.force_authenticate(user=self.student)

        self.pen = Product.objects.create(shop=self.shop, category=self.cat, name="Blue Pen", sku="PEN-BLU", price=Decimal("10.00"))
        self.notebook = Product.objects.create(shop=self.shop, category=self.cat, name="Notebook", sku="NB-01", price=Decimal("50.00"))

        self.inv_pen = Inventory.objects.create(shop=self.shop, product=self.pen, current_stock=50, reorder_threshold=5)
        self.inv_nb = Inventory.objects.create(shop=self.shop, product=self.notebook, current_stock=20, reorder_threshold=5)

    def test_order_creation_server_calculation(self):
        # 2 Pens (2 x 10 = 20) + 1 Notebook (1 x 50 = 50) = 70.00
        payload = {
            "shop": self.shop.id,
            "fulfillment_type": "PICKUP",
            "items": [
                {"product_id": self.pen.id, "quantity": 2},
                {"product_id": self.notebook.id, "quantity": 1}
            ]
        }
        res = self.client.post('/api/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        order_data = res.data['order']
        self.assertEqual(Decimal(str(order_data['subtotal'])), Decimal("70.00"))
        self.assertEqual(Decimal(str(order_data['total_amount'])), Decimal("70.00"))

        # Check stock deduction
        self.inv_pen.refresh_from_db()
        self.inv_nb.refresh_from_db()
        self.assertEqual(self.inv_pen.current_stock, 48)
        self.assertEqual(self.inv_nb.current_stock, 19)

    def test_order_status_workflow_and_illegal_skip(self):
        order = Order.objects.create(customer=self.student, shop=self.shop, subtotal=Decimal("70.00"), total_amount=Decimal("70.00"), status=Order.Status.PENDING)

        # Authenticate shop owner to update status
        self.client.force_authenticate(user=self.owner)

        # Valid transition: PENDING -> CONFIRMED
        res_ok = self.client.patch(f'/api/orders/{order.id}/', {"status": "CONFIRMED"}, format='json')
        self.assertEqual(res_ok.status_code, status.HTTP_200_OK)

        # Illegal skip: CONFIRMED -> DELIVERED (Must go through PREPARING -> READY)
        res_bad = self.client.patch(f'/api/orders/{order.id}/', {"status": "DELIVERED"}, format='json')
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pickup_slot_capacity_rejection(self):
        slot = PickupSlot.objects.create(
            shop=self.shop,
            date="2026-09-10",
            start_time="10:00:00",
            end_time="11:00:00",
            capacity=1,
            booked_count=1, # Already full
            is_active=True
        )
        payload = {
            "shop": self.shop.id,
            "fulfillment_type": "PICKUP",
            "pickup_slot": slot.id,
            "items": [{"product_id": self.pen.id, "quantity": 1}]
        }
        res = self.client.post('/api/orders/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
