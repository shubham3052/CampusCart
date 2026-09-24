-- ==============================================================================
-- Project: Smart Student Stationery Delivery System
-- Step 3: Database & Dedicated User Initialization Script
-- ==============================================================================

-- 1. Create the Database with Full Unicode (utf8mb4) support
CREATE DATABASE IF NOT EXISTS smart_stationery_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

-- 2. Create a Dedicated Application User (Security Best Practice: Do not use root)
-- Note: Replace 'your_database_password' with your desired secure password
CREATE USER IF NOT EXISTS 'stationery_user'@'localhost' 
IDENTIFIED WITH mysql_native_password BY 'your_database_password';

-- Fallback for MySQL 8.0 caching_sha2_password:
ALTER USER 'stationery_user'@'localhost' 
IDENTIFIED WITH mysql_native_password BY 'your_database_password';

-- 3. Grant Scoped Privileges strictly on the project database
GRANT ALL PRIVILEGES ON smart_stationery_db.* TO 'stationery_user'@'localhost';

-- 4. Apply privilege changes
FLUSH PRIVILEGES;

-- 5. Verification Queries
SHOW DATABASES LIKE 'smart_stationery_db';

SELECT 
    SCHEMA_NAME AS `Database`, 
    DEFAULT_CHARACTER_SET_NAME AS `Charset`, 
    DEFAULT_COLLATION_NAME AS `Collation`
FROM information_schema.SCHEMATA 
WHERE SCHEMA_NAME = 'smart_stationery_db';
