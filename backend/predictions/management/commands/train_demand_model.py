"""
backend/predictions/management/commands/train_demand_model.py
Django management command to execute the end-to-end demand prediction training pipeline.
Usage:
    python manage.py train_demand_model [--shop-id=<id>] [--version=<v>] [--force]
"""

import os
import sys
from datetime import datetime, date
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

# Add project root to sys.path if needed for ml package
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../../')))

from ml.preprocessing.data_loader import extract_sales_data, aggregate_daily_sales, fill_missing_dates
from ml.preprocessing.cleaning import clean_sales_data, validate_minimum_history
from ml.preprocessing.feature_engineering import create_features, chronological_train_test_split
from ml.models.train import train_and_select_model
from ml.models.predict import generate_recursive_forecast, load_latest_model
from predictions.models import DemandPrediction, DemandModelMetadata
from shops.models import Shop
from products.models import Product


class Command(BaseCommand):
    help = "Trains explainable regression demand models and generates 7-day and 30-day forecasts."

    def add_arguments(self, parser):
        parser.add_argument('--shop-id', type=int, help='Filter training to a specific shop ID.')
        parser.add_argument('--model-version', type=str, default='v1.0.0', help='Version tag for model (default: v1.0.0).')
        parser.add_argument('--min-days', type=int, default=30, help='Minimum observation days required (default: 30).')
        parser.add_argument('--force', action='store_true', help='Force training with available data even if below threshold.')

    def handle(self, *args, **options):
        shop_id = options.get('shop_id')
        version = options.get('model_version', 'v1.0.0')
        min_days = options.get('min_days', 30)
        force = options.get('force', False)

        self.stdout.write(self.style.NOTICE("================================================================"))
        self.stdout.write(self.style.NOTICE("[*] STARTING DEMAND PREDICTION ML TRAINING PIPELINE"))
        self.stdout.write(self.style.NOTICE(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Version: {version}"))
        self.stdout.write(self.style.NOTICE("================================================================"))

        # 1. Data Extraction
        self.stdout.write("1. Loading historical sales records from database...")
        raw_df = extract_sales_data(shop_id=shop_id)
        raw_count = len(raw_df)
        self.stdout.write(f"   Records found: {raw_count}")

        if raw_count == 0:
            self.stdout.write(self.style.WARNING("   [!] No historical sales transactions found in database."))
            self.stdout.write(self.style.WARNING("   To test with demo data, run: python manage.py seed_historical_sales --days=60"))
            return

        # 2. Daily Aggregation & Contiguous Date Filling
        self.stdout.write("2. Aggregating daily sales per (shop, product) and filling missing dates...")
        daily_df = aggregate_daily_sales(raw_df)
        filled_df = fill_missing_dates(daily_df)
        self.stdout.write(f"   Aggregated daily observations: {len(filled_df)}")

        # 3. Data Cleaning
        self.stdout.write("3. Validating and cleaning data...")
        cleaned_df, cleaning_audit = clean_sales_data(filled_df)
        self.stdout.write(f"   Valid records after cleaning: {cleaning_audit['cleaned_records']}")
        for action in cleaning_audit['actions']:
            self.stdout.write(f"   - {action}")

        # 4. Minimum History Check
        effective_min_days = 14 if force else min_days
        self.stdout.write(f"4. Enforcing minimum historical observations (threshold: {effective_min_days} days)...")
        eligible_df, insufficient_info = validate_minimum_history(cleaned_df, min_days=effective_min_days)
        
        eligible_products = eligible_df[['shop_id', 'product_id']].drop_duplicates()
        self.stdout.write(f"   Products meeting history threshold: {len(eligible_products)}")
        self.stdout.write(f"   Products with insufficient data (<{effective_min_days} days): {len(insufficient_info)}")

        for key, info in insufficient_info.items():
            self.stdout.write(self.style.WARNING(f"   [!] {info['product_name']} (Shop #{info['shop_id']}): {info['available_days']}/{effective_min_days} days -- INSUFFICIENT_DATA"))

        if eligible_df.empty:
            self.stdout.write(self.style.ERROR(
                f"\n[ERROR] Training aborted: No products have at least {effective_min_days} days of historical sales. "
                "Use --force or seed realistic sales via 'python manage.py seed_historical_sales --days=60'."
            ))
            return

        # 5. Feature Engineering
        self.stdout.write("5. Engineering features (Calendar, Lags 1..14, Rolling Means 3,7,14)...")
        features_df = create_features(eligible_df)
        self.stdout.write(f"   Engineered feature rows: {len(features_df)}")

        if len(features_df) < 5:
            self.stdout.write(self.style.ERROR("[ERROR] Feature matrix too small after 14-day lag initialization."))
            return

        # 6. Chronological Train/Test Split
        self.stdout.write("6. Performing chronological train/test split (80% Train, 20% Test, Zero Shuffling)...")
        X_train, y_train, X_test, y_test, train_df, test_df = chronological_train_test_split(features_df, train_ratio=0.80)
        self.stdout.write(f"   Train samples: {len(X_train)} | Test samples: {len(X_test)}")

        # 7. Model Training & Evaluation
        self.stdout.write("7. Training candidate models (LinearRegression vs RandomForestRegressor)...")
        try:
            best_model, best_metrics, model_info, baseline_metrics = train_and_select_model(
                X_train, y_train, X_test, y_test, train_df, test_df, version=version
            )
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"[ERROR] Training error: {str(e)}"))
            self.stdout.write(self.style.NOTICE("   Preserving previously saved model. Production forecasts untouched."))
            return

        # Output comparison logs
        self.stdout.write("----------------------------------------------------------------")
        self.stdout.write(f"   Baseline (7-Day Moving Avg) MAE: {baseline_metrics['mae']}")
        self.stdout.write(f"   Linear Regression MAE:          {model_info['linear_regression_metrics']['mae']} (R2: {model_info['linear_regression_metrics']['r2']})")
        self.stdout.write(f"   Random Forest Regressor MAE:    {model_info['random_forest_metrics']['mae']} (R2: {model_info['random_forest_metrics']['r2']})")
        self.stdout.write(self.style.SUCCESS(f"   [CHOSEN] Selected Model: {model_info['model_name']}"))
        self.stdout.write(self.style.SUCCESS(f"   Test MAE: {best_metrics['mae']} | RMSE: {best_metrics['rmse']} | R2: {best_metrics['r2']}"))
        self.stdout.write(f"   Model saved to: {model_info['saved_path']}")
        self.stdout.write("----------------------------------------------------------------")

        # 8. Record Model Metadata in Database
        self.stdout.write("8. Recording model version and metadata in database...")
        data_dates = sorted(eligible_df['date'].unique())
        metadata_obj, _ = DemandModelMetadata.objects.update_or_create(
            model_version=version,
            defaults={
                'model_name': model_info['model_name'],
                'model_type': model_info['model_type'],
                'training_samples': len(X_train),
                'features_used': model_info['features_used'],
                'mae': best_metrics['mae'],
                'rmse': best_metrics['rmse'],
                'r2_score': best_metrics['r2'],
                'baseline_mae': baseline_metrics['mae'],
                'data_start_date': data_dates[0].date() if data_dates else None,
                'data_end_date': data_dates[-1].date() if data_dates else None,
                'model_file_path': model_info['saved_path'],
                'is_active': True,
                'notes': f"Trained on {datetime.now().strftime('%Y-%m-%d %H:%M')}. Evaluated on {len(X_test)} chronological test points."
            }
        )
        # Mark other versions inactive
        DemandModelMetadata.objects.exclude(id=metadata_obj.id).update(is_active=False)

        # 9. Multi-Step Horizon Forecast Generation
        self.stdout.write("9. Generating recursive 7-day and 30-day horizon forecasts for active products...")
        today = timezone.now().date()
        forecast_count = 0

        grouped_eligible = eligible_df.groupby(['shop_id', 'product_id'])
        with transaction.atomic():
            for (s_id, p_id), group in grouped_eligible:
                fc = generate_recursive_forecast(best_model, group, s_id, p_id, max_days=30)
                
                # A. Save Daily Predictions (days 1..30)
                for dp in fc['daily_predictions']:
                    target_d = datetime.strptime(dp['date'], '%Y-%m-%d').date()
                    DemandPrediction.objects.update_or_create(
                        shop_id=s_id,
                        product_id=p_id,
                        target_date=target_d,
                        forecast_horizon=DemandPrediction.ForecastHorizon.DAILY,
                        defaults={
                            'predicted_units': dp['predicted_units'],
                            'confidence_score': max(0.50, min(0.99, round(1.0 - (best_metrics['mae'] / max(1.0, dp['predicted_units'] + 5)), 2))),
                            'confidence_interval_low': max(0.0, dp['predicted_units'] - best_metrics['mae']),
                            'confidence_interval_high': dp['predicted_units'] + best_metrics['mae'],
                            'model_name': model_info['model_name'],
                            'model_version': version,
                            'model_metadata': metadata_obj
                        }
                    )

                # B. Save 7-Day Aggregated Horizon Record
                DemandPrediction.objects.update_or_create(
                    shop_id=s_id,
                    product_id=p_id,
                    target_date=today,
                    forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D,
                    defaults={
                        'predicted_units': fc['forecast_7d'],
                        'confidence_score': max(0.50, min(0.99, round(1.0 - (best_metrics['mae'] / max(1.0, fc['forecast_7d'] / 7.0 + 5)), 2))),
                        'confidence_interval_low': max(0.0, fc['forecast_7d'] - (best_metrics['mae'] * 7)),
                        'confidence_interval_high': fc['forecast_7d'] + (best_metrics['mae'] * 7),
                        'model_name': model_info['model_name'],
                        'model_version': version,
                        'model_metadata': metadata_obj
                    }
                )

                # C. Save 30-Day Aggregated Horizon Record
                DemandPrediction.objects.update_or_create(
                    shop_id=s_id,
                    product_id=p_id,
                    target_date=today,
                    forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D,
                    defaults={
                        'predicted_units': fc['forecast_30d'],
                        'confidence_score': max(0.50, min(0.99, round(1.0 - (best_metrics['mae'] / max(1.0, fc['forecast_30d'] / 30.0 + 5)), 2))),
                        'confidence_interval_low': max(0.0, fc['forecast_30d'] - (best_metrics['mae'] * 30)),
                        'confidence_interval_high': fc['forecast_30d'] + (best_metrics['mae'] * 30),
                        'model_name': model_info['model_name'],
                        'model_version': version,
                        'model_metadata': metadata_obj
                    }
                )

                forecast_count += 1
                p_name = group['product_name'].iloc[0] if 'product_name' in group.columns else f"Product #{p_id}"
                spike_flag = f" [SPIKE: {fc['spike_info']['severity']}]" if fc['spike_info']['detected'] else ""
                self.stdout.write(
                    f"   [+] {p_name}: Next 7 Days = {fc['forecast_7d']} units | "
                    f"Next 30 Days = {fc['forecast_30d']} units | Trend: {fc['trend']}{spike_flag}"
                )

        self.stdout.write(self.style.SUCCESS("================================================================"))
        self.stdout.write(self.style.SUCCESS(f"[OK] DEMAND PREDICTION TRAINING & FORECASTING COMPLETED SUCCESSFULLY!"))
        self.stdout.write(self.style.SUCCESS(f"   Products Forecasted: {forecast_count}"))
        self.stdout.write(self.style.SUCCESS(f"   Model Version: {version} ({model_info['model_name']})"))
        self.stdout.write(self.style.SUCCESS(f"   Test MAE: {best_metrics['mae']} | Baseline MAE: {baseline_metrics['mae']}"))
        self.stdout.write(self.style.SUCCESS("================================================================"))
