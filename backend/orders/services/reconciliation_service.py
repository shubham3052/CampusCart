from decimal import Decimal
from django.db.models import Sum
from orders.models import Order, Payment, Refund


class ReconciliationService:
    """
    Transaction Reconciliation Engine (Phase 15).
    Audits platform payments, orders, and refund balances to identify financial anomalies,
    status inconsistencies, and amount mismatches for administrative investigation.
    """

    @classmethod
    def run_reconciliation(cls, shop_id: int = None) -> dict:
        discrepancies = []

        # 1. Orders marked PAID but missing captured Payment record
        orders_qs = Order.objects.filter(payment_status=Order.PaymentStatus.PAID)
        if shop_id:
            orders_qs = orders_qs.filter(shop_id=shop_id)

        for order in orders_qs.select_related('shop', 'customer'):
            has_captured_payment = Payment.objects.filter(
                order=order,
                status__in=[Payment.Status.CAPTURED, Payment.Status.PARTIALLY_REFUNDED, Payment.Status.REFUNDED]
            ).exists()

            if not has_captured_payment:
                discrepancies.append({
                    "severity": "CRITICAL",
                    "type": "PAID_ORDER_WITHOUT_PAYMENT",
                    "order_id": order.id,
                    "order_number": str(order.order_number),
                    "shop_id": order.shop_id,
                    "shop_name": order.shop.name,
                    "customer": order.customer.username,
                    "amount": float(order.total_amount),
                    "description": f"Order #{str(order.order_number)[:8]} is marked PAID but has no captured payment record.",
                    "suggested_action": "Verify bank statement or cash collection logs and create audited payment entry.",
                })

        # 2. Payments marked CAPTURED with amount mismatch against Order
        payments_qs = Payment.objects.filter(status=Payment.Status.CAPTURED).select_related('order', 'shop', 'user')
        if shop_id:
            payments_qs = payments_qs.filter(shop_id=shop_id)

        for payment in payments_qs:
            order = payment.order
            if payment.amount != order.total_amount:
                discrepancies.append({
                    "severity": "HIGH",
                    "type": "AMOUNT_MISMATCH",
                    "order_id": order.id,
                    "order_number": str(order.order_number),
                    "payment_id": payment.id,
                    "shop_id": payment.shop_id,
                    "shop_name": payment.shop.name,
                    "expected_amount": float(order.total_amount),
                    "paid_amount": float(payment.amount),
                    "description": (
                        f"Payment #{payment.id} amount (₹{payment.amount}) differs from Order total (₹{order.total_amount})."
                    ),
                    "suggested_action": "Check for unapplied discounts or partial line-item modifications.",
                })

            # Inconsistent payment status: Payment is CAPTURED but Order is still PENDING
            if order.payment_status != Order.PaymentStatus.PAID and order.payment_status != Order.PaymentStatus.PARTIALLY_REFUNDED:
                discrepancies.append({
                    "severity": "MEDIUM",
                    "type": "STATUS_INCONSISTENCY",
                    "order_id": order.id,
                    "order_number": str(order.order_number),
                    "payment_id": payment.id,
                    "shop_id": payment.shop_id,
                    "shop_name": payment.shop.name,
                    "description": (
                        f"Payment #{payment.id} is CAPTURED, but Order #{str(order.order_number)[:8]} payment_status is '{order.payment_status}'."
                    ),
                    "suggested_action": "Synchronize Order payment_status to PAID.",
                })

        # 3. Cumulative Refunds exceeding captured Payment
        refunds_grouped = Refund.objects.filter(
            status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED]
        ).values('payment').annotate(total_refunded=Sum('amount'))

        for group in refunds_grouped:
            payment_id = group['payment']
            total_refunded = group['total_refunded'] or Decimal('0.00')
            payment = Payment.objects.filter(id=payment_id).select_related('order', 'shop').first()
            if payment and total_refunded > payment.amount:
                discrepancies.append({
                    "severity": "CRITICAL",
                    "type": "EXCESSIVE_REFUND",
                    "order_id": payment.order_id,
                    "payment_id": payment.id,
                    "shop_id": payment.shop_id,
                    "shop_name": payment.shop.name,
                    "captured_amount": float(payment.amount),
                    "total_refunded": float(total_refunded),
                    "description": (
                        f"Payment #{payment.id} has cumulative completed refunds (₹{total_refunded}) exceeding captured amount (₹{payment.amount})."
                    ),
                    "suggested_action": "Audit gateway refund transactions immediately.",
                })

        # Summary statistics
        total_payments = Payment.objects.count()
        total_captured = Payment.objects.filter(status=Payment.Status.CAPTURED).count()
        total_volume = Payment.objects.filter(status=Payment.Status.CAPTURED).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        return {
            "summary": {
                "total_payments_evaluated": total_payments,
                "captured_transactions": total_captured,
                "gross_volume": float(total_volume),
                "discrepancies_found": len(discrepancies),
                "healthy": len(discrepancies) == 0,
            },
            "discrepancies": discrepancies,
            "total_anomalies": len(discrepancies),
        }
