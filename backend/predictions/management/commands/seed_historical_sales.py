"""
backend/predictions/management/commands/seed_historical_sales.py
DEMO ONLY - Provides a clearly isolated mechanism to generate realistic historical sales transactions
over a 60-90 day window to demonstrate the Step 17 machine learning demand prediction pipeline.

Can be completely cleared at any time via:
    python manage.py seed_historical_sales --clear
"""

import random
import uuid
from datetime import datetime, timedelta, time
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import transaction

from users.models import User
from shops.models import Shop
from products.models import Product
from orders.models import Order, OrderItem
from inventory.models import Inventory, InventoryTransaction

DEMO_TAG = "DEMO_SALES_STEP17"


class Command(BaseCommand):
    help = "DEMO ONLY: Seeds realistic historical campus sales over 60-90 days for ML training demonstration."

    def add_arguments(self, parser):
        parser.add_argument('--shop-id', type=int, help='Target shop ID (defaults to first active shop).')
        parser.add_argument('--days', type=int, default=60, help='Number of historical days to generate (default: 60).')
        parser.add_argument('--clear', action='store_true', help='Clear all demo sales records previously generated.')

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE("================================================================"))
        self.stdout.write(self.style.NOTICE("[!] DEMO HISTORICAL SALES SEEDER [DEVELOPMENT / DEMO ONLY]"))
        self.stdout.write(self.style.NOTICE("================================================================"))

        if options.get('clear'):
            demo_orders = Order.objects.filter(order_notes__contains=DEMO_TAG)
            count = demo_orders.count()
            # Cascade deletes OrderItems
            demo_orders.delete()
            self.stdout.write(self.style.SUCCESS(f"[OK] Cleared {count} demo orders and their associated order items."))
            return

        days_back = options.get('days', 60)
        shop_id = options.get('shop_id')

        if shop_id:
            shop = Shop.objects.filter(id=shop_id).first()
        else:
            shop = Shop.objects.filter(is_active=True).first()

        if not shop:
            self.stdout.write(self.style.ERROR("[ERROR] No active shop found to seed sales for."))
            return

        products = list(Product.objects.filter(shop=shop, is_active=True)[:10])
        if not products:
            self.stdout.write(self.style.ERROR(f"[ERROR] Shop '{shop.name}' has no active products. Add products first."))
            return

        # Find or create a student demo buyer
        student_user = User.objects.filter(role=User.Role.STUDENT).first()
        if not student_user:
            student_user = User.objects.create_user(
                username='demo_student_buyer',
                email='demobuyer@campus.edu',
                role=User.Role.STUDENT,
                name='Campus Demo Student'
            )

        self.stdout.write(f"Target Shop: {shop.name} (ID: {shop.id})")
        self.stdout.write(f"Products ({len(products)}): {', '.join([p.name for p in products[:5]])}...")
        self.stdout.write(f"Seeding historical sales across past {days_back} days...")

        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days_back)

        created_orders = 0
        created_items = 0

        # Base daily volumes per product with realistic weekday seasonality
        with transaction.atomic():
            curr_date = start_date
            while curr_date < end_date:
                is_weekend = curr_date.weekday() in [5, 6]
                # Weekdays have higher demand, weekends slightly lower
                demand_multiplier = 0.6 if is_weekend else (1.3 if curr_date.weekday() in [0, 1] else 1.0)

                # Generate 2 to 6 realistic customer orders per day
                daily_orders_count = random.randint(1, 3) if is_weekend else random.randint(3, 7)

                for _ in range(daily_orders_count):
                    # Random time during shop operating hours
                    order_time = time(random.randint(9, 18), random.randint(0, 59))
                    order_datetime = timezone.make_aware(datetime.combine(curr_date, order_time))

                    order = Order.objects.create(
                        order_number=str(uuid.uuid4()),
                        customer=student_user,
                        shop=shop,
                        order_type=Order.OrderType.STATIONERY,
                        fulfillment_type=Order.FulfillmentType.PICKUP,
                        status=Order.Status.COMPLETED,
                        payment_status=Order.PaymentStatus.PAID,
                        payment_method=Order.PaymentMethod.UPI,
                        order_notes=f"{DEMO_TAG}: Historical student purchase",
                    )
                    # Override created_at for historical timestamping
                    Order.objects.filter(id=order.id).update(created_at=order_datetime)

                    # Select 1 to 3 items per order
                    selected_products = random.sample(products, k=min(len(products), random.randint(1, 3)))
                    order_subtotal = Decimal('0.00')

                    for prod in selected_products:
                        # Realistic quantity per item (1 to 6 pens/notebooks)
                        qty = max(1, int(round(random.randint(1, 4) * demand_multiplier)))
                        unit_p = prod.price if prod.price > 0 else Decimal('25.00')
                        line_total = unit_p * qty
                        order_subtotal += line_total

                        OrderItem.objects.create(
                            order=order,
                            product=prod,
                            quantity=qty,
                            unit_price=unit_p,
                            total_price=line_total
                        )
                        created_items += 1

                    Order.objects.filter(id=order.id).update(
                        subtotal=order_subtotal,
                        total_amount=order_subtotal
                    )
                    created_orders += 1

                curr_date += timedelta(days=1)

        self.stdout.write(self.style.SUCCESS(
            f"[OK] Seeded {created_orders} completed orders with {created_items} order items across {days_back} days.\n"
            f"   Tag: '{DEMO_TAG}' (easy to clean via --clear).\n"
            f"   Now run: python manage.py train_demand_model --shop-id={shop.id}"
        ))
