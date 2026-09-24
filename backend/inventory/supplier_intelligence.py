"""
Procurement Intelligence & Supplier Analytics Engine.
Provides rule-based supplier performance scoring, product purchase cost tracking,
and explainable vendor recommendations. Prepares reliable purchasing datasets
for future regression-based demand prediction in Step 17.
"""

from decimal import Decimal
from django.utils import timezone
from django.db.models import Sum, Avg, Min, Max, Count, Q, F
from datetime import timedelta

from .models import (
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    Inventory,
    InventoryTransaction,
)


def get_supplier_performance(supplier, shop=None):
    """
    Calculates operational supplier performance metrics directly from actual historical purchase orders.
    Avoids duplicated or stale stored data.
    """
    po_qs = supplier.purchase_orders.all()
    if shop:
        po_qs = po_qs.filter(shop=shop)

    total_orders = po_qs.count()
    completed_orders = po_qs.filter(status=PurchaseOrder.Status.RECEIVED).count()
    cancelled_orders = po_qs.filter(status=PurchaseOrder.Status.CANCELLED).count()
    open_orders = po_qs.filter(
        status__in=[
            PurchaseOrder.Status.DRAFT,
            PurchaseOrder.Status.PENDING_APPROVAL,
            PurchaseOrder.Status.APPROVED,
            PurchaseOrder.Status.ORDERED,
            PurchaseOrder.Status.PLACED,
            PurchaseOrder.Status.PARTIALLY_RECEIVED,
        ]
    ).count()

    # Total purchase spend across non-cancelled orders
    valid_pos = po_qs.exclude(status=PurchaseOrder.Status.CANCELLED)
    total_spend = Decimal('0.00')
    for po in valid_pos:
        total_spend += po.grand_total if po.grand_total > Decimal('0.00') else po.subtotal

    # Delayed orders:
    # 1. Fully received after expected date
    # 2. Currently open/in-progress and expected date is in the past
    today = timezone.now().date()
    delayed_completed = po_qs.filter(
        status=PurchaseOrder.Status.RECEIVED,
        expected_date__isnull=False,
        received_date__isnull=False
    )
    delayed_completed_count = sum(1 for po in delayed_completed if po.received_date.date() > po.expected_date)

    delayed_open_count = po_qs.filter(
        status__in=[
            PurchaseOrder.Status.ORDERED,
            PurchaseOrder.Status.PLACED,
            PurchaseOrder.Status.PARTIALLY_RECEIVED,
        ],
        expected_date__isnull=False,
        expected_date__lt=today
    ).count()

    total_delayed = delayed_completed_count + delayed_open_count

    # Average Lead Time (days between order/created date and received date for completed orders)
    received_pos = po_qs.filter(
        status=PurchaseOrder.Status.RECEIVED,
        received_date__isnull=False
    )
    lead_times = []
    for po in received_pos:
        start_date = po.order_date or po.created_at.date()
        diff = (po.received_date.date() - start_date).days
        if diff >= 0:
            lead_times.append(diff)

    if lead_times:
        avg_lead_time = round(sum(lead_times) / len(lead_times), 1)
    else:
        # Fallback to configured catalog lead times
        sp_qs = supplier.supplier_products.all()
        if shop:
            sp_qs = sp_qs.filter(shop=shop)
        avg_lead = sp_qs.aggregate(avg=Avg('lead_time_days'))['avg']
        avg_lead_time = round(float(avg_lead), 1) if avg_lead is not None else 3.0

    # Most recent order date
    latest_po = po_qs.order_by('-created_at').first()
    last_order_date = latest_po.order_date or latest_po.created_at.date() if latest_po else None

    # Reliability Rate (% of non-cancelled completed orders delivered on-schedule)
    if completed_orders > 0:
        on_time_orders = max(0, completed_orders - delayed_completed_count)
        reliability_pct = round((on_time_orders / completed_orders) * 100, 1)
    elif total_orders == 0:
        reliability_pct = 100.0
    else:
        reliability_pct = 80.0

    return {
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "business_name": supplier.business_name,
        "tax_id": supplier.tax_id,
        "is_active": supplier.is_active,
        "total_orders": total_orders,
        "completed_orders": completed_orders,
        "open_orders": open_orders,
        "delayed_orders": total_delayed,
        "cancelled_orders": cancelled_orders,
        "average_lead_time_days": avg_lead_time,
        "total_purchase_value": float(total_spend),
        "last_order_date": last_order_date.isoformat() if last_order_date else None,
        "reliability_score": reliability_pct,
    }


