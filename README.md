# CampusCart — Smart Student Stationery Delivery System Using Demand Prediction & Intelligent Inventory Management

## 📌 Project Overview
**CampusCart** (Smart Student Stationery Delivery System) is a comprehensive, full-stack, enterprise-grade commerce and logistics platform engineered specifically for university campuses. It streamlines campus stationery procurement, automated document printing (PDF uploads with binding/color options), and rapid delivery to student dorms and academic departments.

Behind the scenes, the platform leverages **Machine Learning (Demand Prediction & Regression Modeling)** to forecast stationery and paper demand based on academic calendars (exam weeks, assignment deadlines, semester start), enabling campus merchants to maintain optimal stock levels without overstocking or stockouts.

---

## 🏗️ Project Architecture & Directory Layout

```text
smart-stationery/
│
├── backend/                  # Django & Django REST Framework application
│   ├── (Django project & modular domain apps: users, shops, products,
│   │    orders, printing, inventory, delivery, recommendations,
│   │    notifications, academics)
│   └── manage.py
│
├── frontend/                 # React.js Single Page Application (SPA)
│   ├── src/
│   │   ├── components/      # Reusable UI elements (buttons, modals, navbar)
│   │   ├── pages/           # Route views (Catalog, Dashboard, Order Tracking)
│   │   ├── layouts/         # Role-based wrappers (Student, Shopkeeper, Admin)
│   │   ├── services/        # Axios API clients & endpoints
│   │   ├── context/         # React context providers (Auth, Cart, Notification)
│   │   ├── hooks/           # Custom React hooks
│   │   └── assets/          # Icons, illustrations, styles
│   └── package.json
│
├── ml/                       # Machine Learning Pipeline & Analytics Engine
│   ├── datasets/            # Historical sales, academic cycles, stationery demand data
│   ├── preprocessing/       # Feature engineering, scaling, calendar encoding
│   ├── models/              # Serialized trained models (.joblib / .pkl)
│   └── predictions/         # Batch & real-time inference scripts for inventory forecasting
│
├── media/                    # Dynamic user and product media storage
│   ├── documents/           # Uploaded student assignments, lab manuals, PDFs for printing
│   └── products/            # Stationery product catalogue images
│
├── documentation/            # System design, ER diagrams, API schemas, final report
│
├── requirements.txt          # Python backend, ML & driver dependencies
└── README.md                 # Project guide & documentation
```

---

## 🧰 Technology Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | React.js, Vanilla CSS, JavaScript (ES6+), Chart.js |
| **Backend** | Python, Django, Django REST Framework (DRF) |
| **Database** | MySQL Server 8.0 with InnoDB engine |
| **Machine Learning** | Scikit-learn, Pandas, NumPy, Joblib (Regression & Demand Modeling) |
| **Security & Auth** | JSON Web Tokens (PyJWT), Role-Based Access Control (RBAC) |
| **File Processing** | Pillow (Images), PyPDF (Document analysis & page counting) |

---

## 📋 Directory Responsibilities

1. **`backend/`**: Encapsulates business logic, REST APIs, database models, permissions, transaction handling, and interfaces with MySQL.
2. **`frontend/`**: Encapsulates student, shop owner, and delivery personnel portals, reactive state management, order tracking, and interactive prediction charts.
3. **`ml/`**: Self-contained machine learning environment responsible for data preparation, model training (e.g. Random Forest Regressor / Linear Regression), model evaluation, and inference endpoints.
4. **`media/`**: Central repository for user-uploaded print documents (PDFs) and catalog item media, isolated from source code.
5. **`documentation/`**: Architecture diagrams, sequence charts, database schema designs, and academic project submission records.

---

## 🛠️ Complete Local Setup & Quickstart Guide

### 1. Prerequisites
- **Python**: 3.10+ (tested on Python 3.11)
- **Node.js**: 18+ (tested on Node.js 20+)
- **Database**: MySQL 8.0+ running on port 3306
- **Package Managers**: `pip` and `npm`

---

### 2. Database Setup (MySQL 8.0)
1. Ensure your MySQL server is running on `127.0.0.1:3306`.
2. Create the application database and dedicated user:
   ```sql
   CREATE DATABASE IF NOT EXISTS smart_stationery_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'stationery_user'@'localhost' IDENTIFIED BY 'StationerySecurePass2026!';
   GRANT ALL PRIVILEGES ON smart_stationery_db.* TO 'stationery_user'@'localhost';
   FLUSH PRIVILEGES;
   ```
   *(Or execute `backend/init_db.sql` via MySQL CLI or Workbench).*

---

### 3. Backend Setup (Django REST Framework)
1. Open PowerShell and navigate to the backend directory:
   ```powershell
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Configure environment variables:
   ```powershell
   Copy-Item .env.example .env
   ```
   *(Verify `DEBUG=True`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `backend/.env`).*
5. Apply database migrations:
   ```powershell
   python manage.py migrate
   ```
6. Verify Django system checks:
   ```powershell
   python manage.py check
   ```

---

### 4. Frontend Setup (React & Vite)
1. Open a new terminal and navigate to the frontend directory:
   ```powershell
   cd frontend
   ```
2. Install npm dependencies:
   ```powershell
   npm install
   ```
3. Configure environment variables:
   ```powershell
   Copy-Item .env.example .env
   ```
   *(Confirm `VITE_API_BASE_URL=http://127.0.0.1:8000/api` in `frontend/.env`).*

---

### 5. Running the Application Locally

#### Start Django Backend (Terminal 1)
```powershell
cd backend
.\venv\Scripts\Activate.ps1
python manage.py runserver 127.0.0.1:8000
```
Backend will be available at: **http://127.0.0.1:8000/**  
- Health Check: `http://127.0.0.1:8000/api/health/`
- Interactive Swagger API Docs: `http://127.0.0.1:8000/api/docs/`
- Django Admin: `http://127.0.0.1:8000/admin/`

#### Start React Frontend (Terminal 2)
```powershell
cd frontend
npm run dev
```
Frontend will be available at: **http://localhost:5174/**

---

### 6. Running Tests

