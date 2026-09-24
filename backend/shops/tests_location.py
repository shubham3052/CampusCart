from decimal import Decimal
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from users.models import User
from shops.models import Shop
from orders.models import Order
from delivery.models import Delivery, DeliverySlot
from products.models import Product, Category
from inventory.models import Inventory


class ShopLocationAndNearbyTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Users
        self.student = User.objects.create_user(
            username='loc_student',
            email='loc_student@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT,
            email_verified=True
        )

        self.shop_owner_1 = User.objects.create_user(
            username='loc_owner_1',
            email='loc_owner_1@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )

        self.shop_owner_2 = User.objects.create_user(
            username='loc_owner_2',
            email='loc_owner_2@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )

        self.admin = User.objects.create_user(
            username='loc_admin',
            email='loc_admin@campus.edu',
            password='Password123!',
            role=User.Role.ADMIN,
            email_verified=True
        )

        # Campus reference datum: IIT Delhi / University Main Gate ~ (28.5450, 77.1926)
        # Shop 1: Campus Core Stationery (~0.2 km away)
        self.shop_1 = Shop.objects.create(
            owner=self.shop_owner_1,
            name="Campus Core Stationery",
            slug="campus-core-stationery",
            shop_type=Shop.ShopType.COLLEGE_STATIONERY,
            address="Near Student Activity Center, Block B",
            campus_location="SAC Block B",
            contact_phone="9876543210",
            latitude=Decimal("28.545500"),
            longitude=Decimal("77.193000"),
            is_active=True
        )

        # Shop 2: South Gate Engineering Xerox (~1.5 km away)
        self.shop_2 = Shop.objects.create(
            owner=self.shop_owner_2,
            name="South Gate Engineering Xerox",
            slug="south-gate-xerox",
            shop_type=Shop.ShopType.PRINTING_XEROX,
            address="Opposite South Gate Complex",
            campus_location="South Gate",
            contact_phone="9876543211",
            latitude=Decimal("28.532000"),
            longitude=Decimal("77.194000"),
            is_active=True
        )

        # Shop 3: Distant Off-Campus Shop (~15 km away)
        self.distant_owner = User.objects.create_user(
            username='distant_owner',
            email='distant_owner@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )
        self.shop_distant = Shop.objects.create(
            owner=self.distant_owner,
            name="Distant City Depot",
            slug="distant-city-depot",
            shop_type=Shop.ShopType.LOCAL_STATIONERY,
            address="City Center Market",
            campus_location="City Center",
            contact_phone="9876543212",
            latitude=Decimal("28.650000"),
            longitude=Decimal("77.220000"),
            is_active=True
        )

        # Shop 4: Inactive Shop with Coordinates
        self.inactive_owner = User.objects.create_user(
            username='inactive_owner',
            email='inactive_owner@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )
        self.shop_inactive = Shop.objects.create(
            owner=self.inactive_owner,
            name="Renovating Stationery",
            slug="renovating-stationery",
            shop_type=Shop.ShopType.LOCAL_STATIONERY,
            address="Hostel 4 Lane",
            campus_location="Hostel 4",
            contact_phone="9876543213",
            latitude=Decimal("28.546000"),
            longitude=Decimal("77.193500"),
            is_active=False
        )

        # Category and Product for order tests
        self.category = Category.objects.create(name="Notebooks", slug="notebooks")
        self.product = Product.objects.create(
            shop=self.shop_1,
            category=self.category,
            name="A4 Spiral Notebook 200p",
            price=Decimal("60.00"),
            is_active=True
        )
        self.inventory = Inventory.objects.create(
            shop=self.shop_1,
            product=self.product,
            current_stock=100,
            reorder_level=10
        )

    # =========================================================================
    # 1. Coordinate Validation Tests
    # =========================================================================
    def test_update_shop_valid_coordinates(self):
        """Authorized shop owner can configure valid latitude and longitude."""
        self.client.force_authenticate(user=self.shop_owner_1)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {
            'latitude': '28.547123',
            'longitude': '77.194567',
            'campus_location': 'Updated SAC Wing'
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.shop_1.refresh_from_db()
        self.assertEqual(str(self.shop_1.latitude), '28.547123')
        self.assertEqual(str(self.shop_1.longitude), '77.194567')

    def test_invalid_latitude_out_of_range(self):
        """Latitude must be between -90 and 90."""
        self.client.force_authenticate(user=self.shop_owner_1)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {'latitude': '95.000000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('errors', response.data)
        self.assertIn('latitude', errors)

    def test_invalid_longitude_out_of_range(self):
        """Longitude must be between -180 and 180."""
        self.client.force_authenticate(user=self.shop_owner_1)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {'longitude': '185.000000'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        errors = response.data.get('errors', response.data)
        self.assertIn('longitude', errors)

    # =========================================================================
    # 2. Permission Tests (Shop Owner Isolation)
    # =========================================================================
    def test_shop_owner_cannot_modify_other_shop_location(self):
        """Shop Owner 2 must NOT be able to modify Shop Owner 1's location."""
        self.client.force_authenticate(user=self.shop_owner_2)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {
            'latitude': '28.500000',
            'longitude': '77.200000'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_student_cannot_modify_shop_location(self):
        """Student accounts cannot modify shop coordinates."""
        self.client.force_authenticate(user=self.student)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {
            'latitude': '28.500000',
            'longitude': '77.200000'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_modify_any_shop_location(self):
        """Platform Admin can modify shop coordinates when verifying vendors."""
        self.client.force_authenticate(user=self.admin)
        url = reverse('shops-detail', kwargs={'id': self.shop_1.id})
        response = self.client.patch(url, {
            'latitude': '28.546789',
            'longitude': '77.193210'
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.shop_1.refresh_from_db()
        self.assertEqual(str(self.shop_1.latitude), '28.546789')

    # =========================================================================
    # 3. Nearby Shop Search Endpoint Tests
    # =========================================================================
    def test_nearby_endpoint_requires_coordinates(self):
        """GET /api/shops/nearby/ without lat/lon must return 400 Bad Request."""
        url = reverse('shops-nearby')
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_nearby_endpoint_rejects_invalid_numbers(self):
        """Non-numeric coordinates must return 400."""
        url = reverse('shops-nearby')
        response = self.client.get(f"{url}?latitude=abc&longitude=xyz")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nearby_endpoint_rejects_out_of_range_coords(self):
        """Out of range coordinates must return 400."""
        url = reverse('shops-nearby')
        response = self.client.get(f"{url}?latitude=95.0&longitude=77.0")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response2 = self.client.get(f"{url}?latitude=28.0&longitude=200.0")
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nearby_endpoint_rejects_invalid_radius(self):
        """Radius <= 0 or > 100 must return 400."""
        url = reverse('shops-nearby')
        response = self.client.get(f"{url}?latitude=28.545&longitude=77.192&radius=-5")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        response2 = self.client.get(f"{url}?latitude=28.545&longitude=77.192&radius=150")
        self.assertEqual(response2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_nearby_endpoint_returns_nearest_active_shops(self):
        """Nearby search returns active shops sorted by distance; excludes inactive shops."""
        # Query from campus gate: (28.5450, 77.1926) with 5 km radius
        url = reverse('shops-nearby')
        response = self.client.get(f"{url}?latitude=28.5450&longitude=77.1926&radius=5.0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        results = response.data.get('results', [])
        # Shop 1 (~0.07 km) and Shop 2 (~1.45 km) should be included
        # Shop 3 (~15 km away) should be excluded
        # Shop 4 (inactive) should be excluded
        self.assertEqual(len(results), 2)

        # Verify sorted nearest first
        self.assertEqual(results[0]['id'], self.shop_1.id)
        self.assertEqual(results[1]['id'], self.shop_2.id)

        # Verify distance_km is present and accurate
        self.assertIn('distance_km', results[0])
        self.assertLess(results[0]['distance_km'], 0.5)
        self.assertIn('distance_km', results[1])
        self.assertGreater(results[1]['distance_km'], 1.0)
        self.assertLess(results[1]['distance_km'], 2.0)

    def test_nearby_endpoint_wider_radius_includes_distant_shop(self):
        """Increasing radius to 25 km includes the distant shop."""
        url = reverse('shops-nearby')
        response = self.client.get(f"{url}?latitude=28.5450&longitude=77.1926&radius=25.0")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get('results', [])
        self.assertEqual(len(results), 3)
        self.assertEqual(results[2]['id'], self.shop_distant.id)

    # =========================================================================
    # 4. Historical Order Location Preservation Tests
    # =========================================================================
    def test_order_creation_preserves_historical_coordinates(self):
        """
        When a delivery order is placed:
        1. Shop coordinates are snapshotted onto Order.shop_latitude and Order.shop_longitude.
        2. Delivery coordinates are snapshotted onto Order.delivery_latitude and Order.delivery_longitude.
        3. Delivery record receives both shop and customer coordinates.
        4. If the shop later relocates, the historical order's coordinates remain unchanged!
        """
        self.client.force_authenticate(user=self.student)
        url = reverse('orders-list')

        order_payload = {
            'shop': self.shop_1.id,
            'fulfillment_type': 'DELIVERY',
            'delivery_address': 'Ganga Hostel Room 204, IIT Campus',
            'delivery_latitude': '28.543210',
            'delivery_longitude': '77.191234',
            'hostel_block': 'Ganga Hostel',
            'room_number': '204',
            'payment_method': 'COD',
            'items': [
                {'product_id': self.product.id, 'quantity': 2}
            ]
        }

        response = self.client.post(url, order_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        order_data = response.data.get('order', response.data)
        order_id = order_data['id']
        order = Order.objects.get(id=order_id)

        # Verify historical snapshot coordinates on Order
        self.assertEqual(str(order.shop_latitude), str(self.shop_1.latitude))
        self.assertEqual(str(order.shop_longitude), str(self.shop_1.longitude))
        self.assertEqual(str(order.delivery_latitude), '28.543210')
        self.assertEqual(str(order.delivery_longitude), '77.191234')

        # Verify snapshot on Delivery record
        delivery = Delivery.objects.get(order=order)
        self.assertEqual(str(delivery.shop_latitude), str(self.shop_1.latitude))
        self.assertEqual(str(delivery.shop_longitude), str(self.shop_1.longitude))
        self.assertEqual(str(delivery.latitude), '28.543210')
        self.assertEqual(str(delivery.longitude), '77.191234')

        # NOW: Simulate shop relocating to a completely new campus block
        self.shop_1.latitude = Decimal("28.555555")
        self.shop_1.longitude = Decimal("77.188888")
        self.shop_1.save()

        # The historical order must retain its original coordinates!
        order.refresh_from_db()
        delivery.refresh_from_db()
        self.assertEqual(str(order.shop_latitude), '28.545500')
        self.assertEqual(str(order.shop_longitude), '77.193000')
        self.assertEqual(str(delivery.shop_latitude), '28.545500')
        self.assertEqual(str(delivery.shop_longitude), '77.193000')
