"""
Smart Purchase Advisor Engine.
Calculates statistical safety stock, dynamic reorder points, target inventory levels,
and explainable purchase order recommendations using authentic Step 17 regression predictions
and real historical demand variability.
"""

import math
import numpy as np
from decimal import Decimal
from datetime import timedelta
from django.utils import timezone
from django.db import models, transaction
from django.db.models import Sum, Q

from inventory.models import (
    Inventory,
    Supplier,
    SupplierProduct,
    PurchaseOrder,
    PurchaseOrderItem,
    InventoryTransaction,
)
from inventory.supplier_intelligence import rank_suppliers_for_product, get_supplier_performance
from inventory.sales_aggregation import get_daily_sales_series
from ml.models.predict import detect_demand_spike
from notifications.models import Notification

# Service level Z-score standard normal distribution table
SERVICE_LEVEL_Z_FACTORS = {
    0.90: 1.282,  # 90% in-stock probability
    0.95: 1.645,  # 95% in-stock probability (default standard)
    0.99: 2.326,  # 99% high-availability probability
}


def get_z_factor(service_level: float) -> float:
    """Returns the normal distribution Z-factor for a given service level."""
    closest_sl = min(SERVICE_LEVEL_Z_FACTORS.keys(), key=lambda k: abs(k - service_level))
    return SERVICE_LEVEL_Z_FACTORS[closest_sl]


def calculate_demand_variability(shop, product, days=45):
    """
    Computes daily demand variability (mean and standard deviation) from actual historical sales.
    Requires at least 14 days of historical timeline to consider data statistically reliable.
    """
    daily_sales = get_daily_sales_series(shop_id=shop.id, product_id=product.id, days=days)
    if not daily_sales:
        return {
            "mean_demand": 0.0,
            "std_dev": 0.0,
            "has_sufficient_data": False,
            "observations_count": 0,
            "active_sales_days": 0,
            "note": "INSUFFICIENT_DATA: No sales records found in observation window."
        }

    units = [d['units_sold'] for d in daily_sales]
    non_zero_days = sum(1 for u in units if u > 0)
    obs_count = len(units)

    mean_val = float(np.mean(units))
    std_val = float(np.std(units)) if obs_count > 1 else 0.0

    has_sufficient = obs_count >= 14 and non_zero_days >= 2

    return {
        "mean_demand": round(mean_val, 2),
        "std_dev": round(std_val, 2),
        "has_sufficient_data": has_sufficient,
        "observations_count": obs_count,
        "active_sales_days": non_zero_days,
        "note": "Sufficient historical demand data" if has_sufficient else "INSUFFICIENT_DATA: Less than 14 observation days recorded."
    }


def calculate_safety_stock(std_dev: float, lead_time_days: int, service_level: float = 0.95, has_sufficient_data: bool = True, fallback_stock: int = 5):
    """
    Calculates statistical safety stock using:
        Safety Stock = round(Z * Demand_Std_Dev * sqrt(Lead_Time))
    If insufficient data exists, returns documented policy fallback (e.g. minimum_stock).
    """
    z_factor = get_z_factor(service_level)
    safe_lead_time = max(1, lead_time_days)

    if not has_sufficient_data or std_dev <= 0:
        return {
            "safety_stock": max(1, fallback_stock),
            "z_factor": z_factor,
            "is_fallback": True,
            "formula": "Documented Policy Fallback (Inventory Minimum Stock)",
            "calculation_detail": f"Fallback to shop minimum buffer: {fallback_stock} units"
        }

    raw_ss = z_factor * std_dev * math.sqrt(safe_lead_time)
    calculated_ss = max(1, int(round(raw_ss)))

    return {
        "safety_stock": calculated_ss,
        "z_factor": z_factor,
        "is_fallback": False,
        "formula": f"Z ({z_factor}) × σ ({std_dev}) × √LeadTime ({safe_lead_time})",
        "calculation_detail": f"{z_factor} × {std_dev} × {round(math.sqrt(safe_lead_time), 2)} = {round(raw_ss, 2)} ≈ {calculated_ss} units"
    }