#### Backend Automated Test Suites
```powershell
cd backend
.\venv\Scripts\Activate.ps1

# 1. Django System & Migration Checks
python manage.py check
python manage.py makemigrations --check

# 2. Comprehensive Role-Based Access Verification
python test_step3_role_verification.py

# 3. Authentication & RBAC Verification
python test_auth_rbac.py

# 4. Platform Owner Governance Verification
python test_platform_owner_rbac.py

# 5. Core 15-Module Test Suite
python test_step8_comprehensive.py

# 6. Pre-flight Production Configuration Audit
python manage.py validate_production
```

#### Frontend Build & Integration Tests
```powershell
cd frontend

# Production Build Verification
npm run build

# Integration Test Suites (Ensure Django backend is active)
node test_step9_integration.cjs       # Health & Auth Integration
node test_step10_marketplace.cjs      # Catalog & Shop Browsing
node test_step11_orders.cjs           # Checkout & Delivery Orders
node test_step12_printing.cjs         # Cloud Printing Lifecycle
node test_step13_pickup_otp.cjs       # Pickup Scheduling & OTP
node test_step14_delivery_otp.cjs     # Courier Dispatch & Delivery OTP
```

---

### 7. Production Deployment Prerequisites
Before deploying to production (e.g., Ubuntu LTS / AWS / DigitalOcean):
1. **Domain & DNS**: Point domain records to server IP (e.g. `campuscart.university.edu` and `api.campuscart.university.edu`).
2. **Reverse Proxy & SSL**: Configure Nginx with Let's Encrypt SSL/TLS certificates.
3. **Environment Security**:
   - Set `DEBUG=False` in `backend/.env`.
   - Generate a cryptographically strong 50+ character `SECRET_KEY`.
   - Restrict `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, and `CSRF_TRUSTED_ORIGINS` to production domains.
   - Configure HTTPS security headers (`SECURE_SSL_REDIRECT=True`, `SESSION_COOKIE_SECURE=True`).
4. **Dedicated MySQL User**: Provision a dedicated database user with a strong unique password.
5. **Media Storage**: Ensure persistent filesystem storage with appropriate permissions for user-uploaded printout PDFs in `media/documents/`.
6. **Payment Gateway**: Switch from `PAYMENT_GATEWAY=SANDBOX` to `RAZORPAY` or `STRIPE` with live production API keys and webhook signing secret.
7. **Production SMTP**: Configure campus SMTP relay credentials (`EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`) to enable transactional email delivery.

---

### 8. Known Limitations
- **Google Maps Key**: Browser geocoding and live courier maps require a valid Google Cloud Platform Maps JavaScript API key in `VITE_GOOGLE_MAPS_API_KEY`.
- **Payment Sandbox**: Default deployment runs with sandbox mock payments for testing; live card charges require production Razorpay/Stripe keys.
- **Console Email Backend**: Local development outputs verification and OTP emails to the Django terminal; production requires SMTP credentials.

---

## 🚀 Development Progression
- [x] **Step 1:** Environment setup, system prerequisites verification, `requirements.txt`.
- [x] **Step 2:** Standardized project directory architecture & documentation.
- [x] **Step 3:** MySQL database creation, user permissions, and Django project scaffolding.
- [x] **Step 4:** Core Django project configuration & database connectivity.
- [x] **Step 5:** Modular Django models, relationships & initial migrations.
- [x] **Step 6:** REST API layer with DRF ViewSets, serializers & routers.
- [x] **Step 7:** JWT authentication & Role-Based Access Control (Student, Shop Owner, Admin, Delivery Agent).
- [x] **Step 8:** Backend API testing, health checks & OpenAPI/Swagger documentation.
- [x] **Step 9:** React frontend foundation, routing, authentication context & design system.
- [x] **Step 10:** Student marketplace, shop browsing, product catalog & cart management.
- [x] **Step 11:** Checkout workflow, address selection & stationery order placement.
- [x] **Step 12:** Document printing workflow, PDF upload, configuration & shop print queue.
- [x] **Step 13:** Pickup Scheduling + Cryptographic OTP Verification System.
- [x] **Step 14:** Complete Delivery Management & Last-Mile Delivery System.
- [x] **Step 15:** Advanced Inventory Management & Stock Intelligence System (No ML, Clean Data Pipeline).
- [x] **Step 16:** Supplier & Purchase Intelligence Improvements (Procurement Lifecycle, Multi-Factor Vendor Ranking, Partial Receiving & Cost Tracking).
- [x] **Step 17:** Regression-Based Demand Prediction (Feature Engineering, Chronological Splitting, Linear vs Random Forest Training, Multi-Step Horizon Forecasting, Demand Spikes & SaaS Dashboard).
- [x] **Step 18:** Smart Purchase Advisor (EOQ, Reorder Point, Safety Stock Calculation & Automated PO Generation).
- [x] **Step 19:** Academic Calendar & Event Intelligence (Exam, practical, and presentation demand spikes).
- [x] **Step 20:** Recommendation Engine (Personalized, Buy Again, Frequently Bought Together, Alternatives).
- [x] **Step 21:** Smart Notes, To-Do & Shopping Planner (Student planner with academic integration and cart conversion).
- [x] **Step 22:** GPS Tracking & Route Optimization (Courier transit telemetry, ETA calculations, and location privacy).
- [x] **Step 23:** Bulk/Class Ordering & Shopping Intelligence (Group buying, volume discounts, tier pricing).
- [x] **Step 24:** Reviews, Ratings, Wishlist & Offers (Verified buyer reviews, coupons, dynamic discounts).
- [x] **Step 25:** Payment, Refund & Transaction Management (Authoritative payment processing, idempotent refunds, COD).
- [x] **Step 26A:** Email OTP & Account Verification (Cryptographic SHA-256 OTP hashing, resend cooldowns, brute-force caps).
- [x] **Step 26:** Security, Privacy & Production Hardening (IDOR defenses, MIME validation, retention policies, RBAC).
- [x] **Step 27:** Advanced Analytics & Business Intelligence (Platform & shop KPIs, sales trajectories, cohort metrics).
- [x] **Step 28:** Admin Reporting, Export & Management System (17 operational reports, streaming UTF-8 BOM CSV exports).
- [x] **Step 29:** Complete QA & End-to-End Testing (Full system-wide validation, 219 tests, 100% pass).
- [x] **Step 30:** Production Deployment Preparation (Environment decoupling, pre-flight audit, Gunicorn/Nginx, backup runbooks).

---

## 🔐 Step 13: Pickup Scheduling & OTP Verification System

The Pickup Scheduling + OTP Verification System organizes and secures physical counter collections for both stationery and printing orders across campus shops.

### 1. Order Lifecycle & Collection Flow

```text
Student Places Order
       │
       ▼
