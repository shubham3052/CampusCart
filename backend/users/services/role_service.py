import logging
from django.core.exceptions import ValidationError
from django.db import transaction
from users.models import User, UserRole, AuditLog
from users.services.audit_service import AuditService

logger = logging.getLogger(__name__)


class RoleService:
    """
    Centralized service for managing user role assignments, role removals,
    and active role transitions in a secure, relational multi-role architecture.
    """

    @classmethod
    @transaction.atomic
    def assign_role(cls, user: User, role: str, assigned_by=None, is_active: bool = True, request=None):
        """
        Assigns a role to a user.
        Preserves existing roles without deleting or overwriting them.
        Ensures strict Platform Owner protection.
        """
        if role not in User.Role.values:
            raise ValidationError(f"Invalid role '{role}'. Allowed roles: {list(User.Role.values)}")

        # Platform Owner Exclusivity: Owner cannot possess any other roles
        if user.is_platform_owner or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com':
            if role != User.Role.PLATFORM_OWNER:
                AuditService.log(
                    action=AuditLog.Action.OWNER_REJECTED_MODIFICATION,
                    actor=assigned_by or user,
                    actor_email=getattr(assigned_by, 'email', 'SYSTEM'),
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"operation": "ASSIGN_ROLE_TO_OWNER_REJECTED", "attempted_role": role, "reason": "Platform Owner is an exclusive role."},
                    request=request
                )
                raise ValidationError("Platform Owner is an exclusive role and cannot possess additional roles.")

        # Platform Owner Escalation Prevention: Only existing Platform Owner can grant PLATFORM_OWNER
        if role == User.Role.PLATFORM_OWNER:
            assigned_by_is_owner = assigned_by and getattr(assigned_by, 'is_platform_owner', False)
            user_already_owner = getattr(user, 'is_platform_owner', False)
            if not assigned_by_is_owner and not user_already_owner:
                AuditService.log(
                    action=AuditLog.Action.OWNER_REJECTED_MODIFICATION,
                    actor=assigned_by or user,
                    actor_email=getattr(assigned_by, 'email', 'ANONYMOUS'),
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"operation": "ASSIGN_PLATFORM_OWNER_REJECTED", "reason": "Only Platform Owner can grant the PLATFORM_OWNER role."},
                    request=request
                )
                raise ValidationError("Only an existing Platform Owner can grant the PLATFORM_OWNER role.")

            # Deactivate any non-PLATFORM_OWNER roles to ensure exclusivity
            UserRole.objects.filter(user=user).exclude(role=User.Role.PLATFORM_OWNER).update(is_active=False)

        user_role, created = UserRole.objects.get_or_create(
            user=user,
            role=role,
            defaults={'is_active': is_active}
        )
        if not created and not user_role.is_active and is_active:
            user_role.is_active = True
            user_role.save(update_fields=['is_active', 'updated_at'])

        # If user has no active role or if this is their primary role, keep user.role synced
        if not user.role or role == User.Role.PLATFORM_OWNER:
            user.role = role
            user.save(update_fields=['role'])

        # Log audit record
        actor_email = assigned_by.email if assigned_by else (user.email if user else "SYSTEM")
        AuditService.log(
            action=AuditLog.Action.ROLE_CHANGED,
            actor=assigned_by or user,
            actor_email=actor_email,
            target_model='User',
            target_id=str(user.id),
            metadata={
                "operation": "ASSIGN_ROLE",
                "role": role,
                "created": created,
                "is_active": is_active,
                "assigned_by": getattr(assigned_by, 'email', 'SYSTEM'),
            },
            request=request
        )

        return user_role, created

    @classmethod
    @transaction.atomic
    def remove_role(cls, user: User, role: str, removed_by=None, request=None):
        """
        Safely removes a role from a user account.
        Prevents removing the last active role of an account.
        Prevents unauthorized removal of PLATFORM_OWNER.
        """
        if role not in User.Role.values:
            raise ValidationError(f"Invalid role '{role}'.")

        # Platform Owner Protection
        if role == User.Role.PLATFORM_OWNER or user.is_platform_owner or user.email.lower() == 'garibhokya@gmail.com':
            if not removed_by or not getattr(removed_by, 'is_platform_owner', False):
                AuditService.log(
                    action=AuditLog.Action.OWNER_REJECTED_MODIFICATION,
                    actor=removed_by or user,
                    actor_email=getattr(removed_by, 'email', 'ANONYMOUS'),
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"operation": "REMOVE_PLATFORM_OWNER_REJECTED", "reason": "Only Platform Owner can revoke PLATFORM_OWNER role."},
                    request=request
                )
                raise ValidationError("Only Platform Owner can revoke the PLATFORM_OWNER role.")

            if user.email.lower() == 'garibhokya@gmail.com' or getattr(user, 'is_platform_owner', False):
                AuditService.log(
                    action=AuditLog.Action.OWNER_REJECTED_DELETION,
                    actor=removed_by or user,
                    actor_email=getattr(removed_by, 'email', 'SYSTEM'),
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"operation": "REMOVE_PLATFORM_OWNER_REJECTED", "reason": "The Platform Owner role cannot be removed from this account."},
                    request=request
                )
                raise ValidationError("The Platform Owner role cannot be removed from this account.")

        user_role = UserRole.objects.filter(user=user, role=role, is_active=True).first()
        if not user_role:
            return False

        # Guard: User must maintain at least one active role
        remaining_roles = list(UserRole.objects.filter(user=user, is_active=True).exclude(role=role).values_list('role', flat=True))
        if not remaining_roles:
            raise ValidationError("Cannot remove the last remaining active role of a user account.")

        # Deactivate role membership
        user_role.is_active = False
        user_role.save(update_fields=['is_active', 'updated_at'])

        # If the removed role was active, switch primary role to one of remaining roles
        try:
            user.refresh_from_db(fields=['role'])
        except Exception:
            pass
        if user.role == role or user.role not in remaining_roles:
            user.role = remaining_roles[0]
            user.save(update_fields=['role'])

        actor_email = removed_by.email if removed_by else "SYSTEM"
        AuditService.log(
            action=AuditLog.Action.ROLE_CHANGED,
            actor=removed_by or user,
            actor_email=actor_email,
            target_model='User',
            target_id=str(user.id),
            metadata={
                "operation": "REMOVE_ROLE",
                "role": role,
                "removed_by": getattr(removed_by, 'email', 'SYSTEM'),
                "fallback_role": user.role,
            },
            request=request
        )

        return True

    @classmethod
    def get_user_roles(cls, user: User):
        """Returns all active authorized role strings for the given user."""
        return user.roles

    @classmethod
    def switch_active_role(cls, user: User, target_role: str, request=None):
        """
        Validates that user possesses target_role and sets it as the active role.
        Platform Owner is strictly prohibited from switching roles.
        """
        if user.is_platform_owner or user.has_role(User.Role.PLATFORM_OWNER) or user.email.lower() == 'garibhokya@gmail.com':
            if target_role != User.Role.PLATFORM_OWNER:
                AuditService.log(
                    action=AuditLog.Action.OWNER_REJECTED_ROLE_SWITCH,
                    actor=user,
                    actor_email=user.email,
                    target_model='User',
                    target_id=str(user.id),
                    metadata={"operation": "SWITCH_ROLE_REJECTED", "attempted_role": target_role, "reason": "Platform Owner cannot switch roles."},
                    request=request
                )
                raise ValidationError("Platform Owner cannot switch to another role.")

        if not user.has_role(target_role):
            raise ValidationError(f"User is not authorized for role '{target_role}'.")
        user.active_role = target_role
        user.save(update_fields=['role'])
        return user
