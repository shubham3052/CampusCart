from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

from delivery.models import StudentAddress, Delivery, DeliveryZone
from shops.models import Shop
from orders.models import Order

User = get_user_model()


class LocationAndGPSAuditTests(TestCase):
    """
    Comprehensive test suite auditing GPS/location functionality across:
    - StudentAddress coordinate range validation & user isolation
    - Shop location updates & ownership permissions
    - Shop nearby geolocation calculation
    - Delivery location access control
    """

    def setUp(self):
        self.client = APIClient()

        # Student 1
        self.student1 = User.objects.create_user(
            email='student1_loc@test.edu',
            username='student1_loc@test.edu',
            password='TestPassword123!',
            role=User.Role.STUDENT,
            first_name='Rahul',
            last_name='Sharma',
            phone_number='9876543210'
        )

        # Student 2
        self.student2 = User.objects.create_user(
            email='student2_loc@test.edu',
            username='student2_loc@test.edu',
            password='TestPassword123!',
            role=User.Role.STUDENT,
            first_name='Priya',
            last_name='Nair',
            phone_number='9876543211'
        )

        # Shop Owner 1
        self.shop_owner1 = User.objects.create_user(
            email='owner1_loc@test.edu',
            username='owner1_loc@test.edu',
            password='TestPassword123!',
            role=User.Role.SHOP_OWNER,
            first_name='Suresh',
            last_name='Kumar',
            phone_number='9876543212'
        )

        # Shop Owner 2
        self.shop_owner2 = User.objects.create_user(
            email='owner2_loc@test.edu',
            username='owner2_loc@test.edu',
            password='TestPassword123!',
            role=User.Role.SHOP_OWNER,
            first_name='Mahesh',
            last_name='Verma',
            phone_number='9876543213'
        )

        # Delivery Courier
        self.courier = User.objects.create_user(
            email='courier_loc@test.edu',
            username='courier_loc@test.edu',
            password='TestPassword123!',
            role=User.Role.DELIVERY_AGENT,
            first_name='Amit',
            last_name='Rao',
            phone_number='9876543214'
        )

        # Create Shop 1
        self.shop1 = Shop.objects.create(
            owner=self.shop_owner1,
            name='Central Campus Stationery',
            slug='central-campus-stationery-loc',
            address='Academic Block 1, Ground Floor',
            campus_location='Academic Complex',
            contact_phone='9876543212',
            latitude=Decimal('28.545000'),
            longitude=Decimal('77.192600'),
            is_active=True
        )

        # Create Shop 2
        self.shop2 = Shop.objects.create(
            owner=self.shop_owner2,
            name='Hostel Gate Xerox',
            slug='hostel-gate-xerox-loc',
            address='Opposite Hostel Block B',
            campus_location='Hostel Zone',
            contact_phone='9876543213',
            latitude=Decimal('28.542000'),
            longitude=Decimal('77.190800'),
            is_active=True
        )

    # -------------------------------------------------------------
    # 1. Student Address Coordinate Validations
    # -------------------------------------------------------------
    def test_create_student_address_with_valid_coordinates(self):
        self.client.force_authenticate(user=self.student1)
        payload = {
            'label': 'Hostel Room',
            'hostel_block': 'Mandakini Hostel',
            'room_number': '304',
            'landmark': 'Near Gate 2',
            'phone_number': '9876543210',
            'latitude': 28.542500,
            'longitude': 77.190000,
            'is_default': True,
        }
        res = self.client.post('/api/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(float(res.data['latitude']), 28.542500)
        self.assertEqual(float(res.data['longitude']), 77.190000)

    def test_create_student_address_without_coordinates(self):
        self.client.force_authenticate(user=self.student1)
        payload = {
            'label': 'Department Lab',
            'hostel_block': 'ECE Dept',
            'room_number': 'Lab 102',
            'phone_number': '9876543210',
        }
        res = self.client.post('/api/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(res.data['latitude'])
        self.assertIsNone(res.data['longitude'])

    def test_create_student_address_invalid_latitude_rejected(self):
        self.client.force_authenticate(user=self.student1)
        payload = {
            'label': 'Invalid Lat',
            'hostel_block': 'Hostel A',
            'room_number': '101',
            'phone_number': '9876543210',
            'latitude': 95.0,  # Invalid (> 90)
            'longitude': 77.190000,
        }
        res = self.client.post('/api/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        has_field = 'latitude' in res.data or ('errors' in res.data and 'latitude' in res.data['errors'])
        self.assertTrue(has_field)

    def test_create_student_address_invalid_longitude_rejected(self):
        self.client.force_authenticate(user=self.student1)
        payload = {
            'label': 'Invalid Lng',
            'hostel_block': 'Hostel A',
            'room_number': '101',
            'phone_number': '9876543210',
            'latitude': 28.542500,
            'longitude': -195.0,  # Invalid (< -180)
        }
        res = self.client.post('/api/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        has_field = 'longitude' in res.data or ('errors' in res.data and 'longitude' in res.data['errors'])
        self.assertTrue(has_field)

    def test_create_student_address_mismatched_coordinates_rejected(self):
        self.client.force_authenticate(user=self.student1)
        payload = {
            'label': 'Half Coords',
            'hostel_block': 'Hostel A',
            'room_number': '101',
            'phone_number': '9876543210',
            'latitude': 28.542500,
            # longitude omitted
        }
        res = self.client.post('/api/addresses/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 2. Student Address User Isolation (Security)
    # -------------------------------------------------------------
    def test_student_address_isolation_prevent_idor(self):
        # Create address for Student 1
        addr1 = StudentAddress.objects.create(
            user=self.student1,
            label='Student 1 Room',
            hostel_block='Karakoram',
            room_number='201',
            phone_number='9876543210',
            latitude=Decimal('28.543000'),
            longitude=Decimal('77.189500')
        )

        # Authenticate as Student 2
        self.client.force_authenticate(user=self.student2)

        # Student 2 cannot retrieve Student 1's address
        res_get = self.client.get(f'/api/addresses/{addr1.id}/')
        self.assertEqual(res_get.status_code, status.HTTP_404_NOT_FOUND)

        # Student 2 cannot update Student 1's address
        res_patch = self.client.patch(f'/api/addresses/{addr1.id}/', {'room_number': '999'}, format='json')
        self.assertEqual(res_patch.status_code, status.HTTP_404_NOT_FOUND)

        # Student 2 cannot delete Student 1's address
        res_del = self.client.delete(f'/api/addresses/{addr1.id}/')
        self.assertEqual(res_del.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------
    # 3. Shop Location Ownership & Validation
    # -------------------------------------------------------------
    def test_shop_owner_can_update_own_shop_coordinates(self):
        self.client.force_authenticate(user=self.shop_owner1)
        payload = {
            'latitude': 28.545800,
            'longitude': 77.192000,
            'campus_location': 'Academic Block 1 North Wing'
        }
        res = self.client.patch(f'/api/shops/{self.shop1.id}/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.shop1.refresh_from_db()
        self.assertEqual(float(self.shop1.latitude), 28.545800)
        self.assertEqual(float(self.shop1.longitude), 77.192000)

    def test_shop_owner_cannot_update_other_shop_coordinates(self):
        self.client.force_authenticate(user=self.shop_owner1)
        payload = {
            'latitude': 28.550000,
            'longitude': 77.195000,
        }
        # Owner 1 attempts to modify Shop 2
        res = self.client.patch(f'/api/shops/{self.shop2.id}/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # 4. Nearby Shops Geolocation API
    # -------------------------------------------------------------
    def test_nearby_shops_api(self):
        self.client.force_authenticate(user=self.student1)
        # Search near Academic complex (28.5450, 77.1926) within 1.0 km
        res = self.client.get('/api/shops/nearby/?latitude=28.5450&longitude=77.1926&radius=1.0')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(res.data['count'], 1)
        # Verify distance_km is computed and sorted
        results = res.data['results']
        self.assertTrue(all('distance_km' in s for s in results))
        if len(results) > 1:
            self.assertLessEqual(results[0]['distance_km'], results[1]['distance_km'])

    def test_nearby_shops_invalid_coordinates(self):
        self.client.force_authenticate(user=self.student1)
        res = self.client.get('/api/shops/nearby/?latitude=invalid&longitude=77.1926')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 5. Delivery Location Access & Privacy
    # -------------------------------------------------------------
    def test_delivery_location_privacy_unassigned_user_denied(self):
        # Create an order and delivery for Student 1 assigned to Courier
        order = Order.objects.create(
            customer=self.student1,
            shop=self.shop1,
            fulfillment_type=Order.FulfillmentType.DELIVERY,
            delivery_address='Mandakini Hostel Room 304',
            delivery_latitude=Decimal('28.542500'),
            delivery_longitude=Decimal('77.190000'),
            shop_latitude=self.shop1.latitude,
            shop_longitude=self.shop1.longitude,
            status=Order.Status.OUT_FOR_DELIVERY,
        )
        delivery = Delivery.objects.create(
            order=order,
            delivery_agent=self.courier,
            delivery_address=order.delivery_address,
            latitude=order.delivery_latitude,
            longitude=order.delivery_longitude,
            shop_latitude=order.shop_latitude,
            shop_longitude=order.shop_longitude,
            delivery_status=Delivery.DeliveryStatus.OUT_FOR_DELIVERY
        )

        # Unrelated student 2 attempts to track delivery
        self.client.force_authenticate(user=self.student2)
        res = self.client.get(f'/api/deliveries/{delivery.id}/location/')
        self.assertIn(res.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # Assigned courier can access location
        self.client.force_authenticate(user=self.courier)
        res_courier = self.client.get(f'/api/deliveries/{delivery.id}/location/')
        self.assertEqual(res_courier.status_code, status.HTTP_200_OK)

        # Customer student 1 can access location
        self.client.force_authenticate(user=self.student1)
        res_student = self.client.get(f'/api/deliveries/{delivery.id}/location/')
        self.assertEqual(res_student.status_code, status.HTTP_200_OK)