Selects Fulfillment: PICKUP
       │
       ▼
Selects Available Time Slot (e.g., 10:30 AM - 11:00 AM)
       │  (Capacity atomically checked & booked via select_for_update)
       ▼
Order Status: PLACED / PENDING
       │
       ▼
Shop Owner Accepts Order ➔ PREPARING
       │
       ▼
Shop Owner Marks Order: READY
       │  (System cryptographically generates 6-digit OTP; notification emitted)
       ▼
Student Retrieves OTP in Order Details
       │
       ▼
Student Visits Shop Counter During Selected Slot
       │
       ▼
Shop Owner Enters Student OTP at Counter Screen
       │  (Backend hashes, validates expiry, checks attempt limit, locks row atomically)
       ▼
Order Status: COMPLETED
```

### 2. Pickup Slot Architecture & Capacity Protection

Pickup slots represent discrete counter pickup windows created by shop owners.

#### Database Model (`delivery.PickupSlot`):
- `shop`: Foreign key to `Shop`
- `date`: Pickup calendar date
- `start_time`, `end_time`: Pickup time window
- `capacity`: Maximum order collections allowed in this window
- `booked_count`: Currently active reservations
- `available_capacity`: Dynamic property `max(0, capacity - booked_count)`
- `is_active`: Toggle to disable new bookings while preserving existing ones
- `UniqueConstraint`: `(shop, date, start_time, end_time)` prevents duplicate slots

#### Atomic Race Condition Protection:
When concurrent students attempt to book the final spot in a slot (`booked_count = capacity - 1`), race conditions are prevented using Django's row-level locking:
```python
with transaction.atomic():
    slot = PickupSlot.objects.select_for_update().get(id=slot_id)
    if slot.booked_count >= slot.capacity:
        raise ValidationError("This pickup slot is already full.")
    slot.booked_count += 1
    slot.save()
```
Automated testing confirms that out of simultaneous requests, exactly 1 succeeds and all subsequent requests are safely rejected with `400 Bad Request`.

### 3. Cryptographic OTP Security Design

Plaintext OTPs are **never exposed** in standard order list or detail endpoints (`GET /api/orders/`).

#### Database Model (`orders.OTPVerification`):
- `order`: One-to-one or foreign key to `Order`
- `otp_hash`: Salted PBKDF2/SHA-256 hash using Django's `make_password()`
- `encrypted_otp`: Cryptographically signed token via Django `signing.dumps()` (for authorized single-tenant retrieval)
- `purpose`: `PICKUP` (extensible to `DELIVERY`)
- `expires_at`: Expiration timestamp (configurable, default 120 minutes)
- `is_verified`: Boolean flag preventing OTP reuse
- `verified_at`: Timestamp of successful redemption
- `verified_by`: User reference to verifier (shop owner, student, or admin)
- `verified_by_role`: Role tag (`SHOP_OWNER`, `STUDENT`, `ADMIN`)
- `attempt_count`: Failed entry tracking
- `max_attempts`: Maximum verification attempts permitted (default: 5)

#### Security Invariants:
1. **No Plaintext Leaks:** Serializers return `active_otp: null` in general order endpoints.
2. **Dedicated Student Retrieval:** `GET /api/orders/{id}/pickup-otp/` strictly allows only the ordering student to view the unmasked OTP while order is `READY`.
3. **Attempt Limiting:** 5 consecutive failed entries permanently lock the OTP.
4. **Single Use:** Already verified OTPs cannot be reused under any circumstances.
5. **Cross-Shop Isolation:** Merchants can only verify orders placed at their own shop (`403 Forbidden` / `404 Not Found`).

### 4. Step 13 API Endpoints

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/pickup-slots/` | Shop Owner / Admin | List pickup slots for authenticated owner's shop |
| `POST` | `/api/pickup-slots/` | Shop Owner / Admin | Create a new pickup time window with capacity |
| `GET` | `/api/pickup-slots/{id}/` | Shop Owner / Admin | Retrieve pickup slot details |
| `PATCH` | `/api/pickup-slots/{id}/` | Shop Owner / Admin | Update slot capacity or active status |
| `DELETE` | `/api/pickup-slots/{id}/` | Shop Owner / Admin | Delete slot (blocked with 400 if active bookings exist) |
| `GET` | `/api/pickup-slots/available/?shop_id=<id>&date=<date>` | Public / Student | List valid, future, active slots with available capacity |
| `GET` | `/api/orders/{id}/pickup-otp/` | Student (Customer) | Retrieve 6-digit OTP when order is in `READY` status |
| `POST` | `/api/orders/{id}/verify-pickup-otp/` | Shop Owner / Customer | Universal atomic pickup verification endpoint |
| `POST` | `/api/shop-owner/orders/{id}/verify-pickup-otp/` | Shop Owner (Merchant) | Dedicated merchant counter verification endpoint |

---

## 🚚 Step 14: Complete Delivery Management & Last-Mile Delivery System

The **Last-Mile Delivery Management System** handles student orders requiring doorstep delivery to university hostels, dorm rooms, and campus departments. It establishes a complete, robust lifecycle with cryptographic handoff verification, time-window slot reservations, dynamic fee calculation, failure handling, and attempt auditing.

### 1. Delivery Architecture & Lifecycle Flow

```text
Student
   ↓
Places Order (DELIVERY)
   ↓
Selects/Enters Saved Address (`StudentAddress`)
   ↓
Selects Delivery Slot (`DeliverySlot`)
   ↓
Delivery Charge Calculated (Free Delivery rule evaluated)
   ↓
Shop Prepares Order
   ↓
Courier Assigned / Reassigned (`ASSIGNED`)
   ↓
Courier Collects from Shop (`PICKED_UP`)
   ↓
Out for Delivery (`OUT_FOR_DELIVERY`) ──► 6-Digit Delivery OTP Generated
   ↓
Courier Signals Arrival at Hostel Gate (`ARRIVING`)
   ↓
Student Provides Delivery OTP
   ↓
OTP Verified at Doorstep (`/api/deliveries/{id}/verify-otp/`)
   ↓
Order COMPLETED + Delivery DELIVERED + COD Payment Marked PAID
```

