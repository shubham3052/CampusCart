from django.utils import timezone
from django.db.models import Sum, Count, Max
from typing import List, Dict, Any, Optional

from orders.models import Order, OrderItem
from products.models import Product
from inventory.models import Inventory
from recommendations.utils.scoring import exponential_recency_decay
from recommendations.utils.filters import filter_available_products, find_in_stock_alternatives
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason


def get_buy_again_recommendations(
    user,
    limit: int = 6,
    halflife_days: float = 30.0
) -> List[Dict[str, Any]]:
    """
    Computes dedicated BUY AGAIN repeat-purchase recommendations for an authenticated student.
    Ranks previously purchased products by:
    - Purchase count
    - Recency exponential decay weight
    
    Formula:
        Score = min(1.0, (0.4 * min(5, purchase_count) / 5.0) + (0.6 * decay_weight))
    """
    if not user or not user.is_authenticated:
        return []

    # 1. Fetch completed items for this student
    items_qs = (
        OrderItem.objects.filter(
            order__customer=user,
            order__status=Order.Status.COMPLETED
        )
        .values('product_id')
        .annotate(
            total_purchases=Count('id'),
            total_units=Sum('quantity'),
            last_order_date=Max('order__created_at')
        )
        .order_by('-last_order_date')
    )

    if not items_qs:
        return []

    now = timezone.now()
    product_ids = [item['product_id'] for item in items_qs]
    products_by_id = {
        p.id: p for p in Product.objects.filter(id__in=product_ids).select_related('shop', 'category')
    }

    scored_items = []
    for item in items_qs:
        p_id = item['product_id']
        prod = products_by_id.get(p_id)
        if not prod:
            continue

        p_count = item['total_purchases']
        last_date = item['last_order_date']
        days_ago = (now - last_date).total_seconds() / 86400.0 if last_date else 30.0

        decay = exponential_recency_decay(days_ago, halflife_days=halflife_days)
        count_factor = min(5.0, float(p_count)) / 5.0
        score = (0.4 * count_factor) + (0.6 * decay)

        scored_items.append((prod, score, p_count, last_date))

    # Sort descending by score
    scored_items.sort(key=lambda x: x[1], reverse=True)

    results = []
    for prod, score, count, last_dt in scored_items[:limit]:
        inv = Inventory.objects.filter(product=prod, shop=prod.shop, is_active=True).first()
        available_stock = inv.available_stock if inv else 0
        is_available = available_stock > 0 and prod.is_active and prod.shop.is_active

        alternatives = []
        if not is_available:
            alternatives = find_in_stock_alternatives(prod, limit=2)

        last_date_str = last_dt.strftime('%b %d, %Y') if last_dt else None
        reason = generate_recommendation_reason(
            ReasonCode.BUY_AGAIN,
            {'purchase_count': count, 'last_purchased_date': last_date_str}
        )

        results.append({
            'id': prod.id,
            'product_id': prod.id,
            'name': prod.name,
            'price': float(prod.price),
            'brand': prod.brand,
            'category_id': prod.category.id,
            'category_name': prod.category.name,
            'shop_id': prod.shop.id,
            'shop_name': prod.shop.name,
            'image_url': prod.image.url if prod.image else None,
            'available_stock': available_stock,
            'is_available': is_available,
            'alternatives': alternatives,
            'recommendation_type': 'BUY_AGAIN',
            'score': round(float(score), 4),
            'reason_code': ReasonCode.BUY_AGAIN,
            'reason_text': reason,
            'metrics': {
                'purchase_count': count,
                'last_purchased': last_date_str,
            }
        })

    return results


def get_user_preferred_categories(user, limit: int = 3) -> List[int]:
    """
    Returns the IDs of the top categories most frequently ordered by the student.
    """
    if not user or not user.is_authenticated:
        return []

    top_cats = (
        OrderItem.objects.filter(
            order__customer=user,
            order__status=Order.Status.COMPLETED
        )
        .values('product__category_id')
        .annotate(cat_count=Count('id'))
        .order_by('-cat_count')
    )
    return [c['product__category_id'] for c in top_cats[:limit] if c['product__category_id']]
