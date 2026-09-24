from decimal import Decimal
from django.utils import timezone
from django.db.models import Avg, Count, Sum, Max, Min, F, Q
from typing import Dict, Any, List, Optional
from datetime import timedelta

from products.models import Product, PriceAlert, Review
from inventory.models import Inventory
from orders.models import Order, OrderItem
from recommendations.utils.filters import filter_available_products


class ShoppingIntelligenceService:
    """
    Advanced Shopping Intelligence Service.
    Powers cross-shop price comparisons, in-stock alternatives,
    reorder cadence prediction, and price drop alerts.
    """

    @staticmethod
    def get_price_comparison(product_id: int) -> Dict[str, Any]:
        """
        Cross-shop price and availability comparison for an item.
        Searches all active campus shops for identical products (by name or SKU).
        """
        target_product = Product.objects.select_related('shop', 'category').filter(id=product_id).first()
        if not target_product:
            return {'success': False, 'message': 'Product not found'}

        # Find all active listings of the same product across active shops
        matching_products = Product.objects.filter(
            Q(name__iexact=target_product.name) | (Q(sku__isnull=False) & Q(sku__gt='') & Q(sku=target_product.sku)),
            is_active=True,
            shop__is_active=True
        ).select_related('shop', 'category')

        target_inv = Inventory.objects.filter(shop=target_product.shop, product=target_product, is_active=True).first()
        target_available = target_inv.available_stock if target_inv else 0

        comparison_list = []
        for prod in matching_products:
            inv = Inventory.objects.filter(shop=prod.shop, product=prod, is_active=True).first()
            available_stock = inv.available_stock if inv else 0

            # Calculate shop rating
            avg_rating = Review.objects.filter(shop=prod.shop).aggregate(avg=Avg('rating'))['avg']
            rating_val = round(float(avg_rating), 1) if avg_rating else 4.8

            price_val = float(prod.price)
            diff_val = round(price_val - float(target_product.price), 2)

            stock_status = 'OUT_OF_STOCK'
            if available_stock > 10:
                stock_status = 'IN_STOCK'
            elif available_stock > 0:
                stock_status = 'LOW_STOCK'

            # Check if pickup / delivery configured
            delivery_avail = getattr(prod.shop, 'is_delivery_enabled', True)
            pickup_avail = getattr(prod.shop, 'is_pickup_enabled', True)

            comparison_list.append({
                'product_id': prod.id,
                'is_current_product': (prod.id == target_product.id),
                'shop_id': prod.shop.id,
                'shop_name': prod.shop.name,
                'shop_address': getattr(prod.shop, 'address', '') or getattr(prod.shop, 'location', 'Campus Store'),
                'price': price_val,
                'price_difference': diff_val,
                'available_stock': available_stock,
                'stock_status': stock_status,
                'rating': rating_val,
                'delivery_available': delivery_avail,
                'pickup_available': pickup_avail,
                'is_best_price': False,
                'is_lowest_price': False,
            })

        # Sort comparison by price ascending, then in-stock
        comparison_list.sort(key=lambda x: (x['price'], -x['available_stock']))

        # Tag best available price (lowest price among in-stock shops)
        in_stock_items = [c for c in comparison_list if c['available_stock'] > 0]
        best_price = None
        best_shop = None
        potential_savings = 0.0

        if in_stock_items:
            in_stock_items[0]['is_best_price'] = True
            in_stock_items[0]['is_lowest_price'] = True
            best_price = in_stock_items[0]['price']
            best_shop = in_stock_items[0]['shop_name']
            if best_price < float(target_product.price):
                potential_savings = round(float(target_product.price) - best_price, 2)
        elif comparison_list:
            comparison_list[0]['is_best_price'] = True
            comparison_list[0]['is_lowest_price'] = True
            best_price = comparison_list[0]['price']
            best_shop = comparison_list[0]['shop_name']

        return {
            'success': True,
            'product_id': target_product.id,
            'target_product': {
                'id': target_product.id,
                'name': target_product.name,
                'brand': target_product.brand,
                'category': target_product.category.name,
                'shop_id': target_product.shop.id,
                'shop_name': target_product.shop.name,
                'current_price': float(target_product.price),
                'available_stock': target_available,
            },
            'best_price': best_price,
            'best_shop': best_shop,
            'potential_savings': potential_savings,
            'shops_compared_count': len(comparison_list),
            'comparison': comparison_list,
            'comparisons': comparison_list,
        }

    @staticmethod
    def get_product_alternatives(product_id: int, limit: int = 4) -> Dict[str, Any]:
        """
        Discovers in-stock alternatives when a product is low or out of stock.
        1. Exact identical product in other campus shops.
        2. Similar products within the same category from available shops.
        """
        target_product = Product.objects.select_related('shop', 'category').filter(id=product_id).first()
        if not target_product:
            return {'success': False, 'message': 'Product not found', 'alternatives': []}

        alternatives = []

        # 1. Exact identical item in other shops
        identical_qs = Product.objects.filter(
            Q(name__iexact=target_product.name) | (Q(sku__isnull=False) & Q(sku__gt='') & Q(sku=target_product.sku)),
            is_active=True,
            shop__is_active=True
        ).exclude(id=target_product.id).select_related('shop', 'category')

        for p in identical_qs:
            inv = Inventory.objects.filter(shop=p.shop, product=p, is_active=True).first()
            avail = inv.available_stock if inv else 0
            if avail > 0:
                price_diff = round(float(p.price) - float(target_product.price), 2)
                reason_str = f"Same product available at {p.shop.name}"
                if price_diff < 0:
                    reason_str += f" (₹{abs(price_diff):.2f} cheaper)"

                alternatives.append({
                    'product_id': p.id,
                    'name': p.name,
                    'brand': p.brand,
                    'price': float(p.price),
                    'price_difference': price_diff,
                    'shop_id': p.shop.id,
                    'shop_name': p.shop.name,
                    'available_stock': avail,
                    'in_stock': (avail > 0),
                    'match_type': 'IDENTICAL_OTHER_SHOP',
                    'reason': reason_str,
                })
                if len(alternatives) >= limit:
                    break

        # 2. Similar products in same category
        if len(alternatives) < limit:
            remaining = limit - len(alternatives)
            excluded_ids = [target_product.id] + [a['product_id'] for a in alternatives]
            similar_qs = Product.objects.filter(
                category=target_product.category,
                is_active=True,
                shop__is_active=True
            ).exclude(id__in=excluded_ids).select_related('shop', 'category')

            for p in similar_qs:
                inv = Inventory.objects.filter(shop=p.shop, product=p, is_active=True).first()
                avail = inv.available_stock if inv else 0
                if avail > 0:
                    price_diff = round(float(p.price) - float(target_product.price), 2)
                    reason_str = f"Similar {target_product.category.name} item in stock at {p.shop.name}"
                    if price_diff < 0:
                        reason_str = f"Similar item at lower price (₹{float(p.price):.2f}) at {p.shop.name}"

                    alternatives.append({
                        'product_id': p.id,
                        'name': p.name,
                        'brand': p.brand,
                        'price': float(p.price),
                        'price_difference': price_diff,
                        'shop_id': p.shop.id,
                        'shop_name': p.shop.name,
                        'available_stock': avail,
                        'match_type': 'SIMILAR_CATEGORY_ALTERNATIVE',
                        'reason': reason_str,
                    })
                    if len(alternatives) >= limit:
                        break

        # Sort alternatives: same product first, then lower price
        alternatives.sort(key=lambda x: (0 if x['match_type'] == 'SAME_PRODUCT_DIFFERENT_SHOP' else 1, x['price']))

        return {
            'success': True,
            'target_product_id': target_product.id,
            'count': len(alternatives),
            'alternatives': alternatives,
        }

    @staticmethod
    def get_enhanced_buy_again(user, limit: int = 8) -> List[Dict[str, Any]]:
        """
        Extends repeat purchase intelligence with:
        - Exact purchase frequency & total units
        - Historical purchase price vs current price (savings / price change indicator)
        - Student-specific reorder cadence prediction (e.g. buys notebooks every 30 days)
        - Alternate in-stock shops when previously used shop is out of stock.
        """
        if not user or not user.is_authenticated:
            return []

        # Find products purchased in completed orders
        items_qs = (
            OrderItem.objects.filter(
                order__customer=user,
                order__status=Order.Status.COMPLETED
            )
            .values('product_id')
            .annotate(
                purchase_count=Count('id'),
                total_units=Sum('quantity'),
                last_order_date=Max('order__created_at'),
                last_unit_price=Max('unit_price')
            )
            .order_by('-last_order_date')
        )

        if not items_qs:
            return []

        now = timezone.now()
        product_ids = [item['product_id'] for item in items_qs[:limit * 2]]
        products_map = {
            p.id: p for p in Product.objects.filter(id__in=product_ids).select_related('shop', 'category')
        }

        results = []
        for item_data in items_qs:
            prod_id = item_data['product_id']
            prod = products_map.get(prod_id)
            if not prod:
                continue

            purchase_count = item_data['purchase_count']
            last_date = item_data['last_order_date']
            days_ago = int((now - last_date).total_seconds() / 86400.0) if last_date else 0
            hist_price = float(item_data['last_unit_price'] or prod.price)
            curr_price = float(prod.price)
            price_diff = round(curr_price - hist_price, 2)

            # Check stock
            inv = Inventory.objects.filter(shop=prod.shop, product=prod, is_active=True).first()
            avail_stock = inv.available_stock if inv else 0
            is_in_stock = (avail_stock > 0 and prod.is_active and prod.shop.is_active)

            # Reorder Cadence Prediction
            due_for_reorder = False
            reorder_cadence_days = None
            reorder_reason = None

            if purchase_count >= 2:
                # Calculate average days between previous orders
                past_order_dates = list(
                    OrderItem.objects.filter(
                        order__customer=user,
                        product=prod,
                        order__status=Order.Status.COMPLETED
                    )
                    .order_by('order__created_at')
                    .values_list('order__created_at', flat=True)
                )

                if len(past_order_dates) >= 2:
                    intervals = []
                    for i in range(1, len(past_order_dates)):
                        diff = (past_order_dates[i] - past_order_dates[i-1]).total_seconds() / 86400.0
                        intervals.append(diff)
                    if intervals:
                        avg_interval = sum(intervals) / len(intervals)
                        reorder_cadence_days = round(avg_interval, 1)

                        # If elapsed time is near or past the typical interval
                        if days_ago >= avg_interval * 0.8:
                            due_for_reorder = True
                            reorder_reason = f"You usually buy this every {int(avg_interval)} days based on your reorder history (last bought {days_ago} days ago)"

            # Cheaper in-stock alternative across other shops
            better_price_alternative = None
            cheaper_alt = Product.objects.filter(
                Q(name__iexact=prod.name) | (Q(sku__isnull=False) & Q(sku__gt='') & Q(sku=prod.sku)),
                is_active=True,
                shop__is_active=True,
                price__lt=prod.price
            ).exclude(id=prod.id).select_related('shop').order_by('price').first()

            if cheaper_alt:
                cheaper_inv = Inventory.objects.filter(shop=cheaper_alt.shop, product=cheaper_alt, is_active=True).first()
                if cheaper_inv and cheaper_inv.available_stock > 0:
                    savings = float(prod.price) - float(cheaper_alt.price)
                    better_price_alternative = {
                        'product_id': cheaper_alt.id,
                        'shop_id': cheaper_alt.shop.id,
                        'shop_name': cheaper_alt.shop.name,
                        'price': float(cheaper_alt.price),
                        'savings_per_unit': round(savings, 2),
                        'available_stock': cheaper_inv.available_stock,
                    }

            # Alternative shop suggestion if out of stock
            alternative_shop = None
            if not is_in_stock:
                alt = Product.objects.filter(
                    Q(name__iexact=prod.name) | (Q(sku__isnull=False) & Q(sku__gt='') & Q(sku=prod.sku)),
                    is_active=True,
                    shop__is_active=True
                ).exclude(id=prod.id).select_related('shop').first()

                if alt:
                    alt_inv = Inventory.objects.filter(shop=alt.shop, product=alt, is_active=True).first()
                    if alt_inv and alt_inv.available_stock > 0:
                        alternative_shop = {
                            'product_id': alt.id,
                            'shop_id': alt.shop.id,
                            'shop_name': alt.shop.name,
                            'price': float(alt.price),
                            'available_stock': alt_inv.available_stock,
                        }

            results.append({
                'product_id': prod.id,
                'name': prod.name,
                'brand': prod.brand,
                'category_name': prod.category.name,
                'shop_id': prod.shop.id,
                'shop_name': prod.shop.name,
                'current_price': curr_price,
                'previous_price': hist_price,
                'price_difference': price_diff,
                'price_change_display': (
                    f"₹{abs(price_diff):.2f} cheaper than last order" if price_diff < 0
                    else f"₹{price_diff:.2f} higher than last order" if price_diff > 0
                    else "Same as last purchased price"
                ),
                'available_stock': avail_stock,
                'is_in_stock': is_in_stock,
                'purchase_count': purchase_count,
                'total_purchased_count': purchase_count,
                'last_purchased_date': last_date.strftime('%b %d, %Y') if last_date else None,
                'days_ago': days_ago,
                'due_for_reorder': due_for_reorder,
                'reorder_cadence_days': reorder_cadence_days,
                'reorder_reason': reorder_reason,
                'reorder_cadence_note': reorder_reason or "",
                'better_price_alternative': better_price_alternative,
                'alternative_shop': alternative_shop,
            })

            if len(results) >= limit:
                break

        # Sort: items due for reorder first, then frequency
        results.sort(key=lambda x: (0 if x['due_for_reorder'] else 1, -x['purchase_count']))
        return results

    # Backward-compatible alias
    get_buy_again_items = get_enhanced_buy_again

    @staticmethod
    def create_price_alert(user, product: Product, target_price: Optional[Decimal] = None, alert_on_restock: bool = True) -> PriceAlert:
        """
        Subscribes a student to price drop or restock events for a product.
        """
        alert, _ = PriceAlert.objects.update_or_create(
            user=user,
            product=product,
            defaults={
                'target_price': target_price or (product.price * Decimal('0.90')),  # default 10% drop target
                'initial_price': product.price,
                'alert_on_restock': alert_on_restock,
                'is_active': True,
                'is_triggered': False,
            }
        )
        return alert

    @staticmethod
    def check_and_trigger_price_alerts(product: Product) -> int:
        """
        Scans active PriceAlerts for this product and sends notifications to students
        whose target_price condition is satisfied by the new price.
        """
        from notifications.models import Notification
        active_alerts = PriceAlert.objects.filter(
            product=product,
            is_active=True,
            is_triggered=False
        )
        notified_count = 0
        now = timezone.now()

        for alert in active_alerts:
            should_notify = False
            if alert.target_price and product.price <= alert.target_price:
                should_notify = True
                msg = f"Price drop alert! '{product.name}' is now available at ₹{product.price} (your target was ₹{alert.target_price})."
            elif alert.alert_on_restock:
                inv = Inventory.objects.filter(shop=product.shop, product=product, is_active=True).first()
                if inv and inv.available_stock > 0:
                    should_notify = True
                    msg = f"Restock alert! '{product.name}' is now in stock at {product.shop.name} for ₹{product.price}."

            if should_notify:
                alert.is_active = False
                alert.is_triggered = True
                alert.triggered_at = now
                alert.save(update_fields=['is_active', 'is_triggered', 'triggered_at'])

                try:
                    Notification.objects.create(
                        recipient=alert.user,
                        title="Stationery Price Alert",
                        message=msg,
                        notification_type=Notification.NotificationType.GENERAL,
                        reference_id=str(product.id)
                    )
                except Exception:
                    pass
                notified_count += 1

        return notified_count