def calculate_product_cost_metrics(product, shop):
    """
    Computes real historical purchasing cost metrics for a product within a specific shop:
    - Last purchase cost
    - Average purchase cost
    - Lowest purchase cost
    - Highest purchase cost
    - Monthly cost trend trajectory
    Derives values strictly from actual purchase receipts and restock transactions.
    """
    # 1. Query all received PO line items for this product
    po_items = PurchaseOrderItem.objects.filter(
        purchase_order__shop=shop,
        product=product,
        quantity_received__gt=0
    ).select_related('purchase_order').order_by('purchase_order__received_date', 'created_at')

    # 2. Query transactions of type RESTOCK or direct receives
    tx_items = InventoryTransaction.objects.filter(
        inventory__shop=shop,
        inventory__product=product,
        transaction_type__in=[
            InventoryTransaction.TransactionType.RESTOCK,
        ],
        unit_cost__gt=0
    ).order_by('created_at')

    data_points = []

    for item in po_items:
        date_ref = item.purchase_order.received_date or item.purchase_order.updated_at
        if date_ref and item.unit_cost > Decimal('0.00'):
            data_points.append({
                'date': date_ref,
                'unit_cost': item.unit_cost,
                'quantity': item.quantity_received,
                'source': f"PO #{item.purchase_order.po_number}"
            })

    for tx in tx_items:
        if tx.unit_cost > Decimal('0.00'):
            data_points.append({
                'date': tx.created_at,
                'unit_cost': tx.unit_cost,
                'quantity': abs(tx.quantity_change),
                'source': tx.reference_id or 'Direct Stock Restock'
            })

    # If no recorded purchase history, inspect current inventory unit_cost snapshot
    if not data_points:
        inv = Inventory.objects.filter(shop=shop, product=product).first()
        base_cost = inv.unit_cost if inv else Decimal('0.00')
        return {
            "product_id": product.id,
            "product_name": product.name,
            "has_history": False,
            "insufficient_history": True,
            "message": "Not enough historical data to calculate a cost trend.",
            "last_cost": float(base_cost),
            "average_cost": float(base_cost),
            "lowest_cost": float(base_cost),
            "highest_cost": float(base_cost),
            "total_purchases_recorded": 0,
            "monthly_trends": [],
            "price_increase_alert": False,
        }

    # Sort data points chronologically
    data_points.sort(key=lambda x: x['date'])

    costs = [dp['unit_cost'] for dp in data_points]
    last_cost = costs[-1]
    lowest_cost = min(costs)
    highest_cost = max(costs)

    # Weighted average cost
    total_cost_volume = sum(dp['unit_cost'] * Decimal(str(dp['quantity'])) for dp in data_points)
    total_qty = sum(dp['quantity'] for dp in data_points)
    average_cost = total_cost_volume / Decimal(str(total_qty)) if total_qty > 0 else (sum(costs) / len(costs))

    # Monthly aggregation
    monthly_groups = {}
    for dp in data_points:
        month_key = dp['date'].strftime('%Y-%m')
        if month_key not in monthly_groups:
            monthly_groups[month_key] = []
        monthly_groups[month_key].append(float(dp['unit_cost']))

    monthly_trends = [
        {
            "month": m_key,
            "average_cost": round(sum(vals) / len(vals), 2),
            "sample_count": len(vals)
        }
        for m_key, vals in sorted(monthly_groups.items())
    ]

    # Alert if latest price jumped > 10% compared to historical average
    price_increase_alert = False
    price_increase_pct = 0.0
    if average_cost > Decimal('0.00') and last_cost > average_cost:
        diff_pct = float(((last_cost - average_cost) / average_cost) * 100)
        if diff_pct >= 10.0:
            price_increase_alert = True
            price_increase_pct = round(diff_pct, 1)

    return {
        "product_id": product.id,
        "product_name": product.name,
        "has_history": True,
        "insufficient_history": len(monthly_trends) < 2,
        "message": "Cost history active" if len(monthly_trends) >= 2 else "Not enough historical data to calculate a cost trend.",
        "last_cost": float(round(last_cost, 2)),
        "average_cost": float(round(average_cost, 2)),
        "lowest_cost": float(round(lowest_cost, 2)),
        "highest_cost": float(round(highest_cost, 2)),
        "total_purchases_recorded": len(data_points),
        "monthly_trends": monthly_trends,
        "price_increase_alert": price_increase_alert,
        "price_increase_pct": price_increase_pct,
    }


