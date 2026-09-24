"""
ml/preprocessing/data_loader.py
Extracts historical sales data from the database, aggregates daily sales per product/shop,
and fills missing dates with zero units to produce continuous time-series records.
"""

import os
import django
import pandas as pd
import numpy as np
from datetime import datetime, timedelta, date

# Ensure Django environment is configured when executed standalone or from ML pipeline
if not os.environ.get('DJANGO_SETTINGS_MODULE'):
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

from django.utils import timezone
from orders.models import Order, OrderItem
from inventory.models import InventoryTransaction
from products.models import Product


def extract_sales_data(shop_id=None, product_id=None, start_date=None, end_date=None):
    """
    Extracts authentic historical sales transactions from the database.
    Excludes CANCELLED orders to avoid counting unfulfilled transactions.
    
    Returns:
        pd.DataFrame: Columns ['date', 'shop_id', 'product_id', 'product_name',
                               'category_id', 'category_name', 'quantity_sold', 'selling_price']
    """
    order_items_qs = OrderItem.objects.select_related(
        'order', 'product', 'product__category', 'order__shop'
    ).exclude(
        order__status=Order.Status.CANCELLED
    )

    if shop_id:
        order_items_qs = order_items_qs.filter(order__shop_id=shop_id)
    if product_id:
        order_items_qs = order_items_qs.filter(product_id=product_id)
    if start_date:
        order_items_qs = order_items_qs.filter(order__created_at__date__gte=start_date)
    if end_date:
        order_items_qs = order_items_qs.filter(order__created_at__date__lte=end_date)

    records = []
    for item in order_items_qs:
        records.append({
            'date': item.order.created_at.date(),
            'shop_id': item.order.shop_id,
            'product_id': item.product_id,
            'product_name': item.product.name,
            'category_id': item.product.category_id if item.product.category else 0,
            'category_name': item.product.category.name if item.product.category else 'General',
            'quantity_sold': int(item.quantity),
            'selling_price': float(item.unit_price),
        })

    if not records:
        # Check InventoryTransaction as fallback for direct sales transactions
        tx_qs = InventoryTransaction.objects.select_related(
            'inventory', 'inventory__product', 'inventory__product__category', 'inventory__shop'
        ).filter(
            transaction_type__in=[
                InventoryTransaction.TransactionType.SALE,
                InventoryTransaction.TransactionType.PURCHASE
            ],
            quantity_change__lt=0
        )
        if shop_id:
            tx_qs = tx_qs.filter(inventory__shop_id=shop_id)
        if product_id:
            tx_qs = tx_qs.filter(inventory__product_id=product_id)
        if start_date:
            tx_qs = tx_qs.filter(created_at__date__gte=start_date)
        if end_date:
            tx_qs = tx_qs.filter(created_at__date__lte=end_date)

        for tx in tx_qs:
            records.append({
                'date': tx.created_at.date(),
                'shop_id': tx.inventory.shop_id,
                'product_id': tx.inventory.product_id,
                'product_name': tx.inventory.product.name,
                'category_id': tx.inventory.product.category_id if tx.inventory.product.category else 0,
                'category_name': tx.inventory.product.category.name if tx.inventory.product.category else 'General',
                'quantity_sold': abs(int(tx.quantity_change)),
                'selling_price': float(tx.inventory.product.price),
            })

    if not records:
        return pd.DataFrame(columns=[
            'date', 'shop_id', 'product_id', 'product_name',
            'category_id', 'category_name', 'quantity_sold', 'selling_price'
        ])

    df = pd.DataFrame(records)
    df['date'] = pd.to_datetime(df['date'])
    return df


def aggregate_daily_sales(df):
    """
    Combines multiple transactions occurring on the same day into a single daily record.
    Aggregates at (shop_id, product_id, date) summing quantity_sold.
    """
    if df.empty:
        return df

    aggregated = df.groupby(['shop_id', 'product_id', 'date']).agg({
        'quantity_sold': 'sum',
        'selling_price': 'mean',
        'product_name': 'first',
        'category_id': 'first',
        'category_name': 'first',
    }).reset_index()

    aggregated['date'] = pd.to_datetime(aggregated['date'])
    return aggregated


def fill_missing_dates(df, start_date=None, end_date=None):
    """
    Extremely important: For every (shop_id, product_id) series, ensures that
    days with zero sales are explicitly represented with quantity_sold = 0
    rather than dropped. This prevents distortion in lag and rolling statistics.
    """
    if df.empty:
        return df

    result_dfs = []
    grouped = df.groupby(['shop_id', 'product_id'])

    for (s_id, p_id), group in grouped:
        group = group.sort_values('date')
        min_date = start_date if start_date else group['date'].min()
        max_date = end_date if end_date else group['date'].max()

        min_date = pd.to_datetime(min_date)
        max_date = pd.to_datetime(max_date)

        # Create complete contiguous calendar date index
        full_date_range = pd.date_range(start=min_date, end=max_date, freq='D')
        full_df = pd.DataFrame({'date': full_date_range})
        full_df['shop_id'] = s_id
        full_df['product_id'] = p_id

        # Merge with actual sales
        merged = pd.merge(full_df, group, on=['shop_id', 'product_id', 'date'], how='left')

        # Fill missing values
        merged['quantity_sold'] = merged['quantity_sold'].fillna(0).astype(int)

        # Forward/backward fill metadata (product_name, category, price)
        merged['product_name'] = merged['product_name'].ffill().bfill()
        merged['category_id'] = merged['category_id'].ffill().bfill().fillna(0).astype(int)
        merged['category_name'] = merged['category_name'].ffill().bfill().fillna('General')
        merged['selling_price'] = merged['selling_price'].ffill().bfill().fillna(0.0)

        result_dfs.append(merged)

    if not result_dfs:
        return df

    final_df = pd.concat(result_dfs, ignore_index=True)
    return final_df.sort_values(['shop_id', 'product_id', 'date']).reset_index(drop=True)
