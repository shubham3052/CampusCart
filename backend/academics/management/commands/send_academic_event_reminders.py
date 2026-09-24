"""
backend/academics/management/commands/send_academic_event_reminders.py
Management command to scan upcoming academic events and dispatch idempotent notifications
to students and shop owners for configured reminder windows (7, 3, 1 days).

Usage:
    python manage.py send_academic_event_reminders [--windows=7,3,1] [--date=YYYY-MM-DD] [--dry-run]
"""

from datetime import date
from django.core.management.base import BaseCommand
from django.utils import timezone
from academics.event_intelligence import dispatch_academic_event_reminders


class Command(BaseCommand):
    help = "Dispatches upcoming academic event alerts to students and shop owners based on event proximity."

    def add_arguments(self, parser):
        parser.add_argument(
            '--windows',
            type=str,
            default='7,3,1',
            help='Comma-separated reminder day intervals before events (default: 7,3,1)'
        )
        parser.add_argument(
            '--date',
            type=str,
            default=None,
            help='Target reference date in YYYY-MM-DD format (default: today)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Simulate notification dispatch without creating actual notification database records.'
        )

    def handle(self, *args, **options):
        windows_str = options.get('windows', '7,3,1')
        try:
            windows = [int(w.strip()) for w in windows_str.split(',') if w.strip()]
        except ValueError:
            windows = [7, 3, 1]

        date_str = options.get('date')
        if date_str:
            target_date = date.fromisoformat(date_str)
        else:
            target_date = timezone.now().date()

        dry_run = options.get('dry_run', False)

        self.stdout.write(self.style.NOTICE("================================================================"))
        self.stdout.write(self.style.NOTICE(f"[*] ACADEMIC EVENT REMINDER DISPATCH ENGINE"))
        self.stdout.write(self.style.NOTICE(f"Reference Date: {target_date} | Windows: {windows} | Dry Run: {dry_run}"))
        self.stdout.write(self.style.NOTICE("================================================================"))

        stats = dispatch_academic_event_reminders(
            target_date=target_date,
            reminder_windows=windows,
            dry_run=dry_run
        )

        self.stdout.write(f"Events processed:            {stats['events_processed']}")
        self.stdout.write(self.style.SUCCESS(f"Student alerts sent:         {stats['student_notifications_sent']}"))
        self.stdout.write(self.style.SUCCESS(f"Shopkeeper alerts sent:      {stats['shopkeeper_notifications_sent']}"))
        self.stdout.write(f"Skipped (already sent):      {stats['skipped_duplicate']}")
        self.stdout.write(f"Skipped (user opted out):    {stats['skipped_preference']}")
        self.stdout.write(self.style.NOTICE("================================================================"))
