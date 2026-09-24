from django.contrib import admin
from .models import (
    Inventory,
    InventoryTransaction,
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryReturn,
)


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ['product', 'shop', 'current_stock', 'reserved_stock', 'available_stock', 'minimum_stock', 'reorder_level', 'maximum_stock', 'stock_status', 'unit_cost', 'is_active']
    list_filter = ['shop', 'is_active']
    search_fields = ['product__name', 'product__sku', 'shop__name']
    readonly_fields = ['available_stock', 'stock_value', 'stock_status', 'created_at', 'updated_at']


@admin.register(InventoryTransaction)
class InventoryTransactionAdmin(admin.ModelAdmin):
    list_display = ['id', 'inventory', 'transaction_type', 'quantity_change', 'stock_before', 'stock_after', 'reference_type', 'reference_id', 'performed_by', 'created_at']
    list_filter = ['transaction_type', 'reference_type', 'created_at']
    search_fields = ['reference_id', 'reason', 'inventory__product__name', 'inventory__shop__name']
    readonly_fields = ['stock_before', 'stock_after', 'created_at']


class SupplierProductInline(admin.TabularInline):
    model = SupplierProduct
    extra = 1
    fields = ['product', 'supplier_product_code', 'purchase_price', 'minimum_order_quantity', 'lead_time_days', 'is_preferred', 'is_active', 'last_purchase_price', 'last_purchase_date']
    readonly_fields = ['last_purchase_price', 'last_purchase_date']


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = ['name', 'business_name', 'shop', 'contact_person', 'phone', 'email', 'city', 'tax_id', 'is_active']
    list_filter = ['shop', 'is_active']
    search_fields = ['name', 'business_name', 'contact_person', 'phone', 'email', 'tax_id']
    inlines = [SupplierProductInline]


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 1
    fields = ['product', 'supplier_sku', 'quantity_ordered', 'quantity_received', 'unit_cost', 'discount', 'tax', 'subtotal', 'total_cost', 'notes']
    readonly_fields = ['subtotal', 'total_cost', 'remaining_quantity']


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = ['po_number', 'shop', 'supplier', 'status', 'subtotal', 'grand_total', 'order_date', 'expected_date', 'received_date']
    list_filter = ['status', 'shop']
    search_fields = ['po_number', 'supplier__name']
    readonly_fields = ['subtotal', 'grand_total', 'approved_by', 'approved_at', 'received_date', 'created_at', 'updated_at']
    inlines = [PurchaseOrderItemInline]


@admin.register(InventoryReturn)
class InventoryReturnAdmin(admin.ModelAdmin):
    list_display = ['id', 'product', 'shop', 'quantity', 'return_type', 'status', 'reason', 'processed_by', 'created_at']
    list_filter = ['return_type', 'status', 'shop']
    search_fields = ['product__name', 'reason']

