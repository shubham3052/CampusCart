# PRODUCTION DEPLOYMENT GUIDE

**Project:** Smart Student Stationery Delivery System Using Demand Prediction and Intelligent Inventory Management  
**Architecture:** Distributed Campus Multi-Tier Web Application  
**Target Environment:** Linux (Ubuntu 22.04 / 24.04 LTS recommended), Nginx, Gunicorn, Python 3.11+, Node.js 20+, MySQL 8.0+

---

## 1. System Architecture Overview

```text
[ Campus Students / Shopkeepers / Administrators ]
                     │ HTTPS (Port 443)
                     ▼
             [ NGINX Reverse Proxy ]
         ┌───────────┴───────────┐
         │ (Static Assets & SPA) │ (API Requests /api/*)
         ▼                       ▼
  [ /var/www/frontend ]   [ Gunicorn WSGI Socket ]
                                 │
                                 ▼
                     [ Django REST Framework ]
                      (Python 3.11 Virtualenv)
                     ┌───────────┴───────────┐
                     ▼                       ▼
             [ MySQL 8.0 InnoDB ]   [ /var/www/media ]
             (Strict SQL Mode)      (Encrypted/Private Storage)
```

---

## 2. Server Prerequisites & Operating System Packages

### 2.1 Base System Installation (Ubuntu/Debian)
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3.11-dev \
    build-essential libmysqlclient-dev pkg-config \
    nginx mysql-server certbot python3-certbot-nginx \
    curl git cron
```

### 2.2 Node.js 20+ LTS (for Frontend Compilation)
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v # Verify v20+
npm -v
```

---

## 3. Database Setup (MySQL 8.0)

### 3.1 MySQL Hardening & Database Creation
```bash
sudo mysql_secure_installation
```

Log in to MySQL as root:
```sql
-- Connect to MySQL
sudo mysql -u root -p

-- Create Dedicated Database with utf8mb4 collation
CREATE DATABASE smart_stationery_db 
    CHARACTER SET utf8mb4 
    COLLATE utf8mb4_unicode_ci;

-- Create Restricted Production User (replace with cryptographically strong password)
CREATE USER 'stationery_prod_user'@'localhost' IDENTIFIED BY 'STRICT_PROD_DB_PASSWORD_2026!';

-- Grant required schema manipulation and DDL/DML privileges
GRANT ALL PRIVILEGES ON smart_stationery_db.* TO 'stationery_prod_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Backend Deployment Steps

### 4.1 Clone Repository & Set Up File Hierarchy
```bash
sudo mkdir -p /var/www/smart-stationery
sudo chown -R $USER:$USER /var/www/smart-stationery
git clone <repository_url> /var/www/smart-stationery
cd /var/www/smart-stationery/backend
```

### 4.2 Python Virtual Environment & Dependencies
```bash
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
pip install gunicorn
```

### 4.3 Environment Variable Configuration
Copy the template and configure your production environment:
```bash
cp .env.example .env
nano .env
```

Set the following production values:
```ini
DEBUG=False
SECRET_KEY=YOUR_50_CHAR_CRYPTOGRAPHICALLY_RANDOM_PRODUCTION_KEY
ALLOWED_HOSTS=api.smartstationery.campus.edu,smartstationery.campus.edu

# SSL / HTTPS Configuration
SECURE_SSL_REDIRECT=True
SECURE_HSTS_SECONDS=31536000
USE_X_FORWARDED_PROTO=True

# CORS & CSRF
CORS_ALLOWED_ORIGINS=https://smartstationery.campus.edu
CSRF_TRUSTED_ORIGINS=https://smartstationery.campus.edu

# Database (MySQL 8.0)
DB_NAME=smart_stationery_db
DB_USER=stationery_prod_user
DB_PASSWORD=STRICT_PROD_DB_PASSWORD_2026!
DB_HOST=127.0.0.1
DB_PORT=3306

# Storage Paths
MEDIA_ROOT=/var/www/smart-stationery/media/
STATIC_ROOT=/var/www/smart-stationery/backend/staticfiles/

# Centralized SMTP Email
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_HOST_USER=postmaster@smartstationery.campus.edu
EMAIL_HOST_PASSWORD=YOUR_SMTP_SECRET_KEY
EMAIL_USE_TLS=True
DEFAULT_FROM_EMAIL=Smart Student Stationery <no-reply@smartstationery.campus.edu>

# Payment Gateway (RAZORPAY or STRIPE)
PAYMENT_GATEWAY=RAZORPAY
PAYMENT_KEY_ID=rzp_live_YOUR_LIVE_KEY_ID
PAYMENT_KEY_SECRET=YOUR_LIVE_KEY_SECRET
PAYMENT_WEBHOOK_SECRET=YOUR_LIVE_WEBHOOK_SECRET
PAYMENT_CURRENCY=INR
```

### 4.4 Database Migrations & Static File Collection
```bash
# Run pre-flight configuration audit
python manage.py validate_production

# Apply database migrations
python manage.py migrate --noinput

# Collect production static assets
python manage.py collectstatic --noinput

