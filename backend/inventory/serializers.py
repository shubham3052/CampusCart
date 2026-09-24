from rest_framework import serializers
from drf_spectacular.utils import extend_schema_field
from decimal import Decimal
from django.db import transaction
from django.utils import timezone
from .models import (
    Inventory,
    InventoryTransaction,
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryReturn,
)
from products.serializers import ProductSummarySerializer
from products.models import Product


class InventoryTransactionSerializer(serializers.ModelSerializer):
    transaction_type_display = serializers.CharField(source='get_transaction_type_display', read_only=True)
    performed_by_name = serializers.CharField(source='performed_by.username', read_only=True, default='System')
    product_name = serializers.CharField(source='inventory.product.name', read_only=True)
    shop_name = serializers.CharField(source='inventory.shop.name', read_only=True)

    class Meta:
        model = InventoryTransaction
        fields = [
            'id',
            'inventory',
            'product_name',
            'shop_name',
            'transaction_type',
            'transaction_type_display',
            'quantity_change',
            'quantity',
            'stock_before',
            'stock_after',
            'reference_type',
            'reference_id',
            'reason',
            'notes',
            'unit_cost',
            'total_cost',
            'performed_by',
            'performed_by_name',
            'created_at',
        ]
        read_only_fields = ['id', 'stock_before', 'stock_after', 'created_at']


class InventorySerializer(serializers.ModelSerializer):
    """
    Comprehensive serializer for shop inventory levels and status indicators.
    """
    product_details = ProductSummarySerializer(source='product', read_only=True)
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    available_stock = serializers.IntegerField(read_only=True)
    stock_value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_status = serializers.CharField(read_only=True)
    is_low_stock = serializers.BooleanField(read_only=True)
    is_out_of_stock = serializers.BooleanField(read_only=True)
    is_overstocked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Inventory
        fields = [
            'id',
            'shop',
            'shop_name',
            'product',
            'product_details',
            'current_stock',
            'reserved_stock',
            'available_stock',
            'minimum_stock',
            'reorder_level',
            'maximum_stock',
            'reorder_threshold',
            'safety_stock',
            'unit_cost',
            'selling_price_snapshot',
            'stock_value',
            'stock_status',
            'is_low_stock',
            'is_out_of_stock',
            'is_overstocked',
            'is_active',
            'last_stock_update',
            'last_restocked_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'available_stock',
            'stock_value',
            'stock_status',
            'is_low_stock',
            'is_out_of_stock',
            'is_overstocked',
            'last_stock_update',
            'last_restocked_at',
            'created_at',
            'updated_at',
        ]

    def validate_current_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Current stock cannot be negative.")
        return value

    def validate_minimum_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Minimum stock cannot be negative.")
        return value

    def validate_reorder_level(self, value):
        if value < 0:
            raise serializers.ValidationError("Reorder level cannot be negative.")
        return value

    def validate_maximum_stock(self, value):
        if value < 0:
            raise serializers.ValidationError("Maximum stock cannot be negative.")
        return value

    def validate(self, attrs):
        min_s = attrs.get('minimum_stock')
        max_s = attrs.get('maximum_stock')
        if min_s is not None and max_s is not None and max_s > 0 and min_s > max_s:
            raise serializers.ValidationError({"maximum_stock": "Maximum stock must be greater than or equal to minimum stock."})
        return attrs


class StockAdjustmentSerializer(serializers.Serializer):
    """
    Dedicated serializer for safe, atomic stock adjustments.
    """
    quantity_change = serializers.IntegerField(
        help_text="Units to add (positive) or deduct (negative)"
    )
    transaction_type = serializers.ChoiceField(
        choices=InventoryTransaction.TransactionType.choices,
        default=InventoryTransaction.TransactionType.ADJUSTMENT
    )
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True)
    reference_id = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)

    def validate_quantity_change(self, value):
        if value == 0:
            raise serializers.ValidationError("Quantity change must be non-zero.")
        return value


class DirectStockReceiveSerializer(serializers.Serializer):
    """
    Fast direct inbound stock receipt without prior PO.
    """
    quantity = serializers.IntegerField(min_value=1, help_text="Number of units received")
    unit_cost = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, allow_null=True)
    supplier = serializers.IntegerField(required=False, allow_null=True)
    invoice_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)


class DamageStockSerializer(serializers.Serializer):
    """
    Process damaged or expired inventory items for safe discard.
    """
    quantity = serializers.IntegerField(min_value=1, help_text="Number of damaged units to discard")
    reason = serializers.CharField(max_length=255, required=True, help_text="Cause of damage")
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)


class SupplierProductSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = SupplierProduct
        fields = [
            'id',
            'supplier',
            'product',
            'product_name',
            'shop',
            'supplier_product_code',
            'purchase_price',
            'minimum_order_quantity',
            'lead_time_days',
            'is_preferred',
            'is_active',
            'last_purchase_price',
            'last_purchase_date',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class SupplierSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    supplier_products = SupplierProductSerializer(many=True, read_only=True)
    active_po_count = serializers.SerializerMethodField()
    performance_summary = serializers.SerializerMethodField()

    class Meta:
        model = Supplier
        fields = [
            'id',
            'shop',
            'shop_name',
            'name',
            'business_name',
            'tax_id',
            'contact_person',
            'phone',
            'email',
            'address',
            'city',
            'state',
            'postal_code',
            'is_active',
            'notes',
            'supplier_products',
            'active_po_count',
            'performance_summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    @extend_schema_field(serializers.IntegerField())
    def get_active_po_count(self, obj):
        return obj.purchase_orders.filter(
            status__in=[
                PurchaseOrder.Status.PENDING_APPROVAL,
                PurchaseOrder.Status.APPROVED,
                PurchaseOrder.Status.ORDERED,
                PurchaseOrder.Status.PLACED,
                PurchaseOrder.Status.PARTIALLY_RECEIVED,
            ]
        ).count()

    @extend_schema_field(serializers.DictField())
    def get_performance_summary(self, obj):
        from .supplier_intelligence import get_supplier_performance
        return get_supplier_performance(obj, shop=obj.shop)


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    remaining_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            'id',
            'purchase_order',
            'product',
            'product_name',
            'supplier_sku',
            'quantity_ordered',
            'quantity_received',
            'remaining_quantity',
            'unit_cost',
            'discount',
            'tax',
            'subtotal',
            'total_cost',
            'notes',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'subtotal', 'total_cost', 'remaining_quantity', 'created_at', 'updated_at']


class PurchaseOrderSerializer(serializers.ModelSerializer):
    shop_name = serializers.CharField(source='shop.name', read_only=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    created_by_name = serializers.CharField(source='created_by.username', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, default=None)

    # Input field for creating PO with inline items
    items_input = serializers.ListField(
        child=serializers.DictField(),
        write_only=True,
        required=False,
        help_text="List of items e.g. [{'product_id': 1, 'quantity_ordered': 100, 'unit_cost': 5.00, 'supplier_sku': 'SKU1'}]"
    )

    class Meta:
        model = PurchaseOrder
        fields = [
            'id',
            'shop',
            'shop_name',
            'supplier',
            'supplier_name',
            'po_number',
            'status',
            'status_display',
            'order_date',
            'expected_date',
            'received_date',
            'subtotal',
            'tax',
            'discount',
            'shipping_charges',
            'grand_total',
            'notes',
            'items',
            'items_input',
            'created_by',
            'created_by_name',
            'approved_by',
            'approved_by_name',
            'approved_at',
            'rejection_reason',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'po_number',
            'subtotal',
            'grand_total',
            'received_date',
            'approved_by',
            'approved_at',
            'rejection_reason',
            'created_at',
            'updated_at',
        ]

    def create(self, validated_data):
        items_data = validated_data.pop('items_input', [])
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        # Auto-generate unique PO Number if not supplied
        import uuid
        validated_data['po_number'] = f"PO-{uuid.uuid4().hex[:8].upper()}"

        with transaction.atomic():
            po = PurchaseOrder.objects.create(**validated_data)
            items_total = Decimal('0.00')

            for item_data in items_data:
                pid = item_data['product_id']
                qty = int(item_data['quantity_ordered'])
                cost = Decimal(str(item_data['unit_cost']))
                disc = Decimal(str(item_data.get('discount', '0.00')))
                tx = Decimal(str(item_data.get('tax', '0.00')))
                sku = item_data.get('supplier_sku', '')
                item_notes = item_data.get('notes', '')

                base = cost * qty
                line_total = max(Decimal('0.00'), base + tx - disc)
                items_total += line_total

                prod = Product.objects.get(id=pid, shop=po.shop)
                PurchaseOrderItem.objects.create(
                    purchase_order=po,
                    product=prod,
                    supplier_sku=sku,
                    quantity_ordered=qty,
                    quantity_received=0,
                    unit_cost=cost,
                    discount=disc,
                    tax=tx,
                    subtotal=base,
                    total_cost=line_total,
                    notes=item_notes
                )

            po.subtotal = items_total
            po.grand_total = max(Decimal('0.00'), items_total + po.tax + po.shipping_charges - po.discount)
            po.save(update_fields=['subtotal', 'grand_total'])

        return po


class PurchaseOrderApprovalSerializer(serializers.Serializer):
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)


class PurchaseOrderRejectionSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=True, help_text="Reason for rejecting this purchase order")


class PurchaseOrderReceiveItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity_to_receive = serializers.IntegerField(min_value=1)


class PurchaseOrderReceiveSerializer(serializers.Serializer):
    items = PurchaseOrderReceiveItemSerializer(many=True)
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True)
    idempotency_key = serializers.CharField(max_length=100, required=False, allow_blank=True, help_text="Client deduplication token")


class InventoryReturnSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.username', read_only=True)

    class Meta:
        model = InventoryReturn
        fields = [
            'id',
            'shop',
            'order',
            'product',
            'product_name',
            'quantity',
            'return_type',
            'status',
            'reason',
            'notes',
            'processed_by',
            'processed_by_name',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

