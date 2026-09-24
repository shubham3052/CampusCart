# Smart Student Stationery & Printing Platform — Frontend Application

Modern, commercial-grade React frontend foundation for the **Smart Student Stationery Delivery System Using Demand Prediction and Intelligent Inventory Management**.

---

## 1. Overview & Architecture

Built with React 19, Vite, and modern Vanilla CSS (with CSS variables design tokens). Designed specifically for multi-role campus operations:
* **Students / Customers**: Mobile-first responsive store interface for fast stationery ordering, PDF assignment upload for instant xerox, and live order tracking with OTP verification.
* **Shop Owners / Merchants**: Desktop-first merchant portal with real-time sales overview, pending orders & print queue management, and inventory tracking.
* **Administrators / SuperAdmin**: Comprehensive platform oversight, multi-vendor management, user compliance, and system health monitoring.

---

## 2. Technology Stack

* **Core**: React.js 19, JavaScript (ES Modules), Vite 8
* **Routing**: React Router v7 (`react-router-dom`)
* **HTTP Client**: Axios with automatic JWT Bearer token injection and seamless 401 refresh token rotation
* **JWT Handling**: `jwt-decode`
* **Icons**: `lucide-react`
* **Charts & Visuals**: `chart.js` & `react-chartjs-2`
* **Styling**: Modern CSS design system (`src/styles/variables.css` & `src/styles/global.css`), glassmorphism cards, micro-animations, Inter & Plus Jakarta Sans typography.

---

## 3. Directory Structure

```text
frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── common/
│   │   │   ├── Badge.jsx            # Multi-color status badges & tags
│   │   │   ├── Button.jsx           # Buttons with variants, sizes & spinner loading
│   │   │   ├── Card.jsx             # Surface card with header, actions & hover
│   │   │   ├── ComingSoon.jsx       # Fallback placeholder for future steps
│   │   │   ├── ConfirmDialog.jsx    # Action confirmation dialogs
│   │   │   ├── DataTable.jsx        # Responsive data table with formatters
│   │   │   ├── EmptyState.jsx       # Empty dataset presentation
│   │   │   ├── ErrorMessage.jsx     # Friendly dismissable error banners
│   │   │   ├── Input.jsx            # Form input with icons & validation
│   │   │   ├── Loader.jsx           # Spinner, skeleton & full-page loaders
│   │   │   ├── Modal.jsx            # Backdrop modal with ESC listener
│   │   │   ├── PageHeader.jsx       # Standardized page title & actions
│   │   │   ├── SearchBar.jsx        # Search input with clear button
│   │   │   ├── Select.jsx           # Form select dropdown
│   │   │   └── StatCard.jsx         # SaaS metric cards with trends
│   │   └── navigation/
│   │       ├── Navbar.jsx           # Dashboard top header & status
│   │       └── Sidebar.jsx          # SaaS collapsible dark navigation sidebar
│   ├── context/
│   │   ├── AuthContext.jsx          # Centralized JWT authentication state
│   │   └── CartContext.jsx          # Shopping cart state (persisted)
│   ├── layouts/
│   │   ├── StudentLayout.jsx        # Mobile-first student interface with bottom nav
│   │   ├── ShopOwnerLayout.jsx      # Desktop-first merchant SaaS layout
│   │   └── AdminLayout.jsx          # Desktop-first platform administration layout
│   ├── pages/
│   │   ├── auth/
│   │   │   ├── Login.jsx            # Login with demo quick-fill credentials
│   │   │   ├── Register.jsx         # Multi-role student/merchant registration
│   │   │   └── ForgotPassword.jsx   # Password reset request flow
│   │   ├── student/
│   │   │   ├── StudentHome.jsx      # Campus delivery banner, search, quick xerox, popular stationery
│   │   │   ├── StudentShops.jsx     # Partner stationery & printing stores
│   │   │   ├── StudentCart.jsx      # Interactive cart with qty controls & fee summary
│   │   │   ├── StudentOrders.jsx    # Live order tracker with delivery OTP verification
│   │   │   └── StudentProfile.jsx   # Student profile & hostel room details
│   │   ├── shopOwner/
│   │   │   └── ShopOwnerDashboard.jsx # 5 StatCards, Chart.js revenue & orders, live queue
│   │   └── admin/
│   │       └── AdminDashboard.jsx   # 4 StatCards, user growth bar chart, status doughnut, top shops
│   ├── routes/
│   │   ├── AppRoutes.jsx            # Route tree with role redirects
│   │   ├── ProtectedRoute.jsx       # Authentication guard
│   │   └── RoleRoute.jsx            # RBAC route guard (STUDENT, SHOP_OWNER, ADMIN)
│   ├── services/
│   │   ├── api.js                   # Axios client with JWT refresh queue interceptor
│   │   └── authService.js           # Auth endpoints wrapper
│   ├── styles/
│   │   ├── variables.css            # Colors, spacing, shadows, typography tokens
│   │   └── global.css               # Reset, utility classes, card styling
│   ├── App.jsx
│   └── main.jsx
├── .env
├── package.json
└── vite.config.js
```

