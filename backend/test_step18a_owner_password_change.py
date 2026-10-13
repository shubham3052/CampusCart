"""
STEP 18A — SECURE PLATFORM OWNER PASSWORD CHANGE + FULL 2FA TEST SUITE
Executes and validates all 45 mandatory security test cases.
"""

import os
import sys
import django
import pyotp
from datetime import timedelta
from unittest.mock import patch

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client, TestCase
from django.utils import timezone
from django.core import signing
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken

from users.models import User, UserRole, EmailVerificationOTP, PlatformOwnerTOTP, AuditLog
from users.services.totp_service import OwnerTOTPService
from users.services.email_service import EmailService
from users.services.role_service import RoleService


class Step18AOwnerPasswordChangeTests(TestCase):
    """
    Test suite covering all 45 mandatory security and regression tests
    for Platform Owner password changing with mandatory Full 2FA (Gmail OTP + Microsoft Authenticator).
    """

    def setUp(self):
        self.client = Client()
        self.test_password = 'OwnerOriginalPassword#2026'

        # Target Platform Owner account
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
        self.owner.set_password(self.test_password)
        self.owner.role = User.Role.PLATFORM_OWNER
        self.owner.is_active = True
        self.owner.email_verified = True
        self.owner.approval_status = User.ApprovalStatus.APPROVED
        self.owner.save()
        UserRole.objects.filter(user=self.owner).exclude(role=User.Role.PLATFORM_OWNER).delete()
        UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})

        # Ensure TOTP is enabled and active on owner for testing
        PlatformOwnerTOTP.objects.filter(user=self.owner).delete()
        self.totp_raw_secret = pyotp.random_base32()
        self.totp_config = PlatformOwnerTOTP.objects.create(
            user=self.owner,
            enabled=True,
            verified=True,
            verified_at=timezone.now(),
            last_used_time_step=0,
            failed_attempts=0
        )
        self.totp_config.set_secret(self.totp_raw_secret)
        self.totp_config.save()

        # Test Admin
        self.admin = User.objects.filter(email='test_admin_step18a@campus.edu').first()
        if not self.admin:
            self.admin = User.objects.create_user(
                username='test_admin_step18a',
                email='test_admin_step18a@campus.edu',
                password='AdminPassword123!',
                role=User.Role.ADMIN,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
        UserRole.objects.get_or_create(user=self.admin, role=User.Role.ADMIN, defaults={'is_active': True})

        # Test Student
        self.student = User.objects.filter(email='test_student_step18a@campus.edu').first()
        if not self.student:
            self.student = User.objects.create_user(
                username='test_student_step18a',
                email='test_student_step18a@campus.edu',
                password='StudentPassword123!',
                role=User.Role.STUDENT,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
        UserRole.objects.get_or_create(user=self.student, role=User.Role.STUDENT, defaults={'is_active': True})

        # Test Shop Owner
        self.shop_owner = User.objects.filter(email='test_shopowner_step18a@campus.edu').first()
        if not self.shop_owner:
            self.shop_owner = User.objects.create_user(
                username='test_shopowner_step18a',
                email='test_shopowner_step18a@campus.edu',
                password='ShopPassword123!',
                role=User.Role.SHOP_OWNER,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
        UserRole.objects.get_or_create(user=self.shop_owner, role=User.Role.SHOP_OWNER, defaults={'is_active': True})

        # Test Courier
        self.courier = User.objects.filter(email='test_courier_step18a@campus.edu').first()
        if not self.courier:
            self.courier = User.objects.create_user(
                username='test_courier_step18a',
                email='test_courier_step18a@campus.edu',
                password='CourierPassword123!',
                role=User.Role.DELIVERY_AGENT,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
        UserRole.objects.get_or_create(user=self.courier, role=User.Role.DELIVERY_AGENT, defaults={'is_active': True})

    def _get_owner_jwt(self):
        refresh = RefreshToken.for_user(self.owner)
        refresh['roles'] = [User.Role.PLATFORM_OWNER]
        refresh['active_role'] = User.Role.PLATFORM_OWNER
        refresh.access_token['roles'] = [User.Role.PLATFORM_OWNER]
        refresh.access_token['active_role'] = User.Role.PLATFORM_OWNER
        return str(refresh.access_token), str(refresh)

    def _get_user_jwt(self, user, role):
        refresh = RefreshToken.for_user(user)
        refresh['roles'] = [role]
        refresh['active_role'] = role
        refresh.access_token['roles'] = [role]
        refresh.access_token['active_role'] = role
        return str(refresh.access_token)

    # 1. Owner Identity
    def test_01_owner_identity(self):
        """Owner account must exist with unique garibhokya@gmail.com email."""
        self.assertEqual(self.owner.email, 'garibhokya@gmail.com')
        self.assertTrue(self.owner.is_active)
        self.assertEqual(User.objects.filter(email='garibhokya@gmail.com').count(), 1)

    # 2. Owner Exclusive Role
    def test_02_owner_exclusive_role(self):
        """Owner must possess only PLATFORM_OWNER role and cannot receive secondary roles."""
        roles = list(UserRole.objects.filter(user=self.owner, is_active=True).values_list('role', flat=True))
        self.assertEqual(roles, [User.Role.PLATFORM_OWNER])
        # Attempt to add Student role via RoleService must raise ValidationError
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            RoleService.assign_role(self.owner, User.Role.STUDENT)
        self.assertEqual(list(UserRole.objects.filter(user=self.owner, is_active=True).values_list('role', flat=True)), [User.Role.PLATFORM_OWNER])

    # 3. Correct Current Password
    def test_03_correct_current_password(self):
        """POST /api/platform-owner/security/password-change/start/ with correct password succeeds."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))
        self.assertEqual(res.data.get('stage'), 'PASSWORD_VERIFIED')
        self.assertIn('stage_token', res.data)

    # 4. Wrong Current Password
    def test_04_wrong_current_password(self):
        """POST /api/platform-owner/security/password-change/start/ with wrong password fails."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': 'IncorrectPassword999!'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data.get('success', True))
        # Ensure no password change OTP was dispatched
        self.assertFalse(EmailVerificationOTP.objects.filter(user=self.owner, purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE).exists())

    # 5. Gmail OTP Generation
    def test_05_gmail_otp_generation(self):
        """Starting password change generates an OTP record with purpose OWNER_PASSWORD_CHANGE."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).first()
        self.assertIsNotNone(otp_rec)
        self.assertFalse(otp_rec.is_verified)
        self.assertNotEqual(otp_rec.otp_hash, '')

    # 6. Gmail OTP Delivery Path
    def test_06_gmail_otp_delivery_path(self):
        """OTP is sent to dynamically resolved owner email (garibhokya@gmail.com)."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).latest('created_at')
        self.assertEqual(otp_rec.email, self.owner.email.lower())

    # 7. Wrong Gmail OTP
    def test_07_wrong_gmail_otp(self):
        """POST /api/platform-owner/security/password-change/verify-email/ with wrong OTP fails."""
        token, _ = self._get_owner_jwt()
        start_res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        stage_token = start_res.data['stage_token']

        verify_res = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': stage_token, 'code': '000000'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(verify_res.data.get('success', True))

    # 8. Expired Gmail OTP
    def test_08_expired_gmail_otp(self):
        """Expired Gmail OTP is rejected."""
        token, _ = self._get_owner_jwt()
        start_res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        stage_token = start_res.data['stage_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).latest('created_at')
        otp_rec.expires_at = timezone.now() - timedelta(minutes=10)
        otp_rec.set_otp('654321')
        otp_rec.save()

        verify_res = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': stage_token, 'code': '654321'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(verify_res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('expired', verify_res.data.get('message', '').lower())

    # 9. Gmail OTP Replay
    def test_09_gmail_otp_replay(self):
        """Replaying an already verified Gmail OTP is rejected."""
        token, _ = self._get_owner_jwt()
        start_res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        stage_token = start_res.data['stage_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).latest('created_at')
        otp_rec.set_otp('654321')
        otp_rec.save()

        # First verification succeeds
        v1 = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': stage_token, 'code': '654321'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(v1.status_code, status.HTTP_200_OK)

        # Replay attempt fails
        v2 = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': stage_token, 'code': '654321'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(v2.status_code, status.HTTP_400_BAD_REQUEST)

    # 10. Gmail OTP Cooldown
    def test_10_gmail_otp_cooldown(self):
        """Requesting password change start again immediately triggers cooldown rate limit."""
        token, _ = self._get_owner_jwt()
        res1 = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Immediate second request
        res2 = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertIn(res2.status_code, [status.HTTP_400_BAD_REQUEST, status.HTTP_429_TOO_MANY_REQUESTS])
        self.assertIn('wait', res2.data.get('message', '').lower())

    # 11. Valid Gmail OTP
    def test_11_valid_gmail_otp(self):
        """Valid Gmail OTP verification succeeds and advances stage token to EMAIL_OTP_VERIFIED."""
        token, _ = self._get_owner_jwt()
        start_res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        stage_token = start_res.data['stage_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).latest('created_at')
        otp_rec.set_otp('778899')
        otp_rec.save()

        verify_res = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': stage_token, 'code': '778899'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_res.data.get('success'))
        self.assertEqual(verify_res.data.get('stage'), 'EMAIL_OTP_VERIFIED')
        self.assertIn('stage_token', verify_res.data)

    # 12. TOTP Required
    def test_12_totp_required(self):
        """If PlatformOwnerTOTP is disabled, password change start is rejected (no downgrade)."""
        self.totp_config.enabled = False
        self.totp_config.save()

        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('microsoft authenticator', res.data.get('message', '').lower())

    # 13. Wrong TOTP
    def test_13_wrong_totp(self):
        """POST /api/platform-owner/security/password-change/verify-totp/ with wrong code fails."""
        token, _ = self._get_owner_jwt()
        stage_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'EMAIL_OTP_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        res = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': stage_token, 'code': '999999'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data.get('success', True))

    # 14. Expired Challenge
    def test_14_expired_challenge(self):
        """Expired password change stage token is rejected."""
        token, _ = self._get_owner_jwt()
        expired_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'PASSWORD_VERIFIED',
                'ts': (timezone.now() - timedelta(minutes=15)).timestamp()
            },
            salt='owner-password-change-salt'
        )

        # Pass expired max_age
        with patch('django.core.signing.loads', side_effect=signing.SignatureExpired):
            res = self.client.post(
                '/api/platform-owner/security/password-change/verify-email/',
                data={'stage_token': expired_token, 'code': '123456'},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {token}'
            )
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn('expired', res.data.get('message', '').lower())

    # 15. TOTP Replay
    def test_15_totp_replay(self):
        """Replaying the same TOTP code in the same time step is rejected."""
        token, _ = self._get_owner_jwt()
        stage_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'EMAIL_OTP_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        totp = pyotp.TOTP(self.totp_raw_secret, interval=30)
        code = totp.now()

        # First verification succeeds
        v1 = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': stage_token, 'code': code},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(v1.status_code, status.HTTP_200_OK)

        # Replay attempt fails
        v2 = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': stage_token, 'code': code},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(v2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already been used', v2.data.get('message', '').lower())

    # 16. TOTP Attempt Limit
    def test_16_totp_attempt_limit(self):
        """Failed TOTP attempts lock out after max attempts (5)."""
        self.totp_config.failed_attempts = 5
        self.totp_config.save()

        token, _ = self._get_owner_jwt()
        stage_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'EMAIL_OTP_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        totp = pyotp.TOTP(self.totp_raw_secret, interval=30)
        res = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': stage_token, 'code': totp.now()},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('maximum', res.data.get('message', '').lower())

    # 17. Valid TOTP
    def test_17_valid_totp(self):
        """Valid TOTP code advances challenge to FULL_MFA_VERIFIED stage."""
        token, _ = self._get_owner_jwt()
        stage_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'EMAIL_OTP_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        totp = pyotp.TOTP(self.totp_raw_secret, interval=30)
        res = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': stage_token, 'code': totp.now()},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))
        self.assertEqual(res.data.get('stage'), 'FULL_MFA_VERIFIED')
        self.assertIn('stage_token', res.data)

    # 18. Password Validation
    def test_18_password_validation(self):
        """Weak passwords (short, entirely numeric, etc.) are rejected."""
        token, _ = self._get_owner_jwt()
        auth_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'FULL_MFA_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        res = self.client.post(
            '/api/platform-owner/security/password-change/complete/',
            data={'stage_token': auth_token, 'new_password': 'short', 'confirm_password': 'short'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 19. Password Confirmation Mismatch
    def test_19_password_confirmation_mismatch(self):
        """Mismatched new password and confirmation are rejected."""
        token, _ = self._get_owner_jwt()
        auth_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'FULL_MFA_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        res = self.client.post(
            '/api/platform-owner/security/password-change/complete/',
            data={'stage_token': auth_token, 'new_password': 'BrandNewValidPass#2026', 'confirm_password': 'MismatchedPass#2026'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('confirm_password', str(res.data))

    # 20. Successful Password Change
    def test_20_successful_password_change(self):
        """Complete 4-stage flow succeeds in updating password."""
        token, _ = self._get_owner_jwt()
        new_pass = 'BrandNewOwnerSecure#2026'

        # Stage 1
        res1 = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': self.test_password},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        token1 = res1.data['stage_token']

        # Set known OTP
        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_PASSWORD_CHANGE
        ).latest('created_at')
        otp_rec.set_otp('123456')
        otp_rec.save()

        # Stage 2
        res2 = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': token1, 'code': '123456'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        token2 = res2.data['stage_token']

        # Stage 3
        totp = pyotp.TOTP(self.totp_raw_secret, interval=30)
        res3 = self.client.post(
            '/api/platform-owner/security/password-change/verify-totp/',
            data={'stage_token': token2, 'code': totp.now()},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res3.status_code, status.HTTP_200_OK)
        token3 = res3.data['stage_token']

        # Stage 4
        res4 = self.client.post(
            '/api/platform-owner/security/password-change/complete/',
            data={'stage_token': token3, 'new_password': new_pass, 'confirm_password': new_pass},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res4.status_code, status.HTTP_200_OK)
        self.assertTrue(res4.data.get('success'))

        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password(new_pass))

    # 21. Old Password Rejected
    def test_21_old_password_rejected(self):
        """Old password no longer works after password change."""
        self.test_20_successful_password_change()
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.check_password(self.test_password))

    # 22. New Password Accepted
    def test_22_new_password_accepted(self):
        """New password successfully validates on owner account."""
        self.test_20_successful_password_change()
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.check_password('BrandNewOwnerSecure#2026'))

    # 23. Old Refresh Token Invalidated
    def test_23_old_refresh_token_invalidated(self):
        """Old refresh token is blacklisted and cannot be used after password change."""
        token, old_refresh = self._get_owner_jwt()
        new_pass = 'NewPasswordAfterInvalidate#2026'

        auth_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'FULL_MFA_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )

        res = self.client.post(
            '/api/platform-owner/security/password-change/complete/',
            data={'stage_token': auth_token, 'new_password': new_pass, 'confirm_password': new_pass},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Attempt to refresh with old refresh token
        refresh_res = self.client.post(
            '/api/auth/token/refresh/',
            data={'refresh': old_refresh},
            content_type='application/json'
        )
        self.assertEqual(refresh_res.status_code, status.HTTP_401_UNAUTHORIZED)

    # 24. Normal JWT Cannot Complete Password Change
    def test_24_normal_jwt_cannot_complete_password_change(self):
        """Calling complete endpoint without valid stage token fails."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/security/password-change/complete/',
            data={'stage_token': 'arbitrary_invalid_token', 'new_password': 'BrandNewPass#2026', 'confirm_password': 'BrandNewPass#2026'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # 25. Tampered Pre-auth Token Rejected
    def test_25_tampered_preauth_token_rejected(self):
        """Tampered signed token is rejected."""
        token, _ = self._get_owner_jwt()
        valid_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_PASSWORD_CHANGE',
                'stage': 'PASSWORD_VERIFIED',
                'ts': timezone.now().timestamp()
            },
            salt='owner-password-change-salt'
        )
        tampered_token = valid_token[:-4] + 'xxxx'

        res = self.client.post(
            '/api/platform-owner/security/password-change/verify-email/',
            data={'stage_token': tampered_token, 'code': '123456'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalid', res.data.get('message', '').lower())

    # 26. Student Blocked
    def test_26_student_blocked(self):
        """Student attempting to call password change endpoints gets 403 Forbidden."""
        student_jwt = self._get_user_jwt(self.student, User.Role.STUDENT)
        for endpoint in ['start', 'verify-email', 'verify-totp', 'complete']:
            res = self.client.post(
                f'/api/platform-owner/security/password-change/{endpoint}/',
                data={},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {student_jwt}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 27. Shop Owner Blocked
    def test_27_shop_owner_blocked(self):
        """Shop Owner attempting to call password change endpoints gets 403 Forbidden."""
        shop_jwt = self._get_user_jwt(self.shop_owner, User.Role.SHOP_OWNER)
        for endpoint in ['start', 'verify-email', 'verify-totp', 'complete']:
            res = self.client.post(
                f'/api/platform-owner/security/password-change/{endpoint}/',
                data={},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {shop_jwt}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 28. Courier Blocked
    def test_28_courier_blocked(self):
        """Courier attempting to call password change endpoints gets 403 Forbidden."""
        courier_jwt = self._get_user_jwt(self.courier, User.Role.DELIVERY_AGENT)
        for endpoint in ['start', 'verify-email', 'verify-totp', 'complete']:
            res = self.client.post(
                f'/api/platform-owner/security/password-change/{endpoint}/',
                data={},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {courier_jwt}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 29. Admin Blocked
    def test_29_admin_blocked(self):
        """Admin attempting to call password change endpoints gets 403 Forbidden."""
        admin_jwt = self._get_user_jwt(self.admin, User.Role.ADMIN)
        for endpoint in ['start', 'verify-email', 'verify-totp', 'complete']:
            res = self.client.post(
                f'/api/platform-owner/security/password-change/{endpoint}/',
                data={},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {admin_jwt}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 30. Owner Cannot Switch Role
    def test_30_owner_cannot_switch_role(self):
        """Owner cannot switch role to Student, Shop Owner, Courier, or Admin."""
        token, _ = self._get_owner_jwt()
        for target_role in [User.Role.STUDENT, User.Role.SHOP_OWNER, User.Role.DELIVERY_AGENT, User.Role.ADMIN]:
            res = self.client.post(
                '/api/auth/switch-role/',
                data={'role': target_role},
                content_type='application/json',
                HTTP_AUTHORIZATION=f'Bearer {token}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 31. LocalStorage Manipulation Blocked
    def test_31_localstorage_manipulation_blocked(self):
        """Manipulating frontend client state does not grant access; backend strictly verifies JWT."""
        student_jwt = self._get_user_jwt(self.student, User.Role.STUDENT)
        # Even if frontend requests with header or payload claiming PLATFORM_OWNER
        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': 'any', 'role': 'PLATFORM_OWNER'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {student_jwt}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 32. JWT Role Tampering Blocked
    def test_32_jwt_role_tampering_blocked(self):
        """JWT with tampered active_role but student user id is rejected."""
        refresh = RefreshToken.for_user(self.student)
        refresh['active_role'] = User.Role.PLATFORM_OWNER
        refresh.access_token['active_role'] = User.Role.PLATFORM_OWNER
        tampered_token = str(refresh.access_token)

        res = self.client.post(
            '/api/platform-owner/security/password-change/start/',
            data={'current_password': 'any'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {tampered_token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 33. Audit Logs Contain No Secrets
    def test_33_audit_logs_contain_no_secrets(self):
        """Audit logs for password change do not contain passwords, OTPs, or tokens."""
        self.test_20_successful_password_change()
        logs = AuditLog.objects.filter(actor=self.owner)
        for l in logs:
            meta_str = str(l.metadata).lower()
            self.assertNotIn('brandnewownersecure#2026', meta_str)
            self.assertNotIn(self.test_password.lower(), meta_str)
            self.assertNotIn('123456', meta_str)
            self.assertNotIn('secret', meta_str)

    # 34. TOTP Secret Not Exposed
    def test_34_totp_secret_not_exposed(self):
        """TOTP secret is stored encrypted and never returned in plaintext."""
        totp_obj = PlatformOwnerTOTP.objects.get(user=self.owner)
        self.assertNotEqual(totp_obj.encrypted_secret, self.totp_raw_secret)
        self.assertTrue(len(totp_obj.encrypted_secret) > 40)

    # 35. Password Not Logged
    def test_35_password_not_logged(self):
        """Django stores only password hash, never plaintext password."""
        self.owner.refresh_from_db()
        self.assertFalse(self.owner.password.startswith('Owner'))
        self.assertTrue(self.owner.password.startswith('pbkdf2_sha256$') or self.owner.password.startswith('argon2'))

    # 36. Regression: Owner Normal Login Password Check
    def test_36_regression_owner_normal_login(self):
        """Owner initial login with password triggers 2FA challenge response."""
        res = self.client.post(
            '/api/auth/login/',
            data={'email': 'garibhokya@gmail.com', 'password': self.test_password},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('requires_2fa'))
        self.assertIn('pre_auth_token', res.data)

    # 37. Regression: Owner Gmail OTP Login
    def test_37_regression_owner_gmail_otp(self):
        """Owner Gmail OTP verification during login advances to TOTP challenge."""
        login_res = self.client.post(
            '/api/auth/login/',
            data={'email': 'garibhokya@gmail.com', 'password': self.test_password},
            content_type='application/json'
        )
        pre_auth_token = login_res.data['pre_auth_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            user=self.owner,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA
        ).latest('created_at')
        otp_rec.set_otp('654321')
        otp_rec.save()

        verify_res = self.client.post(
            '/api/auth/owner/verify-2fa/',
            data={'email': 'garibhokya@gmail.com', 'otp': '654321', 'pre_auth_token': pre_auth_token},
            content_type='application/json'
        )
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertTrue(verify_res.data.get('requires_totp'))
        self.assertIn('pre_auth_token', verify_res.data)

    # 38. Regression: Owner TOTP Login
    def test_38_regression_owner_totp_login(self):
        """Owner TOTP login verification issues full JWT tokens."""
        totp_pre_auth = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email.lower(),
                'purpose': 'OWNER_TOTP',
                'stage': 'OWNER_TOTP',
                'ts': timezone.now().timestamp()
            },
            salt='owner-totp-preauth-salt'
        )

        totp = pyotp.TOTP(self.totp_raw_secret, interval=30)
        res = self.client.post(
            '/api/auth/owner/verify-totp/',
            data={'pre_auth_token': totp_pre_auth, 'code': totp.now()},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertIn('refresh', res.data)
        self.assertEqual(res.data.get('active_role'), User.Role.PLATFORM_OWNER)

    # 39. Regression: Student Login
    def test_39_regression_student_login(self):
        """Student login works normally and returns student active_role."""
        res = self.client.post(
            '/api/auth/login/',
            data={'email': self.student.email, 'password': 'StudentPassword123!'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertFalse(res.data.get('requires_2fa', False))
        self.assertEqual(res.data['user']['role'], User.Role.STUDENT)

    # 40. Regression: Shop Owner Login
    def test_40_regression_shop_owner_login(self):
        """Shop Owner login works normally and returns SHOP_OWNER active_role."""
        res = self.client.post(
            '/api/auth/login/',
            data={'email': self.shop_owner.email, 'password': 'ShopPassword123!'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertFalse(res.data.get('requires_2fa', False))
        self.assertEqual(res.data['user']['role'], User.Role.SHOP_OWNER)

    # 41. Regression: Courier Login
    def test_41_regression_courier_login(self):
        """Courier login works normally and returns DELIVERY_AGENT active_role."""
        res = self.client.post(
            '/api/auth/login/',
            data={'email': self.courier.email, 'password': 'CourierPassword123!'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertFalse(res.data.get('requires_2fa', False))
        self.assertEqual(res.data['user']['role'], User.Role.DELIVERY_AGENT)

    # 42. Regression: Admin Login
    def test_42_regression_admin_login(self):
        """Admin login works normally and returns ADMIN active_role."""
        res = self.client.post(
            '/api/auth/login/',
            data={'email': self.admin.email, 'password': 'AdminPassword123!'},
            content_type='application/json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertFalse(res.data.get('requires_2fa', False))
        self.assertEqual(res.data['user']['role'], User.Role.ADMIN)

    # 43. Regression: Student + Admin Switching
    def test_43_regression_student_admin_switching(self):
        """Multi-role user with STUDENT and ADMIN can switch between them."""
        multi_user = User.objects.create_user(
            username='multi_sa_18a',
            email='multi_sa_18a@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED
        )
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.STUDENT, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.ADMIN, defaults={'is_active': True})

        token = self._get_user_jwt(multi_user, User.Role.STUDENT)
        res = self.client.post(
            '/api/auth/switch-role/',
            data={'role': User.Role.ADMIN},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('active_role'), User.Role.ADMIN)

    # 44. Regression: Shop Owner + Admin Switching
    def test_44_regression_shop_owner_admin_switching(self):
        """Multi-role user with SHOP_OWNER and ADMIN can switch between them."""
        multi_user = User.objects.create_user(
            username='multi_so_18a',
            email='multi_so_18a@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            is_active=True,
            email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED
        )
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.SHOP_OWNER, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.ADMIN, defaults={'is_active': True})

        token = self._get_user_jwt(multi_user, User.Role.SHOP_OWNER)
        res = self.client.post(
            '/api/auth/switch-role/',
            data={'role': User.Role.ADMIN},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('active_role'), User.Role.ADMIN)

    # 45. Regression: Courier + Admin Switching
    def test_45_regression_courier_admin_switching(self):
        """Multi-role user with DELIVERY_AGENT and ADMIN can switch between them."""
        multi_user = User.objects.create_user(
            username='multi_ca_18a',
            email='multi_ca_18a@campus.edu',
            password='Password123!',
            role=User.Role.DELIVERY_AGENT,
            is_active=True,
            email_verified=True,
            approval_status=User.ApprovalStatus.APPROVED
        )
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.DELIVERY_AGENT, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=multi_user, role=User.Role.ADMIN, defaults={'is_active': True})

        token = self._get_user_jwt(multi_user, User.Role.DELIVERY_AGENT)
        res = self.client.post(
            '/api/auth/switch-role/',
            data={'role': User.Role.ADMIN},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data.get('active_role'), User.Role.ADMIN)

    # Additional Negative Test: Legacy Direct Password Change Disabled
    def test_46_legacy_password_change_rejected(self):
        """Legacy direct password change endpoint strictly rejects with 400 Bad Request."""
        token, _ = self._get_owner_jwt()
        res = self.client.post(
            '/api/platform-owner/change-password/',
            data={'current_password': self.test_password, 'new_password': 'BrandNewPass#2026'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data.get('success', True))
        self.assertIn('two-factor', res.data.get('message', '').lower())

    # Additional Negative Test: Forgot Password Bypass Blocked for Platform Owner
    def test_47_forgot_password_bypass_blocked_for_owner(self):
        """Public password reset endpoint cannot be used by Platform Owner to bypass 2FA."""
        # 1. request_password_reset does not send reset OTP
        success, msg = EmailService.request_password_reset('garibhokya@gmail.com')
        self.assertTrue(success)
        self.assertFalse(EmailVerificationOTP.objects.filter(email='garibhokya@gmail.com', purpose=EmailVerificationOTP.Purpose.PASSWORD_RESET).exists())

        # 2. confirm_password_reset rejects if called with fake token
        fake_token = signing.dumps(
            {'email': 'garibhokya@gmail.com', 'purpose': 'PASSWORD_RESET', 'ts': timezone.now().timestamp()},
            salt='password-reset-salt'
        )
        c_success, c_msg = EmailService.confirm_password_reset('garibhokya@gmail.com', fake_token, 'BrandNewPass#2026')
        self.assertFalse(c_success)
        self.assertIn('disabled for platform owner', c_msg.lower())
