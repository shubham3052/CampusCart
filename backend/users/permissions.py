from rest_framework import permissions

class IsStudent(permissions.BasePermission):
    """
    Allows access only to authenticated users with the STUDENT role.
    """
    message = "Access restricted to student accounts."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_student)


class IsShopOwner(permissions.BasePermission):
    """
    Allows access only to authenticated users with the SHOP_OWNER role.
    """
    message = "Access restricted to registered shop owners."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_shop_owner)


class IsPlatformOwner(permissions.BasePermission):
    """
    Allows access only to authenticated users with the PLATFORM_OWNER role.
    Students, Shop Owners, Delivery Agents, and Admins are strictly denied.
    """
    message = "Access restricted to Platform Owner."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, 'role', None) == 'PLATFORM_OWNER'
        )


class IsAdmin(permissions.BasePermission):
    """
    Allows access only to system administrators or superusers.
    """
    message = "Access restricted to system administrators."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_admin)


class IsShopOwnerOrAdmin(permissions.BasePermission):
    """
    Allows access to either shop owners or system administrators.
    """
    message = "Access restricted to shop owners and administrators."

    def has_permission(self, request, view):
        return bool(
            request.user and request.user.is_authenticated and (request.user.is_shop_owner or request.user.is_admin)
        )


class IsShopEntityOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission: Ensures that Shop Owner A can only edit entities
    (products, inventory, printing queue, pickup slots) that belong to their own shop.
    """
    message = "You do not have permission to modify assets belonging to another shop."

    def has_object_permission(self, request, view, obj):
        # Safe methods (GET, HEAD, OPTIONS) can be allowed if publicly browseable
        if request.method in permissions.SAFE_METHODS:
            return True

        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_admin:
            return True

        # Check shop ownership on various object types
        shop = getattr(obj, 'shop', None)
        if shop is None and hasattr(obj, 'owner'):
            shop = obj  # obj is a Shop instance

        if shop and hasattr(shop, 'owner'):
            return shop.owner == request.user

        return False


class IsOwnerOrAdmin(permissions.BasePermission):
    """
    Object-level permission: User can only access/modify their own personal records
    (e.g., student notes, tasks, shopping lists, notifications).
    """
    message = "You do not have permission to access records belonging to another user."

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_admin:
            return True

        user_field = getattr(obj, 'user', None) or getattr(obj, 'student', None) or getattr(obj, 'customer', None) or getattr(obj, 'recipient', None)
        return user_field == request.user


class IsOrderParticipantOrAdmin(permissions.BasePermission):
    """
    Object-level permission for Orders:
    - Admin: Full access.
    - Shop Owner: Can view and update orders belonging to their own shop.
    - Student: Can view their own orders.
    """
    message = "You do not have permission to access or modify this order."

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_admin:
            return True

        # Shop owner of the order's shop
        if request.user.is_shop_owner and obj.shop and obj.shop.owner == request.user:
            return True

        # Customer who placed the order
        if obj.customer == request.user:
            return True

        # Delivery agent assigned to order
        if hasattr(obj, 'delivery_details') and obj.delivery_details.delivery_agent == request.user:
            return True

        return False

