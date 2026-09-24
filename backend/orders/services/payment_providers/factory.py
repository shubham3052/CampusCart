from django.conf import settings
from .base import PaymentProvider
from .sandbox import SandboxMockPaymentProvider


def get_payment_provider() -> PaymentProvider:
    """
    Factory function to retrieve the configured payment gateway provider.
    Defaults to SandboxMockPaymentProvider for tests and development.
    """
    gateway_name = getattr(settings, 'PAYMENT_GATEWAY', 'SANDBOX').upper()

    if gateway_name == 'SANDBOX':
        return SandboxMockPaymentProvider()
    
    # Live providers can be instantiated here when credentials are supplied
    # e.g., if gateway_name == 'RAZORPAY': return RazorpayPaymentProvider()
    
    return SandboxMockPaymentProvider()
