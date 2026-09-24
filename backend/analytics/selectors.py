import math
from datetime import timedelta
from decimal import Decimal
from django.db.models import (
    Sum, Count, Avg, F, Q, Case, When, Value, IntegerField, DecimalField
)
from django.db.models.functions import TruncDate
from django.utils import timezone

from orders.models import (
    Order, OrderItem, BulkOrder, Payment, Refund, CouponUsage
)
from products.models import Product, Category, Wishlist
from inventory.models import Inventory, InventoryTransaction
from printing.models import PrintingOrder
from delivery.models import Delivery
from predictions.models import DemandPrediction, PurchaseRecommendation
from academics.models import AcademicCalendar
from shops.models import Shop
from users.models import User


# ==============================================================================
# SHOP OWNER ANALYTICS SELECTORS
# ==============================================================================

def get_shop_kpi_summary(shop_id, start_datetime, end_datetime):
    """
    Computes top-level KPI metrics for a shop within the specified date window,
    plus today, this week, and this month comparisons.
    """
    now = timezone.now()
    today_start = timezone.make_aware(timezone.datetime.combine(now.date(), timezone.datetime.min.time()))
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    # Base orders query for this shop
    base_orders = Order.objects.filter(shop_id=shop_id)

    # Period orders
    period_orders = base_orders.filter(created_at__range=(start_datetime, end_datetime))
    valid_period_orders = period_orders.exclude(status=Order.Status.CANCELLED)

    # Today's metrics
    today_orders = base_orders.filter(created_at__gte=today_start)
    today_valid = today_orders.exclude(status=Order.Status.CANCELLED)
    today_sales = today_valid.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')
    today_order_count = today_orders.count()

    # Week metrics
    week_orders = base_orders.filter(created_at__gte=week_start).exclude(status=Order.Status.CANCELLED)
    week_sales = week_orders.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

    # Month metrics
    month_orders = base_orders.filter(created_at__gte=month_start).exclude(status=Order.Status.CANCELLED)
    month_sales = month_orders.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

    # Period financial figures
    gross_sales = valid_period_orders.aggregate(
        sub=Sum('subtotal'),
        deliv=Sum('delivery_fee')
    )
    gross_amount = (gross_sales['sub'] or Decimal('0.00')) + (gross_sales['deliv'] or Decimal('0.00'))

    discount_amount = valid_period_orders.aggregate(d=Sum('discount_amount'))['d'] or Decimal('0.00')

    refund_amount = Refund.objects.filter(
        order__shop_id=shop_id,
        status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
        created_at__range=(start_datetime, end_datetime)
    ).aggregate(r=Sum('amount'))['r'] or Decimal('0.00')

    net_revenue = max(Decimal('0.00'), gross_amount - discount_amount - refund_amount)

    valid_orders_count = valid_period_orders.count()
    aov = (net_revenue / Decimal(str(valid_orders_count))) if valid_orders_count > 0 else Decimal('0.00')

    # Orders status counts in period
    pending_orders = period_orders.filter(status=Order.Status.PENDING).count()
    completed_orders = period_orders.filter(status__in=[Order.Status.COMPLETED, Order.Status.DELIVERED]).count()
    cancelled_orders = period_orders.filter(status=Order.Status.CANCELLED).count()

    # Auxiliary stream revenues
    printing_revenue = PrintingOrder.objects.filter(
        shop_id=shop_id,
        created_at__range=(start_datetime, end_datetime)
    ).exclude(status=PrintingOrder.PrintingStatus.CANCELLED).aggregate(p=Sum('price'))['p'] or Decimal('0.00')

    delivery_revenue = valid_period_orders.aggregate(d=Sum('delivery_fee'))['d'] or Decimal('0.00')

    bulk_revenue = BulkOrder.objects.filter(
        shop_id=shop_id,
        status=BulkOrder.Status.COMPLETED,
        created_at__range=(start_datetime, end_datetime)
    ).aggregate(b=Sum('total_amount'))['b'] or Decimal('0.00')

    # Customer return count
    period_customers = set(valid_period_orders.values_list('customer_id', flat=True))
    prior_customers = set(base_orders.filter(
        created_at__lt=start_datetime
    ).exclude(status=Order.Status.CANCELLED).values_list('customer_id', flat=True))

    returning_customers = len(period_customers.intersection(prior_customers))

    return {
        'today_sales': today_sales.quantize(Decimal('0.01')),
        'today_orders': today_order_count,
        'this_week_sales': week_sales.quantize(Decimal('0.01')),
        'this_month_sales': month_sales.quantize(Decimal('0.01')),
        'pending_orders': pending_orders,
        'completed_orders': completed_orders,
        'cancelled_orders': cancelled_orders,
        'total_orders': period_orders.count(),
        'average_order_value': aov.quantize(Decimal('0.01')),
        'returning_customers': returning_customers,
        'unique_customers': len(period_customers),
        'gross_sales': gross_amount.quantize(Decimal('0.01')),
        'discount_amount': discount_amount.quantize(Decimal('0.01')),
        'refund_amount': refund_amount.quantize(Decimal('0.01')),
        'net_revenue': net_revenue.quantize(Decimal('0.01')),
        'printing_revenue': printing_revenue.quantize(Decimal('0.01')),
        'delivery_revenue': delivery_revenue.quantize(Decimal('0.01')),
        'bulk_order_revenue': bulk_revenue.quantize(Decimal('0.01')),
    }


