from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied, NotFound
from shops.models import Shop


class IsShopOwnerForAnalytics(permissions.BasePermission):
    """
    Ensures that only authenticated Shop Owners or Administrators can access shop analytics.
    Shop Owners are strictly constrained to their own registered shop.
    Students, delivery agents, and unauthenticated users are denied.
    """
    message = "Access restricted to authorized shop owners."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        if user.is_admin:
            return True

        if user.is_shop_owner or user.role == 'SHOP_OWNER':
            # Verify shop owner actually owns a shop
            shop = getattr(user, 'owned_shop', None)
            if not shop:
                shop = Shop.objects.filter(owner=user).first()
            if not shop:
                raise NotFound("No active shop found associated with this account.")
            return True

        return False


class IsAdminForAnalytics(permissions.BasePermission):
    """
    Ensures that only Platform Administrators can access system-wide analytics
    and multi-shop comparison datasets.
    """
    message = "Access restricted to system administrators."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_admin)


class IsStudentForAnalytics(permissions.BasePermission):
    """
    Ensures that only authenticated Students can access personal student analytics summaries.
    """
    message = "Access restricted to student accounts."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_student or user.role == 'STUDENT'))


def get_authorized_shop_for_request(request):
    """
    Helper to resolve the authoritative Shop instance for an analytics request:
    - For Shop Owners: Strictly returns their own shop, ignoring any foreign query parameters.
    - For Admins: Accepts an optional ?shop=<id> parameter; if omitted, returns None (platform-wide).
    """
    user = request.user
    if user.is_admin:
        shop_id = request.query_params.get('shop')
        if shop_id:
            try:
                return Shop.objects.get(pk=shop_id)
            except Shop.DoesNotExist:
                raise NotFound(f"Shop #{shop_id} does not exist.")
        return None

    # For shop owners, enforce strict tenant isolation
    shop = getattr(user, 'owned_shop', None)
    if not shop:
        shop = Shop.objects.filter(owner=user).first()
    if not shop:
        raise NotFound("No active shop registered for your account.")

    # Guard: If a shop owner maliciously submitted another shop's ID in query parameters
    param_shop = request.query_params.get('shop')
    if param_shop and str(param_shop) != str(shop.id):
        raise PermissionDenied("You do not have permission to view analytics for another shop.")

    return shop