### 2. Failed Delivery & Rescheduling Lifecycle

```text
Out for Delivery (`OUT_FOR_DELIVERY` / `ARRIVING`)
   ↓
Student Unavailable / Room Locked / Phone Unreachable
   ↓
Courier Reports Failed Delivery (`/api/deliveries/{id}/failed/`)
   ↓
Delivery Status → FAILED + Audit Log Created (`DeliveryAttempt`)
   ↓
Student / Merchant Reschedules Delivery (`/api/deliveries/{id}/reschedule/`)
   ↓
New Slot Concurrency Validated + Old Slot Released
   ↓
Delivery Status → RESCHEDULED + Order Status → READY
   ↓
Reassigned to Courier for Next Dispatch Cycle
```

### 3. Core Database Models

- **`StudentAddress`**: Campus address book storing recipient name, hostel block, room number, campus landmark, and contact phone with default location tagging.
- **`DeliverySlot`**: Hourly campus delivery time windows (e.g. 10:00–11:00 AM) with strict per-slot order capacities. Overbooking is prevented via atomic database row locking (`select_for_update()`).
- **`DeliveryZone`**: Configurable geographical distance slabs (e.g. 0–2.5 km) with base delivery fee and free delivery thresholds.
- **`Delivery`**: Production delivery record tracking the parent order, assigned courier, current status, slot, address, dynamic fee, timestamps, and attempt counts.
- **`DeliveryAttempt`**: Immutable audit log capturing each delivery run, status, failure reason, notes, attempted timestamp, and the responsible courier.

### 4. Delivery Status Transitions

| Current Status | Allowed Next Statuses | Actor |
| :--- | :--- | :--- |
| `PENDING` | `ASSIGNED`, `CANCELLED` | Merchant / Admin |
| `ASSIGNED` | `PICKED_UP`, `FAILED`, `ASSIGNED` (Reassign), `CANCELLED` | Courier / Merchant |
| `PICKED_UP` | `OUT_FOR_DELIVERY`, `FAILED`, `CANCELLED` | Courier |
| `OUT_FOR_DELIVERY` | `ARRIVING`, `DELIVERED`, `FAILED`, `CANCELLED` | Courier |
| `ARRIVING` | `DELIVERED`, `FAILED`, `CANCELLED` | Courier |
| `FAILED` | `RESCHEDULED`, `ASSIGNED` (Retry), `CANCELLED` | Student / Merchant |
| `RESCHEDULED` | `ASSIGNED`, `PICKED_UP`, `CANCELLED` | Merchant / Admin |
| `DELIVERED` | Terminal State (Completed) | System |

### 5. Delivery Charge & Free Delivery Rule

- **Backend-Authoritative**: Delivery fee is strictly computed by the Django backend API; frontend values are never trusted.
- **Standard Flat Fee**: ₹15.00 for campus delivery within hostel core zones.
- **Free Delivery Rule**: Configurable threshold (₹250.00 subtotal). Any order meeting or exceeding ₹250 qualifies for free delivery (₹0.00).

### 6. Delivery OTP Security

- **Generation**: Cryptographically generated 6-digit integer when courier transitions delivery to `OUT_FOR_DELIVERY`.
- **Storage**: PBKDF2 hashed (`otp_hash`) and signed (`encrypted_otp`) using Django cryptographic signing.
- **Access Control**: Never exposed in general order or delivery listings. Accessible only to the ordering student via `/api/deliveries/{id}/delivery-otp/`.
- **Verification**: Atomic database transaction locking both delivery and order rows. Replays and duplicate verifications are rejected.
- **Attempt Limits**: Locked after 5 invalid attempts with 2-hour expiration.

### 7. Step 14 API Endpoints

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/addresses/` | Student | List student's saved delivery drop points |
| `POST` | `/api/addresses/` | Student | Create a new campus address |
| `PUT` / `PATCH` | `/api/addresses/{id}/` | Student | Update saved address details |
| `DELETE` | `/api/addresses/{id}/` | Student | Delete a saved address |
| `POST` | `/api/addresses/{id}/set-default/` | Student | Set primary default drop location |
| `GET` | `/api/delivery-slots/available/` | Student / All | Fetch unbooked delivery time slots for a store |
| `POST` | `/api/delivery-slots/` | Shop Owner / Admin | Create a new delivery time window with capacity |
| `DELETE` | `/api/delivery-slots/{id}/` | Shop Owner / Admin | Remove a delivery slot |
| `GET` | `/api/deliveries/calculate-charge/` | Public | Backend delivery fee calculator with free threshold |
| `GET` | `/api/deliveries/` | Authenticated | List deliveries filtered by role |
| `GET` | `/api/deliveries/agents/` | Shop Owner / Admin | List available delivery agents with active load |
| `POST` | `/api/deliveries/toggle-availability/` | Courier | Update shift status (`AVAILABLE`, `BUSY`, `OFFLINE`) |
| `POST` | `/api/deliveries/{id}/assign/` | Shop Owner / Admin | Assign order to courier |
| `POST` | `/api/deliveries/{id}/reassign/` | Shop Owner / Admin | Reassign order to a different courier |
| `POST` | `/api/deliveries/{id}/pickup/` | Courier | Mark package collected from merchant counter |
| `POST` | `/api/deliveries/{id}/out-for-delivery/`| Courier | Mark out on campus (triggers Delivery OTP) |
| `POST` | `/api/deliveries/{id}/arriving/` | Courier | Signal arrival at student hostel |
| `GET` | `/api/deliveries/{id}/delivery-otp/` | Student (Customer) | Securely retrieve 6-digit delivery OTP |
| `POST` | `/api/deliveries/{id}/verify-otp/` | Courier / Merchant | Verify doorstep OTP and complete order |
| `POST` | `/api/deliveries/{id}/failed/` | Courier | Report delivery failure with reason code |
| `POST` | `/api/deliveries/{id}/reschedule/` | Student / Merchant | Reschedule failed delivery to new time slot |
| `GET` | `/api/deliveries/analytics/` | Merchant / Admin | Aggregate delivery metrics and completion rates |
| `GET` | `/api/orders/{id}/delivery-otp/` | Student (Customer) | Order-level convenience endpoint for Delivery OTP |
| `POST` | `/api/orders/{id}/verify-delivery-otp/` | Courier / Merchant | Order-level doorstep delivery verification endpoint |

---

## 📦 Step 15: Advanced Inventory Management & Stock Intelligence System

Step 15 establishes an enterprise-grade, shop-isolated inventory control and procurement tracking architecture. It guarantees zero negative stock balances, records every physical item movement in immutable audit logs, and forms the clean historical data pipeline for future regression-based demand prediction in Steps 16 and 17.

### 1. Inventory Lifecycle & Stock States

```text
Wholesale Supplier
       │
       ▼
