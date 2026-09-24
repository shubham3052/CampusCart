# PRODUCTION DEPLOYMENT & GO-LIVE CHECKLIST

**Project:** Smart Student Stationery Delivery System Using Demand Prediction and Intelligent Inventory Management  
**Release:** Step 30 — Production Deployment Preparation  
**Target:** Production Campus Infrastructure  

---

## 1. Environment & Server Infrastructure
- [ ] Operating System packages updated (`python3.11`, `mysql-server`, `nginx`, `certbot`).
- [ ] Dedicated system user created (`www-data` / `stationery`).
- [ ] Environment file `.env` created from `.env.example` with cryptographically secure credentials.
- [ ] `DEBUG` explicitly set to `False`.
- [ ] `SECRET_KEY` generated with high entropy (>50 characters, no `django-insecure-` prefix).
- [ ] `ALLOWED_HOSTS` configured with exact domain names (`api.smartstationery.campus.edu`, `smartstationery.campus.edu`).
- [ ] Reverse proxy protocol header configured (`USE_X_FORWARDED_PROTO=True`).

---

## 2. Database & Migrations
- [ ] MySQL 8.0 server installed, secured, and running with `utf8mb4` encoding.
- [ ] Database user permissions restricted to target schema only.
- [ ] `python manage.py makemigrations --check` reports **No changes detected**.
- [ ] `python manage.py migrate --plan` executed with no unexpected schema operations.
- [ ] All database migrations applied successfully with `python manage.py migrate --noinput`.
- [ ] Automated database backup cron job active (`mysqldump` with compression and retention).

---

## 3. Network, DNS & HTTPS Security
- [ ] DNS A and CNAME records pointing to production server IP.
- [ ] SSL/TLS certificate installed via Let's Encrypt / Certbot.
- [ ] HTTP port 80 permanently redirected to HTTPS port 443.
- [ ] HSTS enabled (`SECURE_HSTS_SECONDS=31536000`, subdomains included).
- [ ] Cookie security enabled (`SESSION_COOKIE_SECURE=True`, `CSRF_COOKIE_SECURE=True`).
- [ ] HTTPOnly flags set for session cookies.
- [ ] Security headers active (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).

---

## 4. Cross-Origin (CORS) & CSRF Protection
- [ ] `CORS_ALLOW_ALL_ORIGINS` is `False`.
- [ ] `CORS_ALLOWED_ORIGINS` restricted to verified frontend domains.
- [ ] `CSRF_TRUSTED_ORIGINS` configured with HTTPS schemes.
- [ ] Credentials allowed for authenticated API interactions.

---

## 5. Authentication, OTP & Role-Based Access Control (RBAC)
- [ ] JWT authentication configured with RS256/HS256 signature verification.
- [ ] Access token lifetime set to 60 minutes; refresh token lifetime 7 days with rotation.
- [ ] Token blacklist enabled (`rest_framework_simplejwt.token_blacklist`).
- [ ] Server-side role protection active: client-supplied `role="ADMIN"` strictly sanitized.
- [ ] Email OTP SHA-256 cryptographic hashing active (zero plaintext OTP storage).
- [ ] OTP attempt caps (max 5) and resend rate cooldown (60s) enforced.

---

## 6. Payment & Financial Integrity
- [ ] `PAYMENT_GATEWAY` configured with live Razorpay/Stripe API keys (or explicit sandbox mode).
- [ ] Webhook signature verification secret configured.
- [ ] Zero credit card numbers or CVVs stored in database.
- [ ] Idempotency keys enforced on payment capture and refund requests.
- [ ] Monetary arithmetic uses Python `Decimal` with 2 decimal places.

---

## 7. Email & Communication
- [ ] SMTP credentials configured with verified campus domain / transactional email provider.
- [ ] `DEFAULT_FROM_EMAIL` set to valid campus sender.
- [ ] Email delivery failure handled gracefully without 500 error cascades.
- [ ] Zero email credentials or OTP values leaked to logs.

---

## 8. Static Assets & Media File Storage
- [ ] Static files compiled via `python manage.py collectstatic --noinput`.
- [ ] Nginx configured to serve `/static/` directly with 30-day cache headers.
- [ ] Media root directory (`MEDIA_ROOT`) configured with appropriate directory permissions (`chmod 750`).
- [ ] MIME magic byte validation enforced on uploaded PDFs (`%PDF-`).
- [ ] Dangerous file extensions rejected.
- [ ] Direct directory indexing disabled on `/media/`.
- [ ] Automated document purge cron job active (`cleanup_expired_documents`).

---

## 9. Machine Learning & Demand Prediction
- [ ] Serialized demand models present in `ml/models/saved/` or fallback mechanisms verified.
- [ ] Zero future data leakage in training/prediction time windows.
- [ ] Safe fallback values when sales history is insufficient (zero synthetic data).
- [ ] Smart Purchase Advisor EOQ and ROP mathematical calculations verified.
- [ ] Daily purchase recommendation generation scheduled via cron.

---

## 10. Inventory & Order Management
- [ ] Atomic stock reservation on checkout via `select_for_update()`.
- [ ] Negative inventory prevention enforced at model and database layer.
- [ ] Immutable stock transaction ledger active (`InventoryTransaction`).
- [ ] Multi-tenant cross-shop isolation verified (no shopkeeper access to peer inventory/orders).

---

## 11. Delivery, Pickup & GPS Privacy
- [ ] Pickup slot capacity limits and scheduling verified.
- [ ] Cryptographic pickup and delivery OTP handshakes required to complete orders.
- [ ] Courier GPS tracking restricted to `OUT_FOR_DELIVERY` transit window.
- [ ] GPS noise and unrealistic displacement filtered.
- [ ] Automated GPS coordinate retention cleanup job scheduled (`cleanup_old_locations`).

---

## 12. Frontend SPA Application
- [ ] Production build compiled cleanly with Vite (`npm run build`).
- [ ] Static linter checks pass (`npm run lint` with 0 errors).
- [ ] `VITE_API_BASE_URL` points to production backend API domain.
- [ ] Responsive UI verified across mobile, tablet, and desktop breakpoints.
- [ ] Error boundaries and offline/network failure banners operational.

---

## 13. Logging, Monitoring & Health Checks
- [ ] Enterprise rotating file loggers active (`django.log`, `security.log`).
- [ ] Health check endpoint `/api/health/` verified (reports DB, storage, ML readiness).
- [ ] Zero passwords, tokens, or PII exposed in application logs.
- [ ] Production pre-flight audit passes: `python manage.py validate_production`.
- [ ] Deployment check clean: `python manage.py check --deploy`.

---

## 14. Smoke Testing & Rollback Runbook
- [ ] Student registration, OTP verification, and JWT login verified.
- [ ] Stationery cart checkout and order placement verified.
- [ ] Xerox PDF upload, price calculation, and print queue verified.
- [ ] Order fulfillment, courier assignment, and OTP verification verified.
- [ ] Admin dashboard, analytics KPIs, and CSV report export verified.
- [ ] Rollback strategy verified: database snapshot restore and previous release symlink switch.
