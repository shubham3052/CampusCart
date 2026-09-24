from django.db import models
from django.conf import settings


class ReportAuditLog(models.Model):
    """
    Enterprise audit trail tracking administrative report queries and data exports.
    Records who accessed which report, the filter parameters used, and export formats.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='report_audit_logs',
        db_index=True
    )
    report_type = models.CharField(max_length=60, db_index=True)
    export_format = models.CharField(max_length=20, default='JSON')  # 'JSON', 'CSV'
    filters = models.JSONField(default=dict, blank=True)
    records_count = models.PositiveIntegerField(default=0)
    is_success = models.BooleanField(default=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'report_audit_logs'
        verbose_name = 'Report Audit Log'
        verbose_name_plural = 'Report Audit Logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['report_type', 'created_at']),
            models.Index(fields=['user', 'created_at']),
        ]

    def __str__(self):
        user_str = self.user.username if self.user else "Anonymous"
        return f"[{self.export_format}] {self.report_type} by {user_str} at {self.created_at}"
