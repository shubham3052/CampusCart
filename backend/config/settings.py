"""
Django settings for Smart Student Stationery Delivery System (config).
"""

from pathlib import Path
import os
from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BASE_DIR.parent

import sys
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Load environment variables from backend/.env (override=True ensures changes reload)
load_dotenv(BASE_DIR / '.env', override=True)

# Security Settings
DEBUG = os.environ.get('DEBUG', 'True').strip().lower() in ('true', '1', 'yes')

SECRET_KEY = os.environ.get('SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-smart-stationery-default-development-key-2026-campus-auth'
    else:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured("SECRET_KEY environment variable must be set in production mode (DEBUG=False).")
elif not DEBUG and (SECRET_KEY.startswith('django-insecure-') or len(SECRET_KEY) < 50):
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured("SECRET_KEY is insecure or shorter than 50 characters in production mode.")

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1,192.168.1.21,192.168.1.23').split(',')
    if host.strip()
] + ['testserver']

# In development mode, dynamically auto-discover local hostnames and LAN IPs
if DEBUG:
    try:
        import socket
        _hostname = socket.gethostname()
        if _hostname not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_hostname)
        for _discovered_ip in socket.gethostbyname_ex(_hostname)[2]:
            if _discovered_ip not in ALLOWED_HOSTS:
                ALLOWED_HOSTS.append(_discovered_ip)
    except Exception:
        pass
    for _fallback_ip in ['192.168.1.21', '192.168.1.23']:
        if _fallback_ip not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(_fallback_ip)

# Environment-aware SSL & HTTPS Settings (Step 26 & 30)
ENABLE_HTTPS_REDIRECT = os.environ.get('SECURE_SSL_REDIRECT', 'False').strip().lower() in ('true', '1', 'yes')

if not DEBUG and ENABLE_HTTPS_REDIRECT:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', 31536000))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SECURE_HSTS_SECONDS = 0

if os.environ.get('USE_X_FORWARDED_PROTO', 'False').strip().lower() in ('true', '1', 'yes'):
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# Security Headers & Cookie Policies (Active in both Dev & Prod)
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SESSION_COOKIE_HTTPONLY = True
CSRF_COOKIE_HTTPONLY = False  # Allows frontend SPA to read CSRF token
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SAMESITE = 'Lax'

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-Party Packages
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',

    # Project Domain Apps
    'users',
    'shops',
    'products',
    'inventory',
    'orders',
    'printing',
    'delivery',
    'academics',
    'predictions',
    'notifications',
    'recommendations',
    'analytics',
    'reports',
    'platform_owner',
]

# Custom User Model
AUTH_USER_MODEL = 'users.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',  # Must precede CommonMiddleware
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database Configuration (MySQL 8.0)
DB_OPTIONS = {
    'charset': 'utf8mb4',
    'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
}

# SSL/TLS configuration for remote cloud databases (e.g., Aiven MySQL)
DB_SSL_REQUIRED = os.environ.get('DB_SSL_REQUIRED', 'False').strip().lower() in ('true', '1', 'yes')
DB_SSL_CA = os.environ.get('DB_SSL_CA', '').strip()

if DB_SSL_REQUIRED:
    ssl_config = {}
    if DB_SSL_CA and os.path.isfile(DB_SSL_CA):
        ssl_config['ca'] = DB_SSL_CA
    else:
        ssl_config['check_hostname'] = False
    DB_OPTIONS['ssl'] = ssl_config

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ.get('DB_NAME', 'smart_stationery_db'),
        'USER': os.environ.get('DB_USER', 'stationery_user'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('DB_PORT', '3306'),
        'OPTIONS': DB_OPTIONS,
    }
}

# Test database isolation: use fast in-memory SQLite when running manage.py test
import sys
if 'test' in sys.argv:
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    }

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Media files (Student Document PDFs, Product Catalog Images)
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR.parent / 'media'

# Static file storage with WhiteNoise compression & caching
STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
    },
}

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework Settings
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ),
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'config.exceptions.custom_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': [
        'config.throttling.EnvironmentAwareAnonRateThrottle',
        'config.throttling.EnvironmentAwareUserRateThrottle',
        'config.throttling.EnvironmentAwareScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '120/min',
        'user': '300/min',
        'auth': '20/min',
        'otp': '15/min',
        'payment': '30/min',
        'upload': '20/min',
        'coupons': '30/min',
        'gps': '60/min',
    },
}

