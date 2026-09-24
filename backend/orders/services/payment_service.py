import uuid
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from django.core.exceptions import ValidationError, PermissionDenied
from orders.models import Order, Payment
from notifications.models import Notification
from .payment_providers.factory import get_payment_provider


class PaymentService:
    """
    Authoritative Payment Service for campus orders.
    Coordinates gateway order initialization, cryptographic verification,
    idempotency guards, cash collection audits, and webhook ingestion.
    """

    @classmethod
    def initialize_payment(cls, order: Order, user, payment_method: str = None, idempotency_key: str = None) -> dict:
        """
        Creates or retrieves an authoritative Payment record for an order.
        Validates shop acceptance of the payment method and computes platform commissions.
        """
        method = payment_method or order.payment_method or Order.PaymentMethod.COD

        # Validate shop payment method capabilities
        shop = order.shop
        if method == Order.PaymentMethod.COD and not getattr(shop, 'is_cod_enabled', True):
            raise ValidationError(f"Store '{shop.name}' does not accept Cash on Delivery.")
        elif method == Order.PaymentMethod.PICKUP_CASH and not getattr(shop, 'is_pickup_cash_enabled', True):
            raise ValidationError(f"Store '{shop.name}' does not accept Cash on Pickup.")
        elif method in [Order.PaymentMethod.ONLINE, Order.PaymentMethod.UPI] and not getattr(shop, 'is_online_enabled', True):
            raise ValidationError(f"Store '{shop.name}' is not configured for online payments.")

        # Authoritative commission split
        commission_rate = getattr(shop, 'commission_rate', Decimal('5.00')) or Decimal('5.00')
        platform_fee = (order.total_amount * (commission_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
        merchant_payout = max(Decimal('0.00'), order.total_amount - platform_fee)

        # Idempotency handling
        key = idempotency_key.strip() if idempotency_key else str(uuid.uuid4())
        existing = Payment.objects.filter(idempotency_key=key).first()
        if existing:
            if existing.order_id == order.id and existing.status not in [Payment.Status.FAILED, Payment.Status.CANCELLED]:
                return {
                    "payment": existing,
                    "session": {
                        "gateway": existing.gateway,
                        "gateway_order_id": existing.gateway_order_id,
                        "amount": float(existing.amount),
                        "currency": existing.currency,
                        "idempotency_key": existing.idempotency_key,
                    }
                }
            # Key used by a different order or expired session: re-generate fresh key
            key = str(uuid.uuid4())

        provider = get_payment_provider()

        with transaction.atomic():
            payment = Payment.objects.create(
                order=order,
                user=user,
                shop=shop,
                amount=order.total_amount,
                currency='INR',
                payment_method=method,
                status=Payment.Status.CREATED,
                gateway=provider.provider_name if method in [Order.PaymentMethod.ONLINE, Order.PaymentMethod.UPI] else 'CASH',
                idempotency_key=key,
                platform_fee=platform_fee,
                merchant_payout=merchant_payout,
            )

            session_data = {}
            if method in [Order.PaymentMethod.ONLINE, Order.PaymentMethod.UPI]:
                session_data = provider.create_payment_order(payment)
            else:
                payment.status = Payment.Status.PENDING
                payment.save(update_fields=['status', 'updated_at'])
                session_data = {
                    "gateway": "CASH",
                    "payment_method": method,
                    "amount": float(payment.amount),
                    "currency": payment.currency,
                    "idempotency_key": payment.idempotency_key,
                }

        return {
            "payment": payment,
            "session": session_data,
        }

    @classmethod
    def verify_payment(cls, payment_id: int, verification_data: dict, user) -> dict:
        """
        Cryptographically validates and captures payment.
        Guarantees idempotency: multiple calls with the same payload will not cause duplicate captures.
        """
        with transaction.atomic():
            try:
                payment = Payment.objects.select_for_update().get(id=payment_id)
            except Payment.DoesNotExist:
                return {"success": False, "error": "Payment record not found."}

            order = Order.objects.select_for_update().get(id=payment.order_id)

            # Idempotency check
            if payment.status in [Payment.Status.CAPTURED, Payment.Status.REFUNDED, Payment.Status.PARTIALLY_REFUNDED]:
                return {
                    "success": True,
                    "already_processed": True,
                    "payment": payment,
                    "order": order,
                    "message": "Payment has already been confirmed and captured.",
                }

            provider = get_payment_provider()
            res = provider.verify_payment(payment, verification_data)

            if not res.get('is_valid', False):
                payment.status = Payment.Status.FAILED
                payment.failure_reason = res.get('error_message') or "Signature mismatch or payment declined."
                payment.save(update_fields=['status', 'failure_reason', 'updated_at'])

                order.payment_status = Order.PaymentStatus.FAILED
                order.save(update_fields=['payment_status', 'updated_at'])

                return {
                    "success": False,
                    "error": payment.failure_reason,
                    "payment": payment,
                    "order": order,
                }

            # Valid Payment: transition to CAPTURED and order to PAID
            now = timezone.now()
            payment.status = Payment.Status.CAPTURED
            payment.gateway_payment_id = res.get('gateway_payment_id', '')
            payment.gateway_signature = res.get('gateway_signature', '')
            payment.paid_at = now
            payment.save(update_fields=['status', 'gateway_payment_id', 'gateway_signature', 'paid_at', 'updated_at'])

            order.payment_status = Order.PaymentStatus.PAID
            if order.status == Order.Status.PENDING:
                order.status = Order.Status.CONFIRMED
            order.save(update_fields=['payment_status', 'status', 'updated_at'])

            # Send Notification
            try:
                Notification.objects.create(
                    recipient=order.customer,
                    title="Payment Confirmed!",
                    message=f"Your payment of ₹{payment.amount} for Order #{str(order.order_number)[:8]} was successful.",
                    notification_type=Notification.NotificationType.ORDER_STATUS,
                    reference_id=str(order.order_number)
                )
            except Exception:
                pass

        return {
            "success": True,
            "payment": payment,
            "order": order,
            "message": "Payment verified and captured successfully.",
        }

    @classmethod
    def retry_payment(cls, order_id: int, user) -> dict:
        """
        Creates a new payment attempt for an existing pending or failed order.
        Avoids creating duplicate orders and maintains reserved stock.
        """
        order = Order.objects.get(id=order_id)
        if order.customer != user and not getattr(user, 'is_admin', False):
            raise PermissionDenied("You can only retry payment for your own orders.")

        if order.payment_status == Order.PaymentStatus.PAID:
            raise ValidationError("This order is already paid.")

        if order.status == Order.Status.CANCELLED:
            raise ValidationError("Cannot retry payment for a cancelled order.")

        return cls.initialize_payment(order, user, payment_method=Order.PaymentMethod.ONLINE)

    @classmethod
    def mark_cash_collected(cls, order_id: int, user, notes: str = '') -> dict:
        """
        Audited endpoint allowing delivery agents, shop owners, or admins to mark COD or Counter Pickup cash as collected.
        """
        with transaction.atomic():
            order = Order.objects.select_for_update().get(id=order_id)
            is_admin = getattr(user, 'is_admin', False)
            is_shop_owner = getattr(user, 'is_shop_owner', False) and (order.shop.owner == user)
            is_delivery_agent = False

            if hasattr(order, 'delivery_details'):
                delivery = order.delivery_details
                is_delivery_agent = (delivery.delivery_person == user)

            if not (is_admin or is_shop_owner or is_delivery_agent):
                raise PermissionDenied("You are not authorized to mark cash collection for this order.")

            payment = Payment.objects.select_for_update().filter(
                order=order,
                payment_method__in=[Order.PaymentMethod.COD, Order.PaymentMethod.PICKUP_CASH]
            ).order_by('-created_at').first()

            now = timezone.now()
            if not payment:
                commission_rate = getattr(order.shop, 'commission_rate', Decimal('5.00')) or Decimal('5.00')
                platform_fee = (order.total_amount * (commission_rate / Decimal('100.00'))).quantize(Decimal('0.01'))
                payment = Payment.objects.create(
                    order=order,
                    user=order.customer,
                    shop=order.shop,
                    amount=order.total_amount,
                    currency='INR',
                    payment_method=order.payment_method,
                    status=Payment.Status.CAPTURED,
                    gateway='CASH',
                    idempotency_key=str(uuid.uuid4()),
                    platform_fee=platform_fee,
                    merchant_payout=max(Decimal('0.00'), order.total_amount - platform_fee),
                    collected_by=user,
                    paid_at=now
                )
            else:
                payment.status = Payment.Status.CAPTURED
                payment.collected_by = user
                payment.paid_at = now
                payment.save(update_fields=['status', 'collected_by', 'paid_at', 'updated_at'])

            order.payment_status = Order.PaymentStatus.PAID
            order.save(update_fields=['payment_status', 'updated_at'])

        return {
            "success": True,
            "payment": payment,
            "order": order,
            "message": f"Cash payment of ₹{payment.amount} recorded as collected by {user.username}.",
        }

    @classmethod
    def process_webhook(cls, payload: bytes | str, signature: str, headers: dict) -> dict:
        """
        Validates and processes external gateway webhooks idempotently.
        """
        provider = get_payment_provider()
        res = provider.verify_webhook(payload, signature, headers)
        if not res.get('is_valid', False):
            return {"success": False, "error": "Invalid webhook signature."}

        event_type = res.get('event_type')
        gateway_order_id = res.get('gateway_order_id')
        gateway_payment_id = res.get('gateway_payment_id')

        payment = Payment.objects.filter(gateway_order_id=gateway_order_id).first()
        if not payment and gateway_payment_id:
            payment = Payment.objects.filter(gateway_payment_id=gateway_payment_id).first()

        if not payment:
            return {"success": False, "error": "Associated payment record not found."}

        if event_type == 'payment.captured' and payment.status != Payment.Status.CAPTURED:
            with transaction.atomic():
                now = timezone.now()
                payment.status = Payment.Status.CAPTURED
                payment.gateway_payment_id = gateway_payment_id or payment.gateway_payment_id
                payment.gateway_signature = signature
                payment.paid_at = now
                payment.save(update_fields=['status', 'gateway_payment_id', 'gateway_signature', 'paid_at', 'updated_at'])

                order = Order.objects.select_for_update().get(id=payment.order_id)
                order.payment_status = Order.PaymentStatus.PAID
                if order.status == Order.Status.PENDING:
                    order.status = Order.Status.CONFIRMED
                order.save(update_fields=['payment_status', 'status', 'updated_at'])

                try:
                    Notification.objects.create(
                        recipient=order.customer,
                        title="Payment Confirmed!",
                        message=f"Your payment of ₹{payment.amount} for Order #{str(order.order_number)[:8]} was confirmed via webhook.",
                        notification_type=Notification.NotificationType.ORDER_STATUS,
                        reference_id=str(order.order_number)
                    )
                except Exception:
                    pass
        elif event_type == 'payment.failed' and payment.status != Payment.Status.FAILED:
            payment.status = Payment.Status.FAILED
            payment.failure_reason = "Payment marked failed via webhook."
            payment.save(update_fields=['status', 'failure_reason', 'updated_at'])

        return {"success": True, "event": event_type, "payment_id": payment.id}
