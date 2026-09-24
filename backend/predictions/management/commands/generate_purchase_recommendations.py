"""
Management command: generate_purchase_recommendations
Generates explainable, statistical purchase recommendations for campus stationery stores.
Integrates Step 17 demand forecasts, real demand variability, supplier lead times, and MOQ constraints.
"""

from decimal import Decimal
from django.core.management.base import BaseCommand
from django.utils import timezone

from shops.models import Shop
from inventory.models import Inventory
from predictions.models import PurchaseRecommendation
from predictions.purchase_advisor import (
    generate_recommendation_for_inventory,
    save_or_update_recommendation,
)
from notifications.models import Notification


class Command(BaseCommand):
    help = 'Computes statistical safety stock and generates intelligent purchase recommendations for campus shops.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--shop-id',
            type=int,
            default=None,
            help='Filter calculation to a specific Shop ID'
        )
        parser.add_argument(
            '--horizon',
            type=str,
            default='30',
            choices=['7', '30'],
            help='Planning horizon days (7 or 30). Default: 30'
        )
        parser.add_argument(
            '--service-level',
            type=float,
            default=0.95,
            help='Target service level (e.g. 0.90, 0.95, 0.99). Default: 0.95'
        )
        parser.add_argument(
            '--notify',
            action='store_true',
            help='Dispatch in-app notifications to shopkeepers for critical stockout risks'
        )

    def handle(self, *args, **options):
        shop_id = options.get('shop_id')
        horizon_days = options.get('horizon')
        service_level = options.get('service_level')
        dispatch_notify = options.get('notify')

        planning_horizon = '30_DAYS' if horizon_days == '30' else '7_DAYS'

        self.stdout.write("=" * 70)
        self.stdout.write("[*] SMART PURCHASE ADVISOR: GENERATING REORDER RECOMMENDATIONS")
        self.stdout.write(f"    Horizon: {planning_horizon} | Service Level: {int(service_level * 100)}%")
        self.stdout.write("=" * 70)

        shops_qs = Shop.objects.all()
        if shop_id:
            shops_qs = shops_qs.filter(id=shop_id)

        if not shops_qs.exists():
            self.stdout.write(self.style.WARNING("[!] No matching active shops found."))
            return

        total_processed = 0
        total_reorders = 0
        total_critical = 0
        total_high = 0
        total_cost = Decimal('0.00')
        notifications_sent = 0

        for shop in shops_qs:
            self.stdout.write(f"\n[-] Processing Shop #{shop.id}: '{shop.name}'")
            inventories = Inventory.objects.filter(shop=shop, is_active=True).select_related('product', 'product__category')

            if not inventories.exists():
                self.stdout.write(f"    No inventory records found for shop '{shop.name}'.")
                continue

            shop_reorders = 0
            shop_cost = Decimal('0.00')

            for inv in inventories:
                total_processed += 1
                rec_data = generate_recommendation_for_inventory(
                    inventory=inv,
                    planning_horizon=planning_horizon,
                    service_level=service_level
                )

                rec_obj = save_or_update_recommendation(rec_data)

                if rec_obj.recommended_quantity > 0:
                    shop_reorders += 1
                    total_reorders += 1
                    shop_cost += rec_obj.estimated_purchase_cost
                    total_cost += rec_obj.estimated_purchase_cost

                if rec_obj.priority == PurchaseRecommendation.Priority.CRITICAL:
                    total_critical += 1
                elif rec_obj.priority == PurchaseRecommendation.Priority.HIGH:
                    total_high += 1

                # Optional notification dispatch for critical items
                if dispatch_notify and shop.owner:
                    if rec_obj.priority == PurchaseRecommendation.Priority.CRITICAL or rec_obj.stockout_risk == PurchaseRecommendation.StockoutRisk.HIGH:
                        Notification.objects.create(
                            recipient=shop.owner,
                            title=f"[CRITICAL STOCK] Reorder Needed: {inv.product.name}",
                            message=(
                                f"Product '{inv.product.name}' is critically low (Available: {rec_obj.available_stock}). "
                                f"Smart Advisor recommends ordering {rec_obj.recommended_quantity} units from {rec_obj.supplier.name if rec_obj.supplier else 'Vendor'}."
                            ),
                            notification_type=Notification.NotificationType.RESTOCK_RECOMMENDATION,
                            reference_id=f"REC-{rec_obj.id}"
                        )
                        notifications_sent += 1

                prefix = "[REORDER]" if rec_obj.recommended_quantity > 0 else "[ADEQUATE]"
                self.stdout.write(
                    f"    {prefix} {inv.product.name[:25]:<25} | Stock: {rec_obj.available_stock:>3} | "
                    f"ROP: {rec_obj.reorder_point:>3} | SS: {rec_obj.safety_stock:>2} | "
                    f"Rec: {rec_obj.recommended_quantity:>3} | Priority: {rec_obj.priority:<8}"
                )

            self.stdout.write(
                f"    [OK] Shop '{shop.name}' Complete: {shop_reorders} item(s) require reorder | Est. Cost: Rs. {shop_cost:.2f}"
            )

        self.stdout.write("\n" + "=" * 70)
        self.stdout.write("[OK] RECOMMENDATION GENERATION SUMMARY")
        self.stdout.write(f"    Total Products Evaluated: {total_processed}")
        self.stdout.write(f"    Items Requiring Reorder:  {total_reorders}")
        self.stdout.write(f"    Critical Priority Items:  {total_critical}")
        self.stdout.write(f"    High Priority Items:      {total_high}")
        self.stdout.write(f"    Total Estimated Spend:    Rs. {total_cost:.2f}")
        if dispatch_notify:
            self.stdout.write(f"    Notifications Dispatched: {notifications_sent}")
        self.stdout.write("=" * 70)