Purchase Order (Draft ──> Placed ──> Partially Received ──> Received)
       │
       ▼
Inbound Stock Received (+units)
       │
       ▼
Physical Inventory On-Hand (current_stock)
       ├── Reserved Stock (reserved_stock for pending orders)
       └── Available Stock = current_stock - reserved_stock
       │
       ├── Student Order Placed: stock deducted, SALE audit transaction logged
       ├── Order Cancelled: stock returned, RETURN audit transaction logged
       ├── Manual Audit Count: delta updated, ADJUSTMENT audit transaction logged
       └── Discarded Items: damaged count removed, DAMAGE audit transaction logged
       │
       ▼
Threshold Detection & Alerts
       ├── Current Stock > Maximum Stock       ──> OVERSTOCKED
       ├── Current Stock <= Reorder Level / Min ──> LOW STOCK (Alert dispatched)
       └── Current Stock == 0                   ──> OUT OF STOCK (Alert dispatched)
```

### 2. Core Models Added in Step 15

| Model | Table | Purpose |
| :--- | :--- | :--- |
| `Inventory` | `inventories` | Live stock levels, reserved units, thresholds (min, reorder, max), unit cost price, and stock valuation. |
| `InventoryTransaction` | `inventory_transactions` | Immutable audit log capturing `stock_before`, `quantity_change`, `stock_after`, reference IDs, transaction type, reason, and actor. |
| `Supplier` | `suppliers` | Wholesale distributor registry with contact details, city, and active PO counters. |
| `SupplierProduct` | `supplier_products` | Catalog mapping between wholesale vendors and campus products with purchase costs and lead times. |
| `PurchaseOrder` | `purchase_orders` | Procurement order tracking (`DRAFT`, `PLACED`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CANCELLED`). |
| `PurchaseOrderItem` | `purchase_order_items` | Line items with ordered vs received quantities and unit purchase costs. |
| `InventoryReturn` | `inventory_returns` | Customer returns and discarded items audit trail (`SELLABLE` vs `DAMAGED`). |

### 3. Stock Transaction Types

- **`PURCHASE` / `SALE`**: Units deducted upon student stationery checkout.
- **`RESTOCK`**: Inbound units received via purchase order or direct supplier delivery.
- **`RETURN`**: Sellable units returned from customer orders added back to balance.
- **`DAMAGE`**: Discarded units removed due to storage leaks, transit damage, or expiration.
- **`ADJUSTMENT`**: Delta correction following physical inventory cycle counts.
- **`RESERVATION`**: Temporary stock holds for pending approval workflows.
- **`RELEASE`**: Released reservations upon order cancellation.

### 4. Step 15 API Endpoints

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/inventory/` | Shop Owner / Admin | List shop inventories with search, category, and status filters |
| `GET` | `/api/inventory/{id}/` | Shop Owner / Admin | Retrieve individual inventory record and thresholds |
| `PATCH` | `/api/inventory/{id}/` | Shop Owner / Admin | Update thresholds (`minimum_stock`, `reorder_level`, `maximum_stock`, `unit_cost`) |
| `POST` | `/api/inventory/{id}/adjust/` | Shop Owner / Admin | Safely increment or decrement stock with audit reason (prevents negative) |
| `POST` | `/api/inventory/{id}/adjust-stock/` | Shop Owner / Admin | Legacy adjustment endpoint preserved for backward compatibility |
| `POST` | `/api/inventory/{id}/receive/` | Shop Owner / Admin | Direct supplier inbound receipt without formal PO |
| `POST` | `/api/inventory/{id}/damage/` | Shop Owner / Admin | Record damaged or defective stock discard |
| `GET` | `/api/inventory/{id}/history/` | Shop Owner / Admin | Chronological immutable movement audit trail for this product |
| `GET` | `/api/inventory/low-stock/` | Shop Owner / Admin | Filter all items currently at or below reorder level |
| `GET` | `/api/inventory/out-of-stock/` | Shop Owner / Admin | Filter all products with 0 stock on hand |
| `GET` | `/api/inventory/analytics/` | Shop Owner / Admin | Total SKUs, units on hand, valuation, fast/slow moving items, 30-day movements |
| `GET` | `/api/inventory/daily-sales/` | Shop Owner / Admin | Contiguous daily units sold time series for future ML training |
| `GET` | `/api/inventory/export-csv/` | Shop Owner / Admin | Download shop inventory status as CSV spreadsheet |
| `GET` | `/api/suppliers/` | Shop Owner / Admin | List wholesale vendors with shop isolation |
| `POST` | `/api/suppliers/` | Shop Owner / Admin | Register new wholesale vendor |
| `GET` | `/api/purchase-orders/` | Shop Owner / Admin | List procurement orders and status |
| `POST` | `/api/purchase-orders/` | Shop Owner / Admin | Create draft PO with nested line items |
| `POST` | `/api/purchase-orders/{id}/place/` | Shop Owner / Admin | Place order with supplier |
| `POST` | `/api/purchase-orders/{id}/receive/` | Shop Owner / Admin | Atomically receive delivery items and increment physical stock |
| `POST` | `/api/purchase-orders/{id}/cancel/` | Shop Owner / Admin | Cancel unfulfilled draft purchase order |
| `GET` | `/api/inventory-transactions/` | Shop Owner / Admin | Read-only global audit trail of stock movements |
| `GET` | `/api/inventory-returns/` | Shop Owner / Admin | Customer returns and discarded damage log |

### 5. Future Demand Prediction Data Pipeline Note

In strict adherence to project specifications, **no machine learning algorithms, regression training, or fake predictions are implemented in Step 15**. Instead, Step 15 establishes the authoritative data pipeline:
- Every sales and procurement event generates an immutable `InventoryTransaction`.
- The `sales_aggregation.py` service computes continuous date-indexed vectors of units sold per day (`get_daily_sales_series`).
- In **Step 16 and Step 17**, these historical time-series records will be joined with campus academic cycle calendars (exam weeks, assignment due dates, project submission milestones) to train real Scikit-learn regression models for demand forecasting and smart purchase advising.

---

## 🏭 Step 16: Supplier & Purchase Intelligence Improvements

Step 16 elevates wholesale vendor management and purchase orders into a production-grade procurement system. It incorporates multi-stage approval workflows, row-locked partial receiving, real purchase cost analytics, explainable multi-factor vendor ranking, and low-stock reorder recommendations — all while strictly preparing data for ML Demand Prediction in Step 17 without introducing fake prediction figures.

### 1. Purchase Order Lifecycle & State Machine

```text
       [ Create PO ]
             │
             ▼
         ┌───────┐
         │ DRAFT │ ──(Cancel)──> [ CANCELLED ]
         └───────┘
             │ (Submit)
             ▼
  ┌───────────────────┐
  │ PENDING_APPROVAL  │ ──(Reject)──> [ REJECTED ]
  └───────────────────┘
             │ (Approve)
             ▼
        ┌──────────┐
        │ APPROVED │ ──(Cancel)──> [ CANCELLED ]
        └──────────┘
             │ (Place / Mark Ordered)
             ▼
        ┌──────────┐
        │ ORDERED  │ ──(Cancel)──> [ CANCELLED ]
        └──────────┘
             │
             ├──(Partial Delivery Inbound)──> ┌────────────────────┐
             │                                │ PARTIALLY_RECEIVED │ ──(Remainder Delivered)──┐
             │                                └────────────────────┘                          │
             │                                                                                │
             └───────────────(Complete Delivery Inbound)──────────────────────────────────────▼
                                                                                         ┌──────────┐
                                                                                         │ RECEIVED │
                                                                                         └──────────┘
