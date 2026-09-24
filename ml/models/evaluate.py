"""
ml/models/evaluate.py
Evaluation metrics for regression models and moving average baselines.
Computes MAE, RMSE, R², and safe MAPE with plain-language explanations.
"""

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


def evaluate_model(y_true, y_pred):
    """
    Calculates standard regression metrics:
    - MAE: Mean Absolute Error (average magnitude of errors)
    - RMSE: Root Mean Squared Error (penalizes larger prediction gaps)
    - R²: Coefficient of Determination (proportion of variance explained)
    - MAPE: Mean Absolute Percentage Error (computed on non-zero target points)
    
    Returns:
        dict: Metric values and formatted explanations.
    """
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)

    if len(y_true) == 0 or len(y_pred) == 0:
        return {
            "mae": 0.0,
            "rmse": 0.0,
            "r2": 0.0,
            "mape": 0.0,
            "sample_count": 0,
            "explanation": "No evaluation samples available."
        }

    mae = float(mean_absolute_error(y_true, y_pred))
    mse = float(mean_squared_error(y_true, y_pred))
    rmse = float(np.sqrt(mse))

    # Guard R² against single-value or zero-variance ground truth
    if len(y_true) > 1 and np.var(y_true) > 1e-6:
        r2 = float(r2_score(y_true, y_pred))
    else:
        r2 = 0.0

    # Safe MAPE: only evaluate points where actual > 0
    non_zero_mask = y_true > 0
    if non_zero_mask.any():
        mape = float(np.mean(np.abs((y_true[non_zero_mask] - y_pred[non_zero_mask]) / y_true[non_zero_mask])) * 100.0)
    else:
        mape = 0.0

    return {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 4),
        "mape": round(mape, 2),
        "sample_count": len(y_true),
        "explanation": (
            f"MAE: ±{round(mae, 1)} units average forecast error. "
            f"RMSE: ±{round(rmse, 1)} units. "
            f"R² Score: {round(r2, 2)} ({round(max(0.0, r2) * 100, 1)}% variance explained)."
        )
    }


def compute_baseline_metrics(test_df):
    """
    Computes a naive 7-day moving average baseline.
    Compares the baseline's MAE against the ML model to ensure genuine predictive uplift.
    
    Returns:
        dict: Baseline metrics.
    """
    if test_df.empty or 'rolling_mean_7' not in test_df.columns:
        return {"mae": 0.0, "rmse": 0.0, "r2": 0.0}

    y_true = test_df['target_demand'].values
    y_baseline = test_df['rolling_mean_7'].fillna(test_df['lag_1']).values

    return evaluate_model(y_true, y_baseline)