def get_daily_sales_series(shop_id, start_date, end_date):
    """
    Constructs a contiguous calendar date time-series of orders, gross revenue,
    discounts, refunds, and net revenue. Fills empty days with zeros.
    """
    # Start and end boundaries as datetimes
    start_dt = timezone.make_aware(timezone.datetime.combine(start_date, timezone.datetime.min.time()))
    end_dt = timezone.make_aware(timezone.datetime.combine(end_date, timezone.datetime.max.time()))

    # Group valid orders by TruncDate
    orders_grouped = (
        Order.objects.filter(
            shop_id=shop_id,
            created_at__range=(start_dt, end_dt)
        )
        .exclude(status=Order.Status.CANCELLED)
        .annotate(order_date=TruncDate('created_at'))
        .values('order_date')
        .annotate(
            orders_count=Count('id'),
            total_sales=Sum('total_amount'),
            discounts=Sum('discount_amount'),
            subtotal=Sum('subtotal'),
            delivery_fee=Sum('delivery_fee')
        )
        .order_by('order_date')
    )

    orders_map = {
        item['order_date']: {
            'orders_count': item['orders_count'],
            'gross_sales': (item['subtotal'] or Decimal('0.00')) + (item['delivery_fee'] or Decimal('0.00')),
            'discounts': item['discounts'] or Decimal('0.00'),
            'total_sales': item['total_sales'] or Decimal('0.00'),
        }
        for item in orders_grouped
    }

    # Group completed refunds by TruncDate
    refunds_grouped = (
        Refund.objects.filter(
            order__shop_id=shop_id,
            status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
            created_at__range=(start_dt, end_dt)
        )
        .annotate(refund_date=TruncDate('created_at'))
        .values('refund_date')
        .annotate(refund_total=Sum('amount'))
        .order_by('refund_date')
    )

    refunds_map = {
        item['refund_date']: item['refund_total'] or Decimal('0.00')
        for item in refunds_grouped
    }

    series = []
    curr = start_date
    while curr <= end_date:
        ord_data = orders_map.get(curr, {
            'orders_count': 0,
            'gross_sales': Decimal('0.00'),
            'discounts': Decimal('0.00'),
            'total_sales': Decimal('0.00')
        })
        ref_amount = refunds_map.get(curr, Decimal('0.00'))
        net_sales = max(Decimal('0.00'), ord_data['gross_sales'] - ord_data['discounts'] - ref_amount)

        series.append({
            'date': curr.isoformat(),
            'orders': ord_data['orders_count'],
            'gross_sales': float(ord_data['gross_sales']),
            'discounts': float(ord_data['discounts']),
            'refunds': float(ref_amount),
            'net_sales': float(net_sales),
        })
        curr += timedelta(days=1)

    return series