```

#### State Transition Rules:
- **`DRAFT`**: Editable line items, prices, quantities, taxes, discounts. Can be submitted for approval or deleted/cancelled.
- **`PENDING_APPROVAL`**: Locked for editing. Shop owner or admin can approve or reject with a documented reason.
- **`APPROVED`**: Ready for supplier transmission. Can be dispatched to wholesale distributor.
- **`ORDERED` / `PLACED`**: Dispatched to supplier. Inbound warehouse receiving enabled.
- **`PARTIALLY_RECEIVED`**: One or more shipments received. Status maintained until `received_quantity == ordered_quantity` across all line items.
- **`RECEIVED`**: Terminal successful state. All items fully stocked in physical inventory.
- **`CANCELLED` / `REJECTED`**: Terminal abortive states. Cannot transition to `RECEIVED` or `ORDERED`.

---

### 2. Multi-Factor Vendor Scoring & Ranking Engine

To eliminate human guesswork during replenishment, the system evaluates all suppliers linked to a product using an explainable multi-criteria scoring algorithm:

$$\text{Supplier Score} = (0.40 \times \text{Price}) + (0.30 \times \text{Lead Time}) + (0.20 \times \text{Reliability}) + (0.10 \times \text{MOQ})$$

Where:
- **Price Factor (40%)**: Ratio of minimum catalog price to supplier's quoted price: $\frac{\text{min\_price}}{\text{quote\_price}} \times 100$.
- **Lead Time Factor (30%)**: Scaled fulfillment speed: $\max(0, 100 - (\text{lead\_days} - \text{min\_days}) \times 10)$.
- **Reliability Factor (20%)**: Derived from historical PO fulfillment data: $\frac{\text{completed\_orders}}{\text{total\_orders}} \times 100$, penalized for delayed shipments.
- **MOQ Factor (10%)**: Convenience of lower minimum order threshold.
- **Preferred Supplier Bonus**: +5.0 point boost if tagged as the shopkeeper's preferred vendor.

#### Explainable Rationale:
Every recommendation includes a human-readable justification (e.g., *"Lowest purchase price (₹45.00) • Fast delivery (2 days) • High fulfillment reliability (100.0%) • Tagged as preferred vendor"*).

---

### 3. Concurrency-Safe Stock Receiving & Idempotency

When counter staff receives shipments from delivery trucks:
1. **Row-Level Locking**: `PurchaseOrder.objects.select_for_update()` and `Inventory.objects.select_for_update()` prevent concurrent race conditions when two warehouse workers process simultaneous receipts.
2. **Idempotency Protection**: Receiving submissions accept a unique `idempotency_token` generated by the frontend. Duplicate HTTP submissions within a short window return the cached receipt record rather than crediting inventory twice.
3. **Over-Receiving Guard**: Validates that `quantity_received + current_received <= quantity_ordered` for every line item.
4. **Financial Audit Trail**: Automatically logs `RESTOCK` `InventoryTransaction` records with actual purchase unit cost and total expenditure.
5. **Dynamic Cost Tracking**: Updates `last_purchase_price` and `last_purchase_date` in `SupplierProduct`, updating weighted average, minimum, and maximum purchase costs.

---

### 4. Step 16 API Endpoints

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/suppliers/` | Shop Owner / Admin | List wholesale suppliers isolated by shop with contact, GST, and active counters |
| `POST` | `/api/suppliers/` | Shop Owner / Admin | Create supplier with business name, tax identifier, address, and notes |
| `GET` | `/api/suppliers/{id}/` | Shop Owner / Admin | Retrieve supplier details, catalog mapping, and order history |
| `PATCH` | `/api/suppliers/{id}/` | Shop Owner / Admin | Update supplier contact information or active status |
| `GET` | `/api/suppliers/{id}/performance/` | Shop Owner / Admin | Real-time performance scorecard (fill rate, delay count, lead time, total spend) |
| `GET` | `/api/suppliers/performance-summary/` | Shop Owner / Admin | Aggregated scorecard across all suppliers for shop dashboard |
| `POST` | `/api/suppliers/{id}/add-product/` | Shop Owner / Admin | Link catalog product to supplier with cost price, MOQ, and lead days |
| `GET` | `/api/suppliers/recommend/?product_id=<id>` | Shop Owner / Admin | Ranked vendor comparison for a product with explainable scores |
| `GET` | `/api/purchase-orders/` | Shop Owner / Admin | Filter POs by status, supplier, search query, and date ranges |
| `POST` | `/api/purchase-orders/` | Shop Owner / Admin | Create PO in `DRAFT` status with line items, tax, discount, and shipping |
| `GET` | `/api/purchase-orders/{id}/` | Shop Owner / Admin | Full PO details with item progress, costs, and valid action triggers |
| `POST` | `/api/purchase-orders/{id}/submit-approval/` | Shop Owner / Admin | Transition `DRAFT` ➔ `PENDING_APPROVAL` |
| `POST` | `/api/purchase-orders/{id}/approve/` | Shop Owner / Admin | Approve order (`PENDING_APPROVAL` ➔ `APPROVED`) |
| `POST` | `/api/purchase-orders/{id}/reject/` | Shop Owner / Admin | Reject order (`PENDING_APPROVAL` ➔ `REJECTED`) with documented reason |
| `POST` | `/api/purchase-orders/{id}/order/` | Shop Owner / Admin | Dispatch order (`APPROVED` ➔ `ORDERED`) |
| `POST` | `/api/purchase-orders/{id}/place/` | Shop Owner / Admin | Direct order placement (`DRAFT` / `APPROVED` ➔ `PLACED`) |
| `POST` | `/api/purchase-orders/{id}/receive/` | Shop Owner / Admin | Atomically receive partial/full quantities with idempotency token |
| `POST` | `/api/purchase-orders/{id}/cancel/` | Shop Owner / Admin | Cancel unreceived PO with audit logging |
| `GET` | `/api/purchase-orders/analytics/` | Shop Owner / Admin | Procurement spend trends, supplier distribution, and status breakdowns |
| `GET` | `/api/inventory/{id}/cost-history/` | Shop Owner / Admin | Real purchase cost metrics (last, avg, min, max, monthly history, price alerts) |
| `GET` | `/api/inventory/reorder-recommendations/` | Shop Owner / Admin | Low-stock items with recommended purchase qty (`predicted_demand: null` for Step 17) |

