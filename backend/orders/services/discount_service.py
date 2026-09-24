from decimal import Decimal
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db import transaction

from orders.models import Coupon, CouponUsage, Order
from shops.models import Offer, Shop
from products.models import Product


class DiscountService:
    """
    Authoritative backend discount and promotional pricing engine.
    Calculates eligible discounts for coupons and shop-level offers with multi-shop safety.
    """

    @classmethod
    def validate_coupon(cls, code: str, customer, shop, items_data: list) -> dict:
        """
        Validates coupon against code, date range, usage limits, per-user limits,
        minimum cart spend, and shop scope.

        Returns:
            dict: {
                "is_valid": bool,
                "coupon": Coupon | None,
                "discount_amount": Decimal,
                "subtotal": Decimal,
                "final_amount": Decimal,
                "message": str
            }
        """
        code = (code or "").strip().upper()
        if not code:
            return {
                "is_valid": False,
                "coupon": None,
                "discount_amount": Decimal("0.00"),
                "subtotal": Decimal("0.00"),
                "final_amount": Decimal("0.00"),
                "message": "Coupon code is required."
            }

        coupon = Coupon.objects.filter(code__iexact=code, is_active=True).first()
        if not coupon:
            return {
                "is_valid": False,
                "coupon": None,
                "discount_amount": Decimal("0.00"),
                "subtotal": Decimal("0.00"),
                "final_amount": Decimal("0.00"),
                "message": f"Coupon code '{code}' does not exist or is inactive."
            }

        now = timezone.now()
        if not (coupon.valid_from <= now <= coupon.valid_until):
            return {
                "is_valid": False,
                "coupon": coupon,
                "discount_amount": Decimal("0.00"),
                "subtotal": Decimal("0.00"),
                "final_amount": Decimal("0.00"),
                "message": f"Coupon code '{code}' has expired or is not yet active."
            }

        if coupon.usage_limit is not None and coupon.times_used >= coupon.usage_limit:
            return {
                "is_valid": False,
                "coupon": coupon,
                "discount_amount": Decimal("0.00"),
                "subtotal": Decimal("0.00"),
                "final_amount": Decimal("0.00"),
                "message": f"Coupon code '{code}' has reached its maximum global redemption limit."
            }

        if customer and customer.is_authenticated:
            user_redemptions = CouponUsage.objects.filter(coupon=coupon, user=customer).count()
            if user_redemptions >= coupon.per_user_limit:
                return {
                    "is_valid": False,
                    "coupon": coupon,
                    "discount_amount": Decimal("0.00"),
                    "subtotal": Decimal("0.00"),
                    "final_amount": Decimal("0.00"),
                    "message": f"You have already redeemed coupon '{code}' the maximum allowable times ({coupon.per_user_limit})."
                }

        # Multi-shop boundary safety: If coupon is shop-scoped, target shop must match
        target_shop_id = None
        if shop is not None:
            try:
                target_shop_id = shop.id if hasattr(shop, 'id') else int(shop)
            except (ValueError, TypeError):
                target_shop_id = shop

        if coupon.shop and target_shop_id is not None:
            if coupon.shop_id != target_shop_id:
                return {
                    "is_valid": False,
                    "coupon": coupon,
                    "discount_amount": Decimal("0.00"),
                    "subtotal": Decimal("0.00"),
                    "final_amount": Decimal("0.00"),
                    "message": f"Coupon '{code}' is only valid at '{coupon.shop.name}' and cannot be used for this shop."
                }

        # Calculate subtotal of eligible items
        subtotal = Decimal("0.00")
        eligible_subtotal = Decimal("0.00")

        for item in items_data:
            if isinstance(item, str):
                import json
                try:
                    item = json.loads(item)
                except Exception:
                    item = {}
            if not isinstance(item, dict):
                continue

            qty = Decimal(str(item.get('quantity', 1)))
            p_val = item.get('unit_price') if item.get('unit_price') is not None else item.get('price', 0)
            unit_price = Decimal(str(p_val or 0))
            line_total = qty * unit_price
            subtotal += line_total

            prod_id = item.get('product_id', item.get('product'))
            if hasattr(prod_id, 'id'):
                prod_id = prod_id.id

            # Check item eligibility
            is_eligible = True
            if coupon.shop and target_shop_id is not None and coupon.shop_id != target_shop_id:
                is_eligible = False

            if is_eligible:
                eligible_subtotal += line_total

        if eligible_subtotal < coupon.min_order_amount:
            return {
                "is_valid": False,
                "coupon": coupon,
                "discount_amount": Decimal("0.00"),
                "subtotal": subtotal,
                "final_amount": subtotal,
                "message": f"Minimum eligible order value of ₹{coupon.min_order_amount:.2f} required for coupon '{code}' (current eligible: ₹{eligible_subtotal:.2f})."
            }

        # Compute discount
        if coupon.discount_type == Coupon.DiscountType.PERCENTAGE:
            raw_discount = (eligible_subtotal * coupon.discount_value) / Decimal("100.00")
            if coupon.max_discount is not None:
                discount_amount = min(raw_discount, coupon.max_discount)
            else:
                discount_amount = raw_discount
        else:  # FIXED_AMOUNT
            discount_amount = min(coupon.discount_value, eligible_subtotal)

        discount_amount = max(Decimal("0.00"), discount_amount)
        discount_amount = min(discount_amount, subtotal)
        final_amount = max(Decimal("0.00"), subtotal - discount_amount)

        return {
            "is_valid": True,
            "coupon": coupon,
            "discount_amount": discount_amount.quantize(Decimal("0.01")),
            "subtotal": subtotal.quantize(Decimal("0.01")),
            "final_amount": final_amount.quantize(Decimal("0.01")),
            "message": f"Coupon '{coupon.code}' applied successfully! Savings: ₹{discount_amount:.2f}"
        }

    @classmethod
    def get_best_shop_offer(cls, shop, items_data: list) -> dict:
        """
        Evaluates active offers for a shop and finds the highest eligible promotional discount.
        """
        now = timezone.now()
        active_offers = Offer.objects.filter(
            shop=shop,
            is_active=True,
            start_date__lte=now,
            end_date__gte=now
        ).prefetch_related('applicable_categories', 'applicable_products')

        best_offer = None
        best_discount = Decimal("0.00")
        subtotal = Decimal("0.00")

        for item in items_data:
            qty = Decimal(str(item.get('quantity', 1)))
            unit_price = Decimal(str(item.get('unit_price', item.get('price', 0))))
            subtotal += (qty * unit_price)

        for offer in active_offers:
            if offer.usage_limit is not None and offer.times_used >= offer.usage_limit:
                continue

            if subtotal < offer.min_order_value:
                continue

            # Calculate discount
            if offer.discount_type == Offer.DiscountType.PERCENTAGE:
                raw_discount = (subtotal * offer.discount_value) / Decimal("100.00")
                if offer.max_discount is not None:
                    discount = min(raw_discount, offer.max_discount)
                else:
                    discount = raw_discount
            else:
                discount = min(offer.discount_value, subtotal)

            if discount > best_discount:
                best_discount = discount
                best_offer = offer

        return {
            "offer": best_offer,
            "discount_amount": best_discount.quantize(Decimal("0.01"))
        }

    @classmethod
    def apply_coupon_atomic(cls, coupon: Coupon, customer, order: Order, discount_applied: Decimal):
        """
        Atomically increments times_used on Coupon and records a CouponUsage entry.
        """
        with transaction.atomic():
            locked_coupon = Coupon.objects.select_for_update().get(id=coupon.id)
            if locked_coupon.usage_limit is not None and locked_coupon.times_used >= locked_coupon.usage_limit:
                raise ValidationError(f"Coupon '{locked_coupon.code}' reached maximum usage limit during checkout.")

            locked_coupon.times_used += 1
            locked_coupon.save(update_fields=['times_used', 'updated_at'])

            CouponUsage.objects.create(
                coupon=locked_coupon,
                user=customer,
                order=order,
                discount_applied=discount_applied
            )