def get_order_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Computes detailed order status breakdown, completion rate, cancellation rate,
    and refund frequency.
    """
    orders_qs = Order.objects.filter(shop_id=shop_id, created_at__range=(start_datetime, end_datetime))
    total_orders = orders_qs.count()

    status_counts = dict(
        orders_qs.values('status')
        .annotate(c=Count('id'))
        .values_list('status', 'c')
    )

    # Guarantee all standard choices have an entry
    distribution = [
        {
            'status': status_choice,
            'label': dict(Order.Status.choices).get(status_choice, status_choice),
            'count': status_counts.get(status_choice, 0)
        }
        for status_choice, _ in Order.Status.choices
    ]

    completed = status_counts.get(Order.Status.COMPLETED, 0) + status_counts.get(Order.Status.DELIVERED, 0)
    cancelled = status_counts.get(Order.Status.CANCELLED, 0)

    refunded_orders_count = orders_qs.filter(payment_status__in=[
        Order.PaymentStatus.REFUNDED, Order.PaymentStatus.PARTIALLY_REFUNDED
    ]).count()

    completion_rate = (completed / total_orders * 100.0) if total_orders > 0 else 0.0
    cancellation_rate = (cancelled / total_orders * 100.0) if total_orders > 0 else 0.0
    refund_rate = (refunded_orders_count / total_orders * 100.0) if total_orders > 0 else 0.0

    return {
        'total_orders': total_orders,
        'completion_rate': round(completion_rate, 2),
        'cancellation_rate': round(cancellation_rate, 2),
        'refund_rate': round(refund_rate, 2),
        'distribution': distribution
    }


def get_top_selling_products(shop_id, start_datetime, end_datetime, limit=10, sort_by='revenue'):
    """
    Retrieves top selling products for a shop by quantity sold, revenue, or order count.
    """
    qs = (
        OrderItem.objects.filter(
            order__shop_id=shop_id,
            order__created_at__range=(start_datetime, end_datetime)
        )
        .exclude(order__status=Order.Status.CANCELLED)
        .values('product_id', 'product__name', 'product__category__name', 'product__sku')
        .annotate(
            quantity_sold=Sum('quantity'),
            revenue=Sum('total_price'),
            order_count=Count('order_id', distinct=True)
        )
    )

    if sort_by == 'quantity':
        qs = qs.order_by('-quantity_sold')
    elif sort_by == 'frequency':
        qs = qs.order_by('-order_count')
    else:
        qs = qs.order_by('-revenue')

    results = []
    for item in qs[:limit]:
        results.append({
            'product_id': item['product_id'],
            'product_name': item['product__name'],
            'category_name': item['product__category__name'] or 'General',
            'sku': item['product__sku'] or '',
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': float(item['revenue'] or 0.0),
            'order_count': item['order_count'] or 0,
        })
    return results


def get_product_performance_matrix(shop_id, start_datetime, end_datetime, days=30):
    """
    Evaluates every product in the shop catalog against actual sales velocity,
    inventory availability, days of cover, and classifies into:
    FAST_MOVING, NORMAL, SLOW_MOVING, DEAD_STOCK.
    """
    inventories = (
        Inventory.objects.filter(shop_id=shop_id, is_active=True)
        .select_related('product', 'product__category')
        .order_by('product__name')
    )

    # Sales by product in the given period
    sales_qs = (
        OrderItem.objects.filter(
            order__shop_id=shop_id,
            order__created_at__range=(start_datetime, end_datetime)
        )
        .exclude(order__status=Order.Status.CANCELLED)
        .values('product_id')
        .annotate(
            units_sold=Sum('quantity'),
            revenue=Sum('total_price'),
            order_count=Count('order_id', distinct=True)
        )
    )
    sales_map = {item['product_id']: item for item in sales_qs}

    # Latest 30d demand predictions
    preds_qs = (
        DemandPrediction.objects.filter(
            shop_id=shop_id,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D
        )
        .values('product_id')
        .annotate(predicted=Sum('predicted_units'))
    )
    preds_map = {item['product_id']: item['predicted'] for item in preds_qs}

    performance_list = []
    effective_days = max(1, days)

    for inv in inventories:
        p_id = inv.product_id
        sale = sales_map.get(p_id, {'units_sold': 0, 'revenue': Decimal('0.00'), 'order_count': 0})
        units_sold = sale['units_sold'] or 0
        revenue = sale['revenue'] or Decimal('0.00')
        order_count = sale['order_count'] or 0
        predicted_demand = preds_map.get(p_id, 0)

        daily_velocity = units_sold / effective_days

        # Velocity classification
        if units_sold >= max(20, effective_days * 0.8):
            velocity_class = 'FAST_MOVING'
        elif units_sold >= max(5, effective_days * 0.2):
            velocity_class = 'NORMAL'
        elif units_sold > 0:
            velocity_class = 'SLOW_MOVING'
        else:
            velocity_class = 'DEAD_STOCK'

        # Days of cover calculation
        if daily_velocity > 0:
            days_of_cover = round(inv.current_stock / daily_velocity, 1)
        else:
            days_of_cover = None  # Infinite / zero-velocity indicator

        performance_list.append({
            'product_id': p_id,
            'product_name': inv.product.name,
            'category': inv.product.category.name if inv.product.category else 'General',
            'units_sold': units_sold,
            'revenue': float(revenue),
            'order_count': order_count,
            'current_stock': inv.current_stock,
            'available_stock': inv.available_stock,
            'predicted_demand': predicted_demand,
            'days_of_cover': days_of_cover,
            'stock_status': inv.stock_status,
            'velocity_class': velocity_class,
        })

    # Sort by units sold descending
    performance_list.sort(key=lambda x: x['units_sold'], reverse=True)
    return performance_list


def get_inventory_analytics_data(shop_id):
    """
    Computes stock valuation, health distribution, stockout counts, and turnover ratios.
    """
    inventories = Inventory.objects.filter(shop_id=shop_id, is_active=True).select_related('product')
    total_products = inventories.count()

    total_units = 0
    total_value = Decimal('0.00')
    low_stock = 0
    out_of_stock = 0
    overstocked = 0
    in_stock = 0

    for inv in inventories:
        total_units += inv.current_stock
        total_value += inv.stock_value

        status = inv.stock_status
        if status == 'OUT_OF_STOCK':
            out_of_stock += 1
        elif status == 'LOW_STOCK':
            low_stock += 1
        elif status == 'OVERSTOCKED':
            overstocked += 1
        else:
            in_stock += 1

    # Cost of Goods Sold (COGS) in last 30 days for turnover estimation
    now = timezone.now()
    month_ago = now - timedelta(days=30)
    cogs_aggregate = InventoryTransaction.objects.filter(
        inventory__shop_id=shop_id,
        transaction_type__in=[InventoryTransaction.TransactionType.SALE, InventoryTransaction.TransactionType.PURCHASE],
        quantity_change__lt=0,
        created_at__gte=month_ago
    ).aggregate(total_cogs=Sum('total_cost'))

    cogs_30d = abs(cogs_aggregate['total_cogs'] or Decimal('0.00'))

    # Inventory turnover = COGS / Average Inventory Value
    if total_value > Decimal('0.00') and cogs_30d > Decimal('0.00'):
        # Annualized turnover = (30-day COGS * 12) / Total Value
        annualized_turnover = round(float((cogs_30d * Decimal('12.00')) / total_value), 2)
        days_of_inventory = round(float((total_value / cogs_30d) * Decimal('30.00')), 1)
    else:
        annualized_turnover = 0.0
        days_of_inventory = None

    return {
        'total_products': total_products,
        'total_stock_units': total_units,
        'inventory_value': float(total_value.quantize(Decimal('0.01'))),
        'in_stock_count': in_stock,
        'low_stock_count': low_stock,
        'out_of_stock_count': out_of_stock,
        'overstocked_count': overstocked,
        'turnover_ratio': annualized_turnover,
        'days_of_inventory': days_of_inventory,
    }


def get_stock_movement_trends(shop_id, start_datetime, end_datetime):
    """
    Aggregates immutable InventoryTransaction logs by transaction type and date.
    """
    txs = (
        InventoryTransaction.objects.filter(
            inventory__shop_id=shop_id,
            created_at__range=(start_datetime, end_datetime)
        )
        .annotate(tx_date=TruncDate('created_at'))
        .values('tx_date', 'transaction_type')
        .annotate(
            total_quantity=Sum('quantity_change'),
            tx_count=Count('id')
        )
        .order_by('tx_date')
    )

    type_summary = dict(
        InventoryTransaction.objects.filter(
            inventory__shop_id=shop_id,
            created_at__range=(start_datetime, end_datetime)
        )
        .values('transaction_type')
        .annotate(total_units=Sum('quantity_change'), count=Count('id'))
        .values_list('transaction_type', 'total_units')
    )

    return {
        'summary': {
            'sales_deducted': abs(type_summary.get(InventoryTransaction.TransactionType.SALE, 0) or 0),
            'restocked': type_summary.get(InventoryTransaction.TransactionType.RESTOCK, 0) or 0,
            'returns_added': type_summary.get(InventoryTransaction.TransactionType.RETURN, 0) or 0,
            'damaged_discarded': abs(type_summary.get(InventoryTransaction.TransactionType.DAMAGE, 0) or 0),
            'adjustments': type_summary.get(InventoryTransaction.TransactionType.ADJUSTMENT, 0) or 0,
        },
        'raw_transactions_count': len(txs)
    }


def get_demand_prediction_analytics(shop_id):
    """
    Integrates Step 17 regression forecasts and compares historical actual demand
    vs predicted units. Evaluates MAE, RMSE, and MAPE mathematically without data leakage.
    """
    now = timezone.now()
    today = now.date()

    # Past predictions with historical target dates
    past_preds = (
        DemandPrediction.objects.filter(
            shop_id=shop_id,
            target_date__lte=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.DAILY
        )
        .select_related('product')
        .order_by('target_date')
    )

    evaluation_points = []
    abs_errors = []
    squared_errors = []
    percentage_errors = []

    for pred in past_preds:
        # Determine actual units sold on that exact target_date
        actual_units = (
            OrderItem.objects.filter(
                order__shop_id=shop_id,
                product_id=pred.product_id,
                order__created_at__date=pred.target_date
            )
            .exclude(order__status=Order.Status.CANCELLED)
            .aggregate(s=Sum('quantity'))['s'] or 0
        )

        error = pred.predicted_units - actual_units
        abs_err = abs(error)
        abs_errors.append(abs_err)
        squared_errors.append(error ** 2)

        if actual_units > 0:
            percentage_errors.append(abs_err / actual_units)

        evaluation_points.append({
            'date': pred.target_date.isoformat(),
            'product_name': pred.product.name,
            'predicted': pred.predicted_units,
            'actual': actual_units,
            'error': error,
            'abs_error': abs_err,
        })

    n = len(abs_errors)
    has_sufficient_data = n >= 3

    mae = round(sum(abs_errors) / n, 2) if n > 0 else None
    rmse = round(math.sqrt(sum(squared_errors) / n), 2) if n > 0 else None
    mape = round((sum(percentage_errors) / len(percentage_errors)) * 100.0, 2) if len(percentage_errors) > 0 else None

    # Future predictions: Next 7 days & Next 30 days
    upcoming_daily = (
        DemandPrediction.objects.filter(
            shop_id=shop_id,
            target_date__gt=today,
            target_date__lte=today + timedelta(days=7),
            forecast_horizon=DemandPrediction.ForecastHorizon.DAILY
        )
        .select_related('product')
        .order_by('target_date')
    )

    future_series = [
        {
            'date': p.target_date.isoformat(),
            'product_name': p.product.name,
            'predicted_units': p.predicted_units,
            'confidence_score': float(p.confidence_score),
        }
        for p in upcoming_daily
    ]

    # Spike alerts from purchase advisor recommendations
    spike_recommendations = (
        PurchaseRecommendation.objects.filter(
            shop_id=shop_id,
            demand_spike_alert=True
        )
        .select_related('product')
        [:5]
    )

    spikes = [
        {
            'product_name': rec.product.name,
            'priority': rec.priority,
            'predicted_demand_30d': rec.predicted_demand_30d,
            'current_stock': rec.current_stock,
            'spike_info': rec.demand_spike_info,
            'reason': rec.reason,
        }
        for rec in spike_recommendations
    ]

    return {
        'has_sufficient_data': has_sufficient_data,
        'evaluation_count': n,
        'mae': mae,
        'rmse': rmse,
        'mape': mape,
        'historical_comparison': evaluation_points[-14:],  # Most recent 14 comparison points
        'future_forecast_7d': future_series,
        'detected_spikes': spikes,
    }


def get_academic_demand_analytics(shop_id):
    """
    Evaluates stationery demand trends around university academic milestones
    (Exams, Project Submissions, Lab Deadlines, Semester Starts).
    """
    now = timezone.now().date()
    events = (
        AcademicCalendar.objects.filter(
            is_active=True,
            start_date__lte=now
        )
        .order_by('-start_date')[:5]
    )

    event_insights = []
    for ev in events:
        ev_date = ev.start_date
        # Compare 7 days prior vs 7 days following
        pre_start = ev_date - timedelta(days=7)
        post_end = ev_date + timedelta(days=7)

        pre_sales = (
            OrderItem.objects.filter(
                order__shop_id=shop_id,
                order__created_at__date__gte=pre_start,
                order__created_at__date__lt=ev_date
            )
            .exclude(order__status=Order.Status.CANCELLED)
            .aggregate(s=Sum('quantity'))['s'] or 0
        )

        during_post_sales = (
            OrderItem.objects.filter(
                order__shop_id=shop_id,
                order__created_at__date__gte=ev_date,
                order__created_at__date__lte=post_end
            )
            .exclude(order__status=Order.Status.CANCELLED)
            .aggregate(s=Sum('quantity'))['s'] or 0
        )

        event_insights.append({
            'event_id': ev.id,
            'title': ev.title,
            'event_type': ev.event_type,
            'event_date': ev_date.isoformat(),
            'pre_event_units': pre_sales,
            'event_window_units': during_post_sales,
            'observed_delta': during_post_sales - pre_sales,
        })

    return event_insights


def get_category_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Calculates category performance by units sold, total revenue, and order presence.
    """
    categories_qs = (
        OrderItem.objects.filter(
            order__shop_id=shop_id,
            order__created_at__range=(start_datetime, end_datetime)
        )
        .exclude(order__status=Order.Status.CANCELLED)
        .values('product__category__name')
        .annotate(
            quantity_sold=Sum('quantity'),
            revenue=Sum('total_price'),
            order_count=Count('order_id', distinct=True)
        )
        .order_by('-revenue')
    )

    results = []
    for item in categories_qs:
        results.append({
            'category': item['product__category__name'] or 'Uncategorized',
            'quantity_sold': item['quantity_sold'] or 0,
            'revenue': float(item['revenue'] or Decimal('0.00')),
            'order_count': item['order_count'] or 0,
        })
    return results


