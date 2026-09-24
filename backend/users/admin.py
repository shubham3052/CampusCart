from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, EmailVerificationOTP, AuditLog


@admin.register(User)
class CustomUserAdmin(BaseUserAdmin):
    list_display = (
        'username',
        'email',
        'role',
        'email_verified',
        'availability_status',
        'is_active',
        'created_at'
    )
    list_filter = ('role', 'email_verified', 'is_active', 'availability_status')
    search_fields = ('username', 'email', 'first_name', 'last_name', 'phone_number', 'college_id')
    fieldsets = BaseUserAdmin.fieldsets + (
        (
            'Smart Stationery Attributes',
            {
                'fields': (
                    'role',
                    'email_verified',
                    'availability_status',
                    'phone_number',
                    'college_id',
                    'department',
                    'hostel_block',
                    'room_number',
                )
            },
        ),
    )


@admin.register(EmailVerificationOTP)
class EmailVerificationOTPAdmin(admin.ModelAdmin):
    list_display = (
        'email',
        'purpose',
        'is_verified',
        'attempts',
        'max_attempts',
        'resend_count',
        'expires_at',
        'created_at'
    )
    list_filter = ('purpose', 'is_verified', 'created_at')
    search_fields = ('email', 'user__username', 'user__email')
    readonly_fields = (
        'otp_hash',
        'attempts',
        'max_attempts',
        'resend_count',
        'expires_at',
        'last_sent_at',
        'is_verified',
        'verified_at',
        'created_at',
        'updated_at'
    )


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'action', 'actor_display', 'target_model', 'target_id', 'ip_address')
    list_filter = ('action', 'target_model', 'timestamp')
    search_fields = ('actor_email', 'actor__username', 'target_id', 'ip_address', 'action')

    def actor_display(self, obj):
        return obj.actor_email or (obj.actor.username if obj.actor else 'SYSTEM')
    actor_display.short_description = 'Actor'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

