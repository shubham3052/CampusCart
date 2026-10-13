"""
STEP 19 — SECURE INITIAL PLATFORM OWNER PASSWORD SETUP TEST SUITE
Executes and validates all mandatory negative tests, enrollment flow,
success tests, session revocation, and audit logging.
"""

import os
import sys
import django
import pyotp
import secrets
from datetime import timedelta
from unittest.mock import patch

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client, TestCase
from django.utils import timezone
from django.core import signing
from django.core.cache import cache
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

from users.models import User, UserRole, EmailVerificationOTP, PlatformOwnerTOTP, AuditLog
from users.services.totp_service import OwnerTOTPService
from users.services.email_service import EmailService
from users.services.role_service import RoleService


class Step19OwnerInitialPasswordSetupTests(TestCase):
    """
    Comprehensive test suite for Step 19:
    Platform Owner Secure Initial Password Setup & MFA Recovery.
    """

    def setUp(self):
        cache.clear()
        self.client = Client()

        # URLs
        self.url_request = '/api/auth/owner/password-setup/request/'
        self.url_verify_email = '/api/auth/owner/password-setup/verify-email/'
        self.url_resend_email = '/api/auth/owner/password-setup/resend-email/'
        self.url_verify_totp = '/api/auth/owner/password-setup/verify-totp/'
        self.url_complete = '/api/auth/owner/password-setup/complete/'

        self.url_public_reset_request = '/api/auth/password-reset/request/'
        self.url_public_reset_confirm = '/api/auth/password-reset/confirm/'
        self.url_public_reset_request_alt = '/api/auth/password/reset/request/'
        self.url_public_reset_confirm_alt = '/api/auth/password/reset/confirm/'

        self.url_login = '/api/auth/login/'
        self.url_verify_2fa = '/api/auth/owner/verify-2fa/'
        self.url_verify_owner_totp = '/api/auth/owner/verify-totp/'
        self.url_dashboard = '/api/platform-owner/dashboard-stats/'

        # Setup Platform Owner account (garibhokya@gmail.com)
        self.owner = User.objects.filter(email__iexact='garibhokya@gmail.com').first()
        if not self.owner:
            self.owner = User.objects.create(
                username='garibhokya@gmail.com',
                email='garibhokya@gmail.com',
                first_name='Garib',
                last_name='Hokya',
                role=User.Role.PLATFORM_OWNER,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED,
            )
        self.owner.role = User.Role.PLATFORM_OWNER
        self.owner.is_active = True
        self.owner.email_verified = True
        self.owner.approval_status = User.ApprovalStatus.APPROVED
        self.initial_dev_password = 'DevInitialRandomSecret#2026'
        self.owner.set_password(self.initial_dev_password)
        self.owner.save()

        UserRole.objects.filter(user=self.owner).exclude(role=User.Role.PLATFORM_OWNER).delete()
        UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})

        # Remove existing TOTP to test enrollment path cleanly
        PlatformOwnerTOTP.objects.filter(user=self.owner).delete()

        # Non-owner test accounts
        self.student = User.objects.filter(email='student_step19@campus.edu').first()
        if not self.student:
            self.student = User.objects.create_user(
                username='student_step19@campus.edu',
                email='student_step19@campus.edu',
                password='Password123!',
                role=User.Role.STUDENT,
                first_name='Test',
                last_name='Student',
                is_active=True,
                email_verified=True,
            )
        UserRole.objects.get_or_create(user=self.student, role=User.Role.STUDENT, defaults={'is_active': True})

        self.shop_owner = User.objects.filter(email='shop_step19@campus.edu').first()
        if not self.shop_owner:
            self.shop_owner = User.objects.create_user(
                username='shop_step19@campus.edu',
                email='shop_step19@campus.edu',
                password='Password123!',
                role=User.Role.SHOP_OWNER,
                first_name='Test',
                last_name='Shop',
                is_active=True,
                email_verified=True,
            )
        UserRole.objects.get_or_create(user=self.shop_owner, role=User.Role.SHOP_OWNER, defaults={'is_active': True})

        self.courier = User.objects.filter(email='courier_step19@campus.edu').first()
        if not self.courier:
            self.courier = User.objects.create_user(
                username='courier_step19@campus.edu',
                email='courier_step19@campus.edu',
                password='Password123!',
                role=User.Role.DELIVERY_AGENT,
                first_name='Test',
                last_name='Courier',
                is_active=True,
                email_verified=True,
            )
        UserRole.objects.get_or_create(user=self.courier, role=User.Role.DELIVERY_AGENT, defaults={'is_active': True})

        self.admin = User.objects.filter(email='admin_step19@campus.edu').first()
        if not self.admin:
            self.admin = User.objects.create_user(
                username='admin_step19@campus.edu',
                email='admin_step19@campus.edu',
                password='Password123!',
                role=User.Role.ADMIN,
                first_name='Test',
                last_name='Admin',
                is_active=True,
                email_verified=True,
            )
        UserRole.objects.get_or_create(user=self.admin, role=User.Role.ADMIN, defaults={'is_active': True})

    # =========================================================================
    # SECTION 12 — NEGATIVE TESTS
    # =========================================================================

    def test_01_email_only_password_setup_fails(self):
        """1. Email only → password setup must fail."""
        res = self.client.post(self.url_complete, {'email': 'garibhokya@gmail.com'}, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])
        self.assertIn('stage_token', res.json().get('errors', {}))

    def test_02_email_and_password_setup_fails(self):
        """2. Email + password setup directly without MFA token must fail."""
        res = self.client.post(
            self.url_complete,
            {
                'email': 'garibhokya@gmail.com',
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])
        self.assertIn('stage_token', res.json().get('errors', {}))

    def test_03_gmail_otp_only_password_setup_fails(self):
        """3. Gmail OTP only → password setup must fail."""
        # Forge or use GMAIL_OTP_PENDING token directly at complete endpoint
        token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'GMAIL_OTP_PENDING',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        res = self.client.post(
            self.url_complete,
            {
                'stage_token': token,
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_04_authenticator_otp_only_password_setup_fails(self):
        """4. Authenticator OTP only without verified Gmail OTP must fail."""
        # Attempt to call verify-totp with an invalid or direct token without passing email OTP
        token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'GMAIL_OTP_PENDING',  # still at email stage
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        res = self.client.post(
            self.url_verify_totp,
            {'stage_token': token, 'code': '123456'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_05_normal_jwt_cannot_bypass_password_setup(self):
        """5. Normal JWT in place of temporary token or as bearer bypass must fail."""
        refresh = RefreshToken.for_user(self.owner)
        jwt_access = str(refresh.access_token)

        # Passing JWT as stage_token
        res = self.client.post(
            self.url_complete,
            {
                'stage_token': jwt_access,
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # Passing Bearer JWT in header without stage_token
        res = self.client.post(
            self.url_complete,
            {
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {jwt_access}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_06_student_cannot_use_password_setup(self):
        """6. Student → password setup must fail."""
        res = self.client.post(self.url_request, {'email': self.student.email}, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_07_shop_owner_cannot_use_password_setup(self):
        """7. Shop Owner → password setup must fail."""
        res = self.client.post(self.url_request, {'email': self.shop_owner.email}, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_08_courier_cannot_use_password_setup(self):
        """8. Courier → password setup must fail."""
        res = self.client.post(self.url_request, {'email': self.courier.email}, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_09_admin_cannot_use_password_setup(self):
        """9. Admin → password setup must fail."""
        res = self.client.post(self.url_request, {'email': self.admin.email}, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_10_tampered_temporary_token_fails(self):
        """10. Tampered temporary token must fail."""
        valid_token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'FULL_MFA_VERIFIED',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        tampered_token = valid_token[:-4] + 'xyz9'

        res = self.client.post(
            self.url_complete,
            {
                'stage_token': tampered_token,
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_11_expired_temporary_token_fails(self):
        """11. Expired temporary token must fail."""
        expired_token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'FULL_MFA_VERIFIED',
            'nonce': secrets.token_hex(16),
            'ts': (timezone.now() - timedelta(seconds=350)).timestamp(),
        }, salt='owner-initial-password-setup-salt')

        with patch('django.utils.timezone.now', return_value=timezone.now() + timedelta(seconds=400)):
            res = self.client.post(
                self.url_complete,
                {
                    'stage_token': expired_token,
                    'new_password': 'NewSecurePassword123!',
                    'confirm_password': 'NewSecurePassword123!',
                },
                content_type='application/json'
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_12_replayed_temporary_token_fails(self):
        """12. Replayed temporary token must fail."""
        # Setup TOTP so complete endpoint can proceed to success
        totp_raw = pyotp.random_base32()
        tcfg = PlatformOwnerTOTP.objects.create(
            user=self.owner,
            enabled=True,
            verified=True,
            verified_at=timezone.now(),
            last_used_time_step=0,
            failed_attempts=0
        )
        tcfg.set_secret(totp_raw)
        tcfg.save()

        token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'FULL_MFA_VERIFIED',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        # First use succeeds
        res1 = self.client.post(
            self.url_complete,
            {
                'stage_token': token,
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Second use (replay) must fail!
        res2 = self.client.post(
            self.url_complete,
            {
                'stage_token': token,
                'new_password': 'AnotherNewPassword123!',
                'confirm_password': 'AnotherNewPassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res2.json()['success'])

    def test_13_wrong_gmail_otp_fails(self):
        """13. Wrong Gmail OTP must fail."""
        # Request setup
        res_req = self.client.post(self.url_request, {'email': self.owner.email}, content_type='application/json')
        self.assertEqual(res_req.status_code, status.HTTP_200_OK)
        stage_token = res_req.json()['stage_token']

        # Verify with wrong OTP
        res_ver = self.client.post(
            self.url_verify_email,
            {'stage_token': stage_token, 'code': '999999'},
            content_type='application/json'
        )
        self.assertEqual(res_ver.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res_ver.json()['success'])

    def test_14_expired_gmail_otp_fails(self):
        """14. Expired Gmail OTP must fail."""
        res_req = self.client.post(self.url_request, {'email': self.owner.email}, content_type='application/json')
        stage_token = res_req.json()['stage_token']

        # Find the OTP in db and expire it
        otp_rec = EmailVerificationOTP.objects.filter(
            email=self.owner.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_SETUP
        ).first()
        self.assertIsNotNone(otp_rec)
        otp_rec.expires_at = timezone.now() - timedelta(minutes=1)
        otp_rec.save()

        res_ver = self.client.post(
            self.url_verify_email,
            {'stage_token': stage_token, 'code': '123456'},
            content_type='application/json'
        )
        self.assertEqual(res_ver.status_code, status.HTTP_400_BAD_REQUEST)

    def test_15_wrong_totp_fails(self):
        """15. Wrong Microsoft Authenticator TOTP code must fail."""
        totp_raw = pyotp.random_base32()
        tcfg = PlatformOwnerTOTP.objects.create(
            user=self.owner,
            enabled=True,
            verified=True,
            verified_at=timezone.now(),
            last_used_time_step=0,
            failed_attempts=0
        )
        tcfg.set_secret(totp_raw)
        tcfg.save()

        token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'TOTP_VERIFICATION_PENDING',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        res = self.client.post(
            self.url_verify_totp,
            {'stage_token': token, 'code': '000000'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_16_replayed_totp_fails(self):
        """16. Replaying the exact same TOTP code in the same window must fail."""
        totp_raw = pyotp.random_base32()
        tcfg = PlatformOwnerTOTP.objects.create(
            user=self.owner,
            enabled=True,
            verified=True,
            verified_at=timezone.now(),
            last_used_time_step=0,
            failed_attempts=0
        )
        tcfg.set_secret(totp_raw)
        tcfg.save()

        totp = pyotp.TOTP(totp_raw, interval=30)
        valid_code = totp.now()

        token1 = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'TOTP_VERIFICATION_PENDING',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        # First verify succeeds
        res1 = self.client.post(
            self.url_verify_totp,
            {'stage_token': token1, 'code': valid_code},
            content_type='application/json'
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Attempt to reuse valid_code with another challenge token
        token2 = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'TOTP_VERIFICATION_PENDING',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        res2 = self.client.post(
            self.url_verify_totp,
            {'stage_token': token2, 'code': valid_code},
            content_type='application/json'
        )
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res2.json()['success'])

    def test_17_totp_disabled_must_not_downgrade_security(self):
        """17. If TOTP is disabled or unverified, password setup complete must refuse to proceed."""
        # Ensure no TOTP or disabled TOTP
        PlatformOwnerTOTP.objects.filter(user=self.owner).delete()

        token = signing.dumps({
            'user_id': self.owner.id,
            'email': self.owner.email,
            'purpose': 'OWNER_INITIAL_PASSWORD_SETUP',
            'stage': 'FULL_MFA_VERIFIED',
            'nonce': secrets.token_hex(16),
            'ts': timezone.now().timestamp(),
        }, salt='owner-initial-password-setup-salt')

        res = self.client.post(
            self.url_complete,
            {
                'stage_token': token,
                'new_password': 'NewSecurePassword123!',
                'confirm_password': 'NewSecurePassword123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.json()['success'])

    def test_18_public_forgot_password_flow_blocks_platform_owner(self):
        """18. Public forgot-password endpoints must refuse Platform Owner password changes."""
        # Request via standard path
        res_req1 = self.client.post(self.url_public_reset_request, {'email': self.owner.email}, content_type='application/json')
        self.assertEqual(res_req1.status_code, status.HTTP_200_OK)
        # Verify no OTP was dispatched for Platform Owner
        owner_reset_otp = EmailVerificationOTP.objects.filter(
            email=self.owner.email,
            purpose=EmailVerificationOTP.Purpose.PASSWORD_RESET
        ).first()
        self.assertIsNone(owner_reset_otp)

        # Confirm attempt must strictly fail
        fake_reset_token = signing.dumps({
            'email': self.owner.email,
            'purpose': 'PASSWORD_RESET',
            'otp_id': 99999,
            'ts': timezone.now().timestamp()
        }, salt='password-reset-salt')

        res_conf1 = self.client.post(
            self.url_public_reset_confirm,
            {
                'email': self.owner.email,
                'reset_token': fake_reset_token,
                'new_password': 'PublicResetBypass123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res_conf1.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('disabled for Platform Owner', res_conf1.json()['message'])

        # Check alternate URL route as well
        res_conf2 = self.client.post(
            self.url_public_reset_confirm_alt,
            {
                'email': self.owner.email,
                'reset_token': fake_reset_token,
                'new_password': 'PublicResetBypass123!',
            },
            content_type='application/json'
        )
        self.assertEqual(res_conf2.status_code, status.HTTP_400_BAD_REQUEST)

    # =========================================================================
    # SECTION 13 — END-TO-END SUCCESS AND VERIFICATION TEST
    # =========================================================================

    def test_19_full_initial_password_setup_flow_and_session_revocation(self):
        """
        Complete end-to-end setup flow:
        1. Owner requests setup via email (garibhokya@gmail.com).
        2. Receives 6-digit Gmail OTP and stage token.
        3. Submits Gmail OTP -> receives Microsoft Authenticator enrollment QR code.
        4. Scans QR code into Microsoft Authenticator, submits first 6-digit code.
        5. TOTP enabled and verified -> authorized to set new password.
        6. Submits new personally chosen password.
        7. All existing sessions revoked.
        8. Logs in with NEW PASSWORD + Gmail OTP + Microsoft Authenticator -> reaches Dashboard.
        9. Verifies that the previous unknown password can no longer be used.
        """
        # Create an existing active session with tokens before password setup
        old_refresh = RefreshToken.for_user(self.owner)
        old_access = str(old_refresh.access_token)

        # Stage 1: Request
        with patch.object(EmailService, '_send_email_dispatch', return_value=(True, 'Sent')) as mock_send:
            res1 = self.client.post(self.url_request, {'email': self.owner.email}, content_type='application/json')
            self.assertEqual(res1.status_code, status.HTTP_200_OK)
            data1 = res1.json()
            self.assertTrue(data1['success'])
            self.assertEqual(data1['stage'], 'GMAIL_OTP_PENDING')
            stage_token1 = data1['stage_token']

        # Extract dispatched OTP code from mock call kwargs
        raw_otp = mock_send.call_args[1]['raw_otp']
        self.assertIsNotNone(raw_otp)

        # Stage 2: Verify Gmail OTP
        res2 = self.client.post(
            self.url_verify_email,
            {'stage_token': stage_token1, 'code': raw_otp},
            content_type='application/json'
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        data2 = res2.json()
        self.assertTrue(data2['success'])
        self.assertFalse(data2['totp_enrolled'], "Should detect TOTP not yet enrolled")
        self.assertEqual(data2['stage'], 'TOTP_ENROLLMENT_PENDING')
        self.assertIn('enrollment', data2)
        stage_token2 = data2['stage_token']

        enrollment_info = data2['enrollment']
        manual_key = enrollment_info['manual_entry_key']
        self.assertIsNotNone(manual_key)

        # Stage 3: Generate Authenticator code using the enrollment secret
        totp_app = pyotp.TOTP(manual_key, interval=30)
        authenticator_code = totp_app.now()

        res3 = self.client.post(
            self.url_verify_totp,
            {'stage_token': stage_token2, 'code': authenticator_code},
            content_type='application/json'
        )
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        data3 = res3.json()
        self.assertTrue(data3['success'])
        self.assertEqual(data3['stage'], 'FULL_MFA_VERIFIED')
        stage_token3 = data3['stage_token']

        # Verify PlatformOwnerTOTP is now enabled in DB
        totp_db = PlatformOwnerTOTP.objects.filter(user=self.owner).first()
        self.assertIsNotNone(totp_db)
        self.assertTrue(totp_db.enabled)
        self.assertTrue(totp_db.verified)

        # Stage 4: Owner chooses new password
        chosen_new_password = 'PersonalOwnerMasterPassword#999'

        res4 = self.client.post(
            self.url_complete,
            {
                'stage_token': stage_token3,
                'new_password': chosen_new_password,
                'confirm_password': chosen_new_password,
            },
            content_type='application/json'
        )
        self.assertEqual(res4.status_code, status.HTTP_200_OK)
        data4 = res4.json()
        self.assertTrue(data4['success'])

        # Verify old session token has been revoked / blacklisted
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password(chosen_new_password))

        # Check blacklist for old token
        old_tok_record = OutstandingToken.objects.filter(token=str(old_refresh)).first()
        if old_tok_record:
            self.assertTrue(BlacklistedToken.objects.filter(token=old_tok_record).exists())

        # Step 8: Perform normal login using NEW PASSWORD + 2FA
        res_login = self.client.post(
            self.url_login,
            {'email': self.owner.email, 'password': chosen_new_password},
            content_type='application/json'
        )
        self.assertEqual(res_login.status_code, status.HTTP_200_OK)
        login_data = res_login.json()
        self.assertTrue(login_data['requires_2fa'])
        pre_auth_token1 = login_data['pre_auth_token']

        # Dispatched Gmail 2FA OTP
        otp_2fa_rec = EmailVerificationOTP.objects.filter(
            email=self.owner.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA
        ).order_by('-created_at').first()

        # Find the plain OTP by checking 000000-999999 or mocking create_and_send_otp
        # Let's verify by calling verify_otp or extracting the OTP
        with patch.object(EmailService, 'verify_otp', return_value=(True, 'Success', otp_2fa_rec)):
            res_2fa = self.client.post(
                self.url_verify_2fa,
                {
                    'email': self.owner.email,
                    'otp': '123456',
                    'pre_auth_token': pre_auth_token1
                },
                content_type='application/json'
            )
            self.assertEqual(res_2fa.status_code, status.HTTP_200_OK)
            data_2fa = res_2fa.json()
            self.assertTrue(data_2fa['requires_totp'])
            pre_auth_totp_token = data_2fa['pre_auth_token']

        # Verify Microsoft Authenticator code
        auth_login_code = totp_app.at(timezone.now(), counter_offset=1)
        res_totp = self.client.post(
            self.url_verify_owner_totp,
            {
                'pre_auth_token': pre_auth_totp_token,
                'code': auth_login_code
            },
            content_type='application/json'
        )
        self.assertEqual(res_totp.status_code, status.HTTP_200_OK)
        totp_data = res_totp.json()
        self.assertTrue(totp_data['success'])
        self.assertIn('access', totp_data)
        new_jwt = totp_data['access']

        # Access Platform Owner Dashboard
        res_dash = self.client.get(
            self.url_dashboard,
            HTTP_AUTHORIZATION=f'Bearer {new_jwt}'
        )
        self.assertEqual(res_dash.status_code, status.HTTP_200_OK)

        # Verify that OLD dev password fails
        res_old_login = self.client.post(
            self.url_login,
            {'email': self.owner.email, 'password': self.initial_dev_password},
            content_type='application/json'
        )
        self.assertEqual(res_old_login.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res_old_login.json().get('success', False))

        # Verify Audit Logs generated
        audit_actions = list(
            AuditLog.objects.filter(actor=self.owner)
            .values_list('action', flat=True)
        )
        self.assertIn(AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_STARTED, audit_actions)
        self.assertIn(AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_SENT, audit_actions)
        self.assertIn(AuditLog.Action.OWNER_INITIAL_PASSWORD_GMAIL_OTP_SUCCESS, audit_actions)
        self.assertIn(AuditLog.Action.OWNER_INITIAL_PASSWORD_TOTP_SUCCESS, audit_actions)
        self.assertIn(AuditLog.Action.OWNER_INITIAL_PASSWORD_SETUP_SUCCESS, audit_actions)