def get_printing_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Dedicated printing service analytics for shop owner or platform admin:
    volume, pages, color split, paper formats, and turnaround timing.
    """
    print_qs = PrintingOrder.objects.filter(
        shop_id=shop_id,
        created_at__range=(start_datetime, end_datetime)
    )

    valid_prints = print_qs.exclude(status=PrintingOrder.PrintingStatus.CANCELLED)

    total_orders = print_qs.count()
    completed_orders = print_qs.filter(status=PrintingOrder.PrintingStatus.COMPLETED).count()

    total_pages = 0
    total_copies = 0
    total_revenue = Decimal('0.00')

    color_counts = {'BW': 0, 'COLOR': 0, 'MIXED': 0}
    paper_size_counts = {'A4': 0, 'A3': 0, 'A5': 0, 'LETTER': 0}
    sides_counts = {'SINGLE_SIDED': 0, 'DOUBLE_SIDED': 0}
    binding_counts = 0

    turnaround_minutes_list = []

    for p in valid_prints:
        pages_in_job = p.total_pages * p.copies
        total_pages += pages_in_job
        total_copies += p.copies
        total_revenue += p.price

        if p.color_mode in color_counts:
            color_counts[p.color_mode] += pages_in_job

        if p.paper_size in paper_size_counts:
            paper_size_counts[p.paper_size] += pages_in_job

        if p.print_sides in sides_counts:
            sides_counts[p.print_sides] += pages_in_job

        if p.binding_type != PrintingOrder.BindingType.NONE:
            binding_counts += p.copies

        if p.completed_at and p.created_at:
            delta = (p.completed_at - p.created_at).total_seconds() / 60.0
            if delta >= 0:
                turnaround_minutes_list.append(delta)

    avg_turnaround = (
        round(sum(turnaround_minutes_list) / len(turnaround_minutes_list), 1)
        if turnaround_minutes_list else None
    )

    return {
        'total_print_orders': total_orders,
        'completed_print_orders': completed_orders,
        'pages_printed': total_pages,
        'copies_printed': total_copies,
        'revenue': float(total_revenue.quantize(Decimal('0.01'))),
        'average_turnaround_mins': avg_turnaround,
        'binding_orders_count': binding_counts,
        'color_distribution': color_counts,
        'paper_size_distribution': paper_size_counts,
        'print_sides_distribution': sides_counts,
    }


def get_delivery_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Analyzes delivery operations: fulfillment success, couriers, and failure rates.
    """
    deliveries_qs = Delivery.objects.filter(
        order__shop_id=shop_id,
        created_at__range=(start_datetime, end_datetime)
    ).select_related('delivery_agent')

    total_deliveries = deliveries_qs.count()
    status_counts = dict(
        deliveries_qs.values('delivery_status')
        .annotate(c=Count('id'))
        .values_list('delivery_status', 'c')
    )

    delivered_count = status_counts.get(Delivery.DeliveryStatus.DELIVERED, 0)
    failed_count = status_counts.get(Delivery.DeliveryStatus.FAILED, 0)
    rescheduled_count = status_counts.get(Delivery.DeliveryStatus.RESCHEDULED, 0)
    cancelled_count = status_counts.get(Delivery.DeliveryStatus.CANCELLED, 0)

    success_rate = (delivered_count / total_deliveries * 100.0) if total_deliveries > 0 else 0.0

    # Average delivery duration (delivered_at - picked_up_at)
    durations = []
    for d in deliveries_qs.filter(delivery_status=Delivery.DeliveryStatus.DELIVERED):
        if d.delivered_at and d.picked_up_at:
            diff = (d.delivered_at - d.picked_up_at).total_seconds() / 60.0
            if 0 <= diff <= 300:
                durations.append(diff)

    avg_duration = round(sum(durations) / len(durations), 1) if durations else None

    # Courier performance breakdown
    couriers_qs = (
        deliveries_qs.exclude(delivery_agent=None)
        .values('delivery_agent__id', 'delivery_agent__username', 'delivery_agent__first_name', 'delivery_agent__last_name')
        .annotate(
            total=Count('id'),
            completed=Count(Case(When(delivery_status=Delivery.DeliveryStatus.DELIVERED, then=1), output_field=IntegerField())),
            failed=Count(Case(When(delivery_status=Delivery.DeliveryStatus.FAILED, then=1), output_field=IntegerField())),
        )
    )

    courier_stats = []
    for c in couriers_qs:
        tot = c['total']
        comp = c['completed']
        rate = (comp / tot * 100.0) if tot > 0 else 0.0
        name = f"{c['delivery_agent__first_name']} {c['delivery_agent__last_name']}".strip() or c['delivery_agent__username']
        courier_stats.append({
            'courier_id': c['delivery_agent__id'],
            'name': name,
            'total_assigned': tot,
            'delivered': comp,
            'failed': c['failed'],
            'success_rate': round(rate, 1),
        })

    return {
        'total_deliveries': total_deliveries,
        'delivered_count': delivered_count,
        'failed_count': failed_count,
        'rescheduled_count': rescheduled_count,
        'cancelled_count': cancelled_count,
        'success_rate': round(success_rate, 1),
        'average_duration_mins': avg_duration,
        'couriers': courier_stats,
    }


