"""
ml/preprocessing/cleaning.py
Validates historical sales data, cleans anomalous records,
and enforces minimum data requirements (e.g. >= 30 days) to prevent
unreliable model training on sparse cold-start products.
"""

import pandas as pd
import numpy as np
import logging

logger = logging.getLogger(__name__)

MINIMUM_OBSERVATION_DAYS = 30


def clean_sales_data(df):
    """
    Validates and cleans the sales DataFrame:
    - Removes null product_id or shop_id records
    - Replaces negative quantities with 0 or drops corrupted rows
    - Removes invalid/future dates
    - Deduplicates identical records
    
    Returns:
        tuple: (cleaned_df, cleaning_audit)
    """
    if df.empty:
        return df, {"initial_records": 0, "cleaned_records": 0, "dropped_records": 0, "actions": ["Empty DataFrame"]}

    initial_count = len(df)
    actions = []

    # 1. Drop records with missing shop or product ID
    null_ids = df['shop_id'].isna() | df['product_id'].isna()
    if null_ids.any():
        dropped_nulls = null_ids.sum()
        df = df[~null_ids]
        actions.append(f"Dropped {dropped_nulls} records with missing shop_id or product_id")

    # 2. Check negative quantities
    neg_mask = df['quantity_sold'] < 0
    if neg_mask.any():
        neg_count = neg_mask.sum()
        df.loc[neg_mask, 'quantity_sold'] = 0
        actions.append(f"Corrected {neg_count} negative quantity records to 0")

    # 3. Check invalid or null dates
    invalid_dates = df['date'].isna()
    if invalid_dates.any():
        dropped_dates = invalid_dates.sum()
        df = df[~invalid_dates]
        actions.append(f"Dropped {dropped_dates} records with invalid dates")

    # 4. Remove future dates beyond today
    today = pd.Timestamp.now().normalize()
    future_mask = df['date'] > today
    if future_mask.any():
        future_count = future_mask.sum()
        df = df[~future_mask]
        actions.append(f"Dropped {future_count} records with future timestamps")

    # 5. Deduplicate identical (shop_id, product_id, date) rows if any
    duplicates = df.duplicated(subset=['shop_id', 'product_id', 'date'])
    if duplicates.any():
        dup_count = duplicates.sum()
        df = df.drop_duplicates(subset=['shop_id', 'product_id', 'date'], keep='last')
        actions.append(f"Removed {dup_count} duplicate date rows, keeping latest")

    cleaned_count = len(df)
    audit = {
        "initial_records": initial_count,
        "cleaned_records": cleaned_count,
        "dropped_records": initial_count - cleaned_count,
        "actions": actions if actions else ["Dataset clean, no anomalous records found"]
    }
    return df, audit


def validate_minimum_history(df, min_days=MINIMUM_OBSERVATION_DAYS):
    """
    Enforces the minimum data requirement. A model should not be trained
    blindly when there is insufficient historical data.
    
    Splits products into:
    - eligible_products: Products with >= min_days historical observation days
    - insufficient_products: Products with < min_days, with explicit explanation
    
    Returns:
        tuple: (eligible_df, insufficient_dict)
    """
    if df.empty:
        return df, {}

    grouped = df.groupby(['shop_id', 'product_id'])
    eligible_keys = []
    insufficient_info = {}

    for (s_id, p_id), group in grouped:
        days_count = len(group)
        p_name = group['product_name'].iloc[0] if 'product_name' in group.columns else f"Product #{p_id}"
        
        if days_count >= min_days:
            eligible_keys.append((s_id, p_id))
        else:
            insufficient_info[f"{s_id}_{p_id}"] = {
                "shop_id": s_id,
                "product_id": p_id,
                "product_name": p_name,
                "available_days": days_count,
                "required_days": min_days,
                "status": "INSUFFICIENT_DATA",
                "reason": (
                    f"Demand prediction unavailable for {p_name}. "
                    f"Only {days_count} days of historical sales observations are available. "
                    f"At least {min_days} days are required for reliable ML regression forecasting."
                )
            }

    if not eligible_keys:
        return pd.DataFrame(columns=df.columns), insufficient_info

    eligible_mask = df.set_index(['shop_id', 'product_id']).index.isin(eligible_keys)
    eligible_df = df[eligible_mask].reset_index(drop=True)

    return eligible_df, insufficient_info
