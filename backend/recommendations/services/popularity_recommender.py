from django.utils import timezone
from django.db.models import Sum, Count, Avg, F
from datetime import timedelta
from typing import List, Dict, Any, Optional

from products.models import Product, Review
from orders.models import Order, OrderItem
from inventory.models import Inventory
from recommendations.utils.scoring import normalize_min_max
from recommendations.utils.filters import filter_available_products
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason


def get_popular_products(
    shop_id: Optional[int] = None,
    category_id: Optional[int] = None,
    limit: int = 10,
    days: int = 30
) -> List[Dict[str, Any]]:
    """
    Computes time-decayed popularity ranking based on:
    - Recent completed sales volume in the past `days`
    - Number of distinct student purchasers
    - Product average customer review ratings
    
    Formula:
        Raw_Score = (Sales_Qty * 0.5) + (Unique_Buyers * 0.3) + ((Avg_Rating / 5.0) * 10.0 * 0.2)
        Popularity_Score = Normalize(Raw_Score) in [0.0, 1.0]
    """
    cutoff_date = timezone.now() - timedelta(days=days)

    # 1. Base available products
    prods_qs = filter_available_products(Product.objects.all())
    if shop_id:
        prods_qs = prods_qs.filter(shop_id=shop_id)
    if category_id:
        prods_qs = prods_qs.filter(category_id=category_id)

    # 2. Completed sales metrics
    sales_data = (
        OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED,
            order__created_at__gte=cutoff_date,
            product__in=prods_qs
        )
        .values('product_id')
        .annotate(
            total_qty=Sum('quantity'),
            buyer_count=Count('order__customer', distinct=True)
        )
    )
    sales_map = {s['product_id']: s for s in sales_data}

    # 3. Product ratings (only verified approved reviews)
    ratings_data = (
        Review.objects.filter(product__in=prods_qs, status=Review.Status.APPROVED)
        .values('product_id')
        .annotate(avg_rating=Avg('rating'), review_count=Count('id'))
    )
    rating_map = {r['product_id']: r for r in ratings_data}

    # 4. Inventory stock map
    inventories = Inventory.objects.filter(
        product__in=prods_qs, is_active=True
    ).values('product_id', 'current_stock', 'reserved_stock')
    inv_map = {inv['product_id']: max(0, inv['current_stock'] - inv['reserved_stock']) for inv in inventories}

    # 5. Score candidates
    scored_items = []
    prods_list = list(prods_qs.select_related('shop', 'category'))

    raw_scores = []
    for prod in prods_list:
        p_sales = sales_map.get(prod.id, {'total_qty': 0, 'buyer_count': 0})
        p_rating = rating_map.get(prod.id, {'avg_rating': 0.0, 'review_count': 0})

        qty = p_sales['total_qty'] or 0
        buyers = p_sales['buyer_count'] or 0
        rating = float(p_rating['avg_rating'] or 0.0)

        # Baseline raw score: combines orders + buyers + stars
        raw_score = (qty * 0.5) + (buyers * 0.3) + ((rating / 5.0) * 5.0 * 0.2)
        raw_scores.append(raw_score)
        scored_items.append((prod, raw_score, qty, rating))

    if not scored_items:
        return []

    min_raw = min(raw_scores)
    max_raw = max(raw_scores)

    results = []
    # Sort descending by raw score
    scored_items.sort(key=lambda x: x[1], reverse=True)

    for prod, raw, qty, rating in scored_items[:limit]:
        norm_score = normalize_min_max(raw, min_raw, max_raw) if max_raw > min_raw else (1.0 if raw > 0 else 0.5)
        available_stock = inv_map.get(prod.id, 0)
        
        reason = generate_recommendation_reason(
            ReasonCode.POPULAR,
            {'avg_rating': round(rating, 1) if rating > 0 else None, 'recent_sales_count': qty if qty > 0 else None}
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
            'recommendation_type': 'POPULAR',
            'score': round(float(norm_score), 4),
            'reason_code': ReasonCode.POPULAR,
            'reason_text': reason,
            'metrics': {
                'sales_last_30d': qty,
                'avg_rating': round(rating, 2),
            }
        })

    return results


def get_trending_products(
    shop_id: Optional[int] = None,
    limit: int = 8
) -> List[Dict[str, Any]]:
    """
    Identifies surging products by comparing sales velocity over the last 7 days
    against a prior 21-day baseline.
    
    Formula:
        Recent_Rate = Sales_7d / 7.0
        Prior_Rate = Sales_Prior_21d / 21.0
        Velocity_Surge_Ratio = Recent_Rate / (Prior_Rate + 0.1)
    """
    now = timezone.now()
    t7 = now - timedelta(days=7)
    t28 = now - timedelta(days=28)

    prods_qs = filter_available_products(Product.objects.all())
    if shop_id:
        prods_qs = prods_qs.filter(shop_id=shop_id)

    # Sales in last 7 days
    recent_sales = (
        OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED,
            order__created_at__gte=t7,
            product__in=prods_qs
        )
        .values('product_id')
        .annotate(qty=Sum('quantity'))
    )
    recent_map = {r['product_id']: r['qty'] or 0 for r in recent_sales}

    # Sales in prior 21 days (from 28 days ago to 7 days ago)
    prior_sales = (
        OrderItem.objects.filter(
            order__status=Order.Status.COMPLETED,
            order__created_at__gte=t28,
            order__created_at__lt=t7,
            product__in=prods_qs
        )
        .values('product_id')
        .annotate(qty=Sum('quantity'))
    )
    prior_map = {p['product_id']: p['qty'] or 0 for p in prior_sales}

    prods_list = list(prods_qs.select_related('shop', 'category'))
    scored = []

    for prod in prods_list:
        s7 = recent_map.get(prod.id, 0)
        s_prior = prior_map.get(prod.id, 0)

        # Require at least some activity to become trending
        if s7 > 0:
            rate_7 = s7 / 7.0
            rate_prior = s_prior / 21.0
            ratio = rate_7 / (rate_prior + 0.1)
            growth_pct = int(round(((rate_7 - rate_prior) / max(0.01, rate_prior)) * 100)) if rate_prior > 0 else 100
            scored.append((prod, ratio, s7, growth_pct))

    # If no items had recent sales, gracefully backfill with latest active products
    if not scored:
        popular_fallback = get_popular_products(shop_id=shop_id, limit=limit)
        for item in popular_fallback:
            item['recommendation_type'] = 'TRENDING'
            item['reason_code'] = ReasonCode.TRENDING
            item['reason_text'] = generate_recommendation_reason(ReasonCode.TRENDING, {'shop_name': item['shop_name']})
        return popular_fallback

    scored.sort(key=lambda x: x[1], reverse=True)
    max_ratio = scored[0][1]
    min_ratio = scored[-1][1]

    results = []
    for prod, ratio, s7, growth_pct in scored[:limit]:
        score = normalize_min_max(ratio, min_ratio, max_ratio) if max_ratio > min_ratio else 0.85
        reason = generate_recommendation_reason(
            ReasonCode.TRENDING,
            {'growth_pct': growth_pct if growth_pct > 0 else 50, 'shop_name': prod.shop.name}
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
            'recommendation_type': 'TRENDING',
            'score': round(float(score), 4),
            'reason_code': ReasonCode.TRENDING,
            'reason_text': reason,
            'metrics': {
                'sales_last_7d': s7,
                'surge_ratio': round(float(ratio), 2)
            }
        })

    return results
