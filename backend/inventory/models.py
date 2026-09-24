from django.db import models
from django.conf import settings
from decimal import Decimal
from django.utils import timezone


class Inventory(models.Model):
    """
    Tracks live, reserved, and threshold stock levels for each shop-product combination.
    Enforces that inventory belongs to a unique shop/product pair with strict shop isolation.
    """
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='inventories',
        db_index=True
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='inventory_records',
        db_index=True
    )
    current_stock = models.PositiveIntegerField(
        default=0,
        help_text="Total physical units currently on-hand in the shop"
    )
    reserved_stock = models.PositiveIntegerField(
        default=0,
        help_text="Units committed to pending or active customer orders awaiting completion"
    )
    minimum_stock = models.PositiveIntegerField(
        default=5,
        help_text="Minimum buffer stock to prevent stockouts"
    )
    reorder_level = models.PositiveIntegerField(
        default=10,
        help_text="Stock level triggering replenishment alerts"
    )
    maximum_stock = models.PositiveIntegerField(
        default=100,
        help_text="Maximum capacity target to avoid excessive holding costs/overstock"
    )
    # Legacy fields preserved for 100% backward compatibility with prior test fixtures
    reorder_threshold = models.PositiveIntegerField(
        default=10,
        help_text="Legacy threshold field maintained synchronized with reorder_level"
    )
    safety_stock = models.PositiveIntegerField(
        default=5,
        help_text="Legacy safety stock field maintained synchronized with minimum_stock"
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Purchase cost price per unit for stock valuation"
    )
    selling_price_snapshot = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Snapshot of current retail price"
    )
    is_active = models.BooleanField(default=True, db_index=True)
    last_stock_update = models.DateTimeField(null=True, blank=True)
    last_restocked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventories'
        verbose_name = 'Inventory'
        verbose_name_plural = 'Inventories'
        unique_together = ('shop', 'product')
        indexes = [
            models.Index(fields=['shop', 'current_stock']),
            models.Index(fields=['shop', 'is_active']),
        ]

    def save(self, *args, **kwargs):
        # Keep legacy aliases synchronized automatically
        if self.reorder_level and self.reorder_threshold != self.reorder_level:
            self.reorder_threshold = self.reorder_level
        elif self.reorder_threshold and self.reorder_level != self.reorder_threshold:
            self.reorder_level = self.reorder_threshold

        if self.minimum_stock and self.safety_stock != self.minimum_stock:
            self.safety_stock = self.minimum_stock
        elif self.safety_stock and self.minimum_stock != self.safety_stock:
            self.minimum_stock = self.safety_stock

        if not self.selling_price_snapshot and self.product_id:
            try:
                self.selling_price_snapshot = self.product.price
            except Exception:
                pass

        super().save(*args, **kwargs)

    @property
    def available_stock(self):
        """Effective stock available for new customer orders."""
        return max(0, self.current_stock - self.reserved_stock)

    @property
    def stock_value(self):
        """Estimated inventory cost valuation based on current units and purchase unit cost."""
        return Decimal(str(self.current_stock)) * self.unit_cost

    @property
    def stock_status(self):
        if not self.is_active:
            return 'INACTIVE'
        if self.current_stock == 0:
            return 'OUT_OF_STOCK'
        if self.current_stock <= self.minimum_stock or self.current_stock <= self.reorder_level:
            return 'LOW_STOCK'
        if self.maximum_stock > 0 and self.current_stock > self.maximum_stock:
            return 'OVERSTOCKED'
        return 'IN_STOCK'

    @property
    def is_low_stock(self):
        return self.current_stock > 0 and (self.current_stock <= self.minimum_stock or self.current_stock <= self.reorder_level)

    @property
    def is_out_of_stock(self):
        return self.current_stock == 0

    @property
    def is_overstocked(self):
        return self.maximum_stock > 0 and self.current_stock > self.maximum_stock

    def __str__(self):
        return f"{self.product.name} @ {self.shop.name} [Available: {self.available_stock} / Total: {self.current_stock}]"