def get_customer_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Computes customer acquisition, retention, and repeat purchase frequencies.
    """
    all_shop_orders = Order.objects.filter(shop_id=shop_id).exclude(status=Order.Status.CANCELLED)

    period_orders = all_shop_orders.filter(created_at__range=(start_datetime, end_datetime))

    # Distinct customers in period
    customer_order_counts = dict(
        period_orders.values('customer_id')
        .annotate(c=Count('id'))
        .values_list('customer_id', 'c')
    )

    unique_customers_count = len(customer_order_counts)

    # Distinguish new vs returning based on earliest order ever
    earliest_orders = dict(
        all_shop_orders.values('customer_id')
        .annotate(first_order=TruncDate('created_at'))
        .values_list('customer_id', 'first_order')
    )

    new_customers = 0
    returning_customers = 0
    frequent_customers = 0

    start_date = start_datetime.date()

    for cust_id, order_count in customer_order_counts.items():
        first_date = earliest_orders.get(cust_id)
        if first_date and first_date < start_date:
            returning_customers += 1
        else:
            new_customers += 1

        if order_count >= 3:
            frequent_customers += 1

    repeat_rate = (
        round((returning_customers / unique_customers_count) * 100.0, 1)
        if unique_customers_count > 0 else 0.0
    )

    total_spend = period_orders.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')
    avg_spend = (
        round(float(total_spend / Decimal(str(unique_customers_count))), 2)
        if unique_customers_count > 0 else 0.0
    )

    return {
        'unique_customers': unique_customers_count,
        'new_customers': new_customers,
        'returning_customers': returning_customers,
        'frequent_customers': frequent_customers,
        'repeat_customer_percentage': repeat_rate,
        'average_customer_spend': avg_spend,
        'average_orders_per_customer': round(len(period_orders) / unique_customers_count, 1) if unique_customers_count > 0 else 0.0,
    }


def get_payment_analytics_data(shop_id, start_datetime, end_datetime):
    """
    Aggregates financial payment methods, gateway transaction states, and refunds.
    Never exposes sensitive card details or tokens.
    """
    payments = Payment.objects.filter(
        shop_id=shop_id,
        created_at__range=(start_datetime, end_datetime)
    )

    total_payments = payments.count()
    status_distribution = dict(
        payments.values('status').annotate(c=Count('id')).values_list('status', 'c')
    )

    method_distribution = dict(
        payments.values('payment_method')
        .annotate(c=Count('id'), total=Sum('amount'))
        .values_list('payment_method', 'total')
    )

    refunds = Refund.objects.filter(
        order__shop_id=shop_id,
        created_at__range=(start_datetime, end_datetime)
    )

    total_refunds_count = refunds.count()
    completed_refunds_amount = refunds.filter(
        status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED]
    ).aggregate(s=Sum('amount'))['s'] or Decimal('0.00')

    return {
        'total_transactions': total_payments,
        'successful_count': status_distribution.get(Payment.Status.CAPTURED, 0),
        'pending_count': status_distribution.get(Payment.Status.PENDING, 0),
        'failed_count': status_distribution.get(Payment.Status.FAILED, 0),
        'refunds_count': total_refunds_count,
        'refunded_amount': float(completed_refunds_amount.quantize(Decimal('0.01'))),
        'method_breakdown': {
            method: float(amount or 0.0)
            for method, amount in method_distribution.items()
        }
    }


# ==============================================================================
# PLATFORM ADMIN ANALYTICS SELECTORS
# ==============================================================================

def get_admin_platform_overview(start_datetime, end_datetime, start_date, end_date):
    """
    Generates platform-wide business intelligence, user growth, shop growth,
    revenue stream breakdown, and multi-shop comparison matrices.
    """
    total_users = User.objects.count()
    active_users = User.objects.filter(is_active=True).count()
    verified_users = User.objects.filter(email_verified=True).count()

    # User role distribution
    user_roles = dict(
        User.objects.values('role').annotate(c=Count('id')).values_list('role', 'c')
    )

    total_shops = Shop.objects.count()
    active_shops = Shop.objects.filter(is_active=True).count()

    all_orders = Order.objects.filter(created_at__range=(start_datetime, end_datetime))
    total_orders = all_orders.count()
    valid_orders = all_orders.exclude(status=Order.Status.CANCELLED)
    completed_orders = all_orders.filter(status__in=[Order.Status.COMPLETED, Order.Status.DELIVERED]).count()

    # Platform revenue
    subtotal_sum = valid_orders.aggregate(s=Sum('subtotal'))['s'] or Decimal('0.00')
    delivery_sum = valid_orders.aggregate(d=Sum('delivery_fee'))['d'] or Decimal('0.00')
    gross_revenue = subtotal_sum + delivery_sum

    discount_sum = valid_orders.aggregate(d=Sum('discount_amount'))['d'] or Decimal('0.00')
    refund_sum = Refund.objects.filter(
        status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
        created_at__range=(start_datetime, end_datetime)
    ).aggregate(r=Sum('amount'))['r'] or Decimal('0.00')

    net_revenue = max(Decimal('0.00'), gross_revenue - discount_sum - refund_sum)

    # Stream breakdown
    printing_revenue = PrintingOrder.objects.filter(
        created_at__range=(start_datetime, end_datetime)
    ).exclude(status=PrintingOrder.PrintingStatus.CANCELLED).aggregate(p=Sum('price'))['p'] or Decimal('0.00')

    delivery_revenue = delivery_sum

    bulk_revenue = BulkOrder.objects.filter(
        status=BulkOrder.Status.COMPLETED,
        created_at__range=(start_datetime, end_datetime)
    ).aggregate(b=Sum('total_amount'))['b'] or Decimal('0.00')

    stationery_revenue = max(Decimal('0.00'), gross_revenue - printing_revenue - delivery_revenue)

    # User registration growth over time
    users_trend = (
        User.objects.filter(date_joined__range=(start_datetime, end_datetime))
        .annotate(joined_date=TruncDate('date_joined'))
        .values('joined_date')
        .annotate(new_users=Count('id'))
        .order_by('joined_date')
    )
    user_growth_map = {item['joined_date']: item['new_users'] for item in users_trend}

    daily_growth = []
    curr = start_date
    while curr <= end_date:
        daily_growth.append({
            'date': curr.isoformat(),
            'new_users': user_growth_map.get(curr, 0)
        })
        curr += timedelta(days=1)

    # Multi-Shop Performance Comparison
    shops_qs = Shop.objects.all().select_related('owner')
    shop_comparison = []

    for s in shops_qs:
        s_orders = Order.objects.filter(shop=s, created_at__range=(start_datetime, end_datetime))
        s_valid = s_orders.exclude(status=Order.Status.CANCELLED)
        s_count = s_orders.count()
        s_completed = s_valid.filter(status__in=[Order.Status.COMPLETED, Order.Status.DELIVERED]).count()

        s_gross = s_valid.aggregate(t=Sum('total_amount'))['t'] or Decimal('0.00')
        s_refunds = Refund.objects.filter(
            order__shop=s,
            status__in=[Refund.Status.COMPLETED, Refund.Status.APPROVED],
            created_at__range=(start_datetime, end_datetime)
        ).aggregate(r=Sum('amount'))['r'] or Decimal('0.00')

        s_net = max(Decimal('0.00'), s_gross - s_refunds)
        s_aov = (s_net / s_count) if s_count > 0 else Decimal('0.00')

        s_customers = s_valid.values('customer_id').distinct().count()

        shop_comparison.append({
            'shop_id': s.id,
            'shop_name': s.name,
            'owner_name': s.owner.username,
            'is_active': s.is_active,
            'total_orders': s_count,
            'completed_orders': s_completed,
            'gross_revenue': float(s_gross.quantize(Decimal('0.01'))),
            'net_revenue': float(s_net.quantize(Decimal('0.01'))),
            'average_order_value': float(s_aov.quantize(Decimal('0.01'))),
            'unique_customers': s_customers,
            'rating': float(s.rating),
        })

    # Sort shop comparison by net revenue descending
    shop_comparison.sort(key=lambda x: x['net_revenue'], reverse=True)

    return {
        'platform_kpis': {
            'total_users': total_users,
            'active_users': active_users,
            'verified_users': verified_users,
            'total_shops': total_shops,
            'active_shops': active_shops,
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'gross_revenue': float(gross_revenue.quantize(Decimal('0.01'))),
            'discount_amount': float(discount_sum.quantize(Decimal('0.01'))),
            'refund_amount': float(refund_sum.quantize(Decimal('0.01'))),
            'net_revenue': float(net_revenue.quantize(Decimal('0.01'))),
            'printing_revenue': float(printing_revenue.quantize(Decimal('0.01'))),
            'delivery_revenue': float(delivery_revenue.quantize(Decimal('0.01'))),
            'bulk_revenue': float(bulk_revenue.quantize(Decimal('0.01'))),
        },
        'user_roles': user_roles,
        'revenue_streams': {
            'stationery': float(stationery_revenue.quantize(Decimal('0.01'))),
            'printing': float(printing_revenue.quantize(Decimal('0.01'))),
            'delivery': float(delivery_revenue.quantize(Decimal('0.01'))),
            'bulk_orders': float(bulk_revenue.quantize(Decimal('0.01'))),
        },
        'user_growth_trend': daily_growth,
        'shop_comparison': shop_comparison,
    }


# ==============================================================================
# STUDENT PERSONAL ANALYTICS SELECTORS
# ==============================================================================

def get_student_personal_analytics(user):
    """
    Computes private, personal spending and activity insights for an individual student.
    Strictly scoped to the requesting student.
    """
    student_orders = Order.objects.filter(customer=user)
    valid_orders = student_orders.exclude(status=Order.Status.CANCELLED)

    total_orders_count = student_orders.count()
    active_orders_count = student_orders.filter(
        status__in=[
            Order.Status.PENDING,
            Order.Status.CONFIRMED,
            Order.Status.PREPARING,
            Order.Status.READY,
            Order.Status.OUT_FOR_DELIVERY
        ]
    ).count()

    total_spent = valid_orders.aggregate(s=Sum('total_amount'))['s'] or Decimal('0.00')

    # Printing activity
    printing_jobs = PrintingOrder.objects.filter(order__customer=user).exclude(
        status=PrintingOrder.PrintingStatus.CANCELLED
    )
    total_print_orders = printing_jobs.count()
    pages_printed = sum(p.total_pages * p.copies for p in printing_jobs)

    # Favorite categories
    top_categories = (
        OrderItem.objects.filter(order__customer=user)
        .exclude(order__status=Order.Status.CANCELLED)
        .values('product__category__name')
        .annotate(units=Sum('quantity'), spend=Sum('total_price'))
        .order_by('-spend')[:4]
    )

    categories_list = [
        {
            'category': c['product__category__name'] or 'General',
            'units': c['units'],
            'total_spent': float(c['spend'])
        }
        for c in top_categories
    ]

    return {
        'total_orders': total_orders_count,
        'active_orders': active_orders_count,
        'total_spent': float(total_spent.quantize(Decimal('0.01'))),
        'total_print_orders': total_print_orders,
        'pages_printed': pages_printed,
        'top_categories': categories_list,
    }
