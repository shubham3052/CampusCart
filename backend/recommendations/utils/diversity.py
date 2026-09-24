import math
from typing import List, Dict, Any, Set


def diversify_recommendations(
    recommendations: List[Dict[str, Any]],
    max_per_category_ratio: float = 0.40,
    min_diversity_count: int = 4
) -> List[Dict[str, Any]]:
    """
    Enforces catalog diversification.
    Prevents recommendations from being dominated by a single category (e.g. 8 notebooks).
    Caps each category at ceil(len(recommendations) * max_per_category_ratio).
    Surplus items are moved to an overflow queue and appended only if necessary to meet requested size.
    """
    if len(recommendations) <= min_diversity_count:
        return recommendations

    max_per_cat = max(1, math.ceil(len(recommendations) * max_per_category_ratio))
    cat_counts: Dict[Any, int] = {}
    diversified: List[Dict[str, Any]] = []
    overflow: List[Dict[str, Any]] = []

    for item in recommendations:
        cat_id = item.get('category_id') or item.get('category')
        current_count = cat_counts.get(cat_id, 0)

        if current_count < max_per_cat:
            cat_counts[cat_id] = current_count + 1
            diversified.append(item)
        else:
            overflow.append(item)

    # If diversified list didn't fill up to requested size, backfill from overflow
    needed = len(recommendations) - len(diversified)
    if needed > 0:
        diversified.extend(overflow[:needed])

    return diversified


def deduplicate_across_sections(
    existing_product_ids: Set[int],
    candidate_items: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Suppresses products already showcased in earlier sections of the student home
    (e.g., if Notebook A is in 'Recommended For You', don't repeat it in 'Trending').
    """
    deduped = []
    seen = set(existing_product_ids)

    for item in candidate_items:
        p_id = item.get('id') or item.get('product_id')
        if p_id not in seen:
            deduped.append(item)
            seen.add(p_id)

    return deduped
