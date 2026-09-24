from django.db.models import Q, F
from django.utils import timezone
from datetime import timedelta
from typing import List, Dict, Any, Optional

from products.models import Product
from inventory.models import Inventory
from recommendations.models import RecommendationFeedback, RecommendationInteraction


def filter_available_products(queryset, min_stock: int = 1):
    """
    Ensures recommended products are active, their shop is active, and
    they possess verified available stock (current_stock - reserved_stock >= min_stock).
    """
    valid_inventory_product_ids = Inventory.objects.filter(
        is_active=True,
        shop__is_active=True,
        current_stock__gte=F('reserved_stock') + min_stock
    ).values_list('product_id', flat=True)

    return queryset.filter(
        is_active=True,
        shop__is_active=True,
        id__in=valid_inventory_product_ids
    )


def get_user_excluded_product_ids(user) -> set:
    """
    Returns product IDs that the student explicitly rejected via feedback
    or dismissed within the last 14 days to prevent annoying repeated recommendations.
    """
    if not user or not user.is_authenticated:
        return set()

    # 1. Negative feedback (Not interested, Already have, Not relevant)
    feedback_ids = set(RecommendationFeedback.objects.filter(
        user=user,
        feedback_type__in=[
            RecommendationFeedback.FeedbackType.NOT_INTERESTED,
            RecommendationFeedback.FeedbackType.ALREADY_HAVE,
            RecommendationFeedback.FeedbackType.NOT_RELEVANT,
        ]
    ).values_list('product_id', flat=True))

    # 2. Dismissals within the last 14 days
    fourteen_days_ago = timezone.now() - timedelta(days=14)
    dismissed_ids = set(RecommendationInteraction.objects.filter(
        user=user,
        action=RecommendationInteraction.Action.DISMISSED,
        timestamp__gte=fourteen_days_ago
    ).values_list('product_id', flat=True))

    return feedback_ids.union(dismissed_ids)


def find_in_stock_alternatives(product: Product, limit: int = 3) -> List[Dict[str, Any]]:
    """
    When a requested or viewed product is out-of-stock, finds:
    1. The exact same product SKU/name available in other campus shops.
    2. Similar products within the same category from available shops.
    """
    alternatives = []

    # 1. Cross-shop check for identical product name/SKU
    same_prods_other_shops = filter_available_products(
        Product.objects.filter(
            name__iexact=product.name
        ).exclude(id=product.id).select_related('shop', 'category')
    )[:limit]

    for alt in same_prods_other_shops:
        inv = Inventory.objects.filter(shop=alt.shop, product=alt, is_active=True).first()
        alternatives.append({
            'product_id': alt.id,
            'name': alt.name,
            'shop_id': alt.shop.id,
            'shop_name': alt.shop.name,
            'price': float(alt.price),
            'available_stock': inv.available_stock if inv else 0,
            'alternative_type': 'SAME_PRODUCT_DIFFERENT_SHOP',
            'reason': f"Available at {alt.shop.name}"
        })

    # 2. If needed, find related products in same category
    if len(alternatives) < limit:
        remaining = limit - len(alternatives)
        same_cat_prods = filter_available_products(
            Product.objects.filter(
                category=product.category
            ).exclude(id__in=[product.id] + [a['product_id'] for a in alternatives])
            .select_related('shop', 'category')
        )[:remaining]

        for alt in same_cat_prods:
            inv = Inventory.objects.filter(shop=alt.shop, product=alt, is_active=True).first()
            alternatives.append({
                'product_id': alt.id,
                'name': alt.name,
                'shop_id': alt.shop.id,
                'shop_name': alt.shop.name,
                'price': float(alt.price),
                'available_stock': inv.available_stock if inv else 0,
                'alternative_type': 'SIMILAR_CATEGORY_ALTERNATIVE',
                'reason': f"Similar item in {alt.category.name} available at {alt.shop.name}"
            })

    return alternatives
