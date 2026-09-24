from datetime import date, time, timedelta
from decimal import Decimal
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from django.contrib.auth import get_user_model

from users.models import User
from shops.models import Shop
from products.models import Product, Category
from orders.models import Order, OrderItem, OTPVerification
from delivery.models import (
    StudentAddress,
    Delivery,
    DeliverySlot,
    DeliveryZone,
    DeliveryAttempt,
)

User = get_user_model()


class Step14DeliverySystemTests(APITestCase):
    def setUp(self):
        # Create users
        self.student = User.objects.create_user(
            username="student_rahul",
            email="rahul@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Rahul Sharma",
            phone_number="9876543210",
        )
        self.other_student = User.objects.create_user(
            username="student_priya",
            email="priya@campus.edu",
            password="TestPassword123!",
            role=User.Role.STUDENT,
            name="Priya Patel",
            phone_number="9876543211",
        )
        self.shop_owner = User.objects.create_user(
            username="shop_owner_ramesh",
            email="ramesh@campus.edu",
            password="TestPassword123!",
            role=User.Role.SHOP_OWNER,
            name="Ramesh Gupta",
            phone_number="9876543212",
        )
        self.courier = User.objects.create_user(
            username="courier_aman",
            email="aman@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Aman Kumar",
            phone_number="9876543213",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )
        self.other_courier = User.objects.create_user(
            username="courier_ravi",
            email="ravi@campus.edu",
            password="TestPassword123!",
            role=User.Role.DELIVERY_AGENT,
            name="Ravi Teja",
            phone_number="9876543214",
            availability_status=User.AvailabilityStatus.AVAILABLE,
        )
        self.admin = User.objects.create_user(
            username="admin_super",
            email="admin@campus.edu",
            password="TestPassword123!",
            role=User.Role.ADMIN,
            name="Super Admin",
            phone_number="9876543215",
            is_staff=True,
            is_superuser=True,
        )

        # Create shop
        self.shop = Shop.objects.create(
            owner=self.shop_owner,
            name="Central Campus Stationery",
            slug="central-campus-stationery",
            address="Academic Block 1",
            campus_location="Academic Block 1",
            contact_phone="9876543212",
            is_active=True,
        )

        # Create category and product
        self.category = Category.objects.create(
            name="Notebooks",
            slug="notebooks",
            description="Standard notebooks"
        )
        self.product = Product.objects.create(
            shop=self.shop,
            category=self.category,
            name="Classmate 200pg Ruled",
            slug="classmate-200pg-ruled",
            sku="NB-CLASSMATE-001",
            price=Decimal("60.00"),
            is_active=True,
        )
        from inventory.models import Inventory
        Inventory.objects.create(
            shop=self.shop,
            product=self.product,
            current_stock=100,
        )

        # Create student address
        self.address = StudentAddress.objects.create(
            user=self.student,
            label="Hostel Room",
            recipient_name="Rahul Sharma",
            hostel_block="Mandakini Hostel",
            room_number="Room 304",
            phone_number="9876543210",
            is_default=True,
        )

        # Create delivery slot
        self.today = date.today()
        self.slot = DeliverySlot.objects.create(
            shop=self.shop,
            date=self.today,
            start_time=time(10, 0),
            end_time=time(11, 0),
            capacity=5,
            booked_count=0,
            is_active=True,
        )

        # Create delivery zone
        self.zone = DeliveryZone.objects.create(
            shop=self.shop,
            name="Hostel Core Zone",
            minimum_distance=Decimal("0.0"),
            maximum_distance=Decimal("2.5"),
            base_charge=Decimal("15.00"),
            free_delivery_threshold=Decimal("250.00"),
            is_active=True,
        )

    # -------------------------------------------------------------------------
    # PART 8 & 9: ADDRESS MANAGEMENT & OWNERSHIP ISOLATION
    # -------------------------------------------------------------------------
    def test_student_address_crud_and_isolation(self):
        # 1. Student creates address
        self.client.force_authenticate(user=self.student)
        create_res = self.client.post("/api/addresses/", {
            "label": "Library Cubicle",
            "recipient_name": "Rahul S.",
            "hostel_block": "Central Library",
            "room_number": "Desk 12",
            "phone_number": "9876543210",
            "is_default": False,
        })
        self.assertEqual(create_res.status_code, status.HTTP_201_CREATED)
        new_address_id = create_res.data["id"]

        # 2. Student lists addresses
        list_res = self.client.get("/api/addresses/")
        self.assertEqual(list_res.status_code, status.HTTP_200_OK)
        res_data = list_res.data if isinstance(list_res.data, list) else list_res.data.get("results", [])
        ids = [a["id"] for a in res_data]
        self.assertIn(new_address_id, ids)

        # 3. Other student cannot access or delete Rahul's address
        self.client.force_authenticate(user=self.other_student)
        other_list = self.client.get("/api/addresses/")
        other_data = other_list.data if isinstance(other_list.data, list) else other_list.data.get("results", [])
        other_ids = [a["id"] for a in other_data]
        self.assertNotIn(new_address_id, other_ids)

        del_res = self.client.delete(f"/api/addresses/{new_address_id}/")
        self.assertEqual(del_res.status_code, status.HTTP_404_NOT_FOUND)

    # -------------------------------------------------------------------------
    # PART 10, 11, 12: BACKEND AUTHORITATIVE DELIVERY CHARGE CALCULATION
    # -------------------------------------------------------------------------
    def test_backend_authoritative_delivery_charge(self):
        # Below threshold (INR 120 < INR 250) -> standard charge (INR 15)
        calc_res = self.client.get("/api/deliveries/calculate-charge/?subtotal=120.00")
        self.assertEqual(calc_res.status_code, status.HTTP_200_OK)
        self.assertEqual(calc_res.data["delivery_charge"], 15.0)
        self.assertFalse(calc_res.data["is_free"])

        # Above threshold (INR 300 >= INR 250) -> free delivery (INR 0.0)
        calc_res_free = self.client.get("/api/deliveries/calculate-charge/?subtotal=300.00")
        self.assertEqual(calc_res_free.status_code, status.HTTP_200_OK)
        self.assertEqual(calc_res_free.data["delivery_charge"], 0.0)
        self.assertTrue(calc_res_free.data["is_free"])

    # -------------------------------------------------------------------------
    # PART 13 & 14: DELIVERY SLOTS & CAPACITY CONCURRENCY PROTECTION
    # -------------------------------------------------------------------------
    def test_delivery_slot_capacity_and_available_slots(self):
        self.client.force_authenticate(user=self.student)

        # Slot with capacity 1
        tight_slot = DeliverySlot.objects.create(
            shop=self.shop,
            date=self.today + timedelta(days=1),
            start_time=time(14, 0),
            end_time=time(15, 0),
            capacity=1,
            booked_count=1,  # Already full
            is_active=True,
        )

        avail_res = self.client.get(f"/api/delivery-slots/available/?shop={self.shop.id}&date={tight_slot.date}")
        self.assertEqual(avail_res.status_code, status.HTTP_200_OK)
        slots = avail_res.data if isinstance(avail_res.data, list) else avail_res.data.get("results", [])
        slot_ids = [s["id"] for s in slots]
        self.assertNotIn(tight_slot.id, slot_ids)  # Full slot is excluded

    # -------------------------------------------------------------------------
    # PART 2, 3, 6, 7: DELIVERY ORDER CREATION & LIFECYCLE TRANSITIONS
    # -------------------------------------------------------------------------
    def test_delivery_order_full_lifecycle(self):
        # 1. Student places a DELIVERY order
        self.client.force_authenticate(user=self.student)
        order_res = self.client.post("/api/orders/", {
            "shop": self.shop.id,
            "fulfillment_type": "DELIVERY",
            "payment_method": "COD",
            "delivery_address": "Mandakini Hostel, Room 304",
            "hostel_block": "Mandakini Hostel",
            "room_number": "Room 304",
            "delivery_slot": self.slot.id,
            "order_notes": "Please call at hostel gate",
            "items": [
                {"product_id": self.product.id, "quantity": 2}
            ],
        }, format='json')
        self.assertEqual(order_res.status_code, status.HTTP_201_CREATED, order_res.data)
        order_id = order_res.data["order"]["id"]

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.fulfillment_type, Order.FulfillmentType.DELIVERY)
        self.assertIsNotNone(order.delivery_slot)

        # Confirm Delivery model created with PENDING status
        delivery = Delivery.objects.get(order=order)
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.PENDING)

        # 2. Shop Owner assigns Courier (PART 6)
        self.client.force_authenticate(user=self.shop_owner)
        assign_res = self.client.post(f"/api/deliveries/{delivery.id}/assign/", {
            "delivery_agent_id": self.courier.id,
            "notes": "Handle with care",
        })
        self.assertEqual(assign_res.status_code, status.HTTP_200_OK)
        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.ASSIGNED)
        self.assertEqual(delivery.delivery_agent, self.courier)

        # 3. Admin reassigns Courier (PART 7)
        self.client.force_authenticate(user=self.admin)
        reassign_res = self.client.post(f"/api/deliveries/{delivery.id}/reassign/", {
            "delivery_agent_id": self.other_courier.id,
        })
        self.assertEqual(reassign_res.status_code, status.HTTP_200_OK)
        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_agent, self.other_courier)

        # Reassign back to courier for rest of test
        self.client.post(f"/api/deliveries/{delivery.id}/assign/", {
            "delivery_agent_id": self.courier.id,
        })
        delivery.refresh_from_db()

        # 4. Courier marks PICKED_UP (PART 3)
        self.client.force_authenticate(user=self.courier)
        pickup_res = self.client.post(f"/api/deliveries/{delivery.id}/pickup/")
        self.assertEqual(pickup_res.status_code, status.HTTP_200_OK)
        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.PICKED_UP)

        # 5. Courier marks OUT_FOR_DELIVERY -> Generates Delivery OTP (PART 16 & 17)
        out_res = self.client.post(f"/api/deliveries/{delivery.id}/out-for-delivery/", {
            "estimated_minutes": 20
        })
        self.assertEqual(out_res.status_code, status.HTTP_200_OK)
        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.OUT_FOR_DELIVERY)

        # 6. Courier marks ARRIVING
        arriving_res = self.client.post(f"/api/deliveries/{delivery.id}/arriving/")
        self.assertEqual(arriving_res.status_code, status.HTTP_200_OK)
        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.ARRIVING)

        # 7. Student retrieves delivery OTP (PART 17)
        self.client.force_authenticate(user=self.student)
        otp_res = self.client.get(f"/api/deliveries/{delivery.id}/delivery-otp/")
        self.assertEqual(otp_res.status_code, status.HTTP_200_OK)
        otp_code = otp_res.data["otp"]
        self.assertEqual(len(otp_code), 6)

        # Other student cannot view OTP (hidden via 404 or rejected with 403)
        self.client.force_authenticate(user=self.other_student)
        forbidden_otp = self.client.get(f"/api/deliveries/{delivery.id}/delivery-otp/")
        self.assertIn(forbidden_otp.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # 8. Courier verifies OTP at doorstep (PART 18 & 19)
        self.client.force_authenticate(user=self.courier)
        verify_res = self.client.post(f"/api/deliveries/{delivery.id}/verify-otp/", {
            "otp": otp_code,
            "delivery_notes": "Handed to Rahul at hostel gate",
        })
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)

        # Assert final atomic states
        delivery.refresh_from_db()
        order.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.DELIVERED)
        self.assertEqual(order.status, Order.Status.COMPLETED)
        self.assertEqual(order.payment_status, Order.PaymentStatus.PAID)

        # OTP cannot be reused
        reuse_res = self.client.post(f"/api/deliveries/{delivery.id}/verify-otp/", {
            "otp": otp_code,
        })
        self.assertEqual(reuse_res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------------------
    # PART 23, 24, 25: FAILED DELIVERY & RESCHEDULING
    # -------------------------------------------------------------------------
    def test_failed_delivery_and_rescheduling(self):
        # Order setup
        order = Order.objects.create(
            customer=self.student,
            shop=self.shop,
            fulfillment_type=Order.FulfillmentType.DELIVERY,
            delivery_address="Hostel Block 3",
            delivery_slot=self.slot,
            subtotal=Decimal("120.00"),
            delivery_fee=Decimal("15.00"),
            total_amount=Decimal("135.00"),
            status=Order.Status.CONFIRMED,
        )
        delivery = Delivery.objects.create(
            order=order,
            delivery_agent=self.courier,
            delivery_status=Delivery.DeliveryStatus.OUT_FOR_DELIVERY,
            delivery_address="Hostel Block 3",
            delivery_slot=self.slot,
        )

        # 1. Courier reports failure
        self.client.force_authenticate(user=self.courier)
        fail_res = self.client.post(f"/api/deliveries/{delivery.id}/failed/", {
            "reason": "CUSTOMER_UNAVAILABLE",
            "notes": "Student room locked, phone switched off",
        })
        self.assertEqual(fail_res.status_code, status.HTTP_200_OK)

        delivery.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.FAILED)
        self.assertEqual(delivery.failure_reason, "CUSTOMER_UNAVAILABLE")
        self.assertEqual(delivery.attempt_count, 1)

        # Check DeliveryAttempt audit entry
        attempt = DeliveryAttempt.objects.filter(delivery=delivery).first()
        self.assertIsNotNone(attempt)
        self.assertEqual(attempt.status, "FAILED")
        self.assertEqual(attempt.reason, "CUSTOMER_UNAVAILABLE")

        # 2. Reschedule to a new delivery slot
        new_slot = DeliverySlot.objects.create(
            shop=self.shop,
            date=self.today + timedelta(days=1),
            start_time=time(16, 0),
            end_time=time(17, 0),
            capacity=5,
            booked_count=0,
            is_active=True,
        )

        self.client.force_authenticate(user=self.student)
        resched_res = self.client.post(f"/api/deliveries/{delivery.id}/reschedule/", {
            "delivery_slot_id": new_slot.id,
        })
        self.assertEqual(resched_res.status_code, status.HTTP_200_OK)

        delivery.refresh_from_db()
        new_slot.refresh_from_db()
        self.assertEqual(delivery.delivery_status, Delivery.DeliveryStatus.RESCHEDULED)
        self.assertEqual(delivery.delivery_slot, new_slot)
        self.assertEqual(new_slot.booked_count, 1)

    # -------------------------------------------------------------------------
    # PART 4 & 5: COURIER AVAILABILITY SHIFT STATUS
    # -------------------------------------------------------------------------
    def test_courier_availability_toggle(self):
        self.client.force_authenticate(user=self.courier)
        toggle_res = self.client.post("/api/deliveries/toggle-availability/", {
            "availability_status": "BUSY"
        })
        self.assertEqual(toggle_res.status_code, status.HTTP_200_OK)
        self.courier.refresh_from_db()
        self.assertEqual(self.courier.availability_status, User.AvailabilityStatus.BUSY)

        # Unauthorized user (student) cannot toggle courier availability
        self.client.force_authenticate(user=self.student)
        forbidden_res = self.client.post("/api/deliveries/toggle-availability/", {
            "availability_status": "OFFLINE"
        })
        self.assertEqual(forbidden_res.status_code, status.HTTP_403_FORBIDDEN)
