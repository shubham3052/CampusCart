from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone
from decimal import Decimal

class ShopPrintingConfig(models.Model):
    """
    Shop-level printing capabilities, per-page rates, and binding pricing.
    Allows each campus print center or bookstore to configure their services dynamically.
    """
    shop = models.OneToOneField(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='printing_config'
    )
    is_printing_enabled = models.BooleanField(default=True, db_index=True)
    bw_rate_per_page = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('1.50'))
    color_rate_per_page = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('6.00'))
    a3_multiplier = models.DecimalField(max_digits=4, decimal_places=2, default=Decimal('2.00'))
    duplex_discount_per_sheet = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('0.00'))
    corner_staple_price = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('5.00'))
    spiral_binding_price = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('30.00'))
    soft_bind_price = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('60.00'))
    hardcover_price = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('150.00'))
    supported_paper_sizes = models.JSONField(default=list, help_text="List of supported sizes e.g. ['A4', 'A3']")
    supported_binding_types = models.JSONField(default=list, help_text="List of supported bindings")
    base_prep_time_mins = models.PositiveIntegerField(default=10, help_text="Base machine warm-up/prep time")
    mins_per_100_pages = models.PositiveIntegerField(default=5, help_text="Additional minutes per 100 pages")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'shop_printing_configs'
        verbose_name = 'Shop Printing Config'
        verbose_name_plural = 'Shop Printing Configs'

    def save(self, *args, **kwargs):
        if not self.supported_paper_sizes:
            self.supported_paper_sizes = ['A4', 'A3']
        if not self.supported_binding_types:
            self.supported_binding_types = ['NONE', 'CORNER_STAPLE', 'SPIRAL', 'SOFT_BIND', 'HARDCOVER']
        super().save(*args, **kwargs)

    def calculate_pricing(self, total_pages, copies, color_mode, paper_size, print_sides, binding_type):
        """
        Authoritative pricing calculation on the server.
        """
        total_pages = max(1, int(total_pages))
        copies = max(1, int(copies))

        if color_mode == 'COLOR':
            rate = self.color_rate_per_page
        else:
            rate = self.bw_rate_per_page

        if paper_size == 'A3':
            rate = rate * self.a3_multiplier

        print_cost = (rate * Decimal(total_pages)) * Decimal(copies)

        binding_charge = Decimal('0.00')
        if binding_type == 'CORNER_STAPLE':
            binding_charge = self.corner_staple_price * Decimal(copies)
        elif binding_type == 'SPIRAL':
            binding_charge = self.spiral_binding_price * Decimal(copies)
        elif binding_type == 'SOFT_BIND':
            binding_charge = self.soft_bind_price * Decimal(copies)
        elif binding_type == 'HARDCOVER':
            binding_charge = self.hardcover_price * Decimal(copies)

        subtotal = print_cost + binding_charge
        prep_time = self.base_prep_time_mins + int((total_pages * copies / 100) * self.mins_per_100_pages)

        return {
            'rate_per_page': rate,
            'print_cost': print_cost,
            'binding_charge': binding_charge,
            'subtotal': subtotal,
            'prep_time_mins': max(self.base_prep_time_mins, prep_time)
        }

    def __str__(self):
        return f"Printing Config for {self.shop.name} (B/W: ₹{self.bw_rate_per_page}, Color: ₹{self.color_rate_per_page})"


