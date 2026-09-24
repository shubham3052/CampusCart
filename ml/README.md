# Machine Learning Engine: Demand Prediction & Inventory Forecasting

This module implements explainable, regression-based demand prediction for the campus stationery ecosystem.

## 🏗️ Architecture Flow

```text
Actual Completed Orders (OrderItem / InventoryTransaction)
                     │
                     ▼
          [ 1. Data Extraction ]
      (Exclude Cancelled, Merge Daily)
                     │
                     ▼
        [ 2. Contiguous Date Filling ]
          (Missing dates = 0 units)
                     │
                     ▼
        [ 3. Validation & 30-Day Guard ]
     (Items with <30 days -> INSUFFICIENT_DATA)
                     │
                     ▼
         [ 4. Feature Engineering ]
  (Calendar: day_of_week, month, is_weekend)
  (Lags: lag_1, lag_2, lag_3, lag_7, lag_14)
  (Rolling: rolling_3, rolling_7, rolling_14)
                     │
                     ▼
       [ 5. Chronological Split (80/20) ]
                     │
                     ▼
       [ 6. Model Training & Comparison ]
   Linear Regression vs Random Forest Regressor
         vs 7-Day Moving Average Baseline
                     │
                     ▼
         [ 7. Evaluation & Metrics ]
             (MAE, RMSE, R², MAPE)
                     │
                     ▼
      [ 8. Model Selection & Persistence ]
         (joblib -> ml/models/saved/)
                     │
                     ▼
       [ 9. Multi-Step Recursive Forecast ]
            7-Day & 30-Day Horizons
                     │
                     ▼
    [ 10. Database: DemandPrediction Table ]
```

## 📋 Directory Structure

```text
ml/
├── datasets/
│   ├── raw/                 # Extracted raw daily transactions
│   └── processed/           # Feature matrices
├── preprocessing/
│   ├── data_loader.py       # DB query & zero-filling
│   ├── cleaning.py          # Data validation & 30-day minimum check
│   └── feature_engineering.py # Lags, rolling stats & chronological split
├── models/
│   ├── train.py             # Linear vs RF training & model selection
│   ├── evaluate.py          # MAE, RMSE, R², baseline metrics
│   ├── predict.py           # Recursive multi-step forecasting & spikes
│   └── saved/               # Serialized .joblib model artifacts & metadata
└── README.md
```

## ⚙️ Running Training

To train or refresh the demand model across all shops:

```powershell
python manage.py train_demand_model
```

Options:
- `--shop-id=<id>`: Train for a specific shop
- `--version=<str>`: Tag model version (e.g. `v1.0.0`)
- `--force`: Force training even with low sample count

## 🧪 Demo Data Seeder (Development Only)

To test and demonstrate the ML pipeline with 60–90 days of realistic campus stationery purchasing:

```powershell
python manage.py seed_historical_sales --shop-id=1 --days=60
```

To clean demo data:
```powershell
python manage.py seed_historical_sales --clear
```
