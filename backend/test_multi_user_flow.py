import os
import sys

backend_dir = os.path.abspath(r'C:\Users\Garib\Desktop\Project1\smart-stationery\backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
import django
django.setup()

from django.conf import settings
from django.core import mail

# Enforce in-memory email backend so automated test does NOT send real emails to test addresses
settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
mail.outbox = []

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status
from users.models import EmailVerificationOTP
from users.services.email_service import EmailService

User = get_user_model()
client = APIClient()

print("==================================================")
print("CAMPUSCART STEP 2: MULTI-USER AUTH & OTP FLOW TEST")
print("==================================================")

# Clean up previous test users if any
User.objects.filter(email__in=['usera_test@campus.edu', 'userb_test@campus.edu', 'admin_invite_test@campus.edu']).delete()
EmailVerificationOTP.objects.filter(email__in=['usera_test@campus.edu', 'userb_test@campus.edu', 'admin_invite_test@campus.edu']).delete()

# -----------------------------------------------------------------
# 1. USER A REGISTRATION FLOW
# -----------------------------------------------------------------
print("\n[TEST 1] Register User A (usera_test@campus.edu)...")
res_reg_a = client.post('/api/auth/register/', {
    "name": "User Alpha",
    "email": "usera_test@campus.edu",
    "password": "Password123!",
    "role": "STUDENT"
}, format='json')
print(f"Register User A: HTTP {res_reg_a.status_code}")
assert res_reg_a.status_code == status.HTTP_201_CREATED
user_a = User.objects.get(email='usera_test@campus.edu')
print(f"User A in DB: id={user_a.id}, email_verified={user_a.email_verified}, is_active={user_a.is_active}")
assert user_a.email_verified is False, "New user must start unverified"

# Retrieve OTP generated for User A
otp_a_rec = EmailVerificationOTP.objects.filter(email='usera_test@campus.edu', is_verified=False).order_by('-created_at').first()
assert otp_a_rec is not None, "OTP record must be generated"
print(f"User A OTP Record: ID={otp_a_rec.id}, purpose={otp_a_rec.purpose}, expires_at={otp_a_rec.expires_at}")

# -----------------------------------------------------------------
# 2. USER B REGISTRATION FLOW (Different Domain/Recipient)
# -----------------------------------------------------------------
print("\n[TEST 2] Register User B (userb_test@campus.edu)...")
res_reg_b = client.post('/api/auth/register/', {
    "name": "User Beta",
    "email": "userb_test@campus.edu",
    "password": "Password456!",
    "role": "STUDENT"
}, format='json')
print(f"Register User B: HTTP {res_reg_b.status_code}")
assert res_reg_b.status_code == status.HTTP_201_CREATED
user_b = User.objects.get(email='userb_test@campus.edu')
print(f"User B in DB: id={user_b.id}, email_verified={user_b.email_verified}, is_active={user_b.is_active}")
assert user_b.email_verified is False

otp_b_rec = EmailVerificationOTP.objects.filter(email='userb_test@campus.edu', is_verified=False).order_by('-created_at').first()
assert otp_b_rec is not None
print(f"User B OTP Record: ID={otp_b_rec.id}, purpose={otp_b_rec.purpose}")

# -----------------------------------------------------------------
# 3. CROSS-USER ISOLATION: User A's OTP cannot verify User B
# -----------------------------------------------------------------
print("\n[TEST 3] Verify User A's OTP cannot verify User B...")
# Set known OTP on User A
otp_a_rec.set_otp("111222")
otp_a_rec.save()

res_cross = client.post('/api/auth/email/verify-otp/', {
    "email": "userb_test@campus.edu",
    "otp": "111222",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Cross-user verification attempt: HTTP {res_cross.status_code} - {res_cross.data.get('message')}")
assert res_cross.status_code == status.HTTP_400_BAD_REQUEST

# -----------------------------------------------------------------
# 4. OTP RESEND & OLD OTP INVALIDATION
# -----------------------------------------------------------------
print("\n[TEST 4] Test OTP Resend & Old OTP Invalidation for User A...")
# Fast-forward last_sent_at to satisfy 60s cooldown
otp_a_rec.last_sent_at = timezone.now() - timezone.timedelta(seconds=65)
otp_a_rec.save()

res_resend = client.post('/api/auth/email/resend-otp/', {
    "email": "usera_test@campus.edu",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Resend OTP User A: HTTP {res_resend.status_code} - {res_resend.data.get('message')}")
assert res_resend.status_code == status.HTTP_200_OK

# Check that old OTP is now expired
otp_a_rec.refresh_from_db()
print(f"Old OTP is_expired: {otp_a_rec.is_expired}")
assert otp_a_rec.is_expired is True, "Old OTP must be invalidated upon resend"

# Try verifying with old OTP
res_old = client.post('/api/auth/email/verify-otp/', {
    "email": "usera_test@campus.edu",
    "otp": "111222",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Verify with old OTP: HTTP {res_old.status_code} - {res_old.data.get('message')}")
assert res_old.status_code == status.HTTP_400_BAD_REQUEST

# -----------------------------------------------------------------
# 5. VERIFY USER A WITH NEW OTP
# -----------------------------------------------------------------
print("\n[TEST 5] Verify User A with new OTP...")
new_otp_a = EmailVerificationOTP.objects.filter(email='usera_test@campus.edu', is_verified=False).order_by('-created_at').first()
new_otp_a.set_otp("333444")
new_otp_a.save()

res_verify_a = client.post('/api/auth/email/verify-otp/', {
    "email": "usera_test@campus.edu",
    "otp": "333444",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Verify User A: HTTP {res_verify_a.status_code} - {res_verify_a.data.get('message')}")
assert res_verify_a.status_code == status.HTTP_200_OK
user_a.refresh_from_db()
assert user_a.email_verified is True
print(f"User A email_verified is now: {user_a.email_verified}")

# -----------------------------------------------------------------
# 6. REPLAY PREVENTION: Used OTP cannot be reused
# -----------------------------------------------------------------
print("\n[TEST 6] Replay Prevention: Attempt to use verified OTP again...")
res_replay = client.post('/api/auth/email/verify-otp/', {
    "email": "usera_test@campus.edu",
    "otp": "333444",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Replay attempt: HTTP {res_replay.status_code} - {res_replay.data.get('message')}")
assert res_replay.status_code == status.HTTP_400_BAD_REQUEST

# -----------------------------------------------------------------
# 7. VERIFY USER B
# -----------------------------------------------------------------
print("\n[TEST 7] Verify User B with OTP...")
otp_b_rec.set_otp("555666")
otp_b_rec.save()

res_verify_b = client.post('/api/auth/email/verify-otp/', {
    "email": "userb_test@campus.edu",
    "otp": "555666",
    "purpose": "EMAIL_VERIFICATION"
}, format='json')
print(f"Verify User B: HTTP {res_verify_b.status_code} - {res_verify_b.data.get('message')}")
assert res_verify_b.status_code == status.HTTP_200_OK
user_b.refresh_from_db()
assert user_b.email_verified is True
print(f"User B email_verified is now: {user_b.email_verified}")

# -----------------------------------------------------------------
# 8. LOGIN & LOGOUT TESTING
# -----------------------------------------------------------------
print("\n[TEST 8] Test Login for verified User A...")
res_login = client.post('/api/auth/login/', {
    "email": "usera_test@campus.edu",
    "password": "Password123!"
}, format='json')
print(f"Login User A: HTTP {res_login.status_code}")
assert res_login.status_code == status.HTTP_200_OK
access_token = res_login.data.get('access')
refresh_token = res_login.data.get('refresh')
assert access_token is not None
assert res_login.data.get('user', {}).get('email_verified') is True
print("Access token received. Authenticated /me request:")

client.credentials(HTTP_AUTHORIZATION=f'Bearer {access_token}')
res_me = client.get('/api/auth/me/')
print(f"/api/auth/me/: HTTP {res_me.status_code} -> email={res_me.data.get('email')}, role={res_me.data.get('role')}")
assert res_me.status_code == status.HTTP_200_OK

print("\nTest Logout for User A...")
res_logout = client.post('/api/auth/logout/', {'refresh': refresh_token}, format='json')
print(f"Logout: HTTP {res_logout.status_code} - {res_logout.data.get('message')}")
assert res_logout.status_code == status.HTTP_200_OK

# -----------------------------------------------------------------
# 9. INVALID CREDENTIALS
# -----------------------------------------------------------------
print("\n[TEST 9] Test Invalid Credentials...")
client.credentials()  # Clear auth
res_bad_login = client.post('/api/auth/login/', {
    "email": "usera_test@campus.edu",
    "password": "WrongPassword!"
}, format='json')
print(f"Invalid Password Login: HTTP {res_bad_login.status_code}")
assert res_bad_login.status_code == status.HTTP_400_BAD_REQUEST

# Clean up test accounts after completion
User.objects.filter(email__in=['usera_test@campus.edu', 'userb_test@campus.edu']).delete()
EmailVerificationOTP.objects.filter(email__in=['usera_test@campus.edu', 'userb_test@campus.edu']).delete()

print("\n==================================================")
print("ALL TESTS COMPLETED SUCCESSFULLY!")
print("==================================================")
