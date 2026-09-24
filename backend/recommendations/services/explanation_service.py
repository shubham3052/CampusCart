from typing import Dict, Any, Optional


class ReasonCode:
    BUY_AGAIN = 'BUY_AGAIN'
    FREQUENTLY_BOUGHT = 'FREQUENTLY_BOUGHT'
    ACADEMIC_EVENT = 'ACADEMIC_EVENT'
    POPULAR = 'POPULAR'
    TRENDING = 'TRENDING'
    SIMILAR_PRODUCT = 'SIMILAR_PRODUCT'
    SEASONAL = 'SEASONAL'
    PERSONALIZED = 'PERSONALIZED'
    SHOP_MATCH = 'SHOP_MATCH'
    ALTERNATIVE = 'ALTERNATIVE'
    PRINTING_SERVICE = 'PRINTING_SERVICE'
    BINDING_SERVICE = 'BINDING_SERVICE'
    INVENTORY_SAFE = 'INVENTORY_SAFE'


def generate_recommendation_reason(
    reason_code: str,
    context: Optional[Dict[str, Any]] = None
) -> str:
    """
    Translates structured reason codes and dynamic context into explainable,
    human-readable text tailored for student decision-making and project viva.
    """
    ctx = context or {}

    if reason_code == ReasonCode.BUY_AGAIN:
        count = ctx.get('purchase_count', 1)
        times_str = "once" if count == 1 else f"{count} times"
        last_date = ctx.get('last_purchased_date')
        if last_date:
            return f"Because you purchased this {times_str} before (last ordered {last_date})."
        return f"Because you purchased this {times_str} before."

    elif reason_code == ReasonCode.FREQUENTLY_BOUGHT:
        ref_prod = ctx.get('reference_product_name')
        if ref_prod:
            return f"Students who bought '{ref_prod}' also bought this."
        return "Frequently purchased together with items in your cart."

    elif reason_code == ReasonCode.ACADEMIC_EVENT:
        event_title = ctx.get('event_title', 'Campus Academic Event')
        days_left = ctx.get('days_until')
        event_type = ctx.get('event_type_display')
        if days_left is not None:
            if days_left == 0:
                return f"Essential for your {event_title} starting today!"
            elif days_left == 1:
                return f"Recommended for your {event_title} tomorrow!"
            else:
                return f"Recommended for your upcoming {event_title} in {days_left} days."
        return f"Recommended for your campus academic schedule ({event_title})."

    elif reason_code == ReasonCode.TRENDING:
        shop_name = ctx.get('shop_name')
        growth_pct = ctx.get('growth_pct')
        if growth_pct:
            return f"Trending now with a {growth_pct}% surge in student orders this week."
        if shop_name:
            return f"Trending stationery item in {shop_name} this week."
        return "Trending now among students across campus."

    elif reason_code == ReasonCode.POPULAR:
        avg_rating = ctx.get('avg_rating')
        sales_count = ctx.get('recent_sales_count')
        if avg_rating and avg_rating > 4.0:
            return f"Top-rated item ({avg_rating}★) with high student demand."
        if sales_count:
            return f"Popular choice with {sales_count}+ student orders this month."
        return "Popular choice among students on campus."

    elif reason_code == ReasonCode.SIMILAR_PRODUCT:
        ref_prod = ctx.get('reference_product_name')
        category_name = ctx.get('category_name')
        if ref_prod:
            return f"Similar style, specifications, and brand to '{ref_prod}'."
        if category_name:
            return f"Top-rated alternative in {category_name}."
        return "Similar to stationery products you recently viewed."

    elif reason_code == ReasonCode.SEASONAL:
        term = ctx.get('term_phase', 'Current Academic Period')
        return f"Seasonal essential for {term}."

    elif reason_code == ReasonCode.PERSONALIZED:
        cat_name = ctx.get('favorite_category')
        if cat_name:
            return f"Personalized based on your interest in {cat_name}."
        return "Recommended for you based on your purchase and browsing history."

    elif reason_code == ReasonCode.SHOP_MATCH:
        shop_name = ctx.get('shop_name', 'your preferred campus store')
        return f"Best available offer at {shop_name}."

    elif reason_code == ReasonCode.PRINTING_SERVICE:
        event_title = ctx.get('event_title', 'Project Submission')
        return f"Fast-track print service recommended for your upcoming {event_title}."

    elif reason_code == ReasonCode.BINDING_SERVICE:
        event_title = ctx.get('event_title', 'Project Submission')
        return f"Spiral & hardbound report binding available for {event_title}."

    elif reason_code == ReasonCode.ALTERNATIVE:
        shop_name = ctx.get('alternative_shop_name')
        if shop_name:
            return f"Original shop out of stock; verified in stock at {shop_name}."
        return "Available in-stock alternative to a sold-out item."

    elif reason_code == ReasonCode.INVENTORY_SAFE:
        stock_count = ctx.get('available_stock', 5)
        return f"Verified in-stock ({stock_count} units available) ready for dispatch."

    return "Recommended for you based on campus stationery demand."