---

### 5. Strict ML Boundary Verification (Step 17 Preparation)

In compliance with project requirements:
- **No ML models or fake regressions were added.**
- `reorder-recommendations` explicitly returns `"predicted_demand": null` and `"prediction_status": "Demand prediction not available yet (ML model activates in Step 17)"`.
- The database now securely captures pristine historical procurement time-series: purchase quantities, actual costs, vendor lead times, and daily sales movements, providing the exact training ground required for Scikit-learn regression models in **Step 17**.

---

## 📈 Step 17: Regression-Based Demand Prediction

Step 17 implements an explainable, end-to-end Machine Learning pipeline predicting future stationery demand across university campus shops. It extracts authentic completed orders, constructs continuous daily sales vectors with zero-filled missing dates, engineers lagged and rolling statistics without data leakage, trains and evaluates candidate regression models against moving average baselines, generates recursive 7-day and 30-day horizon forecasts, and provides interactive SaaS dashboards for merchants and administrators.

### 1. Machine Learning Pipeline Architecture

```text
       Actual Campus Orders (Completed / Non-Cancelled)
                             │
                             ▼
                 [ Historical Sales Extraction ]
               (OrderItems & InventoryTransactions)
                             │
                             ▼
               [ Daily Sales Aggregation ]
             (shop + product + date, zero-fill missing)
                             │
                             ▼
            [ Data Cleaning & Minimum 30-Day Check ]
       (Drop invalid; flag <30 days as INSUFFICIENT_DATA)
                             │
                             ▼
                [ Feature Engineering ]
  (Calendar: day_of_week, month, is_weekend | Lags: 1,2,3,7,14 | Rolling: 3,7,14)
                             │
                             ▼
             [ Chronological Train/Test Split ]
                  (80% Train, 20% Test)
                             │
                             ▼
              [ Regression Model Comparison ]
         Linear Regression  vs  Random Forest Regressor
                vs  7-Day Moving Average Baseline
                             │
                             ▼
              [ Evaluation: MAE, RMSE, R² ]
                             │
                             ▼
         [ Model Selection & Joblib Serialization ]
            (Saved to ml/models/saved/ with version)
                             │
                             ▼
             [ Recursive Horizon Forecasting ]
         Next 7 Days (Sum) & Next 30 Days (Sum)
                             │
                             ▼
             [ Database Storage & Metadata ]
         DemandPrediction & DemandModelMetadata
                             │
                             ▼
             [ REST APIs & Spike Detection ]
                             │
                             ▼
           [ Shop Owner & Admin Dashboards ]
```

---

### 2. Feature Engineering & Zero Data Leakage

All features are calculated strictly using information known *prior* to the target forecast date:
- **Calendar & Seasonality**: `day_of_week` (0–6), `day_of_month` (1–31), `month` (1–12), `week_of_year` (1–52), `is_weekend` (0 or 1).
- **Lag Features**: `lag_1`, `lag_2`, `lag_3`, `lag_7`, `lag_14` (grouped per product/shop via `.shift(k)`).
- **Rolling Window Statistics**: `rolling_mean_3`, `rolling_mean_7`, `rolling_mean_14` (computed on `.shift(1)` lagged data to prevent future-data leakage).
- **Chronological Split**: Enforces an 80% train / 20% test split ordered by calendar timestamp. Shuffling across time is strictly prohibited.

---

### 3. Model Comparison & Evaluation Metrics

| Model Candidate | Algorithm | Purpose | Test MAE | R² Score |
| :--- | :--- | :--- | :--- | :--- |
| **Baseline** | 7-Day Moving Average | Naive benchmark | ±2.91 units | 0.00 |
| **Candidate 1** | Scikit-learn LinearRegression | Interpretable linear baseline | ±2.72 units | 0.014 |
| **Candidate 2 (Selected)** | Scikit-learn RandomForestRegressor | Non-linear ensemble model | **±2.57 units** | **0.125** |

