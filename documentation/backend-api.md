# Backend REST API Documentation
**Smart Student Stationery Delivery System Using Demand Prediction and Intelligent Inventory Management**

---

## 1. Overview & Architecture

The Smart Student Stationery Delivery System backend is built with **Django 5.1**, **Django REST Framework (DRF)**, **MySQL 8.0**, and **SimpleJWT** for stateless JWT authentication with token blacklisting and role-based access control (RBAC).

- **Base API URL:** `http://127.0.0.1:8000/api/`
- **Interactive Swagger UI:** `http://127.0.0.1:8000/api/docs/`
- **ReDoc Interactive UI:** `http://127.0.0.1:8000/api/redoc/`
- **OpenAPI 3.0 Schema (JSON/YAML):** `http://127.0.0.1:8000/api/schema/`
- **Health Check Endpoint:** `http://127.0.0.1:8000/api/health/`

---

## 2. Environment Setup & Starting Django

### Prerequisites
- Python 3.11+
- MySQL 8.0 running locally on port 3306 (`smart_stationery_db`)
- Virtual environment at `smart-stationery/backend/venv`

### Starting the Server
Open Windows PowerShell:
```powershell
# 1. Move into backend directory
cd backend

# 2. Activate Virtual Environment
.\venv\Scripts\Activate.ps1

# 3. Ensure database schema is migrated
python manage.py migrate

# 4. Start the development server
python manage.py runserver 127.0.0.1:8000
```

---

## 3. Authentication & JWT Architecture

Authentication uses cryptographic JSON Web Tokens (JWT) adhering to RFC 7519:
- **Access Token:** Lifetime of **60 minutes**. Included in request headers as:  
  `Authorization: Bearer <access_token>`
- **Refresh Token:** Lifetime of **7 days**. Used to obtain a new access token without re-prompting the user.
- **Token Rotation:** Every refresh invalidates the previous refresh token and issues a new one.
- **Token Blacklisting:** On `POST /api/auth/logout/`, the refresh token's unique identifier (`jti`) is stored in the database blacklist table. Future refresh attempts using blacklisted tokens are rejected with `401 Unauthorized`.

---

## 4. User Roles & Permission Hierarchy

| Role Code | Name | Target Persona | Access Level |
| :--- | :--- | :--- | :--- |
| `STUDENT` | Student / Customer | University Students | Browse shops and products, create stationery and printing orders, upload documents, view own order progress, manage personal study notes, academic tasks, and shopping lists. Cannot modify products, inventory, or order status. |
| `SHOP_OWNER` | Shop Owner | Campus Stationery & Print Vendors | Manage their own shop details, manage products in their shop, view orders placed at their shop, update order lifecycle status, manage print queue and pickup slots, adjust stock levels. Strictly isolated from other shops. |
| `ADMIN` | System Administrator | Platform Administrators | Global oversight across all shops, users, platform inventory, academic calendars, reports, and system settings. |

---

## 5. API Response Standardization

All responses adhere to standardized JSON formats.

### Success Response Format
```json
{
  "success": true,
  "message": "<Description of completed action>",
  "data": { ... }
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "<Human-readable error description>",
  "errors": {
    "<field_name>": [ "<Detailed error message>" ]
  }
}
```

---

## 6. Complete Endpoint Reference

### 6.1 System & Health Check
#### `GET /api/health/`
- **Auth:** None (Public)
- **Description:** Verifies operational readiness of backend server and database.
- **Response (`200 OK`):**
  ```json
  {
    "status": "ok",
    "message": "Smart Stationery API is running"
  }
  ```

---

### 6.2 Authentication Endpoints (`/api/auth/`)

#### `POST /api/auth/register/`
- **Auth:** None (Public)
- **Description:** Register a new Student or Shop Owner account. Public registration as `ADMIN` is strictly rejected.
- **Request Body:**
  ```json
  {
    "name": "Rahul Verma",
    "email": "rahul.verma@campus.edu",
    "phone": "9876543210",
    "password": "SecurePassword123!",
    "role": "STUDENT",
    "college_id": "CS2026-104",
    "department": "Computer Science",
    "hostel_block": "Block B",
    "room_number": "314"
  }
  ```
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "User registered successfully!",
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 14,
      "name": "Rahul Verma",
      "email": "rahul.verma@campus.edu",
      "phone": "9876543210",
      "role": "STUDENT"
    }
  }
  ```

#### `POST /api/auth/login/`
- **Auth:** None (Public)
- **Description:** Authenticates with email and password. Returns JWT access & refresh tokens.
- **Request Body:**
  ```json
  {
    "email": "rahul.verma@campus.edu",
    "password": "SecurePassword123!"
  }
  ```
- **Response (`200 OK`):**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 14,
      "name": "Rahul Verma",
      "email": "rahul.verma@campus.edu",
      "phone": "9876543210",
      "role": "STUDENT",
      "college_id": "CS2026-104",
      "department": "Computer Science"
    }
  }
  ```