class PrintingOrder(models.Model):
    """
    Printing / Xerox job specifications associated with an Order.
    Can belong to an order as part of a standalone print job or combined purchase.
    """
    class PrintingStatus(models.TextChoices):
        WAITING = 'WAITING', 'Waiting for Operator'
        PRINTING = 'PRINTING', 'Printing in Progress'
        READY = 'READY', 'Ready for Collection'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    VALID_TRANSITIONS = {
        PrintingStatus.WAITING: [PrintingStatus.PRINTING, PrintingStatus.CANCELLED],
        PrintingStatus.PRINTING: [PrintingStatus.READY, PrintingStatus.CANCELLED],
        PrintingStatus.READY: [PrintingStatus.COMPLETED, PrintingStatus.CANCELLED],
        PrintingStatus.COMPLETED: [],
        PrintingStatus.CANCELLED: [],
    }

    class ColorMode(models.TextChoices):
        BW = 'BW', 'Black & White'
        COLOR = 'COLOR', 'Full Color'
        MIXED = 'MIXED', 'Mixed (Selective color pages)'

    class PaperSize(models.TextChoices):
        A4 = 'A4', 'A4 (Standard Document)'
        A3 = 'A3', 'A3 (Engineering / Drawing Sheets)'
        A5 = 'A5', 'A5 (Booklet / Small Format)'
        LETTER = 'LETTER', 'US Letter'

    class PrintSides(models.TextChoices):
        SINGLE_SIDED = 'SINGLE_SIDED', 'Single-Sided'
        DOUBLE_SIDED = 'DOUBLE_SIDED', 'Back-to-Back (Duplex)'

    class BindingType(models.TextChoices):
        NONE = 'NONE', 'No Binding (Loose Sheets)'
        CORNER_STAPLE = 'CORNER_STAPLE', 'Corner Staple'
        SPIRAL = 'SPIRAL', 'Spiral / Coil Binding'
        SOFT_BIND = 'SOFT_BIND', 'Thermal / Soft Binding'
        HARDCOVER = 'HARDCOVER', 'Project Hardcover Book Binding (Thesis)'

    class PageSelectionType(models.TextChoices):
        ALL = 'ALL', 'All Pages'
        CUSTOM = 'CUSTOM', 'Custom Pages'

    order = models.OneToOneField(
        'orders.Order',
        on_delete=models.CASCADE,
        related_name='printing_details',
        help_text="Parent order containing this print job"
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='printing_orders',
        null=True,
        blank=True
    )
    color_mode = models.CharField(
        max_length=15,
        choices=ColorMode.choices,
        default=ColorMode.BW
    )
    paper_size = models.CharField(
        max_length=15,
        choices=PaperSize.choices,
        default=PaperSize.A4
    )
    paper_gsm = models.PositiveIntegerField(
        default=75,
        help_text="Paper weight in grams per square meter (e.g. 75, 80, 100)"
    )
    print_sides = models.CharField(
        max_length=20,
        choices=PrintSides.choices,
        default=PrintSides.DOUBLE_SIDED
    )
    binding_type = models.CharField(
        max_length=20,
        choices=BindingType.choices,
        default=BindingType.NONE
    )
    page_selection_type = models.CharField(
        max_length=10,
        choices=PageSelectionType.choices,
        default=PageSelectionType.ALL
    )
    custom_page_range = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text="Optional custom page range, e.g. '1-5, 8, 10-12'"
    )
    total_pages = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Total calculated printable pages across all uploaded documents"
    )
    copies = models.PositiveIntegerField(
        default=1,
        validators=[MinValueValidator(1)],
        help_text="Number of complete duplicate sets requested"
    )
    price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00')
    )
    estimated_prep_time_mins = models.PositiveIntegerField(
        default=15,
        help_text="Estimated preparation time in minutes"
    )
    status = models.CharField(
        max_length=20,
        choices=PrintingStatus.choices,
        default=PrintingStatus.WAITING,
        db_index=True
    )
    special_instructions = models.TextField(
        blank=True,
        help_text="Notes for the operator (e.g. 'Print first 2 pages in color, rest B&W')"
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'printing_orders'
        verbose_name = 'Printing Order'
        verbose_name_plural = 'Printing Orders'

    def can_transition_to(self, new_status):
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def __str__(self):
        return f"Print Job #{self.id} for Order #{str(self.order.order_number)[:8]} [{self.get_status_display()}]"


class UploadedDocument(models.Model):
    """
    Student document files (assignments, lab manuals, slides, thesis PDFs)
    uploaded for printing. Documents belong to a printing order.
    """
    printing_order = models.ForeignKey(
        PrintingOrder,
        on_delete=models.CASCADE,
        related_name='documents'
    )
    file = models.FileField(
        upload_to='documents/%Y/%m/',
        help_text="Uploaded PDF, DOCX, or PPTX file"
    )
    original_filename = models.CharField(max_length=255)
    file_size_bytes = models.BigIntegerField(help_text="File size in bytes")
    page_count = models.PositiveIntegerField(default=1)
    retention_expiry_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Automated document retention expiry foundation"
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'uploaded_documents'
        verbose_name = 'Uploaded Document'
        verbose_name_plural = 'Uploaded Documents'
        ordering = ['uploaded_at']

    def save(self, *args, **kwargs):
        if not self.retention_expiry_date:
            self.retention_expiry_date = timezone.now() + timezone.timedelta(days=30)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.original_filename} ({self.page_count} pages)"
