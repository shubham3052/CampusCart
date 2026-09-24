import sys
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle, ScopedRateThrottle


class EnvironmentAwareAnonRateThrottle(AnonRateThrottle):
    """
    Anonymous IP rate throttle that automatically deactivates during automated tests
    to prevent blocking test suites from running at machine velocity.
    """
    def allow_request(self, request, view):
        if 'test' in sys.argv:
            return True
        return super().allow_request(request, view)


class EnvironmentAwareUserRateThrottle(UserRateThrottle):
    """
    Authenticated user rate throttle that automatically deactivates during automated tests.
    """
    def allow_request(self, request, view):
        if 'test' in sys.argv:
            return True
        return super().allow_request(request, view)


class EnvironmentAwareScopedRateThrottle(ScopedRateThrottle):
    """
    Endpoint-scoped rate throttle that allows fine-grained limits
    (auth, otp, payment, upload, coupons, gps) while respecting test execution.
    """
    def allow_request(self, request, view):
        if 'test' in sys.argv:
            return True
        return super().allow_request(request, view)