#### `POST /api/auth/token/refresh/`
- **Auth:** None (Valid Refresh Token Required)
- **Description:** Obtains a fresh access token using a valid refresh token.
- **Request Body:** `{"refresh": "<refresh_token>"}`
- **Response (`200 OK`):**
  ```json
  {
    "access": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```

#### `GET /api/auth/me/`
- **Auth:** Bearer Token (`IsAuthenticated`)
- **Description:** Returns profile metadata of currently authenticated user.
- **Response (`200 OK`):**
  ```json
  {
    "id": 14,
    "name": "Rahul Verma",
    "email": "rahul.verma@campus.edu",
    "role": "STUDENT",
    "phone": "9876543210",
    "college_id": "CS2026-104",
    "department": "Computer Science",
    "hostel_block": "Block B",
    "room_number": "314"
  }
  ```

#### `POST /api/auth/logout/`
- **Auth:** Bearer Token (`IsAuthenticated`)
- **Description:** Revokes and blacklists refresh token in MySQL database.
- **Request Body:** `{"refresh": "<refresh_token>"}`
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Logged out successfully. The refresh token has been blacklisted."
  }
  ```

---

### 6.3 Shops (`/api/shops/`)

- `GET /api/shops/` — Browse active campus stationery/print shops (Public).
- `GET /api/shops/{id}/` — Shop details including opening hours and rating.
- `POST /api/shops/` — Create shop (`SHOP_OWNER` without a shop or `ADMIN`).
- `PATCH /api/shops/{id}/` — Update shop settings (`OWN SHOP ONLY` or `ADMIN`).
- `DELETE /api/shops/{id}/` — Deactivate/delete shop (`ADMIN` only).

---

### 6.4 Products (`/api/products/`)

- `GET /api/products/` — Browse product catalog. Supports filters: `?search=pen`, `?category=1`, `?shop=2`, `?is_active=true`.
- `GET /api/products/{id}/` — Product details including stock availability and category.
- `POST /api/products/` — Create new product (`OWN SHOP ONLY` or `ADMIN`). Auto-generates slug. Validates price >= 0, name required, shop active.
- `PATCH /api/products/{id}/` — Update product (`OWN SHOP ONLY` or `ADMIN`).
- `DELETE /api/products/{id}/` — Delete product (`OWN SHOP ONLY` or `ADMIN`).

---

### 6.5 Inventory (`/api/inventory/`)

- `GET /api/inventory/` — View inventory (`OWN SHOP ONLY` or `ADMIN`). Supports `?status=low` (stock <= threshold) and `?status=out` (stock = 0).
- `POST /api/inventory/{id}/adjust-stock/` — Atomically increment or decrement stock.
  - **Permissions:** `IsShopOwner` (for their own shop) or `IsAdmin`.
  - **Negative Stock Protection:** Rejects any decrement that would result in stock < 0 with `400 Bad Request`.
  - **Request Body:**
    ```json
    {
      "quantity_change": 25,
      "transaction_type": "RESTOCK",
      "notes": "Weekly stationery delivery"
    }
    ```

---

### 6.6 Orders (`/api/orders/`)

- `GET /api/orders/` — Scoped order list:
  - `STUDENT`: Views only their own orders.
  - `SHOP_OWNER`: Views only orders placed at their shop.
  - `ADMIN`: Views all orders platform-wide.
- `GET /api/orders/{id}/` — Order details. Cross-user or cross-shop unauthorized access returns `404 Not Found` / `403 Forbidden`.
- `POST /api/orders/` — Place order.
  - **Server-Side Price Calculation:** Backend computes subtotal and total using database prices. Never trusts client prices.
  - **Atomic Stock Deduction:** Decrements stock and logs `InventoryTransaction`.
  - **OTP Generation:** Automatically creates secure 6-digit verification code.
  - **Request Body:**
    ```json
    {
      "shop": 1,
      "fulfillment_type": "PICKUP",
      "pickup_slot": 3,
      "items": [
        {"product_id": 10, "quantity": 2},
        {"product_id": 14, "quantity": 1}
      ]
    }
    ```
- `PATCH /api/orders/{id}/` — Update order status.
  - **Valid Transitions:** `PENDING` -> `CONFIRMED` -> `PREPARING` -> `READY` -> `PICKED_UP` / `DELIVERED` -> `COMPLETED`.
  - Students cannot modify status once placed (`403 Forbidden`).
  - Invalid state jumps (e.g. `COMPLETED` -> `PENDING`) are rejected (`400 Bad Request`).
- `POST /api/orders/{id}/verify-otp/` — Verifies OTP code on customer pickup or delivery.
  - Allowed only for the shop owner, assigned delivery agent, or admin.
  - Marks order as `PICKED_UP` or `DELIVERED`.

---

### 6.7 Printing Queue (`/api/printing/`)

- `GET /api/printing/` — Print jobs (Students view their own; Shop Owners view queue for their shop).
- `POST /api/printing/{id}/upload-document/` — Upload PDF/DOCX document to print order (`multipart/form-data`).
  - Allowed only for the ordering student or admin.
- Validates: `total_pages >= 1`, `copies >= 1`, `price >= 0`.

---

### 6.8 Pickup Slots (`/api/pickup-slots/`)

- `GET /api/pickup-slots/` — Browse pickup slots. Supports `?shop=1`, `?available=true`.
- `POST /api/pickup-slots/` — Create counter pickup slots (`OWN SHOP ONLY` or `ADMIN`).
- **Capacity Enforcement:** Orders submitted for a slot where `booked_count >= capacity` are rejected with `400 Bad Request`.

---

### 6.9 Deliveries (`/api/deliveries/`)

- `GET /api/deliveries/` — Track deliveries.
- `PATCH /api/deliveries/{id}/` — Update delivery progress (`OUT_FOR_DELIVERY`, `DELIVERED`).
  - Allowed only for assigned `DELIVERY_AGENT` or `ADMIN`.

---

### 6.10 Personal Student Tools

#### Student Notes (`/api/notes/`)
- `GET /api/notes/` — Scoped strictly to `student=request.user`.
- `POST /api/notes/` — Create study note or reminder (`student` auto-bound).
- `PATCH /api/notes/{id}/` — Pin or update note.
- `DELETE /api/notes/{id}/` — Delete note.

#### Student Tasks (`/api/tasks/`)
- `GET /api/tasks/` — Scoped strictly to `student=request.user`.
- `POST /api/tasks/` — Create academic task/to-do item.
- `PATCH /api/tasks/{id}/` — Mark task complete (`{"completed": true}`).

#### Shopping Lists (`/api/shopping-lists/`)
- `GET /api/shopping-lists/` — View personal saved lists.
- `POST /api/shopping-lists/` — Create shopping list.
- `POST /api/shopping-lists/{id}/add-item/` — Add product and quantity.
- `POST /api/shopping-lists/{id}/update-item/` — Update quantity or toggle checkbox.
- `POST /api/shopping-lists/{id}/remove-item/` — Remove item from list.
- `POST /api/shopping-lists/{id}/convert-to-order/` — Converts checked items into order batches grouped by shop.

---

### 6.11 Academic Calendar (`/api/academic/`)

- `GET /api/academic/` — View semester events, exams, and deadlines (Public).
- `POST /api/academic/` — Create academic event (`ADMIN` only).
- **Supported Event Types:**
  - `SEMESTER_START`
  - `ASSIGNMENT`
  - `INTERNAL_EXAM`
  - `FINAL_EXAM`
  - `PROJECT_SUBMISSION`
  - `PRACTICAL`
  - `HOLIDAY`
  - `COLLEGE_EVENT`

---

### 6.12 Demand Predictions & Recommendations

- `GET /api/demand-predictions/` — Forecasted sales volume per product/target date (`SHOP_OWNER` for their shop, `ADMIN`).
- `GET /api/recommendations/shop-restock/` — Smart restock suggestions based on upcoming academic events and stockouts (`SHOP_OWNER` for their shop, `ADMIN`).

---

## 7. Testing Instructions

To run the complete verification suite:

```powershell
cd backend
.\venv\Scripts\Activate.ps1

# 1. Run Django Automated Test Suite (In-Memory Isolated SQLite)
python manage.py test

# 2. Run Comprehensive Master Suite (Live MySQL 8.0 & All 15 Feature Areas)
python test_step8_comprehensive.py

# 3. Run Step 7 RBAC Security Suite
python test_auth_rbac.py

# 4. Verify OpenAPI Schema Export
python manage.py spectacular --file schema.yml
```
