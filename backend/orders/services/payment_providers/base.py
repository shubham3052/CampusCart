from abc import ABC, abstractmethod
from typing import Dict, Any


class PaymentProvider(ABC):
    """
    Abstract Base Class for Payment Gateway Providers.
    Decouples core order and checkout business logic from vendor-specific SDKs.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name/slug of the payment gateway provider."""
        pass

    @abstractmethod
    def create_payment_order(self, payment) -> Dict[str, Any]:
        """
        Initializes an external gateway order for an authoritative payment record.
        Returns dictionary containing gateway identifiers, client key, and session attributes.
        """
        pass

    @abstractmethod
    def verify_payment(self, payment, verification_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Cryptographically or authoritatively validates payment completion.
        Returns:
            {
                "is_valid": bool,
                "gateway_payment_id": str,
                "gateway_signature": str,
                "error_message": str | None,
            }
        """
        pass

    @abstractmethod
    def initiate_refund(self, payment, refund) -> Dict[str, Any]:
        """
        Submits a refund request to the gateway.
        Returns:
            {
                "is_success": bool,
                "gateway_refund_id": str,
                "error_message": str | None,
            }
        """
        pass

    @abstractmethod
    def verify_webhook(self, payload: bytes | str, signature: str, headers: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates webhook authenticity and unpacks event data.
        Returns:
            {
                "is_valid": bool,
                "event_type": str,
                "gateway_order_id": str | None,
                "gateway_payment_id": str | None,
                "amount": float | None,
                "status": str | None,
                "raw_event": dict,
            }
        """
        pass

    @abstractmethod
    def get_payment_status(self, payment) -> Dict[str, Any]:
        """Queries gateway for current transaction state."""
        pass