def calculate_reorder_point(daily_demand: float, lead_time_days: int, safety_stock: int):
    """
    Calculates Reorder Point (ROP):
        Reorder Point = Demand During Lead Time + Safety Stock
        where Demand During Lead Time = daily_demand * lead_time_days
    """
    safe_lead_time = max(1, lead_time_days)
    lead_time_demand = daily_demand * safe_lead_time
    rop = int(round(lead_time_demand + safety_stock))
    return {
        "reorder_point": rop,
        "lead_time_demand": round(lead_time_demand, 1),
        "lead_time_days": safe_lead_time,
        "safety_stock": safety_stock,
        "formula": f"Lead Time Demand ({round(lead_time_demand, 1)}) + Safety Stock ({safety_stock}) = {rop}"
    }


def calculate_target_and_recommended(
    available_stock: int,
    predicted_demand_horizon: int,
    safety_stock: int,
    maximum_stock: int = 0,
    moq: int = 1,
    order_multiple: int = 1
):
    """
    Calculates Target Stock and Recommended Purchase Quantity:
        Target Stock = Predicted Demand for Planning Horizon + Safety Stock
        Raw Recommendation = max(0, Target Stock - Available Stock)
    Then strictly applies constraints:
        - Maximum stock ceiling
        - Supplier Minimum Order Quantity (MOQ)
        - Pack size order multiples
    """
    target_stock = predicted_demand_horizon + safety_stock
    raw_qty = max(0, target_stock - available_stock)

    if raw_qty == 0:
        return {
            "target_stock": target_stock,
            "raw_recommended_quantity": 0,
            "recommended_quantity": 0,
            "moq_applied": False,
            "max_stock_capped": False,
            "multiple_applied": False,
            "explanation": "Available stock is sufficient to meet projected demand plus safety buffer."
        }

    adjusted_qty = raw_qty
    max_capped = False
    moq_applied = False
    multiple_applied = False

    # 1. Respect maximum stock limit
    if maximum_stock > 0 and (available_stock + adjusted_qty) > maximum_stock:
        max_allowed = max(0, maximum_stock - available_stock)
        if max_allowed > 0:
            adjusted_qty = max_allowed
            max_capped = True

    # 2. Respect supplier Minimum Order Quantity (MOQ)
    if moq > 1 and adjusted_qty > 0 and adjusted_qty < moq:
        adjusted_qty = moq
        moq_applied = True

    # 3. Respect pack size / order multiple
    if order_multiple > 1 and adjusted_qty > 0:
        remainder = adjusted_qty % order_multiple
        if remainder != 0:
            adjusted_qty = int(math.ceil(adjusted_qty / order_multiple) * order_multiple)
            multiple_applied = True

    return {
        "target_stock": target_stock,
        "raw_recommended_quantity": raw_qty,
        "recommended_quantity": adjusted_qty,
        "moq_applied": moq_applied,
        "max_stock_capped": max_capped,
        "multiple_applied": multiple_applied,
        "explanation": f"Target stock {target_stock} minus available stock {available_stock} = {raw_qty} units" +
                       (f", adjusted to MOQ {moq}" if moq_applied else "") +
                       (f", capped at maximum capacity {maximum_stock}" if max_capped else "")
    }


def calculate_days_of_cover(available_stock: int, daily_demand: float):
    """Calculates Days of Cover = Available Stock / Daily Demand. Handles 0-division safely."""
    if daily_demand <= 0:
        return None
    return round(float(available_stock) / daily_demand, 1)


def estimate_stockout_date(available_stock: int, daily_predictions_list: list):
    """
    Using step-by-step future daily forecasts, estimates the exact calendar date
    when cumulative demand exceeds available stock.
    """
    if available_stock <= 0:
        return timezone.now().date()

    cum_demand = 0
    for item in daily_predictions_list:
        target_date = item.get('target_date')
        units = item.get('predicted_units', 0)
        cum_demand += units
        if cum_demand >= available_stock:
            return target_date

