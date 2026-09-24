from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from shops.models import Shop
from products.models import Product, Category

User = get_user_model()


class ProductAndShopSharingAuditTests(TestCase):
    """
    Verification tests for Product and Shop sharing:
    - Public access to product details without authentication (AllowAny)
    - Public access to shop details without authentication (AllowAny)
    - Protection against sensitive data leakage (no passwords, tokens, private fields)
    - Proper 404 handling for invalid product or shop IDs
    - Inactive product exclusion from public catalog
    """

    def setUp(self):
        self.anon_client = APIClient()

        # Create shop owner and shop
        self.owner = User.objects.create_user(
            username='share_owner',
            email='share_owner@campus.edu',
            password='SecureOwnerPass2026!',
            role=User.Role.SHOP_OWNER,
            is_active=True,
            email_verified=True
        )
        self.shop = Shop.objects.create(
            owner=self.owner,
            name='Campus Central Supplies',
            slug='campus-central-supplies',
            contact_phone='9812345678',
            address='Student Activity Center, Ground Floor',
            campus_location='SAC Building',
            shop_type='COLLEGE_STATIONERY',
            is_active=True
        )

        self.category = Category.objects.create(
            name='Writing Materials',
            slug='writing-materials'
        )

        # Active product
        self.product_active = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name='Classmate Octane Ball Pen',
            description='Smooth Japanese gel ink ball pen for exam writing',
            price=Decimal('10.00'),
            sku='OCTANE-BP-01',
            brand='Classmate',
            unit='PIECE',
            is_active=True
        )

        # Inactive product
        self.product_inactive = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name='Discontinued Fountain Pen',
            price=Decimal('150.00'),
            sku='DISC-FP-01',
            is_active=False
        )

    def test_public_product_detail_accessible_without_auth(self):
        """Public shared product endpoint /api/products/<id>/ is accessible without auth."""
        res = self.anon_client.get(f'/api/products/{self.product_active.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], 'Classmate Octane Ball Pen')
        self.assertEqual(str(res.data['price']), '10.00')
        self.assertEqual(res.data['shop'], self.shop.id)

        # Ensure no sensitive information is leaked
        self.assertNotIn('password', res.data)
        self.assertNotIn('token', res.data)
        self.assertNotIn('secret', res.data)
        self.assertNotIn('auth', res.data)

    def test_invalid_product_id_returns_404(self):
        """Invalid product ID returns 404 Not Found cleanly without 500 error."""
        res = self.anon_client.get('/api/products/999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_shop_detail_accessible_without_auth(self):
        """Public shared shop endpoint /api/shops/<id>/ is accessible without auth."""
        res = self.anon_client.get(f'/api/shops/{self.shop.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['name'], 'Campus Central Supplies')
        self.assertEqual(res.data['campus_location'], 'SAC Building')

        # Ensure shop owner private user information is not leaked
        self.assertNotIn('password', res.data)
        self.assertNotIn('token', res.data)
        if 'owner' in res.data and isinstance(res.data['owner'], dict):
            self.assertNotIn('password', res.data['owner'])
            self.assertNotIn('email_otp', res.data['owner'])

    def test_invalid_shop_id_returns_404(self):
        """Invalid shop ID returns 404 Not Found cleanly without 500 error."""
        res = self.anon_client.get('/api/shops/999999/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_product_excluded_from_public_list(self):
        """Inactive products are excluded from public catalog listing."""
        res = self.anon_client.get('/api/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        results = res.data.get('results', res.data) if isinstance(res.data, dict) else res.data
        ids = [item['id'] for item in results]
        self.assertIn(self.product_active.id, ids)
        self.assertNotIn(self.product_inactive.id, ids)
