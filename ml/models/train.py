"""
ml/models/train.py
Trains and evaluates regression models (LinearRegression vs RandomForestRegressor)
against a 7-day moving average baseline. Selects and serializes the superior model using joblib.
"""

import os
import joblib
import json
from datetime import datetime
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
from ml.preprocessing.feature_engineering import FEATURE_COLUMNS
from ml.models.evaluate import evaluate_model, compute_baseline_metrics

SAVED_MODELS_DIR = os.path.join(os.path.dirname(__file__), 'saved')
os.makedirs(SAVED_MODELS_DIR, exist_ok=True)


def train_and_select_model(X_train, y_train, X_test, y_test, train_df, test_df, version="v1.0.0"):
    """
    Trains LinearRegression and RandomForestRegressor on chronological train set.
    Evaluates both on the unseen chronological test set.
    Compares against 7-day moving average baseline.
    
    Returns:
        tuple: (best_model, best_metrics, model_info, baseline_metrics)
    """
    if X_train.empty or len(y_train) == 0:
        raise ValueError("Cannot train models: Training dataset is empty.")

    # 1. Baseline: 7-day moving average
    baseline_metrics = compute_baseline_metrics(test_df)

    # 2. Candidate 1: Linear Regression
    lr = LinearRegression()
    lr.fit(X_train, y_train)
    lr_preds = lr.predict(X_test) if not X_test.empty else lr.predict(X_train)
    # Clip negative predictions at 0
    lr_preds = [max(0.0, p) for p in lr_preds]
    lr_metrics = evaluate_model(y_test if not X_test.empty else y_train, lr_preds)

    # 3. Candidate 2: Random Forest Regressor
    rf = RandomForestRegressor(
        n_estimators=100,
        max_depth=10,
        min_samples_split=4,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    rf.fit(X_train, y_train)
    rf_preds = rf.predict(X_test) if not X_test.empty else rf.predict(X_train)
    rf_preds = [max(0.0, p) for p in rf_preds]
    rf_metrics = evaluate_model(y_test if not X_test.empty else y_train, rf_preds)

    # 4. Model Selection: Pick model with lowest MAE (and higher R²)
    if rf_metrics['mae'] <= lr_metrics['mae']:
        best_model = rf
        best_name = "RandomForestRegressor"
        best_metrics = rf_metrics
        feature_importances = dict(zip(FEATURE_COLUMNS, [round(float(imp), 4) for imp in rf.feature_importances_]))
    else:
        best_model = lr
        best_name = "LinearRegression"
        best_metrics = lr_metrics
        feature_importances = dict(zip(FEATURE_COLUMNS, [round(float(coef), 4) for coef in lr.coef_]))

    # Model packaging
    model_info = {
        "model_name": best_name,
        "model_version": version,
        "model_type": "REGRESSION",
        "training_date": datetime.now().isoformat(),
        "training_samples": len(X_train),
        "test_samples": len(X_test),
        "features_used": FEATURE_COLUMNS,
        "feature_importance_or_coef": feature_importances,
        "metrics": best_metrics,
        "linear_regression_metrics": lr_metrics,
        "random_forest_metrics": rf_metrics,
        "baseline_metrics": baseline_metrics,
        "baseline_improvement_mae": round(baseline_metrics['mae'] - best_metrics['mae'], 2),
    }

    # 5. Save serialized model
    model_filename = f"demand_model_{version}.joblib"
    model_filepath = os.path.join(SAVED_MODELS_DIR, model_filename)
    metadata_filepath = os.path.join(SAVED_MODELS_DIR, f"metadata_{version}.json")

    joblib.dump({
        'model': best_model,
        'features': FEATURE_COLUMNS,
        'model_info': model_info
    }, model_filepath)

    with open(metadata_filepath, 'w') as f:
        json.dump(model_info, f, indent=2)

    model_info['saved_path'] = model_filepath
    return best_model, best_metrics, model_info, baseline_metrics