- **MAE (Mean Absolute Error)**: Measures average prediction magnitude gap ($\approx 2.57$ units error on unseen test dates).
- **RMSE (Root Mean Squared Error)**: Penalizes larger gaps.
- **R² Score**: Quantifies proportion of variance captured by the model.

---

### 4. Multi-Step Recursive Horizon Forecasting

Rather than scaling a single-day prediction by 7 or 30, the system iteratively forecasts day by day:
$$\hat{y}_t = \max\left(0, \text{round}\left(f(X_t)\right)\right)$$
where $X_t$ uses model predictions $\hat{y}_{t-1}, \dots$ for future lags.
- **7-Day Demand**: $\sum_{t=1}^7 \hat{y}_t$
- **30-Day Demand**: $\sum_{t=1}^{30} \hat{y}_t$

---

### 5. Statistical Spike Detection & Trend Classification

- **Spike Detection**: Flags products when upcoming expected demand exceeds the 14-day rolling mean by $\ge 2\sigma$ or $+50\%$ (`HIGH_DEMAND_SPIKE` vs `MEDIUM_DEMAND_SPIKE`).
- **Trend Classification**:
  - `INCREASING`: $> +10\%$ growth vs recent historical average.
  - `DECREASING`: $< -10\%$ contraction vs recent historical average.
  - `STABLE`: Within $\pm 10\%$ band.
  - `VOLATILE`: High standard deviation relative to mean (CV $> 0.75$).
  - `INSUFFICIENT_DATA`: $< 30$ days historical observations.

---

### 6. Management Commands

- **Train ML Model**:
  ```powershell
  python manage.py train_demand_model [--shop-id=<id>] [--model-version=v1.0.0] [--min-days=30] [--force]
  ```
- **Demo Historical Sales Generator (Development Only)**:
  ```powershell
  python manage.py seed_historical_sales [--shop-id=1] [--days=60]
  ```
  To purge demo data:
  ```powershell
  python manage.py seed_historical_sales --clear
  ```

---

### 7. Step 17 REST API Endpoints

| Method | Endpoint | Access | Purpose |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/demand-predictions/` | Shop Owner / Admin | List predictions filtered by shop, product, or horizon (`DAILY`, `7_DAYS`, `30_DAYS`) |
| `GET` | `/api/demand-predictions/summary/` | Shop Owner / Admin | Dashboard KPI summary (predicted SKUs, high demand count, spike count, 7d/30d sums) |
| `GET` | `/api/demand-predictions/forecast/?product_id=<id>&horizon=7|30` | Shop Owner / Admin | Unified dual-series for Chart.js (historical actuals + future predicted points) |
| `GET` | `/api/demand-predictions/trends/` | Shop Owner / Admin | Product catalog trend classifications (`INCREASING`, `STABLE`, etc.) |
| `GET` | `/api/demand-predictions/spikes/` | Shop Owner / Admin | Active statistical demand spike alerts with surge percentages |
| `GET` | `/api/demand-predictions/model-metrics/` | Shop Owner / Admin | Active model scorecard (algorithm, version, training date, MAE, RMSE, R²) |

---

### 8. Step 18–30 Comprehensive Capabilities Overview

The Smart Stationery platform encompasses a complete campus commerce and logistics ecosystem:
- **Smart Purchase Advisor (Step 18)**: Integrates ML demand forecasts with Economic Order Quantity (EOQ), Reorder Point (ROP), and Safety Stock (SS) formulas, generating actionable vendor purchase orders.
- **Academic Event Intelligence (Step 19)**: Maps university calendar milestones (midterms, finals, project submissions, practicals) to correlate and forecast stationery/printing demand surges.
- **Recommendation Engine (Step 20)**: Delivers collaborative and content-based item recommendations, "Buy Again", "Frequently Bought Together", and out-of-stock alternatives.
- **Student Planner & Notes (Step 21)**: Academic note-taking, task management, syllabus checklists, and 1-click shopping list conversion to cart.
- **GPS Telemetry & Routing (Step 22)**: Courier location tracking during active deliveries, route optimization, privacy boundaries, and automated coordinate purging.
- **Bulk & Class Orders (Step 23)**: Group buying system with volume discount tiers, shareable invite links, and coordinated campus distribution.
- **Reviews, Ratings & Offers (Step 24)**: Verified-buyer product reviews, promotional coupons with spend thresholds, and multi-shop discount rules.
- **Payment & Refund Architecture (Step 25)**: Authoritative payments, idempotent intent handling, Decimal-accurate partial/full refunds, and COD support.
- **Email OTP & Verification (Step 26A)**: Cryptographic SHA-256 OTP hashing, resend cooldowns, attempt caps, and zero plaintext exposure.
- **Security & Privacy Hardening (Step 26)**: Multi-tenant shop isolation, IDOR defenses, MIME magic-byte PDF validation, and automated document retention cleanups.
- **Analytics & BI Engine (Step 27)**: Platform-wide and shop-specific sales trajectories, Average Order Value (AOV), and customer cohort analytics.
- **Admin Reporting & CSV Exports (Step 28)**: 17 administrative report categories with streaming UTF-8 BOM CSV exports for Excel compatibility.
- **Comprehensive QA & Regression (Step 29)**: Complete integration validation (219 tests, 100% pass) with zero regressions and zero synthetic data.
- **Production Deployment Preparation (Step 30)**: Complete environment externalization, pre-flight audit command, Gunicorn/Nginx reverse proxy guides, and database backup runbooks.

---

## 🚀 Production Deployment Quickstart

### 1. Pre-Flight Configuration Audit
Before starting the web server, verify the configuration against production security standards:
```powershell
python manage.py validate_production
```

### 2. Static File Compilation
```powershell
python manage.py collectstatic --noinput
```

### 3. Frontend Production Compilation
```powershell
cd frontend
npm ci
npm run build
```

### 4. Health Check Verification
Verify operational status across database, storage, and ML services:
```powershell
curl -i http://127.0.0.1:8000/api/health/
```

For complete systemd service units, Nginx reverse proxy configuration, automated cron maintenance schedules, and database backup runbooks, consult the **[Production Deployment Guide](documentation/DEPLOYMENT.md)** and **[Production Checklist](documentation/PRODUCTION_CHECKLIST.md)**.