def get_product_academic_context(shop, product):
    """
    Checks upcoming academic events (next 30 days) and impact rules affecting this product or category.
    Returns structured academic context with potential shortfall information.
    """
    try:
        from academics.models import AcademicCalendar, AcademicEventImpact
        today = timezone.now().date()
        cutoff = today + timedelta(days=30)

        events_qs = AcademicCalendar.objects.filter(
            is_active=True,
            start_date__lte=cutoff,
            end_date__gte=today
        ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED)

        if getattr(shop, 'institution', None):
            events_qs = events_qs.filter(models.Q(institution=shop.institution) | models.Q(institution__isnull=True))

        upcoming_events = list(events_qs.order_by('start_date')[:5])
        if not upcoming_events:
            return None

        # Check if any event impacts this product specifically or category
        cat_id = getattr(product, 'category_id', None)
        relevant_rule = AcademicEventImpact.objects.filter(
            models.Q(event__in=upcoming_events) | models.Q(event_type__in=[e.event_type for e in upcoming_events]),
            models.Q(product=product) | models.Q(category_id=cat_id),
            is_active=True
        ).select_related('event').first()

        # Earliest matching event or first upcoming event
        matching_event = relevant_rule.event if (relevant_rule and relevant_rule.event) else upcoming_events[0]
        days_until = max(0, (matching_event.start_date - today).days) if today < matching_event.start_date else 0

        # Check historical analytics for relationship
        from academics.event_intelligence import get_academic_demand_analytics
        analytics = get_academic_demand_analytics(shop=shop, days=60)
        if analytics.get('has_sufficient_data') and analytics.get('observed_percentage_change', 0) > 0:
            hist_msg = f"Observed historical relationship: {analytics.get('observed_percentage_change')}% surge in sales during exams."
        else:
            hist_msg = "Upcoming event may affect demand. Insufficient historical data to estimate impact."

        return {
            "has_event_alert": True,
            "event_title": matching_event.title,
            "event_type": matching_event.event_type,
            "days_until": days_until,
            "importance": matching_event.importance,
            "impact_strength": relevant_rule.impact_strength if relevant_rule else "MEDIUM",
            "historical_relationship": hist_msg,
        }
    except Exception:
        return None


