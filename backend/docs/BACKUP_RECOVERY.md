# Backup & Disaster Recovery Runbook

**Project**: Smart Student Stationery Delivery System  
**System Architecture**: Django REST Framework + MySQL 8.0 + Media Storage + Vite React SPA  
**Audience**: DevOps Engineers, System Administrators, Compliance Officers  

---

## 1. Overview & Recovery Objectives

- **Recovery Point Objective (RPO)**: <= 1 Hour (Maximum acceptable data loss window)
- **Recovery Time Objective (RTO)**: <= 30 Minutes (Maximum acceptable downtime)
- **Scope**:
  - MySQL relational database (users, orders, payments, refunds, inventory, audit logs)
  - Persistent media storage (student printing PDFs, catalog product images)
  - Environment variables & cryptographic secrets (`.env`)
  - Machine learning models (`.joblib` regression demand weights)

---

## 2. MySQL Database Backup Procedures

### 2.1 Automated Daily Full Backup (`mysqldump`)
Run with single-transaction consistency to ensure zero table locking during operational peak campus hours:

```bash
# Set timestamp variable
BACKUP_DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/backups/smartstationery/mysql"
mkdir -p "$BACKUP_DIR"

# Execute consistent atomic dump with gzipped compression
mysqldump \
  --host=127.0.0.1 \
  --port=3306 \
  --user=stationery_user \
  --password="${DB_PASSWORD}" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  smart_stationery_db | gzip > "${BACKUP_DIR}/smart_stationery_db_${BACKUP_DATE}.sql.gz"

# Verify non-empty backup
if [ -s "${BACKUP_DIR}/smart_stationery_db_${BACKUP_DATE}.sql.gz" ]; then
    echo "[OK] Backup created successfully: ${BACKUP_DIR}/smart_stationery_db_${BACKUP_DATE}.sql.gz"
else
    echo "[CRITICAL] Backup failed or generated 0-byte file!" >&2
    exit 1
fi
```

### 2.2 Backup Rotation Schedule (Cron)
Add to system crontab (`crontab -e`):
```cron
# Full database backup every 6 hours
0 */6 * * * /opt/scripts/backup_mysql.sh >> /var/log/stationery_backup.log 2>&1

# Purge local database backups older than 30 days
0 3 * * * find /var/backups/smartstationery/mysql -type f -name "*.sql.gz" -mtime +30 -delete
```

---

## 3. Persistent Media & Document Backup

Student document uploads and product catalog images are stored under `media/`:
- `media/documents/`: Student PDFs uploaded for counter/doorstep printing.
- `media/products/`: Bookstore stationery product photography.

### 3.1 Incremental File Sync (Rsync to Remote Storage)
```bash
# Sync active media to encrypted backup volume
rsync -avz --delete \
  --exclude="*.tmp" \
  /opt/smart-stationery/media/ \
  backup-node:/encrypted-storage/smart-stationery-media/
```

### 3.2 Weekly Encrypted Media Snapshot
```bash
SNAPSHOT_DATE=$(date +"%Y%m%d")
tar -czf - /opt/smart-stationery/media/ | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -out "/var/backups/smartstationery/media_${SNAPSHOT_DATE}.tar.gz.enc"
```

---

## 4. Disaster Recovery & Restoration Walkthrough

### 4.1 Restoring MySQL Database from Dump
> [!CAUTION]
> Always verify database integrity on a secondary staging environment before restoring in production!

```bash
# 1. Stop backend application services to halt incoming writes
sudo systemctl stop gunicorn-smartstationery

# 2. Decompress desired backup
gunzip < /var/backups/smartstationery/mysql/smart_stationery_db_YYYYMMDD_HHMMSS.sql.gz > /tmp/restore.sql

# 3. Re-create clean target database with UTF8MB4 collation
mysql -u root -p -e "DROP DATABASE IF EXISTS smart_stationery_db; CREATE DATABASE smart_stationery_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 4. Import the dump
mysql -u stationery_user -p smart_stationery_db < /tmp/restore.sql

# 5. Clean up temporary uncompressed dump
rm -f /tmp/restore.sql

# 6. Verify Django migrations status
cd /opt/smart-stationery/backend
python manage.py showmigrations

# 7. Restart application service
sudo systemctl start gunicorn-smartstationery
```

### 4.2 Restoring Media Files
```bash
# Decrypt snapshot
openssl enc -d -aes-256-cbc -pbkdf2 -in /var/backups/smartstationery/media_YYYYMMDD.tar.gz.enc | tar -xzf - -C /
```

---

## 5. Migration Recovery & Rollback Procedure

If a database migration encounters an error during deployment:

```bash
# 1. Inspect migration status across all apps
python manage.py showmigrations

# 2. If a specific app needs rollback to a previous state:
python manage.py migrate users 0004_user_email_verified_emailverificationotp

# 3. If zero migrations need to be applied:
python manage.py migrate <app_name> zero

# 4. In case of schema drift without data loss:
python manage.py migrate --fake <app_name> <migration_number>
```

---

## 6. Environment Variables Recovery

If the production `.env` file is accidentally lost or corrupted:

1. Retrieve the encrypted `.env.vault` from the cold storage key vault.
2. If restoring manually, reference `.env.example` to ensure all 25 environment variables are re-configured with production values:
   - `SECRET_KEY` (Min 50 chars, cryptographically generated)
   - `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_NAME`
   - `PAYMENT_GATEWAY`, `PAYMENT_KEY_ID`, `PAYMENT_KEY_SECRET`, `PAYMENT_WEBHOOK_SECRET`
   - `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`
   - `CORS_ALLOWED_ORIGINS`
   - `SECURE_SSL_REDIRECT=True`
3. Execute Django deployment readiness check to validate the recovered configuration:
   ```bash
   python manage.py check --deploy
   ```