# Verify system deployment readiness
python manage.py check --deploy
```

---

## 5. Frontend Deployment Steps

### 5.1 Compilation & Build
```bash
cd /var/www/smart-stationery/frontend
cp .env.example .env
# Set: VITE_API_BASE_URL=https://api.smartstationery.campus.edu/api
npm ci
npm run build
```
Compiled production artifacts will be placed in `/var/www/smart-stationery/frontend/dist/`.

---

## 6. Gunicorn & Systemd Service Configuration

### 6.1 Gunicorn Systemd Unit
Create `/etc/systemd/system/smart-stationery.service`:
```ini
[Unit]
Description=Gunicorn daemon for Smart Student Stationery Delivery System
After=network.target mysql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/smart-stationery/backend
EnvironmentFile=/var/www/smart-stationery/backend/.env
ExecStart=/var/www/smart-stationery/backend/venv/bin/gunicorn \
          --workers 4 \
          --threads 2 \
          --timeout 60 \
          --bind unix:/run/smart-stationery.sock \
          config.wsgi:application

Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### 6.2 Start and Enable Gunicorn
```bash
sudo systemctl daemon-reload
sudo systemctl start smart-stationery
sudo systemctl enable smart-stationery
sudo systemctl status smart-stationery
```

---

## 7. Nginx Reverse Proxy & SSL (HTTPS) Configuration

Create `/etc/nginx/sites-available/smartstationery`:
```nginx
# Upstream Gunicorn socket
upstream backend_app {
    server unix:/run/smart-stationery.sock fail_timeout=0;
}

# HTTP Redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name smartstationery.campus.edu api.smartstationery.campus.edu;
    return 301 https://$host$request_uri;
}

# Main Application Server (HTTPS)
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name smartstationery.campus.edu;

    ssl_certificate /etc/letsencrypt/live/smartstationery.campus.edu/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/smartstationery.campus.edu/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Security Headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Maximum file upload size (PDF assignments, print documents)
    client_max_body_size 25M;

    # Frontend Single Page Application (Vite/React)
    root /var/www/smart-stationery/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static Assets Cache
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Django Admin Static Files
    location /static/ {
        alias /var/www/smart-stationery/backend/staticfiles/;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # Protected Media Storage
    location /media/ {
        alias /var/www/smart-stationery/media/;
        internal; # Protect from direct unauthenticated indexing
    }

    # Backend API Routing
    location /api/ {
        proxy_pass http://backend_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }

    # Django Admin Interface
    location /admin/ {
        proxy_pass http://backend_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }
}
```

Enable site and restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/smartstationery /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 8. Automated Scheduled Maintenance (Cron Jobs)

Set up periodic cron tasks for the `www-data` user:
```bash
sudo crontab -u www-data -e
```

Add the following maintenance schedule:
```cron
# Path to environment and Python executable
PYTHON=/var/www/smart-stationery/backend/venv/bin/python
MANAGE=/var/www/smart-stationery/backend/manage.py

# 1. Clean up expired print documents (Daily at 02:00 AM)
0 2 * * * $PYTHON $MANAGE cleanup_expired_documents >> /var/www/smart-stationery/backend/logs/cron.log 2>&1

# 2. Clean up stale courier GPS tracking coordinates older than 7 days (Daily at 02:30 AM)
30 2 * * * $PYTHON $MANAGE cleanup_old_locations >> /var/www/smart-stationery/backend/logs/cron.log 2>&1

# 3. Send academic milestone reminders for upcoming exams/presentations (Daily at 08:00 AM)
0 8 * * * $PYTHON $MANAGE send_academic_event_reminders >> /var/www/smart-stationery/backend/logs/cron.log 2>&1

# 4. Generate daily purchase recommendations via Smart Purchase Advisor (Daily at 06:00 AM)
0 6 * * * $PYTHON $MANAGE generate_purchase_recommendations >> /var/www/smart-stationery/backend/logs/cron.log 2>&1

# 5. Flush expired JWT blacklisted tokens (Weekly on Sunday at 03:00 AM)
0 3 * * 0 $PYTHON $MANAGE flushexpiredtokens >> /var/www/smart-stationery/backend/logs/cron.log 2>&1
```

---

## 9. Database Backup & Disaster Recovery Runbook

### 9.1 Automated Backup Script (`/usr/local/bin/backup_stationery_db.sh`)
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/smart-stationery/mysql"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="smart_stationery_db"
RETENTION_DAYS=14

mkdir -p $BACKUP_DIR
mysqldump --single-transaction --quick --routines --triggers -u stationery_prod_user -pSTRICT_PROD_DB_PASSWORD_2026! $DB_NAME | gzip > "$BACKUP_DIR/${DB_NAME}_${DATE}.sql.gz"

# Retention enforcement: delete backups older than 14 days
find $BACKUP_DIR -type f -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
```

Make executable and schedule in root crontab:
```bash
sudo chmod +x /usr/local/bin/backup_stationery_db.sh
# Run daily at 01:00 AM
0 1 * * * /usr/local/bin/backup_stationery_db.sh
```

### 9.2 Restoration Procedure
```bash
# Decompress and restore to MySQL
gunzip < /var/backups/smart-stationery/mysql/smart_stationery_db_20260906_010000.sql.gz | mysql -u stationery_prod_user -p smart_stationery_db
```

---

## 10. Health Check & Smoke Testing Verification

1. **Verify Health Check Endpoint:**
   ```bash
   curl -i https://smartstationery.campus.edu/api/health/
   ```
   *Expected Response:*
   ```json
   HTTP/2 200
   {
       "status": "healthy",
       "service": "Smart Stationery API",
       "database": "connected",
       "storage": "accessible",
       "ml_engine": "ready"
   }
   ```

2. **Verify Static Asset Delivery:**
   ```bash
   curl -I https://smartstationery.campus.edu/static/admin/css/base.css
   ```
   *Expected Response:* `HTTP/2 200 OK`

3. **Verify API Docs (Swagger):**
   ```bash
   curl -I https://smartstationery.campus.edu/api/docs/
   ```
   *Expected Response:* `HTTP/2 200 OK`