def generate_recommendation_for_inventory(inventory: Inventory, planning_horizon: str = '30_DAYS', service_level: float = 0.95):
    """
    Analyzes an inventory item and constructs a complete, explainable purchase recommendation.
    Consumes Step 17 DemandPrediction and Step 16 Supplier Intelligence.
    """
    from predictions.models import DemandPrediction, PurchaseRecommendation

    shop = inventory.shop
    product = inventory.product
    current_stock = inventory.current_stock
    reserved_stock = inventory.reserved_stock
    available_stock = inventory.available_stock
    maximum_stock = inventory.maximum_stock
    minimum_stock = inventory.minimum_stock

    # 1. Fetch Step 17 Demand Predictions
    horizon_choice = (
        DemandPrediction.ForecastHorizon.HORIZON_30D
        if planning_horizon == '30_DAYS'
        else DemandPrediction.ForecastHorizon.HORIZON_7D
    )

    pred_record = DemandPrediction.objects.filter(
        shop=shop,
        product=product,
        forecast_horizon=horizon_choice
    ).first()

    pred_7d_record = DemandPrediction.objects.filter(
        shop=shop,
        product=product,
        forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D
    ).first()

    pred_30d_record = DemandPrediction.objects.filter(
        shop=shop,
        product=product,
        forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D
    ).first()

    pred_7d_units = pred_7d_record.predicted_units if pred_7d_record else 0
    pred_30d_units = pred_30d_record.predicted_units if pred_30d_record else 0
    selected_horizon_demand = pred_record.predicted_units if pred_record else (pred_30d_units if planning_horizon == '30_DAYS' else pred_7d_units)

    # Check prediction freshness
    is_stale = False
    if pred_record and pred_record.created_at:
        age_days = (timezone.now() - pred_record.created_at).days
        if age_days > 7:
            is_stale = True

    # 2. Demand Variability from real sales history
    variability = calculate_demand_variability(shop, product, days=45)
    mean_daily = variability['mean_demand']
    std_dev = variability['std_dev']

    # Average daily demand for planning: prefer predicted demand / horizon days if available
    if planning_horizon == '30_DAYS' and pred_30d_units > 0:
        avg_daily_demand = round(pred_30d_units / 30.0, 2)
    elif planning_horizon == '7_DAYS' and pred_7d_units > 0:
        avg_daily_demand = round(pred_7d_units / 7.0, 2)
    elif mean_daily > 0:
        avg_daily_demand = mean_daily
    else:
        avg_daily_demand = 0.0

    # 3. Supplier Evaluation from Step 16
    ranking_data = rank_suppliers_for_product(product, shop, target_quantity=max(1, selected_horizon_demand))
    rec_supplier_info = ranking_data.get('recommended_supplier')

    if rec_supplier_info:
        supplier_obj = Supplier.objects.filter(id=rec_supplier_info['supplier_id']).first()
        lead_time_days = rec_supplier_info['lead_time_days']
        moq = rec_supplier_info['minimum_order_quantity']
        unit_cost = Decimal(str(rec_supplier_info['purchase_price']))
    else:
        supplier_obj = None
        lead_time_days = 3
        moq = 1
        unit_cost = inventory.unit_cost if inventory.unit_cost > Decimal('0.00') else Decimal('10.00')

    # 4. Statistical Safety Stock Calculation
    ss_result = calculate_safety_stock(
        std_dev=std_dev,
        lead_time_days=lead_time_days,
        service_level=service_level,
        has_sufficient_data=variability['has_sufficient_data'],
        fallback_stock=minimum_stock
    )
    safety_stock = ss_result['safety_stock']

    # 5. Reorder Point (ROP) Calculation
    rop_result = calculate_reorder_point(
        daily_demand=avg_daily_demand,
        lead_time_days=lead_time_days,
        safety_stock=safety_stock
    )
    reorder_point = rop_result['reorder_point']

    # 6. Target Stock & Recommended Purchase Quantity
    qty_result = calculate_target_and_recommended(
        available_stock=available_stock,
        predicted_demand_horizon=selected_horizon_demand,
        safety_stock=safety_stock,
        maximum_stock=maximum_stock,
        moq=moq,
        order_multiple=1
    )
    target_stock = qty_result['target_stock']
    recommended_qty = qty_result['recommended_quantity']

    # 7. Days of Cover & Stockout Date Estimation
    days_of_cover = calculate_days_of_cover(available_stock, avg_daily_demand)

    # Fetch daily predictions schedule for stockout date estimation
    daily_preds = DemandPrediction.objects.filter(
        shop=shop,
        product=product,
        forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
        target_date__gte=timezone.now().date()
    ).order_by('target_date')[:30]
    daily_preds_list = [{'target_date': dp.target_date, 'predicted_units': dp.predicted_units} for dp in daily_preds]
    estimated_stockout = estimate_stockout_date(available_stock, daily_preds_list)

    # 8. Classifications & Statuses
    # Reorder status
    if available_stock <= 0:
        reorder_status = PurchaseRecommendation.ReorderStatus.OUT_OF_STOCK
    elif available_stock <= reorder_point:
        reorder_status = PurchaseRecommendation.ReorderStatus.REORDER_REQUIRED
    elif maximum_stock > 0 and available_stock > maximum_stock:
        reorder_status = PurchaseRecommendation.ReorderStatus.OVERSTOCKED
    elif available_stock <= minimum_stock:
        reorder_status = PurchaseRecommendation.ReorderStatus.LOW_STOCK
    else:
        reorder_status = PurchaseRecommendation.ReorderStatus.STOCK_ADEQUATE

    # Stockout risk
    demand_during_lt = avg_daily_demand * lead_time_days
    if available_stock <= 0 and avg_daily_demand > 0:
        stockout_risk = PurchaseRecommendation.StockoutRisk.HIGH
    elif available_stock < demand_during_lt:
        stockout_risk = PurchaseRecommendation.StockoutRisk.HIGH
    elif available_stock < (demand_during_lt + safety_stock * 0.5):
        stockout_risk = PurchaseRecommendation.StockoutRisk.MEDIUM
    elif available_stock < reorder_point:
        stockout_risk = PurchaseRecommendation.StockoutRisk.LOW
    else:
        stockout_risk = PurchaseRecommendation.StockoutRisk.NONE

    # Velocity / Movement Type & Dead Stock Detection
    recent_sales_total = sum(d['units_sold'] for d in get_daily_sales_series(shop_id=shop.id, product_id=product.id, days=60))
    if available_stock > 20 and recent_sales_total <= 3:
        movement_type = PurchaseRecommendation.MovementType.POTENTIAL_DEAD_STOCK
    elif avg_daily_demand >= 8.0 or pred_30d_units >= 150:
        movement_type = PurchaseRecommendation.MovementType.FAST_MOVING
    elif avg_daily_demand < 1.0 and pred_30d_units < 15:
        movement_type = PurchaseRecommendation.MovementType.SLOW_MOVING
    else:
        movement_type = PurchaseRecommendation.MovementType.NORMAL

    # Priority determination
    if available_stock <= 0 and selected_horizon_demand > 0:
        priority = PurchaseRecommendation.Priority.CRITICAL
    elif available_stock <= reorder_point and stockout_risk == PurchaseRecommendation.StockoutRisk.HIGH:
        priority = PurchaseRecommendation.Priority.CRITICAL
    elif available_stock <= reorder_point:
        priority = PurchaseRecommendation.Priority.HIGH
    elif available_stock <= int(reorder_point * 1.25) and recommended_qty > 0:
        priority = PurchaseRecommendation.Priority.MEDIUM
    elif recommended_qty > 0:
        priority = PurchaseRecommendation.Priority.LOW
    else:
        priority = PurchaseRecommendation.Priority.NONE

    # Replenishment Timing
    if priority in [PurchaseRecommendation.Priority.CRITICAL, PurchaseRecommendation.Priority.HIGH]:
        replenishment_timing = PurchaseRecommendation.ReplenishmentTiming.ORDER_NOW
    elif priority == PurchaseRecommendation.Priority.MEDIUM:
        replenishment_timing = PurchaseRecommendation.ReplenishmentTiming.ORDER_SOON
    elif priority == PurchaseRecommendation.Priority.LOW:
        replenishment_timing = PurchaseRecommendation.ReplenishmentTiming.MONITOR
    else:
        replenishment_timing = PurchaseRecommendation.ReplenishmentTiming.NO_PURCHASE_REQUIRED

    # Demand Spike Check
    recent_14d_sales = [d['units_sold'] for d in get_daily_sales_series(shop_id=shop.id, product_id=product.id, days=14)]
    next_day_val = daily_preds_list[0]['predicted_units'] if daily_preds_list else int(avg_daily_demand)
    spike_check = detect_demand_spike(recent_14d_sales, next_day_val)

    # 9. Formulate Transparent Explanation String
    if recommended_qty > 0:
        reason_str = (
            f"Available stock ({available_stock}) is below the calculated reorder point ({reorder_point}). "
            f"Expected {planning_horizon.replace('_', ' ').lower()} demand is {selected_horizon_demand} units with "
            f"a safety stock buffer of {safety_stock} units. Recommended procurement: {recommended_qty} units from {supplier_obj.name if supplier_obj else 'Vendor'}."
        )
    else:
        reason_str = (
            f"Stock is currently adequate. Available inventory ({available_stock}) covers the projected {planning_horizon.replace('_', ' ').lower()} "
            f"demand ({selected_horizon_demand} units) and exceeds the reorder point ({reorder_point}). No restock required."
        )

    estimated_cost = Decimal(str(recommended_qty)) * unit_cost

    calculation_breakdown = {
        "planning_horizon": planning_horizon,
        "current_stock": current_stock,
        "reserved_stock": reserved_stock,
        "available_stock": available_stock,
        "predicted_demand": selected_horizon_demand,
        "average_daily_demand": avg_daily_demand,
        "demand_std_dev": std_dev,
        "service_level": service_level,
        "service_level_z": ss_result['z_factor'],
        "safety_stock": safety_stock,
        "safety_stock_formula": ss_result['formula'],
        "safety_stock_detail": ss_result['calculation_detail'],
        "lead_time_days": lead_time_days,
        "demand_during_lead_time": round(demand_during_lt, 1),
        "reorder_point": reorder_point,
        "reorder_point_formula": rop_result['formula'],
        "target_stock": target_stock,
        "raw_recommended_quantity": qty_result['raw_recommended_quantity'],
        "moq": moq,
        "moq_applied": qty_result['moq_applied'],
        "maximum_stock": maximum_stock,
        "max_stock_capped": qty_result['max_stock_capped'],
        "final_recommended_quantity": recommended_qty,
        "unit_cost": float(unit_cost),
        "estimated_cost": float(estimated_cost),
        "days_of_cover": days_of_cover,
        "estimated_stockout_date": estimated_stockout.isoformat() if estimated_stockout else None,
        "supplier_score": rec_supplier_info.get('score') if rec_supplier_info else None,
        "supplier_explanation": rec_supplier_info.get('explanation') if rec_supplier_info else "No supplier mapped",
    }

    # Optional Academic Event Context (Step 19)
    academic_ctx = get_product_academic_context(shop, product)
    if academic_ctx:
        academic_ctx["potential_shortfall"] = max(0, (selected_horizon_demand + safety_stock) - available_stock)
        calculation_breakdown["academic_context"] = academic_ctx

    return {
        "shop": shop,
        "product": product,
        "supplier": supplier_obj,
        "current_stock": current_stock,
        "reserved_stock": reserved_stock,
        "available_stock": available_stock,
        "predicted_demand_7d": pred_7d_units,
        "predicted_demand_30d": pred_30d_units,
        "planning_horizon": planning_horizon,
        "predicted_demand": selected_horizon_demand,
        "average_daily_demand": avg_daily_demand,
        "demand_std_dev": std_dev,
        "lead_time_days": lead_time_days,
        "service_level": service_level,
        "service_level_z": ss_result['z_factor'],
        "safety_stock": safety_stock,
        "reorder_point": reorder_point,
        "target_stock": target_stock,
        "recommended_quantity": recommended_qty,
        "unit_cost": unit_cost,
        "estimated_purchase_cost": estimated_cost,
        "priority": priority,
        "reorder_status": reorder_status,
        "stock_movement_type": movement_type,
        "stockout_risk": stockout_risk,
        "days_of_cover": days_of_cover,
        "estimated_stockout_date": estimated_stockout,
        "replenishment_timing": replenishment_timing,
        "demand_spike_alert": spike_check['detected'],
        "demand_spike_info": spike_check,
        "reason": reason_str,
        "calculation_breakdown": calculation_breakdown,
        "is_stale_prediction": is_stale,
    }


