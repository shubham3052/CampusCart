"""
Sales Aggregation & Time-Series Service for Inventory Intelligence and Future Demand Prediction.

This module aggregates clean, immutable historical sales and stock transaction records
from InventoryTransaction without applying any ML algorithms yet.
The resulting time-series serves as the clean data pipeline foundation for regression-based
demand forecasting in Step 16 and Step 17.
"""

from datetime import timedelta
from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.db.models.functions import TruncDate
from .models import InventoryTransaction, Inventory


def get_daily_sales_series(shop_id, product_id=None, start_date=None, end_date=None, days=30):
    """
    Computes a contiguous daily time-series of units sold from authoritative SALE/PURCHASE transactions.
    Fills zero-sales days so ML feature pipelines receive continuous date-indexed vectors.
    """
    now = timezone.now()
    if not end_date:
        end_date = now.date()
    if not start_date:
        start_date = end_date - timedelta(days=days - 1)

    # Base query on InventoryTransaction with negative quantity_change representing customer fulfillment
    qs = InventoryTransaction.objects.filter(
        inventory__shop_id=shop_id,
        transaction_type__in=[
            InventoryTransaction.TransactionType.SALE,
            InventoryTransaction.TransactionType.PURCHASE
        ],
        quantity_change__lt=0,
        created_at__date__gte=start_date,
        created_at__date__lte=end_date
    )

    if product_id:
        qs = qs.filter(inventory__product_id=product_id)

    # Group by calendar date
    aggregated = (
        qs.annotate(sale_date=TruncDate('created_at'))
        .values('sale_date')
        .annotate(
            total_units=Sum('quantity_change'),
            tx_count=Count('id')
        )
        .order_by('sale_date')
    )

    sales_map = {
        item['sale_date']: {
            'units_sold': abs(item['total_units']),
            'tx_count': item['tx_count']
        }
        for item in aggregated
    }

    # Generate contiguous daily time series
    result_series = []
    curr = start_date
    while curr <= end_date:
        day_data = sales_map.get(curr, {'units_sold': 0, 'tx_count': 0})
        day_of_week = curr.strftime('%A')
        is_weekend = curr.weekday() in (5, 6)

        result_series.append({
            'date': curr.isoformat(),
            'units_sold': day_data['units_sold'],
            'transaction_count': day_data['tx_count'],
            'day_of_week': day_of_week,
            'is_weekend': is_weekend,
            'day_num': curr.weekday()
        })
        curr += timedelta(days=1)

    return result_series


def get_product_velocity_ranking(shop_id, days=30):
    """
    Calculates moving velocity metrics for all products in a shop over the trailing window.
    Identifies fast-moving, moderate, and slow-moving items deterministically based on sales history.
    """
    since_date = (timezone.now() - timedelta(days=days)).date()

    # Query all active inventories for this shop
    inventories = Inventory.objects.filter(shop_id=shop_id, is_active=True).select_related('product', 'product__category')

    # Aggregate sales per inventory item
    sales_qs = InventoryTransaction.objects.filter(
        inventory__shop_id=shop_id,
        transaction_type__in=[
            InventoryTransaction.TransactionType.SALE,
            InventoryTransaction.TransactionType.PURCHASE
        ],
        quantity_change__lt=0,
        created_at__date__gte=since_date
    ).values('inventory_id').annotate(
        total_units=Sum('quantity_change'),
        orders_count=Count('id')
    )

    sales_by_inv = {
        item['inventory_id']: {
            'units_sold': abs(item['total_units']),
            'orders_count': item['orders_count']
        }
        for item in sales_qs
    }

    ranked = []
    for inv in inventories:
        sales_info = sales_by_inv.get(inv.id, {'units_sold': 0, 'orders_count': 0})
        units = sales_info['units_sold']

        # Rule-based velocity categorization (No ML)
        if units >= 25:
            velocity_tag = 'FAST_MOVING'
        elif units >= 5:
            velocity_tag = 'MODERATE'
        else:
            velocity_tag = 'SLOW_MOVING'

        ranked.append({
            'inventory_id': inv.id,
            'product_id': inv.product.id,
            'product_name': inv.product.name,
            'category_name': inv.product.category.name if inv.product.category else 'General',
            'current_stock': inv.current_stock,
            'available_stock': inv.available_stock,
            'units_sold': units,
            'orders_count': sales_info['orders_count'],
            'velocity_tag': velocity_tag,
            'stock_value': float(inv.stock_value)
        })

    # Sort descending by units sold
    ranked.sort(key=lambda x: x['units_sold'], reverse=True)
    return ranked
