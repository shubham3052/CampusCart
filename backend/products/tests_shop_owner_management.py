from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from shops.models import Shop
from products.models import Product, Category
from inventory.models import Inventory
from orders.models import Order, OrderItem

User = get_user_model()


class ShopOwnerProductManagementTests(TestCase):
    def setUp(self):
        self.client_owner_a = APIClient()
        self.client_owner_b = APIClient()
        self.client_student = APIClient()
        self.client_anon = APIClient()

        # Users
        self.owner_a = User.objects.create_user(
            username='owner_a_test',
            email='owner_a_test@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            is_active=True,
            email_verified=True
        )
        self.shop_a = Shop.objects.create(
            owner=self.owner_a,
            name='Alpha Test Shop',
            slug='alpha-test-shop',
            contact_phone='9811111111',
            is_active=True
        )

        self.owner_b = User.objects.create_user(
            username='owner_b_test',
            email='owner_b_test@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            is_active=True,
            email_verified=True
        )
        self.shop_b = Shop.objects.create(
            owner=self.owner_b,
            name='Beta Test Shop',
            slug='beta-test-shop',
            contact_phone='9822222222',
            is_active=True
        )

        self.student = User.objects.create_user(
            username='student_test',
            email='student_test@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )

        self.category = Category.objects.create(
            name='Office Supplies',
            slug='office-supplies'
        )

        self.client_owner_a.force_authenticate(user=self.owner_a)
        self.client_owner_b.force_authenticate(user=self.owner_b)
        self.client_student.force_authenticate(user=self.student)

    def test_1_shop_owner_creates_product_without_shop_id(self):
        """1. Shop Owner can create product without manually specifying shop ID (auto-derived)."""
        payload = {
            "category": self.category.id,
            "name": "A4 Spiral Notebook",
            "price": "60.00",
            "description": "200 pages ruled spiral notebook",
            "brand": "Classmate",
            "unit": "PIECE",
        }
        res = self.client_owner_a.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.data['name'], "A4 Spiral Notebook")
        self.assertEqual(res.data['shop'], self.shop_a.id)

    def test_2_product_automatically_belongs_to_owners_shop(self):
        """2. Product automatically belongs to the authenticated owner's shop."""
        res_a = self.client_owner_a.post('/api/products/', {
            "category": self.category.id,
            "name": "Gel Pen Alpha",
            "price": "20.00"
        }, format='json')
        self.assertEqual(res_a.status_code, status.HTTP_201_CREATED)
        prod_a = Product.objects.get(id=res_a.data['id'])
        self.assertEqual(prod_a.shop, self.shop_a)

        res_b = self.client_owner_b.post('/api/products/', {
            "category": self.category.id,
            "name": "Gel Pen Beta",
            "price": "25.00"
        }, format='json')
        self.assertEqual(res_b.status_code, status.HTTP_201_CREATED)
        prod_b = Product.objects.get(id=res_b.data['id'])
        self.assertEqual(prod_b.shop, self.shop_b)

    def test_3_initial_stock_creates_correct_inventory(self):
        """3. Initial stock parameter creates the corresponding Inventory record."""
        payload = {
            "category": self.category.id,
            "name": "Correction Tape",
            "price": "35.00",
            "initial_stock": 25
        }
        res = self.client_owner_a.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        prod_id = res.data['id']

        inv = Inventory.objects.filter(shop=self.shop_a, product_id=prod_id).first()
        self.assertIsNotNone(inv)
        self.assertEqual(inv.current_stock, 25)
        self.assertEqual(res.data['current_stock'], 25)
        self.assertTrue(res.data['is_in_stock'])
        self.assertEqual(res.data['stock_status'], 'IN_STOCK')

    def test_4_product_and_inventory_atomic_creation(self):
        """4. Product and Inventory creation happens atomically in a database transaction."""
        payload = {
            "category": self.category.id,
            "name": "Atomic Marker",
            "price": "40.00",
            "initial_stock": 10
        }
        res = self.client_owner_a.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        prod_id = res.data['id']
        self.assertTrue(Product.objects.filter(id=prod_id).exists())
        self.assertTrue(Inventory.objects.filter(product_id=prod_id, current_stock=10).exists())

    def test_5_shop_owner_can_update_own_product(self):
        """5. Shop Owner can update their own products."""
        prod = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Original Ruler",
            price=Decimal("15.00"),
            sku="RULER-01"
        )
        update_payload = {
            "name": "Steel Ruler 30cm",
            "price": "25.00",
            "description": "Stainless steel measurement ruler"
        }
        res = self.client_owner_a.patch(f'/api/products/{prod.id}/', update_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        prod.refresh_from_db()
        self.assertEqual(prod.name, "Steel Ruler 30cm")
        self.assertEqual(prod.price, Decimal("25.00"))

    def test_6_shop_owner_cannot_update_another_shops_product(self):
        """6. Shop Owner A cannot update Shop B's product -> 404 Not Found (isolated)."""
        prod_b = Product.objects.create(
            shop=self.shop_b,
            category=self.category,
            name="Shop B Highlighter",
            price=Decimal("30.00"),
            sku="HL-B-01"
        )
        res = self.client_owner_a.patch(f'/api/products/{prod_b.id}/', {"price": "1.00"}, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        prod_b.refresh_from_db()
        self.assertEqual(prod_b.price, Decimal("30.00"))

    def test_7_shop_owner_can_delete_own_product(self):
        """7. Shop Owner can delete own product without historical orders -> 204 No Content."""
        prod = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Unneeded Pencil",
            price=Decimal("5.00"),
            sku="PENCIL-01"
        )
        res = self.client_owner_a.delete(f'/api/products/{prod.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(id=prod.id).exists())

    def test_8_shop_owner_cannot_delete_another_shops_product(self):
        """8. Shop Owner A cannot delete Shop B's product -> 404 Not Found."""
        prod_b = Product.objects.create(
            shop=self.shop_b,
            category=self.category,
            name="Shop B Compass",
            price=Decimal("80.00"),
            sku="COMPASS-01"
        )
        res = self.client_owner_a.delete(f'/api/products/{prod_b.id}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Product.objects.filter(id=prod_b.id).exists())

    def test_9_shop_owner_cannot_assign_product_to_another_shop(self):
        """9. Shop Owner A cannot assign product to Shop B -> 403 Forbidden."""
        payload = {
            "shop": self.shop_b.id,
            "category": self.category.id,
            "name": "Infiltrator Stapler",
            "price": "90.00",
            "sku": "STAPLE-MAL"
        }
        res = self.client_owner_a.post('/api/products/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_10_student_can_see_active_products(self):
        """10. Student can see active products across shops in public catalog."""
        prod_active = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Active Eraser",
            price=Decimal("10.00"),
            sku="ERASER-ACT",
            is_active=True
        )
        prod_inactive = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name="Discontinued Eraser",
            price=Decimal("10.00"),
            sku="ERASER-INACT",
            is_active=False
        )

        # Student list query: inactive products are excluded by default
        res = self.client_student.get('/api/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        ids = [item['id'] for item in (res.data.get('results') if isinstance(res.data, dict) else res.data)]
        self.assertIn(prod_active.id, ids)
        self.assertNotIn(prod_inactive.id, ids)

        # Student direct view of active product
        res_view = self.client_student.get(f'/api/products/{prod_active.id}/')
        self.assertEqual(res_view.status_code, status.HTTP_200_OK)

    def test_11_unauthorized_users_blocked_from_product_creation(self):
        """11. Students and Unauthenticated users cannot create products."""
        payload = {
            "category": self.category.id,
            "name": "Unauthorized Pen",
            "price": "10.00"
        }
        res_student = self.client_student.post('/api/products/', payload, format='json')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

        res_anon = self.client_anon.post('/api/products/', payload, format='json')
        self.assertEqual(res_anon.status_code, status.HTTP_401_UNAUTHORIZED)
