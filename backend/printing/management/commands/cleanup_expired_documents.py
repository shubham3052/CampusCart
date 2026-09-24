from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.conf import settings
from printing.models import UploadedDocument, PrintingOrder
from users.models import AuditLog
from users.services.audit_service import AuditService


class Command(BaseCommand):
    help = (
        "Safely purges student printing documents that have exceeded the retention expiry period. "
        "Strictly preserves documents belonging to active or in-progress print jobs (WAITING, PRINTING, READY)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=getattr(settings, 'PRINT_DOCUMENT_RETENTION_DAYS', 30),
            help='Retention window in days (default: 30 or PRINT_DOCUMENT_RETENTION_DAYS)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Report expired documents without deleting physical files or database records'
        )

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        now = timezone.now()
        cutoff = now - timedelta(days=days)

        self.stdout.write("=" * 65)
        self.stdout.write(f"[*] PRINT DOCUMENT RETENTION CLEANUP (Cutoff: {cutoff.strftime('%Y-%m-%d %H:%M:%S')})")
        self.stdout.write(f"[*] Retention Policy: {days} Days | Mode: {'DRY-RUN' if dry_run else 'LIVE PURGE'}")
        self.stdout.write("=" * 65)

        # Active statuses that MUST NEVER have their documents deleted
        PROTECTED_STATUSES = [
            PrintingOrder.PrintingStatus.WAITING,
            PrintingOrder.PrintingStatus.PRINTING,
            PrintingOrder.PrintingStatus.READY,
        ]

        # Candidates for deletion: retention expired OR older than cutoff, but NOT protected
        candidates = UploadedDocument.objects.select_related('printing_order').filter(
            retention_expiry_date__lte=now
        ).exclude(
            printing_order__status__in=PROTECTED_STATUSES
        )

        total_candidates = candidates.count()

        if dry_run:
            self.stdout.write(self.style.WARNING(
                f"[DRY-RUN] Found {total_candidates} expired document(s) eligible for secure deletion."
            ))
            for doc in candidates[:10]:
                self.stdout.write(
                    f"  - Doc #{doc.id}: '{doc.original_filename}' (Job #{doc.printing_order_id}, Status: {doc.printing_order.status})"
                )
            if total_candidates > 10:
                self.stdout.write(f"  ... and {total_candidates - 10} more.")
            return

        deleted_count = 0
        file_errors = 0

        for doc in candidates:
            doc_id = doc.id
            doc_name = doc.original_filename
            order_id = doc.printing_order_id

            # Safe physical file deletion
            try:
                if doc.file and hasattr(doc.file, 'storage') and doc.file.storage.exists(doc.file.name):
                    doc.file.delete(save=False)
            except Exception as e:
                file_errors += 1
                self.stdout.write(self.style.WARNING(f"[WARN] Could not delete physical file for doc #{doc_id}: {e}"))

            # Log deletion event to platform AuditLog
            AuditService.log(
                action=AuditLog.Action.DOCUMENT_PURGED,
                target_model='UploadedDocument',
                target_id=str(doc_id),
                metadata={
                    "filename": doc_name,
                    "printing_order_id": order_id,
                    "retention_days": days,
                    "reason": "EXPIRED_RETENTION_POLICY",
                }
            )

            doc.delete()
            deleted_count += 1

        self.stdout.write(self.style.SUCCESS(
            f"[OK] Successfully purged {deleted_count} expired document(s). Physical file removal errors: {file_errors}."
        ))
