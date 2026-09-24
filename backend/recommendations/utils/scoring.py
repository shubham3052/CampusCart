import math
from decimal import Decimal
from typing import Dict, Any, Optional


def normalize_min_max(value: float, min_val: float, max_val: float) -> float:
    """
    Standard Min-Max scaler mapping any scalar value strictly into [0.0, 1.0].
    Safeguards against zero division when min_val equals max_val.
    """
    if max_val <= min_val:
        return 1.0 if value >= max_val else 0.0
    scaled = (value - min_val) / (max_val - min_val)
    return max(0.0, min(1.0, float(scaled)))


def exponential_recency_decay(days_ago: float, halflife_days: float = 30.0) -> float:
    """
    Calculates time-decay weight using exponential decay with a configurable half-life:
        Weight = exp(-ln(2) * days_ago / halflife)
    - 0 days ago: 1.00
    - 30 days ago: 0.50 (with 30-day halflife)
    - 60 days ago: 0.25
    Never returns negative or zero.
    """
    days = max(0.0, float(days_ago))
    halflife = max(1.0, float(halflife_days))
    decay_constant = math.log(2.0) / halflife
    return float(math.exp(-decay_constant * days))


def calculate_weighted_hybrid_score(
    sub_scores: Dict[str, float],
    weights: Dict[str, float]
) -> float:
    """
    Blends multiple normalized sub-scores into a composite final score in [0.0, 1.0].
    Dynamically reallocates weights if any signal is absent or None.
    
    Formula:
        Final = sum(w_i * s_i) / sum(w_i) for all available signals s_i.
    """
    total_weighted_sum = 0.0
    active_weight_sum = 0.0

    for key, score in sub_scores.items():
        if score is not None:
            w = float(weights.get(key, 0.0))
            if w > 0.0:
                clamped_score = max(0.0, min(1.0, float(score)))
                total_weighted_sum += w * clamped_score
                active_weight_sum += w

    if active_weight_sum <= 0.0:
        return 0.0

    final_score = total_weighted_sum / active_weight_sum
    return round(float(final_score), 4)


def calculate_jaccard_similarity(set_a: set, set_b: set) -> float:
    """
    Computes Jaccard index between two sets: |A ∩ B| / |A ∪ B|.
    Returns 0.0 if either set is empty.
    """
    if not set_a or not set_b:
        return 0.0
    intersection_size = len(set_a.intersection(set_b))
    union_size = len(set_a.union(set_b))
    if union_size == 0:
        return 0.0
    return float(intersection_size / union_size)
