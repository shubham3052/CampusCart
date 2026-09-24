from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from typing import List, Dict, Any, Optional

from products.models import Product
from inventory.models import Inventory
from recommendations.utils.filters import filter_available_products
from recommendations.services.explanation_service import ReasonCode, generate_recommendation_reason


def get_similar_products(
    product_id: int,
    limit: int = 4
) -> List[Dict[str, Any]]:
    """
    Computes content-based product similarity using TF-IDF tokenization and Cosine Similarity
    across product metadata (name, brand, category, description, unit).
    
    Formula:
        Document = "name brand category description"
        Similarity = Cosine(TFIDF(Target), TFIDF(Candidate))
        Score = Similarity * (1.1 if same_category else 0.9) * (1.0 - abs(price_diff)/price_max)
    """
    target = Product.objects.filter(id=product_id).select_related('category', 'shop').first()
    if not target:
        return []

    # Get available candidate products excluding the target itself
    candidates = list(
        filter_available_products(Product.objects.all())
        .exclude(id=product_id)
        .select_related('category', 'shop')
    )

    if not candidates:
        return []

    # Build text corpora
    def build_doc(p: Product) -> str:
        parts = [
            p.name or '',
            p.brand or '',
            p.category.name if p.category else '',
            p.description or '',
            p.get_unit_display() if hasattr(p, 'get_unit_display') else ''
        ]
        return " ".join(parts).lower()

    corpus = [build_doc(target)] + [build_doc(c) for c in candidates]

    try:
        vectorizer = TfidfVectorizer(stop_words='english', max_features=500)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        # Cosine similarity between target (index 0) and all candidates (indices 1..)
        similarities = cosine_similarity(tfidf_matrix[0:1], tfidf_matrix[1:])[0]
    except Exception:
        # Fallback to pure category / brand matching if TF-IDF fails (e.g. empty strings)
        similarities = [1.0 if c.category_id == target.category_id else 0.2 for c in candidates]

    scored_candidates = []
    target_price = float(target.price or 1.0)

    for idx, cand in enumerate(candidates):
        raw_sim = float(similarities[idx])
        cand_price = float(cand.price or 1.0)

        # Same category boost
        cat_multiplier = 1.15 if cand.category_id == target.category_id else 0.85
        # Price proximity penalty: similar products should ideally be in comparable price bands
        price_diff_ratio = min(1.0, abs(cand_price - target_price) / max(1.0, target_price))
        price_factor = 1.0 - (0.25 * price_diff_ratio)

        final_score = min(1.0, max(0.0, raw_sim * cat_multiplier * price_factor))
        scored_candidates.append((cand, final_score))

    # Sort descending by score
    scored_candidates.sort(key=lambda x: x[1], reverse=True)

    results = []
    for cand, score in scored_candidates[:limit]:
        reason = generate_recommendation_reason(
            ReasonCode.SIMILAR_PRODUCT,
            {
                'reference_product_name': target.name,
                'category_name': cand.category.name
            }
        )
        inv = Inventory.objects.filter(product=cand, shop=cand.shop, is_active=True).first()

        results.append({
            'id': cand.id,
            'product_id': cand.id,
            'name': cand.name,
            'price': float(cand.price),
            'brand': cand.brand,
            'category_id': cand.category.id,
            'category_name': cand.category.name,
            'shop_id': cand.shop.id,
            'shop_name': cand.shop.name,
            'image_url': cand.image.url if cand.image else None,
            'available_stock': inv.available_stock if inv else 0,
            'recommendation_type': 'SIMILAR_PRODUCTS',
            'score': round(float(score), 4),
            'reason_code': ReasonCode.SIMILAR_PRODUCT,
            'reason_text': reason,
            'metrics': {
                'similarity_index': round(float(score), 2),
                'same_category': cand.category_id == target.category_id
            }
        })

    return results