# OpenAPI / Swagger Documentation Settings (drf-spectacular)
SPECTACULAR_SETTINGS = {
    'TITLE': 'Smart Student Stationery Delivery System API',
    'DESCRIPTION': (
        'Comprehensive REST API documentation for Smart Student Stationery Delivery System '
        'Using Demand Prediction and Intelligent Inventory Management. Supports JWT authentication, '
        'multi-role RBAC (STUDENT, SHOP_OWNER, ADMIN), document printing queue, order lifecycle, '
        'store pickup slots, doorstep hostel delivery, and demand forecasting.'
    ),
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SECURITY': [{'BearerAuth': []}],
    'APPEND_COMPONENTS': {
        'securitySchemes': {
            'BearerAuth': {
                'type': 'http',
                'scheme': 'bearer',
                'bearerFormat': 'JWT',
                'description': 'Enter JWT Bearer token obtained from /api/auth/login/'
            }
        }
    }
}

# Simple JWT Authentication Settings
from datetime import timedelta
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
    'AUTH_TOKEN_CLASSES': ('rest_framework_simplejwt.tokens.AccessToken',),
}

# Cross-Origin Resource Sharing (CORS) Settings
CORS_ALLOW_ALL_ORIGINS = DEBUG  # Only allow all origins when in development mode
env_cors_origins = os.environ.get('CORS_ALLOWED_ORIGINS', '')
if env_cors_origins:
    CORS_ALLOWED_ORIGINS = [orig.strip() for orig in env_cors_origins.split(',') if orig.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://192.168.1.21:5174',
        'http://192.168.1.23:5174',
    ]
    if DEBUG:
        for _host in ALLOWED_HOSTS:
            if _host not in ['localhost', '127.0.0.1', 'testserver', '*'] and not _host.startswith('.'):
                for _port in ['5173', '5174', '3000']:
                    _origin = f'http://{_host}:{_port}'
                    if _origin not in CORS_ALLOWED_ORIGINS:
                        CORS_ALLOWED_ORIGINS.append(_origin)

CORS_ALLOW_CREDENTIALS = True

# Cross-Site Request Forgery (CSRF) Trusted Origins (Step 30)
env_csrf_origins = os.environ.get('CSRF_TRUSTED_ORIGINS', '')
if env_csrf_origins:
    CSRF_TRUSTED_ORIGINS = [orig.strip() for orig in env_csrf_origins.split(',') if orig.strip()]
else:
    CSRF_TRUSTED_ORIGINS = [
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://192.168.1.21:5174',
        'http://192.168.1.23:5174',
    ]

if DEBUG:
    for _host in ALLOWED_HOSTS:
        if _host not in ['localhost', '127.0.0.1', 'testserver', '*'] and not _host.startswith('.'):
            for _port in ['5173', '5174', '3000']:
                _origin = f'http://{_host}:{_port}'
                if _origin not in CSRF_TRUSTED_ORIGINS:
                    CSRF_TRUSTED_ORIGINS.append(_origin)

# Payment Gateway Configuration (Step 25)
PAYMENT_GATEWAY = os.environ.get('PAYMENT_GATEWAY', 'SANDBOX')
PAYMENT_KEY_ID = os.environ.get('PAYMENT_KEY_ID', 'sandbox_key_placeholder')
PAYMENT_KEY_SECRET = os.environ.get('PAYMENT_KEY_SECRET', 'sandbox_secret_placeholder')
PAYMENT_WEBHOOK_SECRET = os.environ.get('PAYMENT_WEBHOOK_SECRET', 'sandbox_webhook_secret_placeholder')
PAYMENT_CURRENCY = 'INR'

# Printing Document Retention Policy (Step 26)
PRINT_DOCUMENT_RETENTION_DAYS = int(os.environ.get('PRINT_DOCUMENT_RETENTION_DAYS', 30))

