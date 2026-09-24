from datetime import date, time, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from shops.models import Shop
from products.models import Product, Category
from orders.models import Order, OrderItem
from notifications.models import Notification
from delivery.models import (
    StudentAddress,
    Delivery,
    DeliverySlot,
    DeliveryZone,
)

User = get_user_model()


class PickupWorkflowAndMapsTests(APITestCase):
    def setUp(self):
        # Create users
        self.student = User.objects.create_user(
            username="test_student",
            email="student@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Test Student",
            phone_number="9876543210",
        )
        self.shop_owner = User.objects.create_user(
            username="test_shopkeeper",
            email="shop@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Test Shopkeeper",
            phone_number="9876543212",
        )
        self.courier_a = User.objects.create_user(
            username="courier_alpha",
            email="alpha@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Courier Alpha",
            phone_number="9876543213",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )
        self.courier_b = User.objects.create_user(
            username="courier_beta",
            email="beta@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Courier Beta",
            phone_number="9876543214",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )

        # Create Shop with valid location coordinates
        self.shop = Shop.objects.create(
            name="Campus Express Stationery",
            slug="campus-express-stationery",
            owner=self.shop_owner,
            is_active=True,
            address="Ground Floor, Student Activity Centre",
            latitude=Decimal("28.545000"),
            longitude=Decimal("77.192600"),
            contact_phone="9876543299",
        )

        # Create Category and Product
        self.category = Category.objects.create(name="Notebooks", slug="notebooks")
        self.product = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name="Spiral Graph Notebook",
            slug="spiral-graph-notebook",
            sku="NB-TEST-001",
            price=Decimal("80.00"),
            is_active=True,
        )

        # Create Delivery Zone
        self.zone = DeliveryZone.objects.create(
            shop=self.shop,
            name="Hostel Block East",
            minimum_distance=Decimal("0.0"),
            maximum_distance=Decimal("2.5"),
            base_charge=Decimal("15.00"),
            free_delivery_threshold=Decimal("250.00"),
            is_active=True,
        )

        # Create Order
        self.order = Order.objects.create(
            customer=self.student,
            shop=self.shop,
            order_type=Order.OrderType.STATIONERY,
            fulfillment_type=Order.FulfillmentType.DELIVERY,
            status=Order.Status.READY,
            subtotal=Decimal("80.00"),
            delivery_fee=Decimal("15.00"),
            total_amount=Decimal("95.00"),
            payment_status=Order.PaymentStatus.PAID,
            payment_method=Order.PaymentMethod.ONLINE,
            delivery_address="Aravali Hostel, Wing B",
            delivery_latitude=Decimal("28.548200"),
            delivery_longitude=Decimal("77.189500"),
            shop_latitude=Decimal("28.545000"),
            shop_longitude=Decimal("77.192600"),
        )
        self.order_item = OrderItem.objects.create(
            order=self.order,
            product=self.product,
            quantity=1,
            unit_price=Decimal("80.00"),
            total_price=Decimal("80.00"),
        )

        # Create Delivery object
        self.delivery = Delivery.objects.create(
            order=self.order,
            delivery_status=Delivery.DeliveryStatus.PENDING,
            delivery_zone=self.zone,
            delivery_address="Aravali Hostel, Wing B",
            hostel_block="Aravali Hostel",
            room_number="B-304",
            latitude=Decimal("28.548200"),
            longitude=Decimal("77.189500"),
            delivery_charge=Decimal("15.00"),
        )

    def test_assign_delivery_creates_notification_for_assigned_partner_only(self):
        """When a delivery is assigned, only the assigned partner gets a pickup notification."""
        self.client.force_authenticate(user=self.shop_owner)
        url = f"/api/deliveries/{self.delivery.id}/assign/"
        response = self.client.post(url, {"agent_id": self.courier_a.id, "delivery_notes": "Handle with care"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.delivery_status, Delivery.DeliveryStatus.ASSIGNED)
        self.assertEqual(self.delivery.delivery_agent, self.courier_a)

        # Courier A should have received a notification
        courier_a_notifs = Notification.objects.filter(recipient=self.courier_a, title__icontains="Pickup")
        self.assertEqual(courier_a_notifs.count(), 1)
        self.assertIn("ready for pickup", courier_a_notifs.first().message)
        self.assertIn(self.shop.name, courier_a_notifs.first().message)

        # Courier B should NOT have received a notification
        courier_b_notifs = Notification.objects.filter(recipient=self.courier_b)
        self.assertEqual(courier_b_notifs.count(), 0)

    def test_duplicate_assignment_prevention(self):
        """Re-saving or re-assigning same delivery does not create duplicate notifications."""
        self.client.force_authenticate(user=self.shop_owner)
        url = f"/api/deliveries/{self.delivery.id}/assign/"
        # First assignment
        self.client.post(url, {"agent_id": self.courier_a.id})
        count_first = Notification.objects.filter(recipient=self.courier_a, title__icontains="Pickup").count()
        self.assertEqual(count_first, 1)

        # Second assignment with same agent
        self.client.post(url, {"agent_id": self.courier_a.id})
        count_second = Notification.objects.filter(recipient=self.courier_a, title__icontains="Pickup").count()
        self.assertEqual(count_second, 1)

    def test_arrived_at_shop_status_transition(self):
        """Assigned courier can mark 'arrived-at-shop' and transitions status cleanly."""
        self.delivery.delivery_agent = self.courier_a
        self.delivery.delivery_status = Delivery.DeliveryStatus.ASSIGNED
        self.delivery.save()

        self.client.force_authenticate(user=self.courier_a)
        url = f"/api/deliveries/{self.delivery.id}/arrived-at-shop/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.delivery_status, Delivery.DeliveryStatus.ARRIVED_AT_SHOP)
        self.assertIsNotNone(self.delivery.arrived_at_shop_at)

        # Shopkeeper receives arrival notification
        shop_notifs = Notification.objects.filter(recipient=self.shop_owner, title__icontains="Courier Arrived")
        self.assertEqual(shop_notifs.count(), 1)

    def test_unauthorized_partner_cannot_modify_delivery(self):
        """Courier B cannot perform arrived-at-shop or pickup on Courier A's delivery."""
        self.delivery.delivery_agent = self.courier_a
        self.delivery.delivery_status = Delivery.DeliveryStatus.ASSIGNED
        self.delivery.save()

        self.client.force_authenticate(user=self.courier_b)
        url = f"/api/deliveries/{self.delivery.id}/arrived-at-shop/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

        url_pickup = f"/api/deliveries/{self.delivery.id}/pickup/"
        response_pickup = self.client.post(url_pickup)
        self.assertEqual(response_pickup.status_code, status.HTTP_403_FORBIDDEN)

    def test_invalid_pickup_transition_rejected(self):
        """Status transitions must follow valid workflow; e.g. picking up a delivered order is rejected."""
        self.delivery.delivery_agent = self.courier_a
        self.delivery.delivery_status = Delivery.DeliveryStatus.DELIVERED
        self.delivery.save()

        self.client.force_authenticate(user=self.courier_a)
        url = f"/api/deliveries/{self.delivery.id}/arrived-at-shop/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_pickup_after_arrived_at_shop(self):
        """Transition from ARRIVED_AT_SHOP to PICKED_UP works successfully."""
        self.delivery.delivery_agent = self.courier_a
        self.delivery.delivery_status = Delivery.DeliveryStatus.ARRIVED_AT_SHOP
        self.delivery.save()

        self.client.force_authenticate(user=self.courier_a)
        url = f"/api/deliveries/{self.delivery.id}/pickup/"
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.delivery.refresh_from_db()
        self.assertEqual(self.delivery.delivery_status, Delivery.DeliveryStatus.PICKED_UP)
        self.assertIsNotNone(self.delivery.picked_up_at)

    def test_nearby_shops_api(self):
        """Nearby shops endpoint returns shops with calculated distances when coords provided."""
        self.client.force_authenticate(user=self.student)
        url = f"/api/shops/nearby/?latitude=28.545000&longitude=77.192600&radius=5"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data.get("results", response.data)
        self.assertTrue(len(results) > 0)
        found_shop = next((s for s in results if s["id"] == self.shop.id), None)
        self.assertIsNotNone(found_shop)
        self.assertIsNotNone(found_shop.get("latitude"))
        self.assertIsNotNone(found_shop.get("longitude"))
        self.assertIn("distance_km", found_shop)

    def test_delivery_detail_contains_coordinates(self):
        """Delivery serializer returns both shop and student drop-off coordinates."""
        self.delivery.delivery_agent = self.courier_a
        self.delivery.save()

        self.client.force_authenticate(user=self.courier_a)
        url = f"/api/deliveries/{self.delivery.id}/"
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data
        self.assertEqual(float(data["shop_latitude"]), 28.545)
        self.assertEqual(float(data["shop_longitude"]), 77.1926)
        self.assertEqual(float(data["latitude"]), 28.5482)
        self.assertEqual(float(data["longitude"]), 77.1895)
