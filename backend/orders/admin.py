from django.contrib import admin
from .models import Order, OrderItem, BulkOrder, Coupon, CouponUsage, Complaint, ComplaintMessage, Payment, Refund

@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'user', 'shop', 'amount', 'payment_method', 'status', 'gateway', 'paid_at', 'created_at']
    list_filter = ['status', 'payment_method', 'gateway', 'created_at']
    search_fields = ['order__order_number', 'user__username', 'gateway_order_id', 'gateway_payment_id', 'idempotency_key']
    readonly_fields = ['idempotency_key', 'created_at', 'updated_at']

@admin.register(Refund)
class RefundAdmin(admin.ModelAdmin):
    list_display = ['id', 'order', 'payment', 'amount', 'status', 'requested_by', 'approved_by', 'processed_at', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['order__order_number', 'gateway_refund_id', 'reason', 'requested_by__username']
    readonly_fields = ['created_at', 'updated_at', 'processed_at']

@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['order_number', 'customer', 'shop', 'order_type', 'fulfillment_type', 'status', 'total_amount', 'discount_amount', 'created_at']
    list_filter = ['status', 'order_type', 'fulfillment_type', 'created_at']
    search_fields = ['order_number', 'customer__username', 'shop__name']

@admin.register(Coupon)
class CouponAdmin(admin.ModelAdmin):
    list_display = ['code', 'title', 'shop', 'discount_type', 'discount_value', 'min_order_amount', 'valid_from', 'valid_until', 'times_used', 'is_active']
    list_filter = ['discount_type', 'is_active', 'valid_from', 'valid_until']
    search_fields = ['code', 'title', 'shop__name']
    readonly_fields = ['times_used', 'created_at', 'updated_at']

@admin.register(CouponUsage)
class CouponUsageAdmin(admin.ModelAdmin):
    list_display = ['coupon', 'user', 'order', 'discount_applied', 'used_at']
    list_filter = ['used_at']
    search_fields = ['coupon__code', 'user__username', 'order__order_number']

class ComplaintMessageInline(admin.TabularInline):
    model = ComplaintMessage
    extra = 0
    readonly_fields = ['sender', 'message', 'created_at']

@admin.register(Complaint)
class ComplaintAdmin(admin.ModelAdmin):
    list_display = ['ticket_number', 'user', 'shop', 'category', 'status', 'priority', 'resolved_by', 'created_at']
    list_filter = ['status', 'priority', 'category', 'created_at']
    search_fields = ['ticket_number', 'subject', 'description', 'user__username', 'shop__name']
    readonly_fields = ['ticket_number', 'created_at', 'updated_at']
    inlines = [ComplaintMessageInline]