class InventoryTransaction(models.Model):
    """
    Immutable audit log for every physical inventory movement.
    Provides pristine historical transaction data required for future regression-based demand prediction.
    """
    class TransactionType(models.TextChoices):
        PURCHASE = 'PURCHASE', 'Customer Order Deducted'
        SALE = 'SALE', 'Customer Order Sale Completed'
        RESTOCK = 'RESTOCK', 'Supplier Restock Received'
        RETURN = 'RETURN', 'Customer Return Added Back'
        DAMAGE = 'DAMAGE', 'Damaged / Expired Item Discarded'
        ADJUSTMENT = 'ADJUSTMENT', 'Manual Inventory Count Adjustment'
        RESERVATION = 'RESERVATION', 'Stock Reserved for Pending Order'
        RELEASE = 'RELEASE', 'Stock Reservation Released'
        TRANSFER_IN = 'TRANSFER_IN', 'Transfer In'
        TRANSFER_OUT = 'TRANSFER_OUT', 'Transfer Out'
        INITIAL_STOCK = 'INITIAL_STOCK', 'Initial Stock Entry'

    inventory = models.ForeignKey(
        Inventory,
        on_delete=models.CASCADE,
        related_name='transactions'
    )
    transaction_type = models.CharField(
        max_length=25,
        choices=TransactionType.choices,
        db_index=True
    )
    quantity_change = models.IntegerField(
        help_text="Quantity delta (positive for additions, negative for deductions)"
    )
    stock_before = models.PositiveIntegerField(
        default=0,
        help_text="Inventory balance immediately prior to this transaction"
    )
    stock_after = models.PositiveIntegerField(
        help_text="Snapshot of the inventory balance following this transaction"
    )
    reference_type = models.CharField(
        max_length=50,
        blank=True,
        help_text="Type of transaction source (e.g., ORDER, PURCHASE_ORDER, MANUAL_ADJUSTMENT, RETURN, DAMAGE)"
    )
    reference_id = models.CharField(
        max_length=100,
        blank=True,
        help_text="Associated Order ID, PO Number, or Invoice Identifier"
    )
    reason = models.CharField(
        max_length=255,
        blank=True,
        help_text="Business rationale (e.g., 'Physical stock audit', 'Water damage during storage', 'Student cancellation')"
    )
    notes = models.CharField(max_length=255, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inventory_transactions'
    )
    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Unit purchase cost for this stock transaction"
    )
    total_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal('0.00'),
        help_text="Total financial cost or valuation delta for this stock transaction"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'inventory_transactions'
        verbose_name = 'Inventory Transaction'
        verbose_name_plural = 'Inventory Transactions'
        indexes = [
            models.Index(fields=['inventory', 'created_at']),
            models.Index(fields=['transaction_type']),
            models.Index(fields=['reference_id']),
            models.Index(fields=['created_at']),
        ]

    @property
    def quantity(self):
        return self.quantity_change

    def __str__(self):
        return f"{self.get_transaction_type_display()}: {self.quantity_change:+d} ({self.inventory.product.name}) [{self.stock_before} -> {self.stock_after}]"


class Supplier(models.Model):
    """
    Wholesale stationery vendors, distributors, and paper mills affiliated with campus shops.
    """
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='suppliers',
        db_index=True
    )
    name = models.CharField(max_length=150)
    business_name = models.CharField(
        max_length=200,
        blank=True,
        help_text="Registered legal company or business name"
    )
    tax_id = models.CharField(
        max_length=50,
        blank=True,
        help_text="GST / Tax Identification Number"
    )
    contact_person = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=25, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'suppliers'
        verbose_name = 'Supplier'
        verbose_name_plural = 'Suppliers'
        unique_together = ('shop', 'name')
        indexes = [
            models.Index(fields=['shop', 'is_active']),
        ]

    def __str__(self):
        return f"{self.name} ({self.shop.name})"


class SupplierProduct(models.Model):
    """
    Mapping between stationery products and wholesale suppliers with catalog codes and lead times.
    """
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='supplier_products'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        related_name='supplier_mappings'
    )
    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='shop_supplier_products'
    )
    supplier_product_code = models.CharField(max_length=100, blank=True, help_text="Supplier internal SKU")
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    minimum_order_quantity = models.PositiveIntegerField(default=1)
    lead_time_days = models.PositiveIntegerField(default=3, help_text="Estimated replenishment delivery days")
    is_preferred = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    last_purchase_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Unit price paid on most recent purchase order receipt"
    )
    last_purchase_date = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of most recent receipt from this supplier"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'supplier_products'
        verbose_name = 'Supplier Product'
        verbose_name_plural = 'Supplier Products'
        unique_together = ('supplier', 'product')

    def __str__(self):
        return f"{self.product.name} from {self.supplier.name} (₹{self.purchase_price})"


