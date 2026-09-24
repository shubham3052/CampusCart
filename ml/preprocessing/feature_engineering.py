"""
ml/preprocessing/feature_engineering.py
Engineers temporal, calendar, lag, and rolling window features for regression modeling.
Guarantees ZERO data leakage by shifting historical demand prior to calculating rolling metrics
and by enforcing a strict chronological train/test split without random shuffling.
"""

import pandas as pd
import numpy as np


FEATURE_COLUMNS = [
    'day_of_week',
    'day_of_month',
    'month',
    'week_of_year',
    'is_weekend',
    'lag_1',
    'lag_2',
    'lag_3',
    'lag_7',
    'lag_14',
    'rolling_mean_3',
    'rolling_mean_7',
    'rolling_mean_14',
    'selling_price',
    'category_id',
]

ACADEMIC_FEATURE_COLUMNS = [
    'days_to_next_exam',
    'is_exam_period',
    'days_to_project_submission',
    'is_project_period',
    'days_to_next_assignment',
    'is_assignment_period',
    'academic_event_intensity',
]

FULL_FEATURE_COLUMNS = FEATURE_COLUMNS + ACADEMIC_FEATURE_COLUMNS


def add_academic_features(df, events=None):
    """
    Appends academic calendar context features to sales time-series DataFrame.
    Zero-leakage guarantee: Features on date T only utilize academic events
    known and active/scheduled on or before date T.
    """
    if df.empty:
        return df

    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])

    # Initialize defaults
    df['days_to_next_exam'] = 999
    df['is_exam_period'] = 0
    df['days_to_project_submission'] = 999
    df['is_project_period'] = 0
    df['days_to_next_assignment'] = 999
    df['is_assignment_period'] = 0
    df['academic_event_intensity'] = 0.0

    if not events:
        return df

    for idx, row in df.iterrows():
        r_date = row['date'].date() if hasattr(row['date'], 'date') else row['date']

        for ev in events:
            # Check if event is active on r_date
            if ev.start_date <= r_date <= ev.end_date:
                if 'EXAM' in ev.event_type:
                    df.at[idx, 'is_exam_period'] = 1
                elif 'PROJECT' in ev.event_type:
                    df.at[idx, 'is_project_period'] = 1
                elif 'ASSIGNMENT' in ev.event_type:
                    df.at[idx, 'is_assignment_period'] = 1
                df.at[idx, 'academic_event_intensity'] = max(df.at[idx, 'academic_event_intensity'], 1.0)

            # Check future upcoming event from r_date
            elif ev.start_date > r_date:
                days_diff = (ev.start_date - r_date).days
                if days_diff <= 45:
                    if 'EXAM' in ev.event_type:
                        df.at[idx, 'days_to_next_exam'] = min(df.at[idx, 'days_to_next_exam'], days_diff)
                    elif 'PROJECT' in ev.event_type:
                        df.at[idx, 'days_to_project_submission'] = min(df.at[idx, 'days_to_project_submission'], days_diff)
                    elif 'ASSIGNMENT' in ev.event_type:
                        df.at[idx, 'days_to_next_assignment'] = min(df.at[idx, 'days_to_next_assignment'], days_diff)

                    intensity = round(1.0 / (1.0 + 0.1 * days_diff), 3)
                    df.at[idx, 'academic_event_intensity'] = max(df.at[idx, 'academic_event_intensity'], intensity)

    return df