# Enterprise Production Logging Configuration (Step 30)
LOGS_DIR = BASE_DIR / 'logs'
LOGS_DIR.mkdir(parents=True, exist_ok=True)

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} [{name}:{lineno}] {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
        'simple': {
            'format': '[{asctime}] {levelname} {message}',
            'style': '{',
            'datefmt': '%Y-%m-%d %H:%M:%S',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose' if not DEBUG else 'simple',
        },
        'file_django': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'django.log',
            'maxBytes': 10 * 1024 * 1024,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
        'file_security': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': LOGS_DIR / 'security.log',
            'maxBytes': 10 * 1024 * 1024,  # 10 MB
            'backupCount': 5,
            'formatter': 'verbose',
            'encoding': 'utf-8',
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file_django'],
            'level': 'INFO',
            'propagate': True,
        },
        'django.request': {
            'handlers': ['console', 'file_django'],
            'level': 'ERROR',
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console', 'file_security'],
            'level': 'WARNING',
            'propagate': False,
        },
        'smart_stationery': {
            'handlers': ['console', 'file_django'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# ==============================================================================
# EMAIL & OTP VERIFICATION SETTINGS (GMAIL SMTP / CONSOLE FALLBACK)
# Reads Gmail SMTP credentials from environment variables (.env).
# When EMAIL_HOST_USER & EMAIL_HOST_PASSWORD are set, dispatches via smtp.gmail.com:587.
# In local development without configured SMTP credentials, safely routes to console.
# ==============================================================================
EMAIL_HOST = os.getenv('EMAIL_HOST', 'smtp.gmail.com')
EMAIL_PORT = int(os.getenv('EMAIL_PORT', 587))
EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').lower() in ('true', '1', 'yes')
EMAIL_USE_SSL = os.getenv('EMAIL_USE_SSL', 'False').lower() in ('true', '1', 'yes')
EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
EMAIL_TIMEOUT = int(os.getenv('EMAIL_TIMEOUT', 15))  # Network socket timeout in seconds

DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', EMAIL_HOST_USER or 'noreply@campuscart.edu')
SERVER_EMAIL = DEFAULT_FROM_EMAIL

# Backend resolution: Explicit env > SMTP (if credentials provided) > Console (if DEBUG) > SMTP
_smtp_configured = bool(EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
EMAIL_BACKEND = os.getenv(
    'EMAIL_BACKEND',
    'django.core.mail.backends.smtp.EmailBackend' if _smtp_configured else (
        'django.core.mail.backends.console.EmailBackend' if DEBUG else 'django.core.mail.backends.smtp.EmailBackend'
    )
)

# ==============================================================================
# HTTPS TRANSACTIONAL EMAIL DELIVERY (RESEND API OVER PORT 443)
# Communicates over HTTPS port 443 to bypass outbound SMTP blocks (25/465/587)
# on cloud hosting platforms such as Render Free.
# ==============================================================================
RESEND_API_KEY = os.getenv('RESEND_API_KEY', os.getenv('EMAIL_PROVIDER_API_KEY', '')).strip().strip('\'"')
EMAIL_FROM_ADDRESS = os.getenv('EMAIL_FROM_ADDRESS', '').strip().strip('\'"')
EMAIL_FROM_NAME = os.getenv('EMAIL_FROM_NAME', 'CampusCart').strip().strip('\'"')

# Email OTP Security Configuration
EMAIL_OTP_EXPIRY_SECONDS = int(os.getenv('EMAIL_OTP_EXPIRY_SECONDS', 300))  # 5 minutes
EMAIL_OTP_RESEND_COOLDOWN_SECONDS = int(os.getenv('EMAIL_OTP_RESEND_COOLDOWN_SECONDS', 60))  # 1 minute
EMAIL_OTP_MAX_ATTEMPTS = int(os.getenv('EMAIL_OTP_MAX_ATTEMPTS', 5))
EMAIL_OTP_MAX_RESENDS_PER_HOUR = int(os.getenv('EMAIL_OTP_MAX_RESENDS_PER_HOUR', 5))

# Frontend Application Base URL (for verification & transactional email links)
# In development mode (DEBUG=True), default to the host's active LAN IP so links clicked
# from a mobile device on the same Wi-Fi network can connect to the Vite dev server.
_default_frontend_host = 'localhost'
if DEBUG:
    try:
        import socket
        _hostname = socket.gethostname()
        for _discovered_ip in socket.gethostbyname_ex(_hostname)[2]:
            if not _discovered_ip.startswith('127.') and not _discovered_ip.startswith('169.254.'):
                _default_frontend_host = _discovered_ip
                break
    except Exception:
        pass

FRONTEND_BASE_URL = os.getenv('FRONTEND_BASE_URL', os.getenv('FRONTEND_URL', f'http://{_default_frontend_host}:5174'))


