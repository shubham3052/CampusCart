from django.db import migrations

def populate_user_roles(apps, schema_editor):
    User = apps.get_model('users', 'User')
    UserRole = apps.get_model('users', 'UserRole')

    # Convert every existing user's scalar role into a UserRole membership
    roles_to_create = []
    for user in User.objects.all():
        if user.role:
            roles_to_create.append(
                UserRole(
                    user=user,
                    role=user.role,
                    is_active=True
                )
            )

    if roles_to_create:
        # Use bulk_create with ignore_conflicts for idempotence
        UserRole.objects.bulk_create(roles_to_create, ignore_conflicts=True)

def reverse_user_roles(apps, schema_editor):
    UserRole = apps.get_model('users', 'UserRole')
    UserRole.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0010_userrole'),
    ]

    operations = [
        migrations.RunPython(populate_user_roles, reverse_user_roles),
    ]
