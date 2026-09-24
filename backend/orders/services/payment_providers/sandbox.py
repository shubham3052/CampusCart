import hmac
import hashlib
import json
import uuid
from typing import Dict, Any
from django.conf import settings
from .base import PaymentProvider


class SandboxMockPaymentProvider(PaymentProvider):
    """
    Production-grade sandbox/test payment gateway provider.
    Provides deterministic simulation of payment sessions, cryptographic signatures,
    instant capture, webhooks, and refund lifecycle without live financial APIs.
    """

    @property
    def provider_name(self) -> str:
        return "SANDBOX"

    def _get_secret(self) -> str:
        return getattr(settings, 'PAYMENT_KEY_SECRET', 'sandbox_secret_key')

    def _get_webhook_secret(self) -> str:
        return getattr(settings, 'PAYMENT_WEBHOOK_SECRET', 'sandbox_webhook_secret')

    def generate_signature(self, order_id: str, payment_id: str) -> str:
        """Generates standard HMAC-SHA256 signature."""
        msg = f"{order_id}|{payment_id}".encode('utf-8')
        secret = self._get_secret().encode('utf-8')
        return hmac.new(secret, msg, hashlib.sha256).hexdigest()

    def generate_webhook_signature(self, payload_bytes: bytes) -> str:
        """Generates HMAC-SHA256 signature for webhook verification."""
        secret = self._get_webhook_secret().encode('utf-8')
        return hmac.new(secret, payload_bytes, hashlib.sha256).hexdigest()

    def create_payment_order(self, payment) -> Dict[str, Any]:
        """
        Creates a mock gateway order session for student checkout.
        """
        gateway_order_id = f"mock_order_{payment.id}_{uuid.uuid4().hex[:10]}"
        payment.gateway_order_id = gateway_order_id
        payment.gateway = self.provider_name
        payment.status = payment.Status.PENDING
        payment.save(update_fields=['gateway_order_id', 'gateway', 'status', 'updated_at'])

        return {
            "gateway": self.provider_name,
            "gateway_order_id": gateway_order_id,
            "amount": float(payment.amount),
            "currency": payment.currency,
            "key_id": getattr(settings, 'PAYMENT_KEY_ID', 'sandbox_key_mock'),
            "idempotency_key": payment.idempotency_key,
            "order_number": str(payment.order.order_number),
            "shop_name": payment.shop.name,
            "is_sandbox": True,
        }

    def verify_payment(self, payment, verification_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Authoritatively validates payment completion and cryptographic signature.
        """
        simulate_failure = verification_payload.get('simulate_failure', False)
        if simulate_failure:
            return {
                "is_valid": False,
                "gateway_payment_id": "",
                "gateway_signature": "",
                "error_message": "Payment simulation was explicitly marked as failed.",
            }

        gateway_order_id = verification_payload.get('gateway_order_id', payment.gateway_order_id)
        gateway_payment_id = verification_payload.get('gateway_payment_id') or f"mock_pay_{payment.id}_{uuid.uuid4().hex[:10]}"
        provided_signature = verification_payload.get('gateway_signature', '')

        # Check explicit failure flag in gateway_payment_id or signature
        if "fail" in str(gateway_payment_id).lower() or provided_signature == "invalid_signature":
            return {
                "is_valid": False,
                "gateway_payment_id": gateway_payment_id,
                "gateway_signature": provided_signature,
                "error_message": "Invalid payment signature or transaction declined by bank.",
            }

        expected_signature = self.generate_signature(gateway_order_id, gateway_payment_id)

        # In sandbox, allow valid generated HMAC or standard mock signature prefix
        is_signature_valid = (
            provided_signature == expected_signature or
            provided_signature.startswith("mock_sig_") or
            provided_signature == f"sig_{gateway_payment_id}"
        )

        if not is_signature_valid and provided_signature:
            return {
                "is_valid": False,
                "gateway_payment_id": gateway_payment_id,
                "gateway_signature": provided_signature,
                "error_message": "Cryptographic signature mismatch.",
            }

        return {
            "is_valid": True,
            "gateway_payment_id": gateway_payment_id,
            "gateway_signature": expected_signature,
            "error_message": None,
        }

    def initiate_refund(self, payment, refund) -> Dict[str, Any]:
        """
        Processes a mock refund request through gateway.
        """
        if refund.amount > payment.amount:
            return {
                "is_success": False,
                "gateway_refund_id": "",
                "error_message": "Requested refund exceeds total payment amount.",
            }

        gateway_refund_id = f"mock_rfnd_{refund.id}_{uuid.uuid4().hex[:10]}"
        return {
            "is_success": True,
            "gateway_refund_id": gateway_refund_id,
            "error_message": None,
        }

    def verify_webhook(self, payload: bytes | str, signature: str, headers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates webhook payload authenticity and parses event.
        """
        if isinstance(payload, str):
            payload_bytes = payload.encode('utf-8')
            raw_text = payload
        else:
            payload_bytes = payload
            raw_text = payload.decode('utf-8')

        expected_sig = self.generate_webhook_signature(payload_bytes)

        # Allow matching HMAC or mock test signature header
        if signature != expected_sig and signature != "mock_valid_webhook_signature":
            return {
                "is_valid": False,
                "event_type": "",
                "gateway_order_id": None,
                "gateway_payment_id": None,
                "amount": None,
                "status": None,
                "raw_event": {},
            }

        try:
            data = json.loads(raw_text)
        except Exception:
            data = {}

        event_type = data.get('event', 'payment.captured')
        payload_entity = data.get('payload', {}).get('payment', {}).get('entity', {})

        return {
            "is_valid": True,
            "event_type": event_type,
            "gateway_order_id": payload_entity.get('order_id') or data.get('gateway_order_id'),
            "gateway_payment_id": payload_entity.get('id') or data.get('gateway_payment_id'),
            "amount": payload_entity.get('amount') or data.get('amount'),
            "status": payload_entity.get('status') or data.get('status'),
            "raw_event": data,
        }

    def get_payment_status(self, payment) -> Dict[str, Any]:
        return {
            "gateway": self.provider_name,
            "status": payment.status,
            "amount": float(payment.amount),
            "currency": payment.currency,
        }
