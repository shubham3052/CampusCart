from datetime import date, time, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model
from django.core.management import call_command

from users.models import User
from shops.models import Shop
from products.models import Product, Category
from orders.models import Order, OrderItem
from delivery.models import (
    Delivery,
    DeliverySlot,
    DeliveryZone,
    DeliveryLocation,
    DeliveryRoute,
    DeliveryRouteStop,
    StudentAddress,
)
from delivery.services.location_service import DeliveryLocationService
from delivery.services.assignment_service import DeliveryAssignmentService
from delivery.services.route_optimization_service import RouteOptimizationService
from delivery.services.map_provider import haversine_distance

User = get_user_model()


class Step22LiveGpsAndRouteOptimizationTests(APITestCase):
    def setUp(self):
        # 1. Users
        self.student = User.objects.create_user(
            username="student_vikram",
            email="vikram@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Vikram Seth",
            phone_number="9876500001",
        )
        self.other_student = User.objects.create_user(
            username="student_ananya",
            email="ananya@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Ananya Roy",
            phone_number="9876500002",
        )
        self.courier_1 = User.objects.create_user(
            username="courier_karan",
            email="karan@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Karan Verma",
            phone_number="9876500003",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )
        self.courier_2 = User.objects.create_user(
            username="courier_sanjay",
            email="sanjay@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Sanjay Rao",
            phone_number="9876500004",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )
        self.shop_owner = User.objects.create_user(
            username="shop_owner_sunil",
            email="sunil@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Sunil Mittal",
            phone_number="9876500005",
        )
        self.admin = User.objects.create_user(
            username="admin_delivery",
            email="admin_delivery@campus.edu",
            password="TestPassword123!",
            role=User.Role.ADMIN,
            name="Campus Logistics Admin",
            is_staff=True,
            is_superuser=True,
        )

        # 2. Shop with exact GPS
        self.shop = Shop.objects.create(
            owner=self.shop_owner,
            name="Campus Central Hub Shop",
            slug="campus-central-hub-shop",
            address="Academic Block 1 Ground Floor",
            campus_location="Academic Block 1",
            latitude=Decimal("28.545800"),
            longitude=Decimal("77.192000"),
            contact_phone="9876500005",
            is_active=True,
        )

        self.zone = DeliveryZone.objects.create(
            shop=self.shop,
            name="Campus Core Zone (0-2 km)",
            minimum_distance=Decimal("0.00"),
            maximum_distance=Decimal("2.00"),
            base_charge=Decimal("15.00"),
            free_delivery_threshold=Decimal("250.00")
        )

        # 3. Order & Delivery for student
        self.order = Order.objects.create(
            customer=self.student,
            shop=self.shop,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.DELIVERY,
            delivery_address="Hostel Block A, Room 204",
            status=Order.Status.OUT_FOR_DELIVERY,
            subtotal=Decimal("150.00"),
            total_amount=Decimal("165.00"),
        )
        self.delivery = Delivery.objects.create(
            order=self.order,
            delivery_agent=self.courier_1,
            delivery_address="Hostel Block A, Room 204",
            latitude=Decimal("28.542500"),
            longitude=Decimal("77.190000"),
            delivery_zone=self.zone,
            delivery_status=Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
            out_for_delivery_at=timezone.now(),
        )
        self.order.generate_delivery_otp(expiry_minutes=120)

    def test_haversine_distance_calculation(self):
        """Validates geographic distance formula."""
        # Distance between Shop (28.5458, 77.1920) and Hostel Block A (28.5425, 77.1900)
        dist = haversine_distance(28.5458, 77.1920, 28.5425, 77.1900)
        self.assertGreater(dist, 0.3)
        self.assertLess(dist, 0.6)  # approx 410 meters

    def test_courier_location_update_and_validation(self):
        """Tests valid location updates, bounds checks, and accuracy validation."""
        self.client.force_authenticate(user=self.courier_1)

        # 1. Valid location update
        res = self.client.post('/api/deliveries/location/', {
            'delivery_id': self.delivery.id,
            'latitude': 28.5450,
            'longitude': 77.1915,
            'accuracy': 8.5,
            'heading': 180.0,
            'speed': 4.2,
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        self.assertEqual(DeliveryLocation.objects.filter(delivery_person=self.courier_1, is_current=True).count(), 1)

        # 2. Invalid latitude (out of [-90, 90] bounds)
        res_bad_lat = self.client.post('/api/deliveries/location/', {
            'delivery_id': self.delivery.id,
            'latitude': 120.0,
            'longitude': 77.1915,
        })
        self.assertEqual(res_bad_lat.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Excessive accuracy noise (> 200m)
        res_bad_acc = self.client.post('/api/deliveries/location/', {
            'delivery_id': self.delivery.id,
            'latitude': 28.5450,
            'longitude': 77.1915,
            'accuracy': 350.0,
        })
        self.assertEqual(res_bad_acc.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anti_spoofing_impossible_speed_flag(self):
        """Tests that realistic speeds pass while impossible velocity jumps (>80 km/h) are flagged."""
        # Initial point at Delhi campus
        now = timezone.now()
        DeliveryLocation.objects.create(
            delivery=self.delivery,
            delivery_person=self.courier_1,
            latitude=Decimal("28.545000"),
            longitude=Decimal("77.191500"),
            accuracy=10.0,
            timestamp=now - timedelta(seconds=20),
            is_current=True
        )

        # Jump 50 km away in 20 seconds (over 9000 km/h)
        loc, _ = DeliveryLocationService.validate_and_record_location(
            courier=self.courier_1,
            delivery_id=self.delivery.id,
            latitude=28.9950,
            longitude=77.5915,
            accuracy=10.0,
            timestamp=now
        )
        self.assertTrue(loc.is_flagged_suspicious)

    def test_proximity_auto_arriving_detection(self):
        """Tests that moving within 200m of delivery drop point triggers ARRIVING status."""
        self.assertEqual(self.delivery.delivery_status, Delivery.DeliveryStatus.OUT_FOR_DELIVERY)

        # Drop point is (28.542500, 77.190000). Position courier 50 meters away: (28.542550, 77.190050)
        DeliveryLocationService.validate_and_record_location(
            courier=self.courier_1,
            delivery_id=self.delivery.id,
            latitude=28.542550,
            longitude=77.190050,
            accuracy=5.0
        )

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.delivery_status, Delivery.DeliveryStatus.ARRIVING)

    def test_location_privacy_and_anti_idor(self):
        """Validates that students can only see their own active order location and cannot probe other deliveries."""
        # Courier reports location
        self.client.force_authenticate(user=self.courier_1)
        self.client.post('/api/deliveries/location/', {
            'delivery_id': self.delivery.id,
            'latitude': 28.5440,
            'longitude': 77.1910,
            'accuracy': 10.0,
        })

        # 1. Ordering student CAN view live tracking
        self.client.force_authenticate(user=self.student)
        res = self.client.get(f'/api/deliveries/{self.delivery.id}/location/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['tracking_active'])
        self.assertIsNotNone(res.data['current_location'])
        self.assertIn('eta_minutes', res.data)

        # 2. Other student CANNOT view (Forbidden 403 or Not Found 404)
        self.client.force_authenticate(user=self.other_student)
        res_other = self.client.get(f'/api/deliveries/{self.delivery.id}/location/')
        self.assertIn(res_other.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 3. Courier 2 CANNOT update location for Courier 1's delivery
        self.client.force_authenticate(user=self.courier_2)
        res_unauth = self.client.post(f'/api/deliveries/{self.delivery.id}/location/', {
            'latitude': 28.5440,
            'longitude': 77.1910,
        })
        self.assertIn(res_unauth.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_intelligent_courier_assignment(self):
        """Tests multi-factor assignment scoring prioritizing idle courier closer to shop."""
        # Courier 1 is 3.5 km away with 1 active delivery
        DeliveryLocation.objects.create(
            delivery_person=self.courier_1,
            latitude=Decimal("28.575000"),
            longitude=Decimal("77.220000"),
            accuracy=10.0,
            is_current=True
        )

        # Courier 2 is 0.3 km away with 0 active deliveries
        DeliveryLocation.objects.create(
            delivery_person=self.courier_2,
            latitude=Decimal("28.546000"),
            longitude=Decimal("77.192500"),
            accuracy=10.0,
            is_current=True
        )

        # Create unassigned order
        unassigned_order = Order.objects.create(
            customer=self.student,
            shop=self.shop,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.DELIVERY,
            delivery_address="Academic Block 3, Room 101",
            status=Order.Status.CONFIRMED,
            total_amount=Decimal("100.00"),
        )
        unassigned_deliv = Delivery.objects.create(
            order=unassigned_order,
            delivery_address="Academic Block 3, Room 101",
            delivery_status=Delivery.DeliveryStatus.PENDING,
            delivery_zone=self.zone,
        )

        assigned_agent, reason = DeliveryAssignmentService.auto_assign(unassigned_deliv)
        self.assertEqual(assigned_agent.id, self.courier_2.id)
        self.assertIn("close to shop", reason)

    def test_multi_stop_route_creation_and_2opt_optimization(self):
        """Tests creating a multi-stop delivery route and applying 2-Opt local search."""
        # Create 3 deliveries at various campus coordinates
        delivs = []
        coords = [
            ("Hostel Block D", Decimal("28.541000"), Decimal("77.192800")),
            ("Hostel Block B", Decimal("28.542000"), Decimal("77.190800")),
            ("Academic Block 4", Decimal("28.548000"), Decimal("77.194200")),
        ]
        for name, lat, lng in coords:
            ord_obj = Order.objects.create(
                customer=self.student,
                shop=self.shop,
                order_type=Order.OrderType.STATIONERY,
                fulfillment_type=Order.FulfillmentType.DELIVERY,
                delivery_address=name,
                status=Order.Status.READY,
                total_amount=Decimal("120.00"),
            )
            d = Delivery.objects.create(
                order=ord_obj,
                delivery_agent=self.courier_1,
                delivery_address=name,
                latitude=lat,
                longitude=lng,
                delivery_status=Delivery.DeliveryStatus.ASSIGNED,
            )
            delivs.append(d)

        # Create route
        route = RouteOptimizationService.create_route_for_courier(
            courier=self.courier_1,
            deliveries=delivs,
            start_location="Central Campus Hub",
            start_coords=(28.5458, 77.1920)
        )

        self.assertEqual(route.stops.count(), 3)
        self.assertGreater(float(route.total_distance), 0.0)
        self.assertGreater(route.estimated_duration, 0)

        # Test route API endpoints
        self.client.force_authenticate(user=self.courier_1)
        res_opt = self.client.post(f'/api/delivery-routes/{route.id}/optimize/')
        self.assertEqual(res_opt.status_code, status.HTTP_200_OK)

        res_start = self.client.post(f'/api/delivery-routes/{route.id}/start/')
        self.assertEqual(res_start.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertEqual(route.status, DeliveryRoute.RouteStatus.ACTIVE)

        # Complete first stop
        first_stop = route.stops.first()
        res_comp = self.client.post(f'/api/delivery-routes/{route.id}/complete-stop/', {
            'stop_id': first_stop.id
        })
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        first_stop.refresh_from_db()
        self.assertTrue(first_stop.completed)

    def test_location_retention_cleanup_command(self):
        """Tests management command purging old GPS breadcrumbs while preserving current locations."""
        now = timezone.now()
        # Old inactive location (> 10 days ago)
        old_loc = DeliveryLocation.objects.create(
            delivery_person=self.courier_1,
            latitude=Decimal("28.545000"),
            longitude=Decimal("77.191500"),
            accuracy=10.0,
            timestamp=now - timedelta(days=12),
            is_current=False
        )
        # Recent inactive location (2 days ago)
        recent_loc = DeliveryLocation.objects.create(
            delivery_person=self.courier_1,
            latitude=Decimal("28.545200"),
            longitude=Decimal("77.191700"),
            accuracy=10.0,
            timestamp=now - timedelta(days=2),
            is_current=False
        )
        # Active current location (should NEVER be deleted)
        current_loc = DeliveryLocation.objects.create(
            delivery_person=self.courier_1,
            latitude=Decimal("28.545500"),
            longitude=Decimal("77.192000"),
            accuracy=10.0,
            timestamp=now,
            is_current=True
        )

        call_command('cleanup_old_locations', days=7)

        self.assertFalse(DeliveryLocation.objects.filter(id=old_loc.id).exists())
        self.assertTrue(DeliveryLocation.objects.filter(id=recent_loc.id).exists())
        self.assertTrue(DeliveryLocation.objects.filter(id=current_loc.id).exists())