@transaction.atomic
def save_or_update_recommendation(rec_data):
    """
    Saves or updates a PurchaseRecommendation database record.
    Preserves manual overrides if recommendation was previously adjusted.
    """
    from predictions.models import PurchaseRecommendation

    shop = rec_data['shop']
    product = rec_data['product']

    existing = PurchaseRecommendation.objects.filter(
        shop=shop,
        product=product,
        status__in=[
            PurchaseRecommendation.Status.PENDING,
            PurchaseRecommendation.Status.VIEWED,
            PurchaseRecommendation.Status.ADJUSTED,
        ]
    ).first()

    if existing:
        # Preserve manual override if already set
        manual_qty = existing.manual_quantity
        override_reason = existing.override_reason
        overridden_by = existing.overridden_by
        overridden_at = existing.overridden_at
        current_status = existing.status

        for key, val in rec_data.items():
            setattr(existing, key, val)

        if manual_qty is not None:
            existing.manual_quantity = manual_qty
            existing.override_reason = override_reason
            existing.overridden_by = overridden_by
            existing.overridden_at = overridden_at
            existing.status = current_status

        existing.save()
        return existing
    else:
        new_rec = PurchaseRecommendation(**rec_data)
        new_rec.save()
        return new_rec


@transaction.atomic
def create_purchase_orders_from_recommendations(shop, recommendation_ids: list, user):
    """
    Accepts one or more purchase recommendations and creates Draft Purchase Orders in the PO system.
    Groups products intelligently by supplier:
        - If selected items belong to different suppliers, creates separate purchase orders per supplier.
    Updates recommendations to ORDER_CREATED status and links the generated PO.
    Uses select_for_update() to prevent race conditions or duplicate submissions.
    """
    from predictions.models import PurchaseRecommendation

    recommendations = PurchaseRecommendation.objects.select_for_update().filter(
        id__in=recommendation_ids,
        shop=shop
    ).select_related('product', 'supplier')

    if not recommendations.exists():
        raise ValueError("No valid recommendations found for this shop.")

    # Validate that none of the recommendations are already converted to orders
    for rec in recommendations:
        if rec.status == PurchaseRecommendation.Status.ORDER_CREATED:
            raise ValueError(f"Recommendation for {rec.product.name} has already been converted into a purchase order.")

    # Group recommendations by supplier
    grouped_by_supplier = {}
    for rec in recommendations:
        supplier = rec.supplier
        if not supplier:
            # Fall back to shop's first active supplier for this product
            sp = SupplierProduct.objects.filter(product=rec.product, shop=shop, is_active=True).first()
            if sp:
                supplier = sp.supplier
            else:
                raise ValueError(f"Product '{rec.product.name}' has no mapped supplier. Map a supplier first.")

        if supplier.id not in grouped_by_supplier:
            grouped_by_supplier[supplier.id] = {
                "supplier": supplier,
                "recs": []
            }
        grouped_by_supplier[supplier.id]["recs"].append(rec)

    created_pos = []

    for supplier_id, group in grouped_by_supplier.items():
        supplier = group["supplier"]
        recs = group["recs"]

        # Calculate expected delivery date based on supplier lead time
        max_lead_time = max(r.lead_time_days for r in recs) if recs else 3
        expected_date = timezone.now().date() + timedelta(days=max_lead_time)

        # Generate unique PO number
        timestamp_str = timezone.now().strftime('%Y%m%d%H%M%S')
        po_number = f"PO-{shop.id}-{supplier.id}-{timestamp_str}"

        po = PurchaseOrder.objects.create(
            shop=shop,
            supplier=supplier,
            po_number=po_number,
            source='SMART_ADVISOR',
            status=PurchaseOrder.Status.DRAFT,
            order_date=timezone.now().date(),
            expected_date=expected_date,
            created_by=user,
            notes=f"Auto-generated by Smart Purchase Advisor ({len(recs)} item(s) recommended)."
        )

        for rec in recs:
            qty_to_order = rec.effective_quantity
            if qty_to_order <= 0:
                qty_to_order = max(1, rec.safety_stock)

            # Look up supplier SKU if available
            sp_map = SupplierProduct.objects.filter(supplier=supplier, product=rec.product).first()
            sku = sp_map.supplier_product_code if sp_map else rec.product.sku

            PurchaseOrderItem.objects.create(
                purchase_order=po,
                product=rec.product,
                supplier_sku=sku,
                quantity_ordered=qty_to_order,
                quantity_received=0,
                unit_cost=rec.unit_cost,
                notes=f"Recommended via Smart Advisor (Priority: {rec.priority})"
            )

            # Update recommendation status & PO reference
            rec.status = PurchaseRecommendation.Status.ORDER_CREATED
            rec.purchase_order = po
            rec.action_taken = True
            rec.save(update_fields=['status', 'purchase_order', 'action_taken', 'updated_at'])

        # Recalculate totals
        po.recalculate_totals()
        created_pos.append(po)

    return created_pos
