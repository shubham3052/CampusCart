from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from users.models import AuditLog
from users.services.audit_service import AuditService

User = get_user_model()


class Command(BaseCommand):
    help = 'Safely initializes or promotes a Platform Owner account.'

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, default='owner@platform.edu', help='Platform Owner email address')
        parser.add_argument('--password', type=str, default='PlatformOwner2026!', help='Platform Owner password')
        parser.add_argument('--name', type=str, default='Platform Owner', help='Platform Owner full name')
        parser.add_argument('--phone', type=str, default='9990001111', help='Platform Owner contact phone')

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
                'phone_number': phone,
                'is_staff': True,
                'is_superuser': True,
                'email_verified': True,
                'is_active': True,
            }
        )

        user.role = User.Role.PLATFORM_OWNER
        user.first_name = first_name
        user.last_name = last_name
        user.is_staff = True
        user.is_superuser = True
        user.email_verified = True
        user.is_active = True
        if phone:
            user.phone_number = phone
        user.set_password(password)
        user.save()

        AuditService.log(
            action=AuditLog.Action.ROLE_CHANGED,
            actor=user,
            actor_email=user.email,
            target_model='User',
            target_id=str(user.id),
            metadata={"new_role": User.Role.PLATFORM_OWNER, "initialized_via": "CLI_COMMAND"}
        )

        status_msg = "Created new" if created else "Updated existing"
        self.stdout.write(self.style.SUCCESS(
            f"Successfully {status_msg} Platform Owner account: {email} [Role: {user.role}]"
        ))
