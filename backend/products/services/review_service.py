from decimal import Decimal
from typing import Optional, Dict, Any
from django.db.models import Avg, Count
from django.utils import timezone

from products.models import Product, Review
from orders.models import Order, OrderItem
from shops.models import Shop


class ReviewService:
    """
    Verified purchase validation and review aggregation service.
    Enforces marketplace authenticity, prevents rating spam, and calculates rating distributions.
    """

    ELIGIBLE_ORDER_STATUSES = [
        Order.Status.COMPLETED,
        Order.Status.DELIVERED,
        Order.Status.PICKED_UP
    ]

    @classmethod
    def verify_purchase(
        cls,
        user,
        product: Optional[Product] = None,
        shop: Optional[Shop] = None,
        order_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Verifies whether an authenticated user has actually completed a purchase
        for the given product or shop.

        Returns:
            dict: {
                "is_verified": bool,
                "order": Order | None,
                "order_item": OrderItem | None,
                "reason": str
            }
        """
        if not user or not user.is_authenticated:
            return {
                "is_verified": False,
                "order": None,
                "order_item": None,
                "reason": "Authentication required to review products or shops."
            }

        base_orders = Order.objects.filter(
            customer=user,
            status__in=cls.ELIGIBLE_ORDER_STATUSES
        )

        if order_id:
            base_orders = base_orders.filter(id=order_id)

        if product:
            # Check if user purchased this product in a completed order
            matching_item = OrderItem.objects.filter(
                order__in=base_orders,
                product=product
            ).select_related('order').first()

            if not matching_item:
                return {
                    "is_verified": False,
                    "order": None,
                    "order_item": None,
                    "reason": f"Only verified buyers who completed an order for '{product.name}' can write a review."
                }

            # Check if user already reviewed this product
            already_reviewed = Review.objects.filter(
                user=user,
                product=product
            ).exists()

            if already_reviewed:
                return {
                    "is_verified": False,
                    "order": matching_item.order,
                    "order_item": matching_item,
                    "reason": "You have already submitted a review for this product. You can update your existing review."
                }

            return {
                "is_verified": True,
                "order": matching_item.order,
                "order_item": matching_item,
                "reason": "Verified purchase confirmed."
            }

        elif shop:
            matching_order = base_orders.filter(shop=shop).first()
            if not matching_order:
                return {
                    "is_verified": False,
                    "order": None,
                    "order_item": None,
                    "reason": f"Only students with a completed order from '{shop.name}' can review this store."
                }

            # Check if user already reviewed this shop without a product
            already_reviewed = Review.objects.filter(
                user=user,
                shop=shop,
                product__isnull=True
            ).exists()

            if already_reviewed:
                return {
                    "is_verified": False,
                    "order": matching_order,
                    "order_item": None,
                    "reason": "You have already reviewed this shop. You can edit your existing review."
                }

            return {
                "is_verified": True,
                "order": matching_order,
                "order_item": None,
                "reason": "Verified shop purchase confirmed."
            }

        return {
            "is_verified": False,
            "order": None,
            "order_item": None,
            "reason": "Either product or shop must be specified for review verification."
        }

    @classmethod
    def get_rating_summary(
        cls,
        product: Optional[Product] = None,
        shop: Optional[Shop] = None
    ) -> Dict[str, Any]:
        """
        Calculates approved review statistics including average score, count,
        and 1-5 star distribution histogram.
        """
        qs = Review.objects.filter(status=Review.Status.APPROVED)
        if product:
            qs = qs.filter(product=product)
        elif shop:
            qs = qs.filter(shop=shop)
        else:
            return {
                "average_rating": 0.0,
                "review_count": 0,
                "distribution": {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
            }

        aggregates = qs.aggregate(
            avg_rating=Avg('rating'),
            count=Count('id')
        )

        avg_val = aggregates['avg_rating']
        avg_rating = round(float(avg_val), 1) if avg_val is not None else 0.0
        review_count = aggregates['count'] or 0

        # Histogram distribution
        dist = {"1": 0, "2": 0, "3": 0, "4": 0, "5": 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        counts = qs.values('rating').annotate(total=Count('id'))
        for c in counts:
            r = c['rating']
            dist[r] = c['total']
            dist[str(r)] = c['total']

        return {
            "average_rating": avg_rating,
            "review_count": review_count,
            "distribution": dist
        }