def rank_suppliers_for_product(product, shop, target_quantity=1):
    """
    Intelligent rule-based multi-criteria supplier ranking:
    Formula:
        Score = (Price_Factor * 0.40) + (Lead_Time_Factor * 0.30) + (Reliability_Factor * 0.20) + (MOQ_Factor * 0.10)
    Transparent and fully explainable without black-box ML.
    """
    sp_mappings = SupplierProduct.objects.filter(
        product=product,
        shop=shop,
        is_active=True,
        supplier__is_active=True
    ).select_related('supplier')

    if not sp_mappings.exists():
        return {
            "product_id": product.id,
            "product_name": product.name,
            "recommended_supplier": None,
            "suppliers_ranked": [],
            "reason": "No active suppliers mapped to this product.",
        }

    # Find minimums for normalization
    all_prices = [sp.purchase_price for sp in sp_mappings if sp.purchase_price > Decimal('0.00')]
    min_price = min(all_prices) if all_prices else Decimal('1.00')

    all_leads = [sp.lead_time_days for sp in sp_mappings if sp.lead_time_days > 0]
    min_lead = min(all_leads) if all_leads else 1

    scored_suppliers = []

    for sp in sp_mappings:
        perf = get_supplier_performance(sp.supplier, shop)

        # 1. Price factor (normalized: lower is better)
        if sp.purchase_price > Decimal('0.00'):
            price_factor = float(min_price / sp.purchase_price)
        else:
            price_factor = 0.5

        # 2. Lead-time factor (normalized: shorter is better)
        lead_time = max(1, sp.lead_time_days)
        lead_time_factor = float(min_lead / lead_time)

        # 3. Reliability factor
        reliability_factor = perf['reliability_score'] / 100.0

        # 4. MOQ compliance factor
        moq_factor = 1.0 if target_quantity >= sp.minimum_order_quantity else 0.6

        # Preferred supplier minor bump
        preferred_bonus = 0.05 if sp.is_preferred else 0.0

        # Composite score calculation
        composite_score = round(
            (price_factor * 0.40) +
            (lead_time_factor * 0.30) +
            (reliability_factor * 0.20) +
            (moq_factor * 0.10) +
            preferred_bonus,
            3
        )

        reasons = []
        if sp.purchase_price == min_price:
            reasons.append(f"Lowest purchase price (₹{sp.purchase_price})")
        else:
            reasons.append(f"Competitive price (₹{sp.purchase_price})")

        if sp.lead_time_days == min_lead:
            reasons.append(f"Fastest delivery ({sp.lead_time_days} days)")
        else:
            reasons.append(f"Lead time {sp.lead_time_days} days")

        if perf['reliability_score'] >= 90:
            reasons.append(f"{perf['reliability_score']}% fulfillment reliability")

        if sp.is_preferred:
            reasons.append("Marked as shop preferred supplier")

        explainable_reason = " + ".join(reasons)

        scored_suppliers.append({
            "supplier_id": sp.supplier.id,
            "supplier_name": sp.supplier.name,
            "business_name": sp.supplier.business_name,
            "supplier_product_id": sp.id,
            "purchase_price": float(sp.purchase_price),
            "lead_time_days": sp.lead_time_days,
            "minimum_order_quantity": sp.minimum_order_quantity,
            "is_preferred": sp.is_preferred,
            "score": composite_score,
            "reliability_pct": perf['reliability_score'],
            "completed_orders": perf['completed_orders'],
            "explanation": explainable_reason,
        })

    # Sort descending by composite score
    scored_suppliers.sort(key=lambda s: s['score'], reverse=True)
    top_supplier = scored_suppliers[0]

    return {
        "product_id": product.id,
        "product_name": product.name,
        "recommended_supplier": top_supplier,
        "suppliers_ranked": scored_suppliers,
        "reason": f"Recommended Supplier: {top_supplier['supplier_name']} ({top_supplier['explanation']})",
    }


