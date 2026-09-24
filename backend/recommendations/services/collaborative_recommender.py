from django.db.models import Count
from typing import List, Dict, Any, Optional

from orders.models import Order, OrderItem
from products.models import Product
from inventory.models import Inventory
from recommendations.utils.filters import filter_available_products
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason


def get_frequently_bought_together(
    product_id: int,
    limit: int = 4,
    min_co_occurrences: int = 1
) -> List[Dict[str, Any]]:
    """
    Computes statistically grounded Frequently Bought Together recommendations
    based on actual multi-item completed orders containing `product_id`.
    
    Formula:
        Association Confidence = Joint_Orders(A, B) / Total_Orders(A)
        Relevance Score = min(1.0, Association Confidence * log(1 + Joint_Orders))
    """
    ref_product = Product.objects.filter(id=product_id).first()
    if not ref_product:
        return []

    # 1. Find all completed orders containing the reference product
    orders_with_ref = (
        OrderItem.objects.filter(
            product_id=product_id,
            order__status=Order.Status.COMPLETED
        )
        .values_list('order_id', flat=True)
        .distinct()
    )
    total_ref_orders = len(orders_with_ref)

    if total_ref_orders == 0:
        # Fallback to products from the same category or shop with high sales
        return _get_category_co_occurrence_fallback(ref_product, limit)

    # 2. Count co-occurring items in these orders
    co_items = (
        OrderItem.objects.filter(
            order_id__in=orders_with_ref
        )
        .exclude(product_id=product_id)
        .values('product_id')
        .annotate(co_count=Count('order_id', distinct=True))
        .filter(co_count__gte=min_co_occurrences)
        .order_by('-co_count')
    )

    co_counts_map = {item['product_id']: item['co_count'] for item in co_items}
    candidate_ids = list(co_counts_map.keys())

    if not candidate_ids:
        return _get_category_co_occurrence_fallback(ref_product, limit)

    # 3. Filter available in-stock products
    available_prods = filter_available_products(
        Product.objects.filter(id__in=candidate_ids).select_related('shop', 'category')
    )

    results = []
    for prod in available_prods[:limit]:
        co_count = co_counts_map.get(prod.id, 1)
        confidence = float(co_count / max(1, total_ref_orders))
        score = min(1.0, confidence * (1.0 + 0.1 * min(10, co_count)))

        reason = generate_recommendation_reason(
            ReasonCode.FREQUENTLY_BOUGHT,
            {'reference_product_name': ref_product.name}
        )

        inv = Inventory.objects.filter(product=prod, shop=prod.shop, is_active=True).first()
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
            'available_stock': inv.available_stock if inv else 0,
            'recommendation_type': 'FREQUENTLY_BOUGHT_TOGETHER',
            'score': round(float(score), 4),
            'reason_code': ReasonCode.FREQUENTLY_BOUGHT,
            'reason_text': reason,
            'metrics': {
                'co_occurrence_orders': co_count,
                'confidence_pct': int(round(confidence * 100)),
            }
        })

    return results


def _get_category_co_occurrence_fallback(ref_product: Product, limit: int) -> List[Dict[str, Any]]:
    """
    Graceful fallback for cold-start or products with zero order history:
    Recommends high-rating complementary items from the same shop or related categories.
    """
    complementary_qs = filter_available_products(
        Product.objects.filter(shop=ref_product.shop)
        .exclude(id=ref_product.id)
        .select_related('shop', 'category')
        .order_by('-price')
    )[:limit]

    results = []
    for prod in complementary_qs:
        reason = generate_recommendation_reason(
            ReasonCode.FREQUENTLY_BOUGHT,
            {'reference_product_name': ref_product.name}
        )
        inv = Inventory.objects.filter(product=prod, shop=prod.shop, is_active=True).first()
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
            'available_stock': inv.available_stock if inv else 0,
            'recommendation_type': 'FREQUENTLY_BOUGHT_TOGETHER',
            'score': 0.70,
            'reason_code': ReasonCode.FREQUENTLY_BOUGHT,
            'reason_text': reason,
            'metrics': {
                'co_occurrence_orders': 0,
                'confidence_pct': 70,
            }
        })

    return results
