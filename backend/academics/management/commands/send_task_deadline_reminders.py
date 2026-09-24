from django.core.management.base import BaseCommand
from academics.services.planner_service import SmartPlannerService


class Command(BaseCommand):
    help = "Dispatches idempotent task deadline and smart shopping reminders to students."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Run evaluation without creating actual notification records.',
        )

    def handle(self, *args, **options):
        dry_run = options.get('dry_run', False)
        self.stdout.write(f"Initiating student task deadline reminder check (dry_run={dry_run})...")

        stats = SmartPlannerService.dispatch_task_deadline_reminders(dry_run=dry_run)

        self.stdout.write(
            self.style.SUCCESS(
                f"Completed: Processed {stats['processed']} tasks. "
                f"Sent {stats['reminders_sent']} reminders. "
                f"Skipped {stats['skipped_duplicates']} duplicates."
            )
        )