def generate_reorder_recommendations(shop):
    """
    Identifies low-stock items in the shop and prepares purchase recommendations.
    STRICT SCOPE BOUNDARY (Step 16):
    Returns predicted_demand: null. Does NOT generate synthetic or fake predictions.
    ML Demand Prediction belongs strictly to Step 17.
    """
    low_stock_items = Inventory.objects.filter(
        shop=shop,
        is_active=True
    ).filter(
        Q(current_stock__lte=F('reorder_level')) | Q(current_stock__lte=F('minimum_stock'))
    ).select_related('product', 'product__category')

    recommendations = []

    from predictions.models import DemandPrediction

    for inv in low_stock_items:
        # Determine recommended order quantity to replenish up to maximum_stock (or 2x reorder level)
        target_capacity = inv.maximum_stock if inv.maximum_stock > inv.reorder_level else (inv.reorder_level * 2)
        recommended_qty = max(1, target_capacity - inv.current_stock)

        # Retrieve Step 17 Demand Prediction for this product/shop
        pred_7d = DemandPrediction.objects.filter(
            shop=shop,
            product=inv.product,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D
        ).first()

        if pred_7d:
            predicted_demand_val = pred_7d.predicted_units
            prediction_status_str = f"Available ({pred_7d.model_name} {pred_7d.model_version})"
        else:
            predicted_demand_val = None
            prediction_status_str = "Demand prediction not available yet (insufficient historical data)"

        # Supplier ranking for this product
        ranking_result = rank_suppliers_for_product(inv.product, shop, target_quantity=recommended_qty)
        rec_supplier = ranking_result.get('recommended_supplier')

        recommendations.append({
            "product_id": inv.product.id,
            "product_name": inv.product.name,
            "sku": inv.product.sku,
            "category_name": inv.product.category.name if inv.product.category else "General",
            "current_stock": inv.current_stock,
            "minimum_stock": inv.minimum_stock,
            "reorder_level": inv.reorder_level,
            "safety_stock": inv.minimum_stock,
            "maximum_stock": inv.maximum_stock,
            "stock_status": inv.stock_status,
            # ML Demand Prediction from Step 17
            "predicted_demand": predicted_demand_val,
            "predicted_demand_7d": predicted_demand_val,
            "demand_prediction_status": prediction_status_str,
            "recommended_purchase_quantity": recommended_qty,
            "recommended_supplier": rec_supplier,
            "supplier_selection_reason": ranking_result.get('reason'),
            "estimated_cost": float(Decimal(str(recommended_qty)) * Decimal(str(rec_supplier['purchase_price']))) if rec_supplier else 0.0,
        })

    return recommendations