---

## 4. Environment Variables

Create or edit `.env` in the `frontend/` directory:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000/api
```

---

## 5. Prerequisites & Installation

### Prerequisites
* Node.js: `v18.0.0` or higher (verified with `v24.11.1`)
* npm: `v9.0.0` or higher (verified with `11.6.2`)
* Django backend running on `http://127.0.0.1:8000/`

### Installation
From the `frontend/` directory:
```bash
npm install
```

---

## 6. Running the Application

### Start Development Server
```bash
npm run dev
```
The application will launch on:
```text
http://localhost:5173
```

### Start Backend Server (in separate terminal)
```bash
cd ../backend
.\venv\Scripts\activate
python manage.py runserver 127.0.0.1:8000
```

---

## 7. Available User Roles & Demo Credentials

| Role | Email | Password | Allowed Dashboards / Routes |
| :--- | :--- | :--- | :--- |
| **Student** | `student@campus.edu` | `StudentPass123!` | `/student/*` (`/student/home`, `/student/shops`, `/student/cart`, `/student/orders`, `/student/profile`) |
| **Shop Owner** | `owner@campus.edu` | `OwnerPass123!` | `/shop-owner/*` (`/shop-owner/dashboard`, `/shop-owner/orders`, `/shop-owner/products`, `/shop-owner/inventory`, etc.) |
| **Admin** | `admin@campus.edu` | `AdminPass123!` | `/admin/*` (`/admin/dashboard`, `/admin/users`, `/admin/shops`, `/admin/reports`, etc.) |

*The Login page includes Quick Demo buttons that automatically populate these credentials with a single click.*

---

## 8. Authentication & RBAC Flow

1. **Login**: User submits credentials to `POST /api/auth/login/`.
2. **Token Storage**: Received `access_token` and `refresh_token` are saved in `localStorage`.
3. **Automatic Header**: Axios request interceptor attaches `Authorization: Bearer <token>` to all subsequent requests.
4. **Token Refresh**: If any request returns `401 Unauthorized`, the Axios response interceptor automatically invokes `POST /api/auth/token/refresh/` using the stored refresh token, updates the access token, and retries the original request without user interruption.
5. **Role Route Protection**:
   - `ProtectedRoute` verifies if the user is authenticated. If not, it redirects to `/login`.
   - `RoleRoute` verifies that `user.role` matches the route section (`STUDENT`, `SHOP_OWNER`, or `ADMIN`). If an unauthorized user attempts to access another role's dashboard (e.g., Shop Owner attempting to open `/admin/dashboard`), they are cleanly blocked and redirected to their own dashboard.
6. **Logout**: User triggers `logout()`, which blacklists the refresh token at `POST /api/auth/logout/` and clears all tokens and session state.

---

## 9. Troubleshooting

* **Backend Connection Refused**:
  Ensure Django is running: `http://127.0.0.1:8000/api/health/` should return `{"status": "ok"}`.
* **CORS Errors**:
  Verify `CORS_ALLOWED_ORIGINS` in `backend/config/settings.py` includes `http://localhost:5173` and `http://127.0.0.1:5173`.
* **Port Conflict**:
  If port 5173 is in use, start with `npm run dev -- --port 5174`. Update `VITE_API_BASE_URL` in `.env` if backend port changes.
