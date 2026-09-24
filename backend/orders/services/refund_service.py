from decimal import Decimal
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from orders.models import Order, Payment, Refund
from notifications.models import Notification
from .payment_providers.factory import get_payment_provider


class RefundService:
    """
    Authoritative service for student, merchant, and admin refunds.
    Enforces non-exceedance of captured payments, cumulative bounds, and gateway integration.
    """

    @classmethod
    def request_refund(cls, order_id: int, amount: Decimal, reason: str, user) -> Refund:
        """
        Creates a refund request. Validates that order was paid and cumulative refunds
        do not exceed original captured amount.
        """
        with transaction.atomic():
            order = Order.objects.select_for_update().get(id=order_id)

            if order.customer != user and not getattr(user, 'is_admin', False) and not (getattr(user, 'is_shop_owner', False) and order.shop.owner == user):
                raise PermissionDenied("You do not have permission to request a refund for this order.")

            if order.payment_status not in [Order.PaymentStatus.PAID, Order.PaymentStatus.PARTIALLY_REFUNDED]:
                raise ValidationError("Cannot request a refund for an unpaid or pending order.")

            payment = Payment.objects.select_for_update().filter(
                order=order,
                status__in=[Payment.Status.CAPTURED, Payment.Status.PARTIALLY_REFUNDED]
            ).order_by('-created_at').first()

            if not payment:
                raise ValidationError("No captured payment found for this order to refund.")

            amount = Decimal(str(amount)).quantize(Decimal('0.01'))
            if amount <= Decimal('0.00'):
                raise ValidationError("Refund amount must be greater than zero.")

            # Calculate cumulative approved/completed/processing refunds
            existing_total = Refund.objects.filter(
                order=order,
                status__in=[Refund.Status.REQUESTED, Refund.Status.APPROVED, Refund.Status.PROCESSING, Refund.Status.COMPLETED]
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            if existing_total + amount > payment.amount:
                max_allowable = max(Decimal('0.00'), payment.amount - existing_total)
                raise ValidationError(
                    f"Refund amount (₹{amount}) exceeds remaining refundable balance (₹{max_allowable}). "
                    f"Original payment: ₹{payment.amount}."
                )

            # Admins or shop owners can auto-approve; students submit as REQUESTED
            is_staff = getattr(user, 'is_admin', False) or (getattr(user, 'is_shop_owner', False) and order.shop.owner == user)
            initial_status = Refund.Status.APPROVED if is_staff else Refund.Status.REQUESTED

            refund = Refund.objects.create(
                payment=payment,
                order=order,
                amount=amount,
                reason=reason.strip() or "Customer refund request",
                status=initial_status,
                requested_by=user,
                approved_by=user if is_staff else None
            )

            # If auto-approved by staff, immediately dispatch to gateway
            if is_staff:
                cls.process_approved_refund(refund)

        return refund

    @classmethod
    def approve_refund(cls, refund_id: int, admin_user) -> Refund:
        """
        Approves a student-requested refund and dispatches to gateway.
        """
        with transaction.atomic():
            refund = Refund.objects.select_for_update().get(id=refund_id)
            order = refund.order

            is_admin = getattr(admin_user, 'is_admin', False)
            is_shop_owner = getattr(admin_user, 'is_shop_owner', False) and (order.shop.owner == admin_user)
            if not (is_admin or is_shop_owner):
                raise PermissionDenied("Only administrators or the shop owner can approve refunds.")

            if refund.status != Refund.Status.REQUESTED:
                raise ValidationError(f"Cannot approve refund in status '{refund.status}'.")

            refund.status = Refund.Status.APPROVED
            refund.approved_by = admin_user
            refund.save(update_fields=['status', 'approved_by', 'updated_at'])

            cls.process_approved_refund(refund)

        return refund

    @classmethod
    def reject_refund(cls, refund_id: int, admin_user, reason: str = '') -> Refund:
        """
        Rejects a refund request.
        """
        with transaction.atomic():
            refund = Refund.objects.select_for_update().get(id=refund_id)
            order = refund.order

            is_admin = getattr(admin_user, 'is_admin', False)
            is_shop_owner = getattr(admin_user, 'is_shop_owner', False) and (order.shop.owner == admin_user)
            if not (is_admin or is_shop_owner):
                raise PermissionDenied("Only administrators or the shop owner can reject refunds.")

            if refund.status != Refund.Status.REQUESTED:
                raise ValidationError(f"Cannot reject refund in status '{refund.status}'.")

            refund.status = Refund.Status.REJECTED
            refund.rejection_reason = reason.strip() or "Rejected by store/admin."
            refund.approved_by = admin_user
            refund.save(update_fields=['status', 'rejection_reason', 'approved_by', 'updated_at'])

            try:
                Notification.objects.create(
                    recipient=refund.requested_by,
                    title="Refund Request Declined",
                    message=f"Your refund request of ₹{refund.amount} for Order #{str(order.order_number)[:8]} was rejected. Reason: {refund.rejection_reason}",
                    notification_type=Notification.NotificationType.ORDER_STATUS,
                    reference_id=str(order.order_number)
                )
            except Exception:
                pass

        return refund

    @classmethod
    def process_approved_refund(cls, refund: Refund) -> dict:
        """
        Initiates gateway refund transaction and updates cumulative payment & order states.
        """
        payment = refund.payment
        order = refund.order
        provider = get_payment_provider()

        res = provider.initiate_refund(payment, refund)

        if not res.get('is_success', False):
            refund.status = Refund.Status.FAILED
            refund.rejection_reason = res.get('error_message') or "Gateway refund failed."
            refund.save(update_fields=['status', 'rejection_reason', 'updated_at'])
            return {"success": False, "error": refund.rejection_reason}

        now = timezone.now()
        refund.status = Refund.Status.COMPLETED
        refund.gateway_refund_id = res.get('gateway_refund_id', '')
        refund.processed_at = now
        refund.save(update_fields=['status', 'gateway_refund_id', 'processed_at', 'updated_at'])

        # Calculate completed refunds
        total_refunded = Refund.objects.filter(
            payment=payment,
            status=Refund.Status.COMPLETED
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        if total_refunded >= payment.amount:
            payment.status = Payment.Status.REFUNDED
            order.payment_status = Order.PaymentStatus.REFUNDED
        else:
            payment.status = Payment.Status.PARTIALLY_REFUNDED
            order.payment_status = Order.PaymentStatus.PARTIALLY_REFUNDED

        payment.save(update_fields=['status', 'updated_at'])
        order.save(update_fields=['payment_status', 'updated_at'])

        # Notify student
        try:
            Notification.objects.create(
                recipient=order.customer,
                title="Refund Processed Successfully",
                message=f"A refund of ₹{refund.amount} has been processed for Order #{str(order.order_number)[:8]}.",
                notification_type=Notification.NotificationType.ORDER_STATUS,
                reference_id=str(order.order_number)
            )
        except Exception:
            pass

        return {"success": True, "refund": refund}

    @classmethod
    def auto_refund_on_cancellation(cls, order: Order, user, reason: str = 'Order cancelled') -> Refund | None:
        """
        Automated trigger when a paid order is cancelled. Automatically issues a full refund.
        """
        if order.payment_status not in [Order.PaymentStatus.PAID, Order.PaymentStatus.PARTIALLY_REFUNDED]:
            return None

        payment = Payment.objects.filter(
            order=order,
            status__in=[Payment.Status.CAPTURED, Payment.Status.PARTIALLY_REFUNDED]
        ).order_by('-created_at').first()

        if not payment:
            return None

        completed_refunds = Refund.objects.filter(
            order=order,
            status=Refund.Status.COMPLETED
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

        refundable_balance = max(Decimal('0.00'), payment.amount - completed_refunds)
        if refundable_balance <= Decimal('0.00'):
            return None

        with transaction.atomic():
            refund = Refund.objects.create(
                payment=payment,
                order=order,
                amount=refundable_balance,
                reason=f"Automatic refund on order cancellation: {reason}",
                status=Refund.Status.APPROVED,
                requested_by=user,
                approved_by=order.shop.owner if getattr(order, 'shop', None) else user
            )
            cls.process_approved_refund(refund)
            return refund
