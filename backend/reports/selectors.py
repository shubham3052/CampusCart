import math
from datetime import timedelta, datetime
from decimal import Decimal
from django.db.models import (
    Sum, Count, Avg, F, Q, Case, When, Value, IntegerField, DecimalField
)
from django.db.models.functions import TruncDate
from django.utils import timezone

from orders.models import (
    Order, OrderItem, BulkOrder, Payment, Refund, Coupon, CouponUsage, Complaint
)
from products.models import Product, Category, Review, Wishlist
from inventory.models import Inventory, InventoryTransaction
from printing.models import PrintingOrder
from delivery.models import Delivery
from predictions.models import DemandPrediction, PurchaseRecommendation, DemandModelMetadata
from academics.models import AcademicCalendar
from shops.models import Shop, Offer
from users.models import User
from recommendations.models import RecommendationInteraction


def paginate_dataset(dataset, page=1, page_size=25):
    """
    Standard pagination helper for Python lists or Django querysets.
    Returns: (paginated_items, pagination_metadata)
    """
    total_count = len(dataset)
    total_pages = max(1, math.ceil(total_count / page_size))
    current_page = min(page, total_pages)
    start_idx = (current_page - 1) * page_size
    end_idx = start_idx + page_size
    items = dataset[start_idx:end_idx]

    return items, {
        'total_records': total_count,
        'page': current_page,
        'page_size': page_size,
        'total_pages': total_pages,
        'has_next': current_page < total_pages,
        'has_previous': current_page > 1,
    }


# ==============================================================================
# 1. SALES REPORT
# ==============================================================================