def create_features(df):
    """
    Builds regression feature matrix from contiguous daily sales series.
    All features are derived strictly from information available BEFORE the target date.
    
    Returns:
        pd.DataFrame: Contains all FEATURE_COLUMNS + metadata and 'target_demand'.
    """
    if df.empty:
        return df

    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values(['shop_id', 'product_id', 'date']).reset_index(drop=True)

    # 1. Calendar & Seasonality Features
    df['day_of_week'] = df['date'].dt.dayofweek.astype(int)          # 0=Monday, 6=Sunday
    df['day_of_month'] = df['date'].dt.day.astype(int)                # 1..31
    df['month'] = df['date'].dt.month.astype(int)                      # 1..12
    df['week_of_year'] = df['date'].dt.isocalendar().week.astype(int) # 1..52
    df['is_weekend'] = df['day_of_week'].isin([5, 6]).astype(int)    # 1 if Saturday or Sunday

    # Ensure price and category are present
    if 'selling_price' not in df.columns:
        df['selling_price'] = 0.0
    if 'category_id' not in df.columns:
        df['category_id'] = 0

    # 2. Lag Features (grouped per product/shop)
    grouped = df.groupby(['shop_id', 'product_id'])['quantity_sold']
    
    df['lag_1'] = grouped.shift(1)
    df['lag_2'] = grouped.shift(2)
    df['lag_3'] = grouped.shift(3)
    df['lag_7'] = grouped.shift(7)
    df['lag_14'] = grouped.shift(14)

    # 3. Rolling Window Features (strictly lagged by 1 to prevent data leakage)
    # rolling_mean_3: average of t-1, t-2, t-3
    df['rolling_mean_3'] = grouped.apply(lambda x: x.shift(1).rolling(window=3, min_periods=1).mean()).reset_index(drop=True)
    df['rolling_mean_7'] = grouped.apply(lambda x: x.shift(1).rolling(window=7, min_periods=1).mean()).reset_index(drop=True)
    df['rolling_mean_14'] = grouped.apply(lambda x: x.shift(1).rolling(window=14, min_periods=1).mean()).reset_index(drop=True)

    # 4. Target Variable
    df['target_demand'] = df['quantity_sold'].astype(int)

    # 5. Drop rows where lag_14 is NaN (first 14 days of history)
    clean_df = df.dropna(subset=['lag_14', 'rolling_mean_14']).reset_index(drop=True)

    # Fill any edge case NaNs in rolling features
    clean_df['rolling_mean_3'] = clean_df['rolling_mean_3'].fillna(clean_df['lag_1'])
    clean_df['rolling_mean_7'] = clean_df['rolling_mean_7'].fillna(clean_df['lag_1'])
    clean_df['rolling_mean_14'] = clean_df['rolling_mean_14'].fillna(clean_df['lag_1'])

    return clean_df


def chronological_train_test_split(df, train_ratio=0.80):
    """
    Splits the dataset chronologically without random shuffling to respect time-series ordering.
    First 80% of dates -> Training set
    Last 20% of dates -> Testing set
    
    Returns:
        tuple: (X_train, y_train, X_test, y_test, train_df, test_df)
    """
    if df.empty:
        empty_X = pd.DataFrame(columns=FEATURE_COLUMNS)
        empty_y = pd.Series(dtype=int)
        return empty_X, empty_y, empty_X, empty_y, df, df

    # Order chronologically by date
    unique_dates = sorted(df['date'].unique())
    split_idx = int(len(unique_dates) * train_ratio)

    if split_idx == 0 or split_idx >= len(unique_dates):
        # Fallback if too few distinct dates
        split_date = unique_dates[min(len(unique_dates) - 1, max(1, int(len(unique_dates) * 0.8)))]
    else:
        split_date = unique_dates[split_idx]

    train_mask = df['date'] < split_date
    test_mask = df['date'] >= split_date

    # If test mask is empty due to small date range, use index-based chronological split
    if not test_mask.any():
        n = len(df)
        train_n = int(n * train_ratio)
        train_df = df.iloc[:train_n].copy()
        test_df = df.iloc[train_n:].copy()
    else:
        train_df = df[train_mask].copy()
        test_df = df[test_mask].copy()

    X_train = train_df[FEATURE_COLUMNS]
    y_train = train_df['target_demand']
    X_test = test_df[FEATURE_COLUMNS]
    y_test = test_df['target_demand']

    return X_train, y_train, X_test, y_test, train_df, test_df
