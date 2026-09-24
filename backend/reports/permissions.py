from rest_framework import permissions


class IsAdminForReports(permissions.BasePermission):
    """
    Strict permission class ensuring that only authorized Platform Administrators
    can access reports, analytics queries, or download data exports.
    Students, shop owners, delivery couriers, and unauthenticated users are denied.
    """
    message = "Administrative clearance required. Access restricted to system administrators."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False

        # Support both is_admin attribute / property and role check
        is_admin_flag = getattr(user, 'is_admin', False)
        is_staff_flag = getattr(user, 'is_staff', False)
        is_superuser_flag = getattr(user, 'is_superuser', False)
        role_flag = getattr(user, 'role', '') == 'ADMIN'

        return bool(is_admin_flag or is_staff_flag or is_superuser_flag or role_flag)
