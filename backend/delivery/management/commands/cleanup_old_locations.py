from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from delivery.models import DeliveryLocation


class Command(BaseCommand):
    help = "Purges historical delivery GPS records older than configured retention period (default: 7 days)."

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=getattr(settings, 'LOCATION_RETENTION_DAYS', 7),
            help='Retention window in days (default: 7)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report stale locations without deleting'
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        cutoff = timezone.now() - timedelta(days=days)

        self.stdout.write("=" * 60)
        self.stdout.write(f"[*] GPS LOCATION RETENTION CLEANUP (Cutoff: {cutoff.strftime('%Y-%m-%d %H:%M:%S')})")
        self.stdout.write("=" * 60)

        # Never delete currently active locations (is_current=True)
        stale_qs = DeliveryLocation.objects.filter(
            is_current=False,
            timestamp__lt=cutoff
        )
        count = stale_qs.count()

        if dry_run:
            self.stdout.write(self.style.WARNING(f"[DRY-RUN] Found {count} historical GPS record(s) older than {days} days."))
        else:
            deleted_count, _ = stale_qs.delete()
            self.stdout.write(self.style.SUCCESS(f"[OK] Successfully purged {deleted_count} stale GPS location record(s)."))