def get_sales_report_data(filters):
    """
    Computes daily sales ledger and aggregate financial figures.
    Uses authentic Order and Refund records. Decimal-safe without double-counting.
    """
    start_dt = filters['start_datetime']
    end_dt = filters['end_datetime']

    base_orders = Order.objects.filter(created_at__range=(start_dt, end_dt))
    if filters.get('shop_id'):
        base_orders = base_orders.filter(shop_id=filters['shop_id'])
    if filters.get('order_type'):
        base_orders = base_orders.filter(order_type=filters['order_type'])

    valid_orders = base_orders.exclude(status=Order.Status.CANCELLED)

    # Base refunds
    base_refunds = Refund.objects.filter(
        status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
        created_at__range=(start_dt, end_dt)
    )
    if filters.get('shop_id'):
        base_refunds = base_refunds.filter(order__shop_id=filters['shop_id'])

    # Summary Totals
    gross_subtotal = valid_orders.aggregate(s=Sum('subtotal'))['s'] or Decimal('0.00')
    delivery_fee = valid_orders.aggregate(d=Sum('delivery_fee'))['d'] or Decimal('0.00')
    gross_sales = gross_subtotal + delivery_fee
    discount_amount = valid_orders.aggregate(d=Sum('discount_amount'))['d'] or Decimal('0.00')
    refund_amount = base_refunds.aggregate(r=Sum('amount'))['r'] or Decimal('0.00')
    net_sales = max(Decimal('0.00'), gross_sales - discount_amount - refund_amount)
    total_orders_count = valid_orders.count()
    aov = (net_sales / Decimal(str(total_orders_count))) if total_orders_count > 0 else Decimal('0.00')

    # Stream breakdowns
    printing_rev_qs = PrintingOrder.objects.filter(
        created_at__range=(start_dt, end_dt)
    ).exclude(status=PrintingOrder.PrintingStatus.CANCELLED)
    if filters.get('shop_id'):
        printing_rev_qs = printing_rev_qs.filter(shop_id=filters['shop_id'])
    printing_revenue = printing_rev_qs.aggregate(p=Sum('price'))['p'] or Decimal('0.00')

    bulk_rev_qs = BulkOrder.objects.filter(
        status=BulkOrder.Status.COMPLETED,
        created_at__range=(start_dt, end_dt)
    )
    if filters.get('shop_id'):
        bulk_rev_qs = bulk_rev_qs.filter(shop_id=filters['shop_id'])
    bulk_revenue = bulk_rev_qs.aggregate(b=Sum('total_amount'))['b'] or Decimal('0.00')

    # Daily breakdown map
    daily_orders = (
        valid_orders.annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(
            order_count=Count('id'),
            subtotal=Sum('subtotal'),
            delivery=Sum('delivery_fee'),
            discount=Sum('discount_amount'),
        )
    )
    orders_by_day = {item['day']: item for item in daily_orders}

    daily_refunds = (
        base_refunds.annotate(day=TruncDate('created_at'))
        .values('day')
        .annotate(refund_total=Sum('amount'))
    )
    refunds_by_day = {item['day']: item['refund_total'] for item in daily_refunds}

    rows = []
    curr = filters['start_date']
    while curr <= filters['end_date']:
        o = orders_by_day.get(curr, {})
        cnt = o.get('order_count', 0)
        sub = o.get('subtotal', Decimal('0.00')) or Decimal('0.00')
        deliv = o.get('delivery', Decimal('0.00')) or Decimal('0.00')
        disc = o.get('discount', Decimal('0.00')) or Decimal('0.00')
        ref = refunds_by_day.get(curr, Decimal('0.00')) or Decimal('0.00')

        day_gross = sub + deliv
        day_net = max(Decimal('0.00'), day_gross - disc - ref)

        rows.append({
            'date': curr.isoformat(),
            'orders_count': cnt,
            'gross_sales': float(day_gross.quantize(Decimal('0.01'))),
            'discounts': float(disc.quantize(Decimal('0.01'))),
            'refunds': float(ref.quantize(Decimal('0.01'))),
            'net_sales': float(day_net.quantize(Decimal('0.01'))),
        })
        curr += timedelta(days=1)

    # Sorting
    sort_key = filters.get('sort', '-date')
    reverse = sort_key.startswith('-')
    raw_field = sort_key.lstrip('-')
    if raw_field in ('date', 'orders_count', 'gross_sales', 'discounts', 'refunds', 'net_sales'):
        rows.sort(key=lambda r: r.get(raw_field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['date'], reverse=True)

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'gross_sales': float(gross_sales.quantize(Decimal('0.01'))),
            'discounts': float(discount_amount.quantize(Decimal('0.01'))),
            'refunds': float(refund_amount.quantize(Decimal('0.01'))),
            'net_sales': float(net_sales.quantize(Decimal('0.01'))),
            'total_orders': total_orders_count,
            'average_order_value': float(aov.quantize(Decimal('0.01'))),
            'printing_revenue': float(printing_revenue.quantize(Decimal('0.01'))),
            'delivery_revenue': float(delivery_fee.quantize(Decimal('0.01'))),
            'bulk_revenue': float(bulk_revenue.quantize(Decimal('0.01'))),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 2. ORDERS REPORT
# ==============================================================================

def get_orders_report_data(filters):
    """
    Detailed operational order reporting with customer reference, shop, payment status,
    fulfillment mode, and order lifecycle milestones.
    """
    qs = Order.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('customer', 'shop')

    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])
    if filters.get('order_status'):
        qs = qs.filter(status=filters['order_status'])
    if filters.get('payment_method'):
        qs = qs.filter(payment_method=filters['payment_method'])
    if filters.get('payment_status'):
        qs = qs.filter(payment_status=filters['payment_status'])
    if filters.get('order_type'):
        qs = qs.filter(order_type=filters['order_type'])
    if filters.get('customer_id'):
        qs = qs.filter(customer_id=filters['customer_id'])

    search = filters.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(order_number__icontains=search) |
            Q(customer__username__icontains=search) |
            Q(customer__college_id__icontains=search) |
            Q(shop__name__icontains=search)
        )

    # Status distribution for KPIs
    status_counts = dict(qs.values('status').annotate(c=Count('id')).values_list('status', 'c'))
    total_in_filter = qs.count()

    # Safe server-side sorting
    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'total_amount': 'total_amount',
        '-total_amount': '-total_amount',
        'status': 'status',
        '-status': '-status',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    rows = []
    # Fetch with item counts
    order_items_count_map = dict(
        OrderItem.objects.filter(order__in=qs)
        .values('order_id')
        .annotate(c=Count('id'))
        .values_list('order_id', 'c')
    )

    for o in qs:
        # Determine delivery status
        deliv_status = 'N/A'
        if hasattr(o, 'delivery_details') and o.delivery_details:
            deliv_status = o.delivery_details.get_delivery_status_display()

        rows.append({
            'id': o.id,
            'order_number': str(o.order_number)[:8],
            'full_order_number': str(o.order_number),
            'created_at': o.created_at.strftime('%Y-%m-%d %H:%M'),
            'customer': o.customer.username,
            'college_id': o.customer.college_id or '—',
            'shop_name': o.shop.name,
            'order_type': o.get_order_type_display(),
            'fulfillment_type': o.get_fulfillment_type_display(),
            'items_count': order_items_count_map.get(o.id, 0),
            'subtotal': float(o.subtotal),
            'discount_amount': float(o.discount_amount),
            'delivery_fee': float(o.delivery_fee),
            'total_amount': float(o.total_amount),
            'payment_status': o.get_payment_status_display(),
            'payment_method': o.get_payment_method_display(),
            'order_status': o.get_status_display(),
            'raw_status': o.status,
            'delivery_status': deliv_status,
            'completed_at': o.updated_at.strftime('%Y-%m-%d %H:%M') if o.status in [Order.Status.COMPLETED, Order.Status.DELIVERED] else '—',
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_orders': total_in_filter,
            'completed_orders': status_counts.get(Order.Status.COMPLETED, 0) + status_counts.get(Order.Status.DELIVERED, 0),
            'pending_orders': status_counts.get(Order.Status.PENDING, 0),
            'cancelled_orders': status_counts.get(Order.Status.CANCELLED, 0),
            'status_distribution': {
                k: {
                    'count': v,
                    'percentage': round((v / total_in_filter) * 100.0, 1) if total_in_filter > 0 else 0.0
                }
                for k, v in status_counts.items()
            }
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 3. PRODUCTS REPORT
# ==============================================================================

def get_products_report_data(filters):
    """
    Product catalog performance: units sold, gross revenue generated,
    active stock, ML predicted demand, and inventory health status.
    """
    prods = Product.objects.all().select_related('shop', 'category')
    if filters.get('shop_id'):
        prods = prods.filter(shop_id=filters['shop_id'])
    if filters.get('category_id'):
        prods = prods.filter(category_id=filters['category_id'])

    search = filters.get('search', '').strip()
    if search:
        prods = prods.filter(Q(name__icontains=search) | Q(sku__icontains=search) | Q(brand__icontains=search))

    # Units and revenue sold in period
    order_items = OrderItem.objects.filter(
        order__created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).exclude(order__status=Order.Status.CANCELLED)

    if filters.get('shop_id'):
        order_items = order_items.filter(order__shop_id=filters['shop_id'])

    sales_stats = {
        item['product_id']: item
        for item in order_items.values('product_id')
        .annotate(units=Sum('quantity'), rev=Sum('total_price'), ords=Count('order_id', distinct=True))
    }

    # Current inventory map
    inventories = dict(
        Inventory.objects.values_list('product_id', 'current_stock')
    )

    # Demand prediction map (next 7 days forecast)
    predictions = dict(
        DemandPrediction.objects.filter(forecast_horizon='7_DAYS')
        .values('product_id')
        .annotate(pred=Sum('predicted_units'))
        .values_list('product_id', 'pred')
    )

    rows = []
    for p in prods:
        stat = sales_stats.get(p.id, {})
        units = stat.get('units', 0) or 0
        rev = stat.get('rev', Decimal('0.00')) or Decimal('0.00')
        ords = stat.get('ords', 0) or 0
        stock = inventories.get(p.id, 0)
        pred = predictions.get(p.id, 0)

        status = 'IN_STOCK'
        if stock == 0:
            status = 'OUT_OF_STOCK'
        elif stock <= 5:
            status = 'LOW_STOCK'
        elif stock > 150:
            status = 'OVERSTOCKED'

        rows.append({
            'id': p.id,
            'name': p.name,
            'sku': p.sku or '—',
            'category': p.category.name if p.category else 'General',
            'shop_name': p.shop.name,
            'price': float(p.price),
            'units_sold': units,
            'revenue': float(rev.quantize(Decimal('0.01'))),
            'orders_count': ords,
            'current_stock': stock,
            'predicted_demand': pred,
            'stock_status': status,
        })

    sort_key = filters.get('sort', '-revenue')
    reverse = sort_key.startswith('-')
    field = sort_key.lstrip('-')
    if field in ('name', 'units_sold', 'revenue', 'orders_count', 'current_stock', 'predicted_demand'):
        rows.sort(key=lambda r: r.get(field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['revenue'], reverse=True)

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    total_rev = sum(r['revenue'] for r in rows)
    total_units = sum(r['units_sold'] for r in rows)

    return {
        'kpis': {
            'total_products_listed': len(rows),
            'total_units_sold': total_units,
            'total_product_revenue': round(total_rev, 2),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 4. CATEGORIES REPORT
# ==============================================================================

def get_categories_report_data(filters):
    """
    Category performance metrics: units sold, orders, revenue contribution,
    current inventory volume, and demand forecasts.
    """
    cats = Category.objects.all()
    order_items = OrderItem.objects.filter(
        order__created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).exclude(order__status=Order.Status.CANCELLED)

    if filters.get('shop_id'):
        order_items = order_items.filter(order__shop_id=filters['shop_id'])

    cat_sales = (
        order_items.values('product__category_id')
        .annotate(
            units=Sum('quantity'),
            rev=Sum('total_price'),
            ords=Count('order_id', distinct=True)
        )
    )
    sales_map = {
        item['product__category_id']: item for item in cat_sales
    }

    # Inventory volume per category
    inv_by_cat = dict(
        Inventory.objects.values('product__category_id')
        .annotate(stock=Sum('current_stock'))
        .values_list('product__category_id', 'stock')
    )

    total_revenue_all = sum(
        (item['rev'] or Decimal('0.00')) for item in cat_sales
    ) or Decimal('0.01')

    rows = []
    for c in cats:
        s = sales_map.get(c.id, {})
        units = s.get('units', 0) or 0
        rev = s.get('rev', Decimal('0.00')) or Decimal('0.00')
        ords = s.get('ords', 0) or 0
        stock = inv_by_cat.get(c.id, 0) or 0

        share = (rev / total_revenue_all) * Decimal('100.00')

        rows.append({
            'id': c.id,
            'name': c.name,
            'units_sold': units,
            'orders_count': ords,
            'revenue': float(rev.quantize(Decimal('0.01'))),
            'revenue_share_percentage': round(float(share), 1),
            'current_inventory': stock,
        })

    sort_key = filters.get('sort', '-revenue')
    reverse = sort_key.startswith('-')
    field = sort_key.lstrip('-')
    if field in ('name', 'units_sold', 'orders_count', 'revenue', 'current_inventory'):
        rows.sort(key=lambda r: r.get(field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['revenue'], reverse=True)

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_categories': len(rows),
            'total_revenue': round(float(total_revenue_all), 2),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 5. SHOPS PERFORMANCE REPORT & RANKINGS
# ==============================================================================

def get_shops_report_data(filters):
    """
    Multi-shop performance comparison and ranking matrix.
    Admin authorized only. Strict real metrics.
    """
    shops = Shop.objects.all().select_related('owner')
    if filters.get('shop_id'):
        shops = shops.filter(id=filters['shop_id'])

    search = filters.get('search', '').strip()
    if search:
        shops = shops.filter(Q(name__icontains=search) | Q(owner__username__icontains=search))

    start_dt = filters['start_datetime']
    end_dt = filters['end_datetime']

    rows = []
    for s in shops:
        s_orders = Order.objects.filter(shop=s, created_at__range=(start_dt, end_dt))
        s_valid = s_orders.exclude(status=Order.Status.CANCELLED)
        cnt = s_orders.count()
        completed = s_valid.filter(status__in=[Order.Status.COMPLETED, Order.Status.DELIVERED]).count()

        gross = s_valid.aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')
        refunds = Refund.objects.filter(
            order__shop=s,
            status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
            created_at__range=(start_dt, end_dt)
        ).aggregate(r=Sum('amount'))['r'] or Decimal('0.00')

        net = max(Decimal('0.00'), gross - refunds)
        aov = (net / Decimal(str(cnt))) if cnt > 0 else Decimal('0.00')

        customers_cnt = s_valid.values('customer_id').distinct().count()

        # Auxiliary revenues
        printing_rev = PrintingOrder.objects.filter(
            shop=s,
            created_at__range=(start_dt, end_dt)
        ).exclude(status=PrintingOrder.PrintingStatus.CANCELLED).aggregate(p=Sum('price'))['p'] or Decimal('0.00')

        deliv_rev = s_valid.aggregate(d=Sum('delivery_fee'))['d'] or Decimal('0.00')

        # Inventory health stats
        invs = Inventory.objects.filter(shop=s)
        low_stock = invs.filter(current_stock__gt=0, current_stock__lte=F('minimum_stock')).count()
        out_of_stock = invs.filter(current_stock=0).count()

        rows.append({
            'shop_id': s.id,
            'name': s.name,
            'shop_type': s.get_shop_type_display(),
            'owner_username': s.owner.username,
            'orders_count': cnt,
            'completed_orders': completed,
            'gross_revenue': float(gross.quantize(Decimal('0.01'))),
            'refund_amount': float(refunds.quantize(Decimal('0.01'))),
            'net_revenue': float(net.quantize(Decimal('0.01'))),
            'average_order_value': float(aov.quantize(Decimal('0.01'))),
            'customers_count': customers_cnt,
            'printing_revenue': float(printing_rev.quantize(Decimal('0.01'))),
            'delivery_revenue': float(deliv_rev.quantize(Decimal('0.01'))),
            'rating': float(s.rating),
            'is_active': s.is_active,
            'inventory_health': f"{out_of_stock} OOS / {low_stock} Low",
        })

    sort_key = filters.get('sort', '-net_revenue')
    reverse = sort_key.startswith('-')
    field = sort_key.lstrip('-')
    if field in ('name', 'orders_count', 'completed_orders', 'gross_revenue', 'net_revenue', 'average_order_value', 'customers_count', 'rating'):
        rows.sort(key=lambda r: r.get(field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['net_revenue'], reverse=True)

    # Assign rank based on current sorted order
    for idx, r in enumerate(rows, 1):
        r['rank'] = idx

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_shops': len(rows),
            'active_shops': sum(1 for r in rows if r['is_active']),
            'total_platform_net_revenue': round(sum(r['net_revenue'] for r in rows), 2),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 6. INVENTORY & STOCK MOVEMENT REPORTS
# ==============================================================================

def get_inventory_report_data(filters):
    """
    Inventory health and valuation report across products and shops.
    """
    qs = Inventory.objects.all().select_related('shop', 'product', 'product__category')
    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])
    if filters.get('category_id'):
        qs = qs.filter(product__category_id=filters['category_id'])

    search = filters.get('search', '').strip()
    if search:
        qs = qs.filter(Q(product__name__icontains=search) | Q(product__sku__icontains=search))

    total_stock_value = Decimal('0.00')
    low_stock_count = 0
    out_of_stock_count = 0
    overstock_count = 0

    rows = []
    for inv in qs:
        val = inv.stock_value
        total_stock_value += val

        status = inv.stock_status
        if status == 'LOW_STOCK':
            low_stock_count += 1
        elif status == 'OUT_OF_STOCK':
            out_of_stock_count += 1
        elif status == 'OVERSTOCKED':
            overstock_count += 1

        rows.append({
            'id': inv.id,
            'shop_name': inv.shop.name,
            'product_name': inv.product.name,
            'category': inv.product.category.name if inv.product.category else 'General',
            'current_stock': inv.current_stock,
            'reserved_stock': inv.reserved_stock,
            'available_stock': inv.available_stock,
            'minimum_stock': inv.minimum_stock,
            'reorder_level': inv.reorder_level,
            'unit_cost': float(inv.unit_cost),
            'inventory_value': float(val.quantize(Decimal('0.01'))),
            'stock_status': status,
        })

    sort_key = filters.get('sort', 'current_stock')
    reverse = sort_key.startswith('-')
    field = sort_key.lstrip('-')
    if field in ('product_name', 'current_stock', 'available_stock', 'inventory_value', 'stock_status'):
        rows.sort(key=lambda r: r.get(field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['current_stock'])

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_items': len(rows),
            'total_inventory_value': float(total_stock_value.quantize(Decimal('0.01'))),
            'low_stock_count': low_stock_count,
            'out_of_stock_count': out_of_stock_count,
            'overstocked_count': overstock_count,
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


def get_stock_movement_report_data(filters):
    """
    Immutable inventory movement ledger from InventoryTransaction.
    """
    qs = InventoryTransaction.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('inventory__shop', 'inventory__product', 'performed_by')

    if filters.get('shop_id'):
        qs = qs.filter(inventory__shop_id=filters['shop_id'])

    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'quantity_change': 'quantity_change',
        '-quantity_change': '-quantity_change',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    rows = []
    for tx in qs:
        rows.append({
            'id': tx.id,
            'date': tx.created_at.strftime('%Y-%m-%d %H:%M'),
            'shop_name': tx.inventory.shop.name,
            'product_name': tx.inventory.product.name,
            'transaction_type': tx.get_transaction_type_display(),
            'quantity_change': tx.quantity_change,
            'stock_before': tx.stock_before,
            'stock_after': tx.stock_after,
            'reference_type': tx.reference_type or '—',
            'reference_id': tx.reference_id or '—',
            'reason': tx.reason or '—',
            'performed_by': tx.performed_by.username if tx.performed_by else 'System',
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_transactions': len(rows),
            'net_stock_delta': sum(r['quantity_change'] for r in rows),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 7. DEMAND PREDICTIONS & DEMAND SPIKE REPORTS
# ==============================================================================

def get_demand_prediction_report_data(filters):
    """
    Demand forecasts from Step 17 ML regression models and accuracy evaluations.
    """
    qs = DemandPrediction.objects.filter(
        target_date__range=(filters['start_date'], filters['end_date'])
    ).select_related('shop', 'product')

    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])

    # Determine actual demand by matching OrderItems on that date
    completed_sales = (
        OrderItem.objects.filter(
            order__status__in=[Order.Status.COMPLETED, Order.Status.DELIVERED],
            order__created_at__date__range=(filters['start_date'], filters['end_date'])
        )
        .annotate(order_day=TruncDate('order__created_at'))
        .values('product_id', 'order__shop_id', 'order_day')
        .annotate(actual_units=Sum('quantity'))
    )
    actual_map = {
        (item['product_id'], item['order__shop_id'], item['order_day']): item['actual_units']
        for item in completed_sales
    }

    rows = []
    errors = []
    for pred in qs:
        actual = actual_map.get((pred.product_id, pred.shop_id, pred.target_date))
        error_val = None
        if actual is not None:
            error_val = abs(pred.predicted_units - actual)
            errors.append(error_val)

        rows.append({
            'id': pred.id,
            'shop_name': pred.shop.name,
            'product_name': pred.product.name,
            'target_date': pred.target_date.strftime('%Y-%m-%d'),
            'forecast_horizon': pred.get_forecast_horizon_display(),
            'predicted_demand': pred.predicted_units,
            'actual_demand': actual if actual is not None else 'Pending',
            'error': error_val if error_val is not None else '—',
            'confidence_score': f"{int(pred.confidence_score * 100)}%",
            'model_name': pred.model_name,
            'generated_at': pred.created_at.strftime('%Y-%m-%d'),
        })

    mae = round(sum(errors) / len(errors), 2) if errors else None

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_forecasts': len(rows),
            'evaluated_points': len(errors),
            'mae': mae if mae is not None else "Insufficient Data",
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


def get_demand_spike_report_data(filters):
    """
    Spike detection audit identifying unexpected demand surges and stockout alerts.
    """
    recs = PurchaseRecommendation.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).filter(Q(demand_spike_alert=True) | Q(priority=PurchaseRecommendation.Priority.CRITICAL)).select_related('shop', 'product')

    if filters.get('shop_id'):
        recs = recs.filter(shop_id=filters['shop_id'])

    rows = []
    for r in recs:
        baseline = round(r.average_daily_demand * 7, 1)
        observed = r.predicted_demand_7d
        spike_mag = round((observed / baseline), 1) if baseline > 0 else 1.0

        rows.append({
            'id': r.id,
            'shop_name': r.shop.name,
            'product_name': r.product.name,
            'date': r.created_at.strftime('%Y-%m-%d'),
            'baseline_demand': baseline,
            'predicted_surge': observed,
            'spike_magnitude': f"{spike_mag}x",
            'urgency': r.get_urgency_level_display(),
            'recommended_quantity': r.recommended_quantity,
            'rationale': r.rationale or r.reason or 'Demand surge detected prior to academic milestone',
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_spike_alerts': len(rows),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 8. ACADEMIC DEMAND REPORT
# ==============================================================================

def get_academic_demand_report_data(filters):
    """
    Correlates student stationery and printing order volumes with University Academic Events.
    """
    events = AcademicCalendar.objects.filter(
        start_date__lte=filters['end_date'],
        end_date__gte=filters['start_date']
    ).select_related('institution')

    rows = []
    for ev in events:
        # Window: 7 days before event start to 7 days after event end
        pre_start = ev.start_date - timedelta(days=7)
        pre_end = ev.start_date - timedelta(days=1)
        dur_start = ev.start_date
        dur_end = ev.end_date

        pre_orders = Order.objects.filter(
            created_at__date__range=(pre_start, pre_end)
        ).exclude(status=Order.Status.CANCELLED).count()

        dur_orders = Order.objects.filter(
            created_at__date__range=(dur_start, dur_end)
        ).exclude(status=Order.Status.CANCELLED).count()

        pct_change = 0.0
        if pre_orders > 0:
            pct_change = round(((dur_orders - pre_orders) / pre_orders) * 100.0, 1)

        rows.append({
            'id': ev.id,
            'title': ev.title,
            'event_type': ev.get_event_type_display(),
            'start_date': ev.start_date.strftime('%Y-%m-%d'),
            'end_date': ev.end_date.strftime('%Y-%m-%d'),
            'pre_event_orders': pre_orders,
            'during_event_orders': dur_orders,
            'observed_change_percentage': pct_change,
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_events_in_window': len(rows),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 9. PRINTING REPORT
# ==============================================================================

def get_printing_report_data(filters):
    """
    Campus xerox and document printing operational report.
    """
    qs = PrintingOrder.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('shop', 'order', 'order__customer')

    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])
    if filters.get('print_status'):
        qs = qs.filter(status=filters['print_status'])

    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'price': 'price',
        '-price': '-price',
        'total_pages': 'total_pages',
        '-total_pages': '-total_pages',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    total_orders = qs.count()
    valid_print = qs.exclude(status=PrintingOrder.PrintingStatus.CANCELLED)

    total_revenue = valid_print.aggregate(s=Sum('price'))['s'] or Decimal('0.00')
    total_pages = sum(p.total_pages * p.copies for p in valid_print)
    bw_pages = sum(p.total_pages * p.copies for p in valid_print if p.color_mode == 'BW')
    color_pages = sum(p.total_pages * p.copies for p in valid_print if p.color_mode in ['COLOR', 'MIXED'])
    binding_jobs = valid_print.exclude(binding_type='NONE').count()

    rows = []
    for p in qs:
        rows.append({
            'id': p.id,
            'order_number': str(p.order.order_number)[:8],
            'shop_name': p.shop.name if p.shop else (p.order.shop.name if p.order else '—'),
            'date': p.created_at.strftime('%Y-%m-%d %H:%M'),
            'customer': p.order.customer.username if p.order else '—',
            'pages': p.total_pages,
            'copies': p.copies,
            'color_mode': p.get_color_mode_display(),
            'paper_size': p.get_paper_size_display(),
            'print_sides': p.get_print_sides_display(),
            'binding_type': p.get_binding_type_display(),
            'price': float(p.price),
            'status': p.get_status_display(),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_print_orders': total_orders,
            'total_pages_printed': total_pages,
            'bw_pages': bw_pages,
            'color_pages': color_pages,
            'binding_orders': binding_jobs,
            'printing_revenue': float(total_revenue.quantize(Decimal('0.01'))),
            'average_print_order_value': round(float(total_revenue) / total_orders, 2) if total_orders > 0 else 0.0,
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 10. DELIVERY REPORT
# ==============================================================================

def get_delivery_report_data(filters):
    """
    Campus doorstep delivery logistics and courier performance.
    """
    qs = Delivery.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('order', 'order__shop', 'delivery_agent')

    if filters.get('shop_id'):
        qs = qs.filter(order__shop_id=filters['shop_id'])
    if filters.get('delivery_status'):
        qs = qs.filter(delivery_status=filters['delivery_status'])

    total_deliveries = qs.count()
    delivered_count = qs.filter(delivery_status=Delivery.DeliveryStatus.DELIVERED).count()
    failed_count = qs.filter(delivery_status=Delivery.DeliveryStatus.FAILED).count()
    rescheduled_count = qs.filter(delivery_status=Delivery.DeliveryStatus.RESCHEDULED).count()

    success_rate = (delivered_count / total_deliveries * 100.0) if total_deliveries > 0 else 0.0

    rows = []
    durations = []
    for d in qs:
        duration_mins = None
        if d.delivered_at and d.picked_up_at:
            duration_mins = int((d.delivered_at - d.picked_up_at).total_seconds() / 60)
            durations.append(duration_mins)

        rows.append({
            'id': d.id,
            'order_number': str(d.order.order_number)[:8],
            'shop_name': d.order.shop.name if d.order and d.order.shop else '—',
            'courier_name': d.delivery_agent.username if d.delivery_agent else 'Unassigned',
            'date': d.created_at.strftime('%Y-%m-%d %H:%M'),
            'status': d.get_delivery_status_display(),
            'priority': d.get_priority_display(),
            'estimated_time': d.estimated_delivery_time.strftime('%H:%M') if d.estimated_delivery_time else '—',
            'duration_mins': duration_mins if duration_mins is not None else '—',
            'attempt_count': d.attempt_count,
            'failure_reason': d.get_failure_reason_display() if d.failure_reason else '—',
        })

    avg_duration = round(sum(durations) / len(durations), 1) if durations else None

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_deliveries': total_deliveries,
            'delivered_count': delivered_count,
            'failed_count': failed_count,
            'rescheduled_count': rescheduled_count,
            'success_rate_percentage': round(success_rate, 1),
            'average_duration_mins': avg_duration if avg_duration is not None else "Insufficient Data",
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 11. CUSTOMER REPORT
# ==============================================================================

def get_customers_report_data(filters):
    """
    Student customer cohort, repeat purchase rate, and lifetime value.
    Protects privacy: zero passwords, auth tokens, or private payment secrets.
    """
    users_qs = User.objects.filter(role=User.Role.STUDENT)

    search = filters.get('search', '').strip()
    if search:
        users_qs = users_qs.filter(Q(username__icontains=search) | Q(college_id__icontains=search))

    start_dt = filters['start_datetime']
    end_dt = filters['end_datetime']

    # Filtered orders
    period_orders = Order.objects.filter(
        created_at__range=(start_dt, end_dt)
    ).exclude(status=Order.Status.CANCELLED)

    cust_order_counts = {
        item['customer_id']: (item['c'], item['total'])
        for item in period_orders.values('customer_id')
        .annotate(c=Count('id'), total=Sum('total_amount'))
    }

    total_customers = users_qs.count()
    active_in_period = len(cust_order_counts)

    # Historical first order dates
    first_orders = dict(
        Order.objects.exclude(status=Order.Status.CANCELLED)
        .values('customer_id')
        .annotate(first=TruncDate('created_at'))
        .values_list('customer_id', 'first')
    )

    new_count = 0
    returning_count = 0
    start_date = filters['start_date']

    for c_id in cust_order_counts.keys():
        f = first_orders.get(c_id)
        if f and f < start_date:
            returning_count += 1
        else:
            new_count += 1

    repeat_rate = (returning_count / active_in_period * 100.0) if active_in_period > 0 else 0.0

    rows = []
    for u in users_qs:
        stat = cust_order_counts.get(u.id, (0, Decimal('0.00')))
        c = stat[0] if isinstance(stat, tuple) else 0
        tot = stat[1] if isinstance(stat, tuple) else Decimal('0.00')

        rows.append({
            'id': u.id,
            'username': u.username,
            'college_id': u.college_id or '—',
            'department': u.department or '—',
            'email_verified': u.email_verified,
            'orders_in_period': c,
            'spend_in_period': float(tot.quantize(Decimal('0.01'))),
            'joined_at': u.date_joined.strftime('%Y-%m-%d'),
        })

    sort_key = filters.get('sort', '-spend_in_period')
    reverse = sort_key.startswith('-')
    field = sort_key.lstrip('-')
    if field in ('username', 'orders_in_period', 'spend_in_period', 'joined_at'):
        rows.sort(key=lambda r: r.get(field, 0), reverse=reverse)
    else:
        rows.sort(key=lambda r: r['spend_in_period'], reverse=True)

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_students': total_customers,
            'active_in_period': active_in_period,
            'new_customers': new_count,
            'returning_customers': returning_count,
            'repeat_purchase_rate': round(repeat_rate, 1),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 12. PAYMENTS & REFUNDS REPORTS
# ==============================================================================

def get_payments_report_data(filters):
    """
    Authoritative financial payments ledger from Step 25 Payment model.
    Strictly excludes sensitive tokens or auth secrets.
    """
    qs = Payment.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('order', 'shop', 'user')

    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])
    if filters.get('payment_method'):
        qs = qs.filter(payment_method=filters['payment_method'])
    if filters.get('payment_status'):
        qs = qs.filter(status=filters['payment_status'])

    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'amount': 'amount',
        '-amount': '-amount',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    total_payments = qs.count()
    successful = qs.filter(status=Payment.Status.CAPTURED)
    successful_amount = successful.aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

    method_breakdown = dict(
        qs.values('payment_method').annotate(c=Count('id')).values_list('payment_method', 'c')
    )

    rows = []
    for p in qs:
        rows.append({
            'id': p.id,
            'order_number': str(p.order.order_number)[:8],
            'shop_name': p.shop.name,
            'customer': p.user.username,
            'date': p.created_at.strftime('%Y-%m-%d %H:%M'),
            'payment_method': p.get_payment_method_display(),
            'amount': float(p.amount),
            'status': p.get_status_display(),
            'gateway': p.gateway,
            'paid_at': p.paid_at.strftime('%Y-%m-%d %H:%M') if p.paid_at else '—',
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_transactions': total_payments,
            'successful_count': successful.count(),
            'successful_amount': float(successful_amount.quantize(Decimal('0.01'))),
            'method_distribution': method_breakdown,
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


def get_refunds_report_data(filters):
    """
    Refunds ledger from Step 25 Refund model.
    """
    qs = Refund.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('order', 'payment', 'requested_by', 'approved_by')

    if filters.get('shop_id'):
        qs = qs.filter(order__shop_id=filters['shop_id'])

    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'amount': 'amount',
        '-amount': '-amount',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    total_refunds = qs.count()
    completed = qs.filter(status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED])
    completed_amount = completed.aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

    rows = []
    for r in qs:
        rows.append({
            'id': r.id,
            'order_number': str(r.order.order_number)[:8],
            'payment_id': r.payment_id,
            'amount': float(r.amount),
            'reason': r.reason,
            'status': r.get_status_display(),
            'requested_by': r.requested_by.username,
            'approved_by': r.approved_by.username if r.approved_by else '—',
            'created_at': r.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_refund_requests': total_refunds,
            'completed_refunds_count': completed.count(),
            'total_refunded_amount': float(completed_amount.quantize(Decimal('0.01'))),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 13. BULK ORDERS REPORT
# ==============================================================================

def get_bulk_orders_report_data(filters):
    """
    Step 23 Class-wide and project team bulk purchases report.
    """
    qs = BulkOrder.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('shop', 'user')

    if filters.get('shop_id'):
        qs = qs.filter(shop_id=filters['shop_id'])

    sort_key = filters.get('sort', '-created_at')
    allowed_sorts = {
        'created_at': 'created_at',
        '-created_at': '-created_at',
        'total_amount': 'total_amount',
        '-total_amount': '-total_amount',
    }
    qs = qs.order_by(allowed_sorts.get(sort_key, '-created_at'))

    total_bulk = qs.count()
    total_revenue = qs.filter(status=BulkOrder.Status.COMPLETED).aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

    rows = []
    for b in qs:
        rows.append({
            'id': b.id,
            'title': b.title,
            'share_code': b.share_code,
            'order_type': b.get_order_type_display(),
            'shop_name': b.shop.name if b.shop else '—',
            'coordinator': b.user.username if b.user else '—',
            'current_quantity': getattr(b, 'current_quantity', getattr(b, 'estimated_quantity', 10)),
            'target_quantity': getattr(b, 'target_quantity', getattr(b, 'estimated_quantity', 10)),
            'total_amount': float(b.total_amount),
            'status': b.get_status_display(),
            'created_at': b.created_at.strftime('%Y-%m-%d'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_bulk_orders': total_bulk,
            'completed_bulk_revenue': float(total_revenue.quantize(Decimal('0.01'))),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 14. REVIEWS & COMPLAINTS REPORT
# ==============================================================================

def get_reviews_complaints_report_data(filters):
    """
    Customer trust, satisfaction, and support grievances metrics.
    """
    reviews = Review.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('shop', 'product', 'user')

    if filters.get('shop_id'):
        reviews = reviews.filter(shop_id=filters['shop_id'])

    total_reviews = reviews.count()
    avg_rating = reviews.aggregate(a=Avg('rating'))['a'] or 0.0
    rating_distribution = dict(reviews.values('rating').annotate(c=Count('id')).values_list('rating', 'c'))

    complaints = Complaint.objects.filter(
        created_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('shop', 'user')

    if filters.get('shop_id'):
        complaints = complaints.filter(shop_id=filters['shop_id'])

    total_complaints = complaints.count()
    complaints_status = dict(complaints.values('status').annotate(c=Count('id')).values_list('status', 'c'))

    # Table rows from complaints
    rows = []
    for c in complaints:
        rows.append({
            'ticket_number': str(c.ticket_number)[:8],
            'user': c.user.username,
            'shop_name': c.shop.name if c.shop else '—',
            'category': c.get_category_display(),
            'subject': c.subject,
            'priority': c.get_priority_display(),
            'status': c.get_status_display(),
            'created_at': c.created_at.strftime('%Y-%m-%d %H:%M'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_reviews': total_reviews,
            'average_rating': round(float(avg_rating), 1),
            'rating_distribution': {
                star: rating_distribution.get(star, 0) for star in range(1, 6)
            },
            'total_complaints': total_complaints,
            'open_complaints': complaints_status.get(Complaint.Status.OPEN, 0),
            'resolved_complaints': complaints_status.get(Complaint.Status.RESOLVED, 0),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 15. OFFERS & COUPONS REPORT
# ==============================================================================

def get_offers_report_data(filters):
    """
    Step 24 Promotional deals and student coupon redemption auditing.
    """
    offers = Offer.objects.all().select_related('shop')
    if filters.get('shop_id'):
        offers = offers.filter(shop_id=filters['shop_id'])

    active_offers = offers.filter(is_active=True).count()

    usages = CouponUsage.objects.filter(
        used_at__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('coupon', 'user', 'order')

    if filters.get('shop_id'):
        usages = usages.filter(order__shop_id=filters['shop_id'])

    total_usages = usages.count()
    total_discount = usages.aggregate(s=Sum('discount_applied'))['s'] or Decimal('0.00')

    rows = []
    for u in usages:
        rows.append({
            'coupon_code': u.coupon.code,
            'user': u.user.username,
            'order_number': str(u.order.order_number)[:8],
            'discount_applied': float(u.discount_applied),
            'used_at': u.used_at.strftime('%Y-%m-%d %H:%M'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_offers_configured': offers.count(),
            'active_offers': active_offers,
            'total_coupon_redemptions': total_usages,
            'total_discounts_granted': float(total_discount.quantize(Decimal('0.01'))),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 16. RECOMMENDATIONS & CTR REPORT
# ==============================================================================

def get_recommendations_report_data(filters):
    """
    Step 20 Smart Recommendation impressions, clicks, and conversion rates.
    """
    qs = RecommendationInteraction.objects.filter(
        timestamp__range=(filters['start_datetime'], filters['end_datetime'])
    ).select_related('user', 'product')

    action_counts = dict(qs.values('action').annotate(c=Count('id')).values_list('action', 'c'))

    impressions = action_counts.get(RecommendationInteraction.Action.VIEWED, 0)
    clicks = action_counts.get(RecommendationInteraction.Action.CLICKED, 0)
    cart_adds = action_counts.get(RecommendationInteraction.Action.ADDED_TO_CART, 0)
    purchases = action_counts.get(RecommendationInteraction.Action.PURCHASED, 0)

    ctr = (clicks / impressions * 100.0) if impressions > 0 else 0.0
    conversion_rate = (purchases / impressions * 100.0) if impressions > 0 else 0.0

    rows = []
    for item in qs.order_by('-timestamp')[:100]:
        rows.append({
            'id': item.id,
            'user': item.user.username if item.user else 'Anonymous',
            'product': item.product.name if item.product else '—',
            'recommendation_type': item.recommendation_type,
            'action': item.get_action_display(),
            'timestamp': item.timestamp.strftime('%Y-%m-%d %H:%M'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_impressions': impressions,
            'clicks': clicks,
            'ctr_percentage': round(ctr, 2),
            'added_to_cart': cart_adds,
            'conversions': purchases,
            'conversion_rate_percentage': round(conversion_rate, 2),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }


# ==============================================================================
# 17. USER MANAGEMENT REPORT
# ==============================================================================

def get_user_management_report_data(filters):
    """
    Platform user directory statistics: roles, active status, email verification rate.
    """
    users = User.objects.all()

    total_users = users.count()
    active_users = users.filter(is_active=True).count()
    verified_users = users.filter(email_verified=True).count()
    unverified_users = total_users - verified_users

    role_counts = dict(users.values('role').annotate(c=Count('id')).values_list('role', 'c'))

    rows = []
    for u in users.order_by('-date_joined'):
        rows.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.get_role_display(),
            'is_active': u.is_active,
            'email_verified': u.email_verified,
            'date_joined': u.date_joined.strftime('%Y-%m-%d'),
        })

    paginated_rows, pagination = paginate_dataset(rows, filters['page'], filters['page_size'])

    return {
        'kpis': {
            'total_users': total_users,
            'active_users': active_users,
            'email_verified_users': verified_users,
            'unverified_users': unverified_users,
            'students_count': role_counts.get(User.Role.STUDENT, 0),
            'shop_owners_count': role_counts.get(User.Role.SHOP_OWNER, 0),
            'delivery_agents_count': role_counts.get(User.Role.DELIVERY_AGENT, 0),
            'admins_count': role_counts.get(User.Role.ADMIN, 0),
        },
        'rows': paginated_rows,
        'all_rows': rows,
        'pagination': pagination,
    }