class PurchaseOrder(models.Model):
    """
    Inbound procurement order placed by shopkeepers to wholesale vendors.
    Supports complete approval and fulfillment lifecycle.
    """
    class Status(models.TextChoices):
        DRAFT = 'DRAFT', 'Draft'
        PENDING_APPROVAL = 'PENDING_APPROVAL', 'Pending Approval'
        APPROVED = 'APPROVED', 'Approved'
        ORDERED = 'ORDERED', 'Ordered'
        PLACED = 'PLACED', 'Order Placed'  # Legacy alias preserved for test compatibility
        PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED', 'Partially Received'
        RECEIVED = 'RECEIVED', 'Fully Received'
        CANCELLED = 'CANCELLED', 'Cancelled'
        REJECTED = 'REJECTED', 'Rejected'

    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='purchase_orders',
        db_index=True
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name='purchase_orders'
    )
    po_number = models.CharField(max_length=50, unique=True, db_index=True)
    source = models.CharField(
        max_length=20,
        choices=[('MANUAL', 'Manual'), ('SMART_ADVISOR', 'Smart Purchase Advisor')],
        default='MANUAL',
        db_index=True,
        help_text="Origin of purchase order: manual creation or Smart Purchase Advisor suggestion"
    )
    status = models.CharField(
        max_length=25,
        choices=Status.choices,
        default=Status.DRAFT,
        db_index=True
    )
    order_date = models.DateField(null=True, blank=True)
    expected_date = models.DateField(null=True, blank=True)
    received_date = models.DateTimeField(null=True, blank=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Total tax charges")
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Negotiated or promotional discount")
    shipping_charges = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Freight and shipping charges")
    grand_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="Final grand total: subtotal + tax + shipping - discount")
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='created_purchase_orders'
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='approved_purchase_orders'
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    VALID_TRANSITIONS = {
        Status.DRAFT: [Status.PENDING_APPROVAL, Status.APPROVED, Status.ORDERED, Status.PLACED, Status.CANCELLED],
        Status.PENDING_APPROVAL: [Status.APPROVED, Status.REJECTED, Status.CANCELLED],
        Status.APPROVED: [Status.ORDERED, Status.PLACED, Status.CANCELLED],
        Status.ORDERED: [Status.PARTIALLY_RECEIVED, Status.RECEIVED, Status.CANCELLED],
        Status.PLACED: [Status.PARTIALLY_RECEIVED, Status.RECEIVED, Status.CANCELLED],
        Status.PARTIALLY_RECEIVED: [Status.RECEIVED, Status.CANCELLED],
        Status.RECEIVED: [],
        Status.CANCELLED: [],
        Status.REJECTED: [Status.DRAFT],
    }

    class Meta:
        db_table = 'purchase_orders'
        verbose_name = 'Purchase Order'
        verbose_name_plural = 'Purchase Orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.po_number} - {self.supplier.name} [{self.get_status_display()}]"

    def can_transition_to(self, new_status):
        allowed = self.VALID_TRANSITIONS.get(self.status, [])
        return new_status in allowed

    def recalculate_totals(self):
        items_subtotal = Decimal('0.00')
        for item in self.items.all():
            items_subtotal += item.total_cost if item.total_cost > Decimal('0.00') else item.subtotal
        self.subtotal = items_subtotal
        self.grand_total = max(Decimal('0.00'), items_subtotal + self.tax + self.shipping_charges - self.discount)
        self.save(update_fields=['subtotal', 'grand_total', 'updated_at'])

    def recalculate_subtotal(self):
        """Maintained for 100% backward compatibility."""
        self.recalculate_totals()


class PurchaseOrderItem(models.Model):
    """
    Line items within an inbound purchase order.
    """
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name='items'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='purchase_order_items'
    )
    supplier_sku = models.CharField(max_length=100, blank=True, help_text="Vendor product code / SKU")
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Line item discount")
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Line item tax")
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    total_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="Final line item total")
    notes = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'purchase_order_items'
        verbose_name = 'Purchase Order Item'
        verbose_name_plural = 'Purchase Order Items'

    def save(self, *args, **kwargs):
        base = Decimal(str(self.quantity_ordered)) * self.unit_cost
        self.subtotal = base
        self.total_cost = max(Decimal('0.00'), base + self.tax - self.discount)
        super().save(*args, **kwargs)

    @property
    def remaining_quantity(self):
        return max(0, self.quantity_ordered - self.quantity_received)

    def __str__(self):
        return f"{self.product.name}: {self.quantity_received}/{self.quantity_ordered} @ ₹{self.unit_cost}"


class InventoryReturn(models.Model):
    """
    Customer return or discarded product audit trail.
    Distinguishes sellable items returned to active stock versus unsellable/damaged returns.
    """
    class ReturnType(models.TextChoices):
        SELLABLE = 'SELLABLE', 'Sellable Inventory Return'
        DAMAGED = 'DAMAGED', 'Damaged / Defective Return'

    class ReturnStatus(models.TextChoices):
        REQUESTED = 'REQUESTED', 'Requested'
        APPROVED = 'APPROVED', 'Approved'
        RECEIVED = 'RECEIVED', 'Received'
        REJECTED = 'REJECTED', 'Rejected'

    shop = models.ForeignKey(
        'shops.Shop',
        on_delete=models.CASCADE,
        related_name='inventory_returns',
        db_index=True
    )
    order = models.ForeignKey(
        'orders.Order',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='inventory_returns'
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.PROTECT,
        related_name='inventory_returns'
    )
    quantity = models.PositiveIntegerField()
    return_type = models.CharField(
        max_length=20,
        choices=ReturnType.choices,
        default=ReturnType.SELLABLE
    )
    status = models.CharField(
        max_length=20,
        choices=ReturnStatus.choices,
        default=ReturnStatus.RECEIVED
    )
    reason = models.CharField(max_length=255)
    notes = models.TextField(blank=True)
    processed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='processed_returns'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventory_returns'
        verbose_name = 'Inventory Return'
        verbose_name_plural = 'Inventory Returns'
        ordering = ['-created_at']

    def __str__(self):
        return f"Return #{self.id}: {self.product.name} x {self.quantity} [{self.return_type}]"
