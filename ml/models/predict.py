"""
ml/models/predict.py
Generates multi-step recursive forecasts for 7-day and 30-day horizons,
performs statistical demand spike detection, and computes trend classifications.
"""

import os
import joblib
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from ml.preprocessing.feature_engineering import FEATURE_COLUMNS


def load_latest_model():
    """
    Loads the latest serialized model bundle from ml/models/saved/.
    Returns:
        tuple: (model, model_info) or (None, None) if no model exists.
    """
    saved_dir = os.path.join(os.path.dirname(__file__), 'saved')
    if not os.path.exists(saved_dir):
        return None, None

    model_files = [f for f in os.listdir(saved_dir) if f.startswith('demand_model_') and f.endswith('.joblib')]
    if not model_files:
        return None, None

    # Sort to find most recent version
    model_files.sort(reverse=True)
    latest_file = os.path.join(saved_dir, model_files[0])

    try:
        bundle = joblib.load(latest_file)
        return bundle['model'], bundle['model_info']
    except Exception:
        return None, None


def generate_recursive_forecast(model, historical_series_df, shop_id, product_id, max_days=30):
    """
    Implements recursive multi-step daily forecasting for the next `max_days`.
    For each future day t = 1..max_days:
    - Constructs future calendar features
    - Uses actual recent sales for past lags, and earlier predicted values for future lags
    - Appends prediction to maintain a sliding window
    
    Returns:
        dict: {
            'daily_predictions': [{'date': '...', 'day_num': t, 'predicted_units': int}],
            'forecast_7d': int (sum of days 1..7),
            'forecast_30d': int (sum of days 1..30),
            'trend': str,
            'spike_info': dict,
        }
    """
    if historical_series_df.empty:
        return {
            'daily_predictions': [],
            'forecast_7d': 0,
            'forecast_30d': 0,
            'trend': 'INSUFFICIENT_DATA',
            'spike_info': {'detected': False, 'severity': 'NONE', 'spike_percentage': 0.0}
        }

    df = historical_series_df.sort_values('date').copy()
    last_date = pd.to_datetime(df['date'].iloc[-1])
    selling_price = float(df['selling_price'].iloc[-1]) if 'selling_price' in df.columns else 0.0
    category_id = int(df['category_id'].iloc[-1]) if 'category_id' in df.columns else 0

    # Maintain sequence of sales quantities: historical then appended with predictions
    sales_sequence = list(df['quantity_sold'].values)

    daily_predictions = []
    
    for day_step in range(1, max_days + 1):
        future_date = last_date + timedelta(days=day_step)
        
        # 1. Calendar features
        day_of_week = future_date.weekday()
        day_of_month = future_date.day
        month = future_date.month
        week_of_year = future_date.isocalendar().week
        is_weekend = int(day_of_week in [5, 6])

        # 2. Lag features from sequence (1-indexed back from current end of sequence)
        lag_1 = sales_sequence[-1] if len(sales_sequence) >= 1 else 0
        lag_2 = sales_sequence[-2] if len(sales_sequence) >= 2 else lag_1
        lag_3 = sales_sequence[-3] if len(sales_sequence) >= 3 else lag_2
        lag_7 = sales_sequence[-7] if len(sales_sequence) >= 7 else lag_1
        lag_14 = sales_sequence[-14] if len(sales_sequence) >= 14 else lag_7

        # 3. Rolling stats
        rolling_mean_3 = float(np.mean(sales_sequence[-3:])) if len(sales_sequence) >= 3 else float(lag_1)
        rolling_mean_7 = float(np.mean(sales_sequence[-7:])) if len(sales_sequence) >= 7 else float(lag_1)
        rolling_mean_14 = float(np.mean(sales_sequence[-14:])) if len(sales_sequence) >= 14 else float(lag_1)

        # 4. Feature vector
        feature_dict = {
            'day_of_week': day_of_week,
            'day_of_month': day_of_month,
            'month': month,
            'week_of_year': week_of_year,
            'is_weekend': is_weekend,
            'lag_1': lag_1,
            'lag_2': lag_2,
            'lag_3': lag_3,
            'lag_7': lag_7,
            'lag_14': lag_14,
            'rolling_mean_3': rolling_mean_3,
            'rolling_mean_7': rolling_mean_7,
            'rolling_mean_14': rolling_mean_14,
            'selling_price': selling_price,
            'category_id': category_id,
        }
        
        X_row = pd.DataFrame([feature_dict])[FEATURE_COLUMNS]
        raw_pred = model.predict(X_row)[0]
        predicted_units = max(0, int(round(raw_pred)))

        daily_predictions.append({
            'date': future_date.strftime('%Y-%m-%d'),
            'day_num': day_step,
            'predicted_units': predicted_units,
            'day_of_week': future_date.strftime('%A'),
            'is_weekend': bool(is_weekend)
        })

        # Append to sequence for recursive future lag lookups
        sales_sequence.append(predicted_units)

    forecast_7d = sum(p['predicted_units'] for p in daily_predictions[:7])
    forecast_30d = sum(p['predicted_units'] for p in daily_predictions[:30])

    # Demand Spike Detection
    recent_actuals = list(df['quantity_sold'].tail(14).values)
    next_day_forecast = daily_predictions[0]['predicted_units'] if daily_predictions else 0
    spike_info = detect_demand_spike(recent_actuals, next_day_forecast)

    # Trend Classification
    trend = classify_demand_trend(recent_actuals, [p['predicted_units'] for p in daily_predictions[:7]])

    return {
        'shop_id': shop_id,
        'product_id': product_id,
        'daily_predictions': daily_predictions,
        'forecast_7d': forecast_7d,
        'forecast_30d': forecast_30d,
        'trend': trend,
        'spike_info': spike_info,
    }


