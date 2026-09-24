# Admin Reporting & Business Intelligence System Documentation
**Project:** Smart Student Stationery Delivery System Using Demand Prediction and Intelligent Inventory Management  
**Version:** Step 28 Production Release  
**Scope:** Authoritative metric definitions, financial accounting rules, export specifications, and security policies.

---

## 1. Executive Summary
The Admin Reporting, Export & Management System provides platform administrators with real-time operational reports, multi-dimensional filtering, historical trend analysis, and secure UTF-8 CSV exports across the entire campus stationery ecosystem.

All reports query **authentic database records** using Decimal-safe arithmetic and timezone-aware boundaries. No fake or hardcoded numbers are permitted under any condition.

---

## 2. Core Financial Metric Definitions

### Gross Sales
- **Definition:** Total monetary value of items and fulfillment fees before discounts or refunds are deducted.
- **Formula:**  
  $$\text{Gross Sales} = \sum (\text{Order Subtotal}) + \sum (\text{Delivery Fee})$$
- **Inclusion Rules:** Includes all placed orders in non-cancelled states (`PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `PICKED_UP`, `COMPLETED`). Excludes `CANCELLED` orders.

### Discounts
- **Definition:** Total financial value of promotional coupons and volume discounts deducted from order totals.
- **Formula:**  
  $$\text{Discounts} = \sum (\text{Order Discount Amount})$$
- **Inclusion Rules:** Applied at checkout via valid shop or platform promotional coupons or bulk order tier volume discounts.

### Refunds
- **Definition:** Cumulative amount approved or disbursed to students for returned items or cancelled paid orders.
- **Formula:**  
  $$\text{Refunds} = \sum (\text{Refund Amount where status} \in [\text{COMPLETED}, \text{APPROVED}])$$
- **Precision:** Calculated strictly from authoritative `Refund` model records linked to original `Payment` and `Order` instances.

### Net Sales (Net Revenue)
- **Definition:** Net financial income retained by the platform and merchants after all discounts and refunds are subtracted.
- **Formula:**  
  $$\text{Net Sales} = \max(0.00, \text{Gross Sales} - \text{Discounts} - \text{Refunds})$$

### Average Order Value (AOV)
- **Definition:** Average net revenue generated per non-cancelled customer order.
- **Formula:**  
  $$\text{AOV} = \frac{\text{Net Sales}}{\text{Valid Order Count}}$$
- **Edge Case:** Returns ₹0.00 if valid order count is zero.

### Order Count
- **Definition:** Total number of distinct order entities recorded within the selected date window.
- **Completed Order:** Any order with status `COMPLETED` or `DELIVERED`.
- **Cancelled Order:** Any order marked `CANCELLED`. Deducted from gross/net revenue calculations.

---

## 3. Operational Stream Revenue Definitions

### Stationery Revenue
- **Definition:** Sales volume originating from physical stationery catalog purchases (notebooks, pens, geometry boxes, drafting supplies).
- **Formula:** $\sum (\text{OrderItem Total Price}) - \text{Stationery Discounts}$.

### Printing Revenue
- **Definition:** Revenue earned from document printing, thesis binding, and xerox services.
- **Formula:** $\sum (\text{PrintingOrder Price where status} \neq \text{CANCELLED})$.

### Delivery Revenue
- **Definition:** Total campus courier charges collected for hostel and department deliveries.
- **Formula:** $\sum (\text{Order Delivery Fee})$.

### Bulk Order Revenue
- **Definition:** High-volume class-wide or project team bulk purchases.
- **Formula:** $\sum (\text{BulkOrder Total Amount where status} = \text{COMPLETED})$.

---

## 4. Customer & Behavioral Metric Definitions

### Customer
- **Definition:** Any registered user with role `STUDENT` who has placed at least one non-cancelled order on the platform.

### New Customer
- **Definition:** A student whose first-ever completed order on the platform occurs within the filtered date window.

### Returning Customer
- **Definition:** A student who placed an order in the filtered window and has at least one prior order dated before the window start.

### Repeat Purchase Rate
- **Definition:** Proportion of active customers in the window who have made repeat purchases.
- **Formula:**  
  $$\text{Repeat Rate} = \left(\frac{\text{Returning Customers}}{\text{Unique Active Customers in Window}}\right) \times 100\%$$

---

## 5. Inventory & Supply Chain Metric Definitions

### Inventory Value
- **Definition:** Total physical capital invested in on-hand inventory.
- **Formula:**  
  $$\text{Inventory Value} = \sum (\text{Current Stock} \times \text{Unit Cost})$$

### Stock Status Hierarchy
- `OUT_OF_STOCK`: `Current Stock == 0`
- `LOW_STOCK`: `Current Stock > 0` AND `(Current Stock <= Minimum Stock OR Current Stock <= Reorder Level)`
- `OVERSTOCKED`: `Maximum Stock > 0` AND `Current Stock > Maximum Stock`
- `IN_STOCK`: Normal operating levels
- `INACTIVE`: Product listing deactivated by merchant

### Demand Forecast
- **Definition:** Machine learning predicted unit demand generated by Step 17 Regression models (`RandomForestRegressor`) for a 7-day or 30-day forward-looking horizon.

---

## 6. Export Security & Formatting Standards

1. **Format:** UTF-8 encoded CSV with Byte Order Mark (`\ufeff`) for compatibility with Microsoft Excel, LibreOffice, and Google Sheets without encoding glitches.
2. **Naming Convention:** `{report_name}_{start_date}_to_{end_date}.csv` (e.g. `sales_report_2026-08-01_to_2026-08-31.csv`).
3. **Data Protection:** Zero plain-text passwords, OTPs, credit card numbers, CVVs, or gateway secret tokens are ever exported.
4. **Audit Logging:** Every JSON query and CSV export is immutably recorded in `ReportAuditLog` with requesting administrator ID, IP address, filter parameters, and timestamp.
