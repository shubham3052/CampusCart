import os
import shutil
from datetime import datetime, timedelta, date
from decimal import Decimal
import pandas as pd
import numpy as np

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from users.models import User
from shops.models import Shop
from products.models import Product, Category
from orders.models import Order, OrderItem
from inventory.models import Inventory, InventoryTransaction
from predictions.models import DemandPrediction, DemandModelMetadata
from inventory.supplier_intelligence import generate_reorder_recommendations

from ml.preprocessing.data_loader import extract_sales_data, aggregate_daily_sales, fill_missing_dates
from ml.preprocessing.cleaning import clean_sales_data, validate_minimum_history
from ml.preprocessing.feature_engineering import create_features, chronological_train_test_split, FEATURE_COLUMNS
from ml.models.evaluate import evaluate_model, compute_baseline_metrics
from ml.models.train import train_and_select_model
from ml.models.predict import generate_recursive_forecast, detect_demand_spike, classify_demand_trend


class Step17DemandPredictionTests(TestCase):
    """
    Comprehensive test suite for STEP 17: Regression-Based Demand Prediction.
    Tests data pipeline, feature engineering, model training, evaluation, forecasting,
    database models, multi-tenant RBAC security, and inventory integration.
    """

    def setUp(self):
        # 1. Users
        self.admin = User.objects.create_superuser(
            username='admin_ml',
            email='adminml@campus.edu',
            password='Password123!',
            role=User.Role.ADMIN
        )

        self.shop_owner_a = User.objects.create_user(
            username='owner_a_ml',
            email='ownera_ml@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER
        )

        self.shop_owner_b = User.objects.create_user(
            username='owner_b_ml',
            email='ownerb_ml@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER
        )

        self.student = User.objects.create_user(
            username='student_ml',
            email='student_ml@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT
        )

        self.delivery_agent = User.objects.create_user(
            username='delivery_ml',
            email='delivery_ml@campus.edu',
            password='Password123!',
            role=User.Role.DELIVERY_AGENT
        )

        # 2. Shops
        self.shop_a = Shop.objects.create(
            name='Alpha Stationery Shop',
            slug='alpha-stationery-ml',
            owner=self.shop_owner_a,
            is_active=True
        )

        self.shop_b = Shop.objects.create(
            name='Beta Tech Store',
            slug='beta-tech-ml',
            owner=self.shop_owner_b,
            is_active=True
        )

        # 3. Category & Products
        self.category = Category.objects.create(name='Writing Tools', slug='writing-tools-ml')

        self.product_a1 = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name='Blue Ballpoint Pen',
            sku='PEN-BLUE-01',
            price=Decimal('10.00'),
            is_active=True
        )

        self.product_a2 = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name='Spiral Class Notebook',
            sku='NOTE-SPIRAL-01',
            price=Decimal('45.00'),
            is_active=True
        )

        self.product_b1 = Product.objects.create(
            shop=self.shop_b,
            category=self.category,
            name='Beta Premium Marker',
            sku='MARKER-BETA-01',
            price=Decimal('25.00'),
            is_active=True
        )

        # 4. Inventory
        self.inv_a1 = Inventory.objects.create(
            shop=self.shop_a,
            product=self.product_a1,
            current_stock=8,
            minimum_stock=15,
            reorder_level=20,
            maximum_stock=80,
            unit_cost=Decimal('7.00'),
            is_active=True
        )

        self.client = APIClient()

    # =========================================================================
    # 1. DATA PIPELINE TESTS
    # =========================================================================

    def test_sales_extraction_filters_cancelled_orders(self):
        """Validates that completed orders are extracted while CANCELLED orders are strictly excluded."""
        # Completed Order
        order_ok = Order.objects.create(
            customer=self.student,
            shop=self.shop_a,
            status=Order.Status.COMPLETED
        )
        OrderItem.objects.create(
            order=order_ok,
            product=self.product_a1,
            quantity=5,
            unit_price=Decimal('10.00'),
            total_price=Decimal('50.00')
        )

        # Cancelled Order
        order_bad = Order.objects.create(
            customer=self.student,
            shop=self.shop_a,
            status=Order.Status.CANCELLED
        )
        OrderItem.objects.create(
            order=order_bad,
            product=self.product_a1,
            quantity=20,
            unit_price=Decimal('10.00'),
            total_price=Decimal('200.00')
        )

        df = extract_sales_data(shop_id=self.shop_a.id)
        self.assertFalse(df.empty)
        # Should only contain 5 units from completed order, not the 20 from cancelled
        self.assertEqual(df['quantity_sold'].sum(), 5)

    def test_missing_dates_filled_with_zero(self):
        """Verifies that missing calendar days are zero-filled to maintain a contiguous date vector."""
        start_d = date(2026, 8, 1)
        end_d = date(2026, 8, 5)

        # Only sales on Day 1 and Day 4
        records = [
            {'date': pd.to_datetime('2026-08-01'), 'shop_id': 1, 'product_id': 1, 'product_name': 'Pen', 'category_id': 1, 'category_name': 'Writing', 'quantity_sold': 10, 'selling_price': 10.0},
            {'date': pd.to_datetime('2026-08-04'), 'shop_id': 1, 'product_id': 1, 'product_name': 'Pen', 'category_id': 1, 'category_name': 'Writing', 'quantity_sold': 15, 'selling_price': 10.0},
        ]
        df = pd.DataFrame(records)
        filled = fill_missing_dates(df, start_date=start_d, end_date=end_d)

        # Total 5 days: Aug 1, 2, 3, 4, 5
        self.assertEqual(len(filled), 5)
        # Aug 2, 3, 5 should have 0 units sold
        aug2 = filled[filled['date'] == pd.to_datetime('2026-08-02')].iloc[0]
        self.assertEqual(aug2['quantity_sold'], 0)
        aug3 = filled[filled['date'] == pd.to_datetime('2026-08-03')].iloc[0]
        self.assertEqual(aug3['quantity_sold'], 0)
        aug4 = filled[filled['date'] == pd.to_datetime('2026-08-04')].iloc[0]
        self.assertEqual(aug4['quantity_sold'], 15)

    def test_data_cleaning_and_negative_value_handling(self):
        """Verifies cleaning invalid timestamps, negative values, and duplicate rows."""
        records = [
            {'date': pd.to_datetime('2026-08-01'), 'shop_id': 1, 'product_id': 1, 'quantity_sold': -5}, # negative
            {'date': pd.to_datetime('2026-08-02'), 'shop_id': 1, 'product_id': 1, 'quantity_sold': 10},
            {'date': pd.to_datetime('2026-08-02'), 'shop_id': 1, 'product_id': 1, 'quantity_sold': 12}, # duplicate
            {'date': pd.to_datetime('2030-01-01'), 'shop_id': 1, 'product_id': 1, 'quantity_sold': 4},  # future date
        ]
        df = pd.DataFrame(records)
        cleaned, audit = clean_sales_data(df)

        self.assertEqual(len(cleaned), 2)
        # Negative corrected to 0
        self.assertEqual(cleaned.iloc[0]['quantity_sold'], 0)
        # Future date removed
        self.assertFalse((cleaned['date'] == pd.to_datetime('2030-01-01')).any())

    def test_minimum_30_day_history_requirement(self):
        """Verifies products with < 30 days history are segregated as INSUFFICIENT_DATA."""
        # Product 1 has 35 days, Product 2 has 10 days
        dates_p1 = [pd.to_datetime(f'2026-07-{i:02d}') for i in range(1, 32)] + [pd.to_datetime('2026-08-01'), pd.to_datetime('2026-08-02'), pd.to_datetime('2026-08-03'), pd.to_datetime('2026-08-04')]
        dates_p2 = [pd.to_datetime(f'2026-08-{i:02d}') for i in range(1, 11)]

        rows = []
        for d in dates_p1:
            rows.append({'date': d, 'shop_id': 1, 'product_id': 1, 'product_name': 'Pen', 'quantity_sold': 5})
        for d in dates_p2:
            rows.append({'date': d, 'shop_id': 1, 'product_id': 2, 'product_name': 'Marker', 'quantity_sold': 2})

        df = pd.DataFrame(rows)
        eligible_df, insufficient_info = validate_minimum_history(df, min_days=30)

        # Product 1 should be eligible
        self.assertIn(1, eligible_df['product_id'].values)
        self.assertNotIn(2, eligible_df['product_id'].values)

        # Product 2 should be in insufficient_info with explanation
        self.assertIn('1_2', insufficient_info)
        self.assertEqual(insufficient_info['1_2']['status'], 'INSUFFICIENT_DATA')
        self.assertIn('10 days', insufficient_info['1_2']['reason'])

    # =========================================================================
    # 2. FEATURE ENGINEERING & LEAKAGE PREVENTION TESTS
    # =========================================================================

    def test_feature_engineering_and_no_data_leakage(self):
        """Verifies lag and rolling features are strictly time-lagged with no future leakage."""
        dates = pd.date_range(start='2026-07-01', periods=40, freq='D')
        quantities = [i % 7 + 1 for i in range(40)] # deterministic sequence

        df = pd.DataFrame({
            'date': dates,
            'shop_id': 1,
            'product_id': 1,
            'quantity_sold': quantities,
            'selling_price': 15.0,
            'category_id': 1
        })

        features_df = create_features(df)
        self.assertFalse(features_df.empty)

        # Check that FEATURE_COLUMNS exist
        for col in FEATURE_COLUMNS:
            self.assertIn(col, features_df.columns)

        # Test lag_1: on any row, lag_1 must match previous row's quantity_sold
        row_idx = 5
        target_date = features_df.iloc[row_idx]['date']
        prev_date = target_date - timedelta(days=1)
        prev_qty = df[df['date'] == prev_date]['quantity_sold'].iloc[0]
        self.assertEqual(features_df.iloc[row_idx]['lag_1'], prev_qty)

        # Chronological split verification: train dates strictly precede test dates
        X_train, y_train, X_test, y_test, train_df, test_df = chronological_train_test_split(features_df, train_ratio=0.8)
        self.assertGreater(len(X_train), 0)
        self.assertGreater(len(X_test), 0)
        max_train_date = train_df['date'].max()
        min_test_date = test_df['date'].min()
        self.assertLessEqual(max_train_date, min_test_date)

    # =========================================================================
    # 3. MODEL TRAINING & EVALUATION TESTS
    # =========================================================================

    def test_model_training_evaluation_and_serialization(self):
        """Tests training candidate regression models, comparing against baseline, and saving joblib artifact."""
        dates = pd.date_range(start='2026-06-01', periods=60, freq='D')
        quantities = [5 + (i % 5) for i in range(60)]

        df = pd.DataFrame({
            'date': dates,
            'shop_id': 1,
            'product_id': 1,
            'quantity_sold': quantities,
            'selling_price': 20.0,
            'category_id': 1
        })
        features_df = create_features(df)
        X_train, y_train, X_test, y_test, train_df, test_df = chronological_train_test_split(features_df, train_ratio=0.8)

        best_model, best_metrics, model_info, baseline_metrics = train_and_select_model(
            X_train, y_train, X_test, y_test, train_df, test_df, version="v_test_01"
        )

        self.assertIsNotNone(best_model)
        self.assertIn(model_info['model_name'], ['LinearRegression', 'RandomForestRegressor'])
        self.assertIn('mae', best_metrics)
        self.assertIn('rmse', best_metrics)
        self.assertIn('r2', best_metrics)
        self.assertTrue(os.path.exists(model_info['saved_path']))

    # =========================================================================
    # 4. RECURSIVE FORECASTING & SPIKE DETECTION TESTS
    # =========================================================================

    def test_recursive_horizon_forecast_and_spike_detection(self):
        """Verifies multi-step recursive 7-day and 30-day forecasting and statistical spike detection."""
        dates = pd.date_range(start='2026-07-01', periods=45, freq='D')
        quantities = [10 for _ in range(45)] # constant 10 units/day

        df = pd.DataFrame({
            'date': dates,
            'shop_id': self.shop_a.id,
            'product_id': self.product_a1.id,
            'product_name': self.product_a1.name,
            'quantity_sold': quantities,
            'selling_price': 10.0,
            'category_id': 1
        })
        features_df = create_features(df)
        X_train, y_train, X_test, y_test, train_df, test_df = chronological_train_test_split(features_df)

        best_model, _, _, _ = train_and_select_model(X_train, y_train, X_test, y_test, train_df, test_df, version="v_test_02")

        fc = generate_recursive_forecast(best_model, df, self.shop_a.id, self.product_a1.id, max_days=30)
        self.assertEqual(len(fc['daily_predictions']), 30)
        self.assertGreater(fc['forecast_7d'], 0)
        self.assertGreater(fc['forecast_30d'], fc['forecast_7d'])

        # Spike detection test
        spike_normal = detect_demand_spike([10, 10, 10, 10, 10], 11)
        self.assertFalse(spike_normal['detected'])

        spike_surge = detect_demand_spike([10, 10, 10, 10, 10], 35) # 250% surge
        self.assertTrue(spike_surge['detected'])
        self.assertEqual(spike_surge['severity'], 'HIGH_DEMAND_SPIKE')

        # Trend classification
        trend = classify_demand_trend([10, 10, 10, 10, 10, 10, 10], [10, 10, 10, 10, 10, 10, 10])
        self.assertEqual(trend, 'STABLE')

    # =========================================================================
    # 5. REST APIS & MULTI-TENANT SECURITY TESTS
    # =========================================================================

    def test_demand_prediction_api_and_shop_isolation(self):
        """
        Enforces:
        - Shop Owner A can view Shop A's predictions.
        - Shop Owner A is denied access to Shop B's predictions.
        - Student is denied access (403).
        - Admin has platform-wide visibility.
        """
        today = timezone.now().date()
        meta = DemandModelMetadata.objects.create(
            model_name='RandomForestRegressor',
            model_version='v1.0.0',
            mae=2.5,
            rmse=3.2,
            r2_score=0.85,
            is_active=True
        )

        # Shop A Prediction
        DemandPrediction.objects.create(
            shop=self.shop_a,
            product=self.product_a1,
            target_date=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D,
            predicted_units=42,
            model_metadata=meta
        )

        # Shop B Prediction
        DemandPrediction.objects.create(
            shop=self.shop_b,
            product=self.product_b1,
            target_date=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D,
            predicted_units=90,
            model_metadata=meta
        )

        # 1. Student Denied
        self.client.force_authenticate(user=self.student)
        res_student = self.client.get('/api/demand-predictions/')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Delivery Agent Denied
        self.client.force_authenticate(user=self.delivery_agent)
        res_delivery = self.client.get('/api/demand-predictions/')
        self.assertEqual(res_delivery.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Shop Owner A Views Only Shop A
        self.client.force_authenticate(user=self.shop_owner_a)
        res_a = self.client.get('/api/demand-predictions/')
        self.assertEqual(res_a.status_code, status.HTTP_200_OK)
        results = res_a.data if isinstance(res_a.data, list) else res_a.data.get('results', [])
        product_ids = [p['product'] for p in results]
        self.assertIn(self.product_a1.id, product_ids)
        self.assertNotIn(self.product_b1.id, product_ids)

        # 4. Summary Action
        res_sum = self.client.get('/api/demand-predictions/summary/')
        self.assertEqual(res_sum.status_code, status.HTTP_200_OK)
        self.assertEqual(res_sum.data['summary']['total_products_predicted'], 1)

        # 5. Model Metrics Action
        res_metrics = self.client.get('/api/demand-predictions/model-metrics/')
        self.assertEqual(res_metrics.status_code, status.HTTP_200_OK)
        self.assertEqual(res_metrics.data['model']['model_version'], 'v1.0.0')

        # 6. Admin Can View All
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get('/api/demand-predictions/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        admin_results = res_admin.data if isinstance(res_admin.data, list) else res_admin.data.get('results', [])
        self.assertEqual(len(admin_results), 2)

    # =========================================================================
    # 6. INVENTORY INTEGRATION & STEP 18 PREPARATION
    # =========================================================================

    def test_inventory_reorder_recommendation_ml_integration(self):
        """Verifies that low-stock reorder recommendations consume the 7-day predicted demand from DemandPrediction."""
        today = timezone.now().date()
        DemandPrediction.objects.create(
            shop=self.shop_a,
            product=self.product_a1,
            target_date=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D,
            predicted_units=64,
            model_name='RandomForestRegressor',
            model_version='v1.0.0'
        )

        recs = generate_reorder_recommendations(self.shop_a)
        self.assertGreater(len(recs), 0)
        rec_a1 = next((r for r in recs if r['product_id'] == self.product_a1.id), None)
        self.assertIsNotNone(rec_a1)

        # In Step 17, predicted_demand must come directly from DemandPrediction
        self.assertEqual(rec_a1['predicted_demand'], 64)
        self.assertIn('Available', rec_a1['demand_prediction_status'])


from django.core.management import call_command
from inventory.models import Supplier, SupplierProduct, PurchaseOrder, PurchaseOrderItem
from predictions.models import PurchaseRecommendation
from predictions.purchase_advisor import (
    calculate_demand_variability,
    calculate_safety_stock,
    calculate_reorder_point,
    calculate_target_and_recommended,
    calculate_days_of_cover,
    estimate_stockout_date,
    generate_recommendation_for_inventory,
    save_or_update_recommendation,
    create_purchase_orders_from_recommendations,
)


class Step18SmartPurchaseAdvisorTests(TestCase):
    """
    Comprehensive test suite for STEP 18: Smart Purchase Advisor.
    Validates statistical safety stock, reorder points, target stock, MOQ & max stock constraints,
    supplier intelligence, manual override audit trails, bulk PO creation by supplier, and RBAC isolation.
    """

    def setUp(self):
        # 1. Users
        self.admin = User.objects.create_superuser(
            username='admin_adv',
            email='adminadv@campus.edu',
            password='Password123!',
            role=User.Role.ADMIN
        )

        self.shop_owner_a = User.objects.create_user(
            username='owner_a_adv',
            email='ownera_adv@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER
        )

        self.shop_owner_b = User.objects.create_user(
            username='owner_b_adv',
            email='ownerb_adv@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER
        )

        self.student = User.objects.create_user(
            username='student_adv',
            email='student_adv@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT
        )

        self.delivery_agent = User.objects.create_user(
            username='delivery_adv',
            email='delivery_adv@campus.edu',
            password='Password123!',
            role=User.Role.DELIVERY_AGENT
        )

        # 2. Shops
        self.shop_a = Shop.objects.create(
            name='Alpha Campus Stationery',
            slug='alpha-campus-adv',
            owner=self.shop_owner_a,
            is_active=True
        )

        self.shop_b = Shop.objects.create(
            name='Beta Express Store',
            slug='beta-express-adv',
            owner=self.shop_owner_b,
            is_active=True
        )

        # 3. Suppliers
        self.supplier_x = Supplier.objects.create(
            shop=self.shop_a,
            name='ABC Stationery Wholesalers',
            email='sales@abcsupplies.com',
            is_active=True
        )

        self.supplier_y = Supplier.objects.create(
            shop=self.shop_a,
            name='XYZ Paper Mills',
            email='orders@xyzpaper.com',
            is_active=True
        )

        # 4. Products & Inventory
        self.category = Category.objects.create(name='Stationery Adv', slug='stationery-adv')

        self.product_pen = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name='Premium Blue Gel Pen',
            sku='PEN-GEL-01',
            price=Decimal('15.00'),
            is_active=True
        )

        self.product_notebook = Product.objects.create(
            shop=self.shop_a,
            category=self.category,
            name='College Ruled Notebook',
            sku='NOTE-RULED-01',
            price=Decimal('50.00'),
            is_active=True
        )

        self.inv_pen = Inventory.objects.create(
            shop=self.shop_a,
            product=self.product_pen,
            current_stock=42,
            reserved_stock=4,
            minimum_stock=20,
            reorder_level=90,
            maximum_stock=500,
            unit_cost=Decimal('8.00'),
            is_active=True
        )

        self.inv_notebook = Inventory.objects.create(
            shop=self.shop_a,
            product=self.product_notebook,
            current_stock=15,
            reserved_stock=5,
            minimum_stock=10,
            reorder_level=50,
            maximum_stock=300,
            unit_cost=Decimal('30.00'),
            is_active=True
        )

        # 5. Supplier Mappings
        self.sp_pen = SupplierProduct.objects.create(
            supplier=self.supplier_x,
            product=self.product_pen,
            shop=self.shop_a,
            purchase_price=Decimal('8.00'),
            lead_time_days=5,
            minimum_order_quantity=50,
            is_preferred=True,
            is_active=True
        )

        self.sp_notebook = SupplierProduct.objects.create(
            supplier=self.supplier_y,
            product=self.product_notebook,
            shop=self.shop_a,
            purchase_price=Decimal('28.00'),
            lead_time_days=4,
            minimum_order_quantity=25,
            is_preferred=True,
            is_active=True
        )

        # 6. Step 17 Demand Predictions
        today = timezone.now().date()
        self.pred_pen_7d = DemandPrediction.objects.create(
            shop=self.shop_a,
            product=self.product_pen,
            target_date=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_7D,
            predicted_units=65,
            model_name='RandomForestRegressor'
        )

        self.pred_pen_30d = DemandPrediction.objects.create(
            shop=self.shop_a,
            product=self.product_pen,
            target_date=today,
            forecast_horizon=DemandPrediction.ForecastHorizon.HORIZON_30D,
            predicted_units=280,
            model_name='RandomForestRegressor'
        )

        self.client = APIClient()

    # =========================================================================
    # 1. CORE CALCULATION TESTS
    # =========================================================================

    def test_available_stock_calculation(self):
        """Verifies available_stock = current_stock - reserved_stock and never negative."""
        self.assertEqual(self.inv_pen.available_stock, 38)
        self.inv_pen.reserved_stock = 100
        self.assertEqual(self.inv_pen.available_stock, 0)

    def test_statistical_safety_stock_formula(self):
        """
        Verifies Safety Stock = round(Z * std_dev * sqrt(lead_time)).
        With std_dev=4.0 and lead_time=4 (sqrt=2):
        - 90% (Z=1.282): 1.282 * 4 * 2 = 10.256 -> 10
        - 95% (Z=1.645): 1.645 * 4 * 2 = 13.16 -> 13
        - 99% (Z=2.326): 2.326 * 4 * 2 = 18.608 -> 19
        """
        ss_90 = calculate_safety_stock(std_dev=4.0, lead_time_days=4, service_level=0.90, has_sufficient_data=True)
        self.assertEqual(ss_90['safety_stock'], 10)
        self.assertEqual(ss_90['z_factor'], 1.282)

        ss_95 = calculate_safety_stock(std_dev=4.0, lead_time_days=4, service_level=0.95, has_sufficient_data=True)
        self.assertEqual(ss_95['safety_stock'], 13)
        self.assertEqual(ss_95['z_factor'], 1.645)

        ss_99 = calculate_safety_stock(std_dev=4.0, lead_time_days=4, service_level=0.99, has_sufficient_data=True)
        self.assertEqual(ss_99['safety_stock'], 19)
        self.assertEqual(ss_99['z_factor'], 2.326)

    def test_safety_stock_insufficient_data_fallback(self):
        """When insufficient historical sales data exists, falls back to documented inventory policy."""
        ss_fallback = calculate_safety_stock(
            std_dev=0.0,
            lead_time_days=5,
            service_level=0.95,
            has_sufficient_data=False,
            fallback_stock=15
        )
        self.assertTrue(ss_fallback['is_fallback'])
        self.assertEqual(ss_fallback['safety_stock'], 15)

    def test_reorder_point_calculation(self):
        """Reorder Point = Demand During Lead Time + Safety Stock."""
        rop_res = calculate_reorder_point(daily_demand=10.0, lead_time_days=5, safety_stock=20)
        # 10 * 5 + 20 = 70
        self.assertEqual(rop_res['reorder_point'], 70)
        self.assertEqual(rop_res['lead_time_demand'], 50.0)

    def test_target_stock_and_recommended_purchase(self):
        """
        Target Stock = Horizon Demand + Safety Stock.
        Recommended = max(0, Target Stock - Available Stock).
        """
        res = calculate_target_and_recommended(
            available_stock=38,
            predicted_demand_horizon=280,
            safety_stock=45,
            maximum_stock=500,
            moq=1
        )
        # Target = 280 + 45 = 325.
        # Recommended = 325 - 38 = 287.
        self.assertEqual(res['target_stock'], 325)
        self.assertEqual(res['recommended_quantity'], 287)

    def test_moq_and_max_stock_constraints(self):
        """Tests that MOQ bumps small recommendations and maximum stock limits excess purchasing."""
        # 1. MOQ bump
        res_moq = calculate_target_and_recommended(
            available_stock=50,
            predicted_demand_horizon=60,
            safety_stock=10,
            maximum_stock=500,
            moq=50
        )
        # Target = 70, Raw = 20, but MOQ is 50 -> Bumped to 50
        self.assertEqual(res_moq['raw_recommended_quantity'], 20)
        self.assertEqual(res_moq['recommended_quantity'], 50)
        self.assertTrue(res_moq['moq_applied'])

        # 2. Maximum stock cap
        res_max = calculate_target_and_recommended(
            available_stock=80,
            predicted_demand_horizon=100,
            safety_stock=20,
            maximum_stock=100,
            moq=1
        )
        # Target = 120, Raw = 40. Max allowed = 100 - 80 = 20
        self.assertEqual(res_max['recommended_quantity'], 20)
        self.assertTrue(res_max['max_stock_capped'])

    def test_days_of_cover_and_zero_division_safety(self):
        """Days of Cover handles zero and normal demand safely."""
        self.assertIsNone(calculate_days_of_cover(available_stock=50, daily_demand=0.0))
        self.assertEqual(calculate_days_of_cover(available_stock=50, daily_demand=10.0), 5.0)

    # =========================================================================
    # 2. END-TO-END RECOMMENDATION MODEL & ENGINE TESTS
    # =========================================================================

    def test_generate_and_save_recommendation(self):
        """Tests generating recommendation for inv_pen and saving to DB."""
        rec_data = generate_recommendation_for_inventory(
            self.inv_pen,
            planning_horizon='30_DAYS',
            service_level=0.95
        )
        self.assertEqual(rec_data['shop'], self.shop_a)
        self.assertEqual(rec_data['product'], self.product_pen)
        self.assertEqual(rec_data['supplier'], self.supplier_x)
        self.assertEqual(rec_data['predicted_demand_30d'], 280)
        self.assertGreater(rec_data['recommended_quantity'], 0)

        rec_obj = save_or_update_recommendation(rec_data)
        self.assertIsNotNone(rec_obj.id)
        self.assertEqual(rec_obj.status, PurchaseRecommendation.Status.PENDING)
        self.assertIn('reorder point', rec_obj.reason.lower())

    # =========================================================================
    # 3. PURCHASE ORDER INTEGRATION & BULK TESTS
    # =========================================================================

    def test_single_recommendation_accept_creates_draft_po(self):
        """Accepting a recommendation generates a draft PurchaseOrder with source='SMART_ADVISOR'."""
        rec_data = generate_recommendation_for_inventory(self.inv_pen, planning_horizon='30_DAYS')
        rec = save_or_update_recommendation(rec_data)

        self.client.force_authenticate(user=self.shop_owner_a)
        res = self.client.post(f'/api/purchase-recommendations/{rec.id}/accept/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])

        rec.refresh_from_db()
        self.assertEqual(rec.status, PurchaseRecommendation.Status.ORDER_CREATED)
        self.assertIsNotNone(rec.purchase_order)
        self.assertEqual(rec.purchase_order.source, 'SMART_ADVISOR')
        self.assertEqual(rec.purchase_order.supplier, self.supplier_x)
        self.assertEqual(rec.purchase_order.status, PurchaseOrder.Status.DRAFT)

        po_item = rec.purchase_order.items.first()
        self.assertEqual(po_item.product, self.product_pen)
        self.assertEqual(po_item.quantity_ordered, rec.effective_quantity)

    def test_bulk_recommendation_accept_groups_by_supplier(self):
        """
        Bulk accepting items from multiple suppliers creates separate POs per supplier.
        inv_pen -> supplier_x, inv_notebook -> supplier_y.
        """
        rec_pen = save_or_update_recommendation(generate_recommendation_for_inventory(self.inv_pen))
        rec_notebook = save_or_update_recommendation(generate_recommendation_for_inventory(self.inv_notebook))

        self.client.force_authenticate(user=self.shop_owner_a)
        res = self.client.post('/api/purchase-recommendations/bulk-accept/', {
            'recommendation_ids': [rec_pen.id, rec_notebook.id]
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['created_pos_count'], 2)

        # Verify 2 distinct POs created
        pos = PurchaseOrder.objects.filter(shop=self.shop_a, source='SMART_ADVISOR')
        self.assertEqual(pos.count(), 2)
        suppliers = set(p.supplier_id for p in pos)
        self.assertEqual(suppliers, {self.supplier_x.id, self.supplier_y.id})

    def test_manual_override_audit_trail(self):
        """Shop owner can adjust recommended quantity and record explanation."""
        rec = save_or_update_recommendation(generate_recommendation_for_inventory(self.inv_pen))

        self.client.force_authenticate(user=self.shop_owner_a)
        res = self.client.post(f'/api/purchase-recommendations/{rec.id}/override/', {
            'manual_quantity': 350,
            'override_reason': 'Anticipating upcoming college annual fest demand.'
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rec.refresh_from_db()
        self.assertEqual(rec.manual_quantity, 350)
        self.assertEqual(rec.effective_quantity, 350)
        self.assertEqual(rec.status, PurchaseRecommendation.Status.ADJUSTED)
        self.assertEqual(rec.overridden_by, self.shop_owner_a)
        self.assertIn('college annual fest', rec.override_reason)

    # =========================================================================
    # 4. MULTI-TENANT RBAC & SECURITY TESTS
    # =========================================================================

    def test_shop_isolation_and_role_access(self):
        """Shop Owner B cannot view or modify Shop Owner A's recommendations; Students and Drivers blocked."""
        rec_a = save_or_update_recommendation(generate_recommendation_for_inventory(self.inv_pen))

        # 1. Student Denied (403)
        self.client.force_authenticate(user=self.student)
        res_student = self.client.get('/api/purchase-recommendations/')
        self.assertEqual(res_student.status_code, status.HTTP_403_FORBIDDEN)

        # 2. Delivery Person Denied (403)
        self.client.force_authenticate(user=self.delivery_agent)
        res_driver = self.client.get('/api/purchase-recommendations/')
        self.assertEqual(res_driver.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Shop Owner B Cannot View Shop A Recommendations
        self.client.force_authenticate(user=self.shop_owner_b)
        res_owner_b = self.client.get('/api/purchase-recommendations/')
        self.assertEqual(res_owner_b.status_code, status.HTTP_200_OK)
        b_ids = [r['id'] for r in (res_owner_b.data if isinstance(res_owner_b.data, list) else res_owner_b.data.get('results', []))]
        self.assertNotIn(rec_a.id, b_ids)

        # Shop Owner B Cannot Accept Shop A's Recommendation
        res_hack = self.client.post(f'/api/purchase-recommendations/{rec_a.id}/accept/')
        self.assertEqual(res_hack.status_code, status.HTTP_404_NOT_FOUND)

        # 4. Admin Has Full Access
        self.client.force_authenticate(user=self.admin)
        res_admin = self.client.get('/api/purchase-recommendations/admin-analytics/')
        self.assertEqual(res_admin.status_code, status.HTTP_200_OK)
        self.assertTrue(res_admin.data['success'])

    # =========================================================================
    # 5. MANAGEMENT COMMAND TEST
    # =========================================================================

    def test_management_command_generate_recommendations(self):
        """Tests the generate_purchase_recommendations command execution."""
        call_command('generate_purchase_recommendations', shop_id=self.shop_a.id, horizon='30', service_level=0.95)
        recs = PurchaseRecommendation.objects.filter(shop=self.shop_a)
        self.assertGreater(recs.count(), 0)
        pen_rec = recs.filter(product=self.product_pen).first()
        self.assertIsNotNone(pen_rec)
        self.assertGreater(pen_rec.recommended_quantity, 0)