def detect_demand_spike(recent_actuals, incoming_demand):
    """
    Statistical spike detection using rolling mean + standard deviation (z-score threshold)
    and percentage surge check.
    
    Returns:
        dict: { 'detected': bool, 'severity': str, 'spike_percentage': float, 'recent_mean': float }
    """
    if len(recent_actuals) < 3:
        return {'detected': False, 'severity': 'NONE', 'spike_percentage': 0.0, 'recent_mean': 0.0}

    mean_val = float(np.mean(recent_actuals))
    std_val = float(np.std(recent_actuals))

    if mean_val <= 0:
        pct_increase = 100.0 if incoming_demand > 0 else 0.0
    else:
        pct_increase = round(((incoming_demand - mean_val) / mean_val) * 100.0, 1)

    # Threshold: demand exceeds mean + 2 std devs OR increase > 60% with at least 5 units
    is_spike = False
    severity = 'NORMAL'

    if incoming_demand >= 5:
        if std_val > 0 and (incoming_demand > (mean_val + 2.5 * std_val)):
            is_spike = True
            severity = 'HIGH_DEMAND_SPIKE'
        elif pct_increase >= 80.0:
            is_spike = True
            severity = 'HIGH_DEMAND_SPIKE'
        elif pct_increase >= 40.0:
            is_spike = True
            severity = 'MEDIUM_DEMAND_SPIKE'

    return {
        'detected': is_spike,
        'severity': severity,
        'spike_percentage': pct_increase,
        'recent_mean': round(mean_val, 1),
        'incoming_demand': incoming_demand
    }


def classify_demand_trend(recent_history, upcoming_forecast):
    """
    Classifies demand velocity into:
    - INCREASING: > +10% expansion vs recent volume
    - DECREASING: < -10% contraction vs recent volume
    - STABLE: within ±10% band
    - VOLATILE: high variance (coefficient of variation > 0.7)
    - INSUFFICIENT_DATA: too few points
    """
    if len(recent_history) < 7 or len(upcoming_forecast) < 7:
        return 'INSUFFICIENT_DATA'

    hist_mean = float(np.mean(recent_history[-7:]))
    fc_mean = float(np.mean(upcoming_forecast[:7]))

    # Check volatility (CV = std / mean)
    std_val = float(np.std(recent_history))
    if hist_mean > 0 and (std_val / hist_mean) > 0.75:
        return 'VOLATILE'

    if hist_mean == 0:
        return 'INCREASING' if fc_mean > 0 else 'STABLE'

    delta_pct = ((fc_mean - hist_mean) / hist_mean) * 100.0

    if delta_pct > 10.0:
        return 'INCREASING'
    elif delta_pct < -10.0:
        return 'DECREASING'
    else:
        return 'STABLE'
