# Advanced Analytics & Business Intelligence Documentation

## 1. Analytics Architecture
The analytics subsystem is housed under `backend/analytics/` and decoupled into dedicated architectural layers:
- **Selectors (`analytics/selectors.py`)**: Pure, optimized database aggregations utilizing Django ORM (`annotate`, `aggregate`, `Sum`, `Count`, `Avg`, `TruncDate`, `Case`, `When`). Never loads raw database tables into Python memory.
- **Services (`analytics/services.py`)**: Business intelligence orchestration, formula enforcement, and scoped caching layer.
- **Filters & Utilities (`analytics/filters.py`)**: Reusable date range parser with timezone-aware day boundary normalization and validation.
- **Permissions (`analytics/permissions.py`)**: Strict tenant isolation (`IsShopOwnerForAnalytics`, `IsAdminForAnalytics`, `IsStudentForAnalytics`).
- **Serializers (`analytics/serializers.py`)**: DRF serialization ensuring Decimal-safe representations of currency.
- **Views & Routing (`analytics/views.py`, `analytics/urls.py`)**: Clean REST API endpoints.

---

## 2. Available Dashboards
1. **Shop Owner BI Portal (`/shop-owner/analytics`)**:
   - High-level KPI cards (Today's Sales, Orders, Week Sales, Month Sales, Net Revenue, AOV, Returning Customers).
   - Sales & orders time series line charts.
   - Product sales velocity matrix (FAST_MOVING, NORMAL, SLOW_MOVING, DEAD_STOCK).
   - Inventory health distribution & stock movement trends.
   - Demand forecasting accuracy (MAE, RMSE, MAPE) & spike alerts.
   - Xerox/printing volume, page color split, paper size breakdown.
   - Delivery performance, delay tracking, and courier success rates.
   - Customer retention cohorts & repeat purchase rates.
2. **Platform SuperAdmin BI Portal (`/admin/analytics`)**:
   - Ecosystem KPIs (Total Users, Active Shops, Platform Orders, Net Revenue).
   - Revenue stream attribution (Stationery, Printing, Delivery, Bulk Orders).
   - User and shop registration growth trends.
   - Multi-Shop Performance Comparison table ranking merchants across key metrics.
3. **Student Personal Activity Summary (`/api/analytics/student/summary/`)**:
   - Lightweight, privacy-safe summary of personal spend, orders, print usage, and favorite stationery categories.

---

## 3. Financial Definitions & Formulas
All financial figures are calculated strictly in `Decimal` without floating-point inaccuracies:

- **Valid Orders**:
  `Order.status != Order.Status.CANCELLED`
- **Gross Sales**:
  `Sum(subtotal) + Sum(delivery_fee)` across valid orders.
- **Discounts**:
  `Sum(discount_amount)` across valid orders with coupons or promotional offers.
- **Refunds Settled**:
  `Sum(amount)` for records in `Refund` where `status in [COMPLETED, APPROVED]`.
- **Net Revenue**:
  `max(Decimal('0.00'), Gross Sales - Discounts - Refunds)`
- **Average Order Value (AOV)**:
  `Net Revenue / count(valid orders)` (evaluates to `Decimal('0.00')` when valid orders = 0).

---

## 4. Fulfillment & Order Ratios
- **Completion Rate**:
  `(COMPLETED orders + DELIVERED orders) / Total Orders * 100`
- **Cancellation Rate**:
  `CANCELLED orders / Total Orders * 100`
- **Refund Rate**:
  `Orders with PaymentStatus in [REFUNDED, PARTIALLY_REFUNDED] / Total Orders * 100`

---

## 5. Inventory & Velocity Formulas
- **Inventory Valuation**:
  `Sum(current_stock * unit_cost)` across active inventory items.
- **Stock Status**:
  - `OUT_OF_STOCK`: `current_stock == 0`
  - `LOW_STOCK`: `current_stock <= minimum_stock` or `current_stock <= reorder_level`
  - `OVERSTOCKED`: `maximum_stock > 0 and current_stock > maximum_stock`
  - `IN_STOCK`: Normal stock level.
- **Velocity Classification**:
  - `FAST_MOVING`: >= 20 units sold or >= 0.8 units/day in selected period.
  - `NORMAL`: >= 5 units sold or >= 0.2 units/day.
  - `SLOW_MOVING`: > 0 units sold.
  - `DEAD_STOCK`: 0 units sold during the period.
- **Days of Cover**:
  `current_stock / (units_sold / period_days)` (evaluates to `None` if daily velocity = 0).
- **Inventory Turnover Ratio**:
  `(30-day COGS * 12) / Total Inventory Valuation`

---

## 6. Demand Prediction Accuracy Formulas
- **Evaluation Set**: Historical predictions where `target_date <= today` compared against actual units sold from `OrderItem` on that date.
- **Mean Absolute Error (MAE)**:
  `Sum(|predicted - actual|) / N`
- **Root Mean Squared Error (RMSE)**:
  `sqrt(Sum((predicted - actual)^2) / N)`
- **Mean Absolute Percentage Error (MAPE)**:
  `Sum(|predicted - actual| / actual) / K * 100` (computed strictly for points where `actual > 0` to prevent division-by-zero).
- **Insufficient Data Guard**: If `N < 3`, `has_sufficient_data = False` is returned and metrics render as "N/A" rather than synthetic zeros.

---

## 7. Date Range Filter Options
Supported presets:
- `today`: 00:00:00 to 23:59:59 of current date.
- `yesterday`: 00:00:00 to 23:59:59 of previous date.
- `7d`: Trailing 7 calendar days.
- `30d`: Trailing 30 calendar days (default).
- `90d`: Trailing 90 calendar days.
- `month`: From 1st of current month to current date.
- `prev_month`: Complete previous calendar month.
- `year`: From January 1st of current year to current date.
- `custom`: Client-specified `start_date` and `end_date` (bounded to maximum 730 days).

---

## 8. Multi-Tenant Security & Tenant Isolation
1. **Zero Cross-Shop Leakage**:
   - `IsShopOwnerForAnalytics` extracts the merchant's owned shop from `request.user.owned_shop`.
   - If a merchant supplies `?shop=<id>` pointing to another shop, `get_authorized_shop_for_request` immediately raises `PermissionDenied` (HTTP 403).
2. **Admin Scoping**:
   - Admins can view platform-wide aggregates or inspect a specific merchant by passing `?shop=<id>`.
3. **Role Authorization**:
   - Students and delivery agents receive HTTP 403 when attempting to query merchant or admin analytics endpoints.
   - Student analytics endpoint (`/api/analytics/student/summary/`) queries only records where `customer == request.user`.

---

## 9. Scoped Caching & Performance
- Expensive analytics results are cached using Django's cache backend with a 60-second TTL.
- Cache keys incorporate the tenant scope and an MD5 hash of the query parameters:
  `analytics:{scope_type}:{scope_id}:{endpoint_name}:{param_hash}`
- Prevents cross-shop cache pollution.
- Test suites automatically bypass caching (`'test' in sys.argv`).
