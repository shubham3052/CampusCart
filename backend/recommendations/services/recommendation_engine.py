from typing import List, Dict, Any, Optional, Set

from products.models import Product
from orders.models import Order, OrderItem
from inventory.models import Inventory
from recommendations.models import RecommendationConfig
from recommendations.utils.scoring import calculate_weighted_hybrid_score, normalize_min_max
from recommendations.utils.filters import (
    filter_available_products,
    get_user_excluded_product_ids,
)
from recommendations.utils.diversity import (
    diversify_recommendations,
    deduplicate_across_sections,
)
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason
from recommendations.services.popularity_recommender import get_popular_products, get_trending_products
from recommendations.services.general_recommender import get_buy_again_recommendations, get_user_preferred_categories
from recommendations.services.academic_recommender import get_academic_recommendations, get_recommended_shops
from recommendations.services.collaborative_recommender import get_frequently_bought_together
from recommendations.services.content_recommender import get_similar_products


class RecommendationEngine:
    """
    Master Orchestration Service for the Campus Recommendation Platform.
    Blends general, collaborative, content, popularity, and academic event intelligence
    into a unified, explainable, and inventory-verified feed.
    """

    @classmethod
    def get_home_feed(cls, user, limit_per_section: int = 6) -> Dict[str, Any]:
        """
        Assembles a comprehensive, cross-section deduplicated student marketplace home feed:
        1. Recommended For You (Hybrid Blended)
        2. Buy Again (Repeat purchases)
        3. Because You Bought (Complementary to last purchased item)
        4. Academic Essentials & Event Services (Step 19 calendar)
        5. Trending Now (7d sales velocity)
        6. Popular Near You (Ratings + sales volume)
        7. Recommended Shops
        """
        excluded_ids: Set[int] = get_user_excluded_product_ids(user)
        seen_product_ids: Set[int] = set(excluded_ids)

        # 1. Buy Again (Personalized repeat purchase items)
        buy_again_raw = get_buy_again_recommendations(user, limit=limit_per_section)
        buy_again = [item for item in buy_again_raw if item['id'] not in excluded_ids]

        # 2. Academic Recommendations
        academic_data = get_academic_recommendations(user, limit=limit_per_section)
        academic_products = [
            item for item in academic_data.get('products', []) if item['id'] not in excluded_ids
        ]

        # 3. Hybrid Personalized Recommendations
        personalized_raw = cls.get_personalized_recommendations(
            user, limit=limit_per_section * 2, excluded_ids=excluded_ids
        )
        # Apply category diversification (max 40% per category)
        diversified_personalized = diversify_recommendations(personalized_raw, max_per_category_ratio=0.40)
        recommended_for_you = diversified_personalized[:limit_per_section]
        for item in recommended_for_you:
            seen_product_ids.add(item['id'])

        # 4. Because You Bought This
        because_you_bought = []
        last_order_item = None
        if user and user.is_authenticated:
            last_order_item = (
                OrderItem.objects.filter(
                    order__customer=user,
                    order__status=Order.Status.COMPLETED
                )
                .select_related('product')
                .order_by('-order__created_at')
                .first()
            )

        if last_order_item and last_order_item.product_id:
            ref_prod = last_order_item.product
            freq_bought = get_frequently_bought_together(ref_prod.id, limit=4)
            because_you_bought = deduplicate_across_sections(seen_product_ids, freq_bought)
            for item in because_you_bought:
                seen_product_ids.add(item['id'])

        # 5. Trending Products (Deduplicated against Recommended For You)
        trending_raw = get_trending_products(limit=limit_per_section * 2)
        trending = deduplicate_across_sections(seen_product_ids, trending_raw)[:limit_per_section]
        for item in trending:
            seen_product_ids.add(item['id'])

        # 6. Popular Products (Deduplicated against earlier sections)
        popular_raw = get_popular_products(limit=limit_per_section * 2)
        popular = deduplicate_across_sections(seen_product_ids, popular_raw)[:limit_per_section]

        # 7. Recommended Campus Shops
        shops = get_recommended_shops(user, limit=4)

        return {
            'recommended_for_you': recommended_for_you,
            'buy_again': buy_again,
            'because_you_bought': {
                'reference_product_name': last_order_item.product.name if last_order_item else None,
                'items': because_you_bought
            } if because_you_bought else None,
            'academic_recommendations': {
                'has_events': academic_data.get('has_academic_events', False),
                'upcoming_event': academic_data.get('upcoming_event'),
                'products': academic_products,
                'services': academic_data.get('services', [])
            },
            'trending': trending,
            'popular': popular,
            'recommended_shops': shops
        }

    @classmethod
    def get_personalized_recommendations(
        cls,
        user,
        limit: int = 10,
        excluded_ids: Optional[Set[int]] = None
    ) -> List[Dict[str, Any]]:
        """
        Computes hybrid blended recommendation ranking for a given student.
        Integrates:
        - Personal purchase history (preferred categories & repeat signals)
        - Academic event relevance & intensity
        - Trending sales velocity
        - Overall popularity & review scores
        """
        config = RecommendationConfig.get_active()
        weights = {
            'history': float(config.personal_history_weight),
            'academic': float(config.academic_context_weight),
            'trending': float(config.trending_velocity_weight),
            'popular': float(config.popularity_weight),
        }

        # 1. Base available products
        base_qs = filter_available_products(Product.objects.all(), min_stock=config.min_inventory_required)
        if excluded_ids:
            base_qs = base_qs.exclude(id__in=excluded_ids)

        all_candidates = list(base_qs.select_related('shop', 'category'))
        if not all_candidates:
            return []

        # 2. Gather sub-signals
        # (a) Personal preferred categories
        fav_cats = set(get_user_preferred_categories(user, limit=4))

        # (b) Academic context
        acad_data = get_academic_recommendations(user, limit=20)
        acad_event = acad_data.get('upcoming_event')
        acad_prod_ids = {p['id']: p['score'] for p in acad_data.get('products', [])}

        # (c) Popularity & Trending maps
        popular_items = {p['id']: p['score'] for p in get_popular_products(limit=50)}
        trending_items = {t['id']: t['score'] for t in get_trending_products(limit=50)}

        # 3. Inventory stock map
        invs = Inventory.objects.filter(product__in=all_candidates, is_active=True).values('product_id', 'current_stock', 'reserved_stock')
        inv_map = {i['product_id']: max(0, i['current_stock'] - i['reserved_stock']) for i in invs}

        # 4. Score each candidate product
        scored_products = []
        for prod in all_candidates:
            # Sub-score 1: History relevance
            s_history = 1.0 if prod.category_id in fav_cats else 0.2

            # Sub-score 2: Academic relevance
            s_acad = acad_prod_ids.get(prod.id, 0.0)

            # Sub-score 3: Popularity & Trending
            s_pop = popular_items.get(prod.id, 0.3)
            s_trend = trending_items.get(prod.id, 0.2)

            sub_scores = {
                'history': s_history if fav_cats else None,  # Cold-start reallocates automatically
                'academic': s_acad if acad_event else None,
                'trending': s_trend,
                'popular': s_pop
            }

            final_score = calculate_weighted_hybrid_score(sub_scores, weights)

            # Determine predominant reason
            if s_acad >= 0.6 and acad_event:
                reason_code = ReasonCode.ACADEMIC_EVENT
                reason_text = generate_recommendation_reason(
                    ReasonCode.ACADEMIC_EVENT,
                    {'event_title': acad_event['title'], 'days_until': acad_event.get('days_until')}
                )
            elif prod.category_id in fav_cats:
                reason_code = ReasonCode.PERSONALIZED
                reason_text = generate_recommendation_reason(
                    ReasonCode.PERSONALIZED, {'favorite_category': prod.category.name}
                )
            elif s_trend >= 0.7:
                reason_code = ReasonCode.TRENDING
                reason_text = generate_recommendation_reason(
                    ReasonCode.TRENDING, {'shop_name': prod.shop.name}
                )
            else:
                reason_code = ReasonCode.POPULAR
                reason_text = generate_recommendation_reason(ReasonCode.POPULAR)

            scored_products.append({
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
                'available_stock': inv_map.get(prod.id, 0),
                'recommendation_type': 'PERSONALIZED',
                'score': round(final_score, 4),
                'reason_code': reason_code,
                'reason_text': reason_text,
                'metrics': {
                    'history_factor': round(s_history, 2),
                    'academic_factor': round(s_acad, 2),
                    'trending_factor': round(s_trend, 2),
                }
            })

        scored_products.sort(key=lambda x: x['score'], reverse=True)
        return scored_products[:limit]

    @classmethod
    def get_shop_insights(cls, shop_id: int) -> Dict[str, Any]:
        """
        Shop-owner customer demand insights:
        Identifies upcoming academic demand surges, fast-moving items, and stock opportunities.
        """
        shop = None
        from shops.models import Shop
        shop = Shop.objects.filter(id=shop_id).first()
        if not shop:
            return {'error': 'Shop not found'}

        # Academic event surge categories
        from academics.event_intelligence import get_upcoming_events, get_affected_categories_and_products
        events = get_upcoming_events(days=30)
        impacts = get_affected_categories_and_products(events)

        # Shop top selling products
        popular = get_popular_products(shop_id=shop_id, limit=5)
        trending = get_trending_products(shop_id=shop_id, limit=5)

        return {
            'shop_id': shop.id,
            'shop_name': shop.name,
            'academic_surge_opportunities': {
                'upcoming_events_count': len(events),
                'affected_categories': impacts['categories'],
                'affected_products': impacts['products'],
                'services_rush': impacts['services']
            },
            'shop_fast_moving_stationery': popular,
            'shop_trending_items': trending
        }
