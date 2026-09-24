import os
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from users.models import AuditLog
from users.services.audit_service import AuditService

User = get_user_model()


class Command(BaseCommand):
    help = 'Idempotently initializes, creates, or configures the permanent System Owner account.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--email',
            type=str,
            default=os.getenv('SYSTEM_OWNER_EMAIL', 'garibhokya@gmail.com'),
            help='System Owner email address (defaults to garibhokya@gmail.com)'
        )
        parser.add_argument(
            '--password',
            type=str,
            default=os.getenv('SYSTEM_OWNER_PASSWORD', 'SystemOwner2026!'),
            help='Application password for the System Owner (not the Gmail password)'
        )
        parser.add_argument(
            '--name',
            type=str,
            default='System Owner',
            help='System Owner display name'
        )
        parser.add_argument(
            '--phone',
            type=str,
            default='',
            help='System Owner contact phone number'
        )

    def handle(self, *args, **options):
        email = options['email'].strip().lower()
        password = options['password']
        name = options['name'].strip()
        phone = options.get('phone', '').strip()

        parts = name.split(' ', 1)
        first_name = parts[0]
        last_name = parts[1] if len(parts) > 1 else ''

        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': first_name,
                'last_name': last_name,
                'role': User.Role.PLATFORM_OWNER,
                'phone_number': phone or None,
                'is_staff': True,
                'is_superuser': True,
                'email_verified': True,
                'is_active': True,
            }
        )

        user.role = User.Role.PLATFORM_OWNER
        if first_name and not user.first_name:
            user.first_name = first_name
        if last_name and not user.last_name:
            user.last_name = last_name
        user.is_staff = True
        user.is_superuser = True
        user.email_verified = True
        user.is_active = True
        if phone:
            user.phone_number = phone

        # Securely set application password using Django's PBKDF2 hasher
        user.set_password(password)
        user.save()

        AuditService.log(
            action=AuditLog.Action.ROLE_CHANGED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={
                "new_role": User.Role.PLATFORM_OWNER,
                "initialized_via": "CREATE_SYSTEM_OWNER_CLI"
            }
        )

        status_msg = "Created new" if created else "Configured existing"
        self.stdout.write(self.style.SUCCESS(
            f"Successfully {status_msg} System Owner account: {email} [Role: {user.role}, Active: {user.is_active}]"
        ))
