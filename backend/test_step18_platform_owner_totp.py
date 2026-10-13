"""
STEP 18 — PLATFORM OWNER MICROSOFT AUTHENTICATOR (TOTP) 2FA TEST SUITE
Executes and validates all 33 mandatory security test cases.
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

from users.models import User, UserRole, EmailVerificationOTP, PlatformOwnerTOTP, AuditLog
from users.services.totp_service import OwnerTOTPService


class Step18PlatformOwnerTOTPTests(TestCase):
    """
    Test suite covering all 33 mandatory security test cases for Platform Owner TOTP 2FA.
    """

    def setUp(self):
        self.client = Client()
        self.test_password = 'TestOwnerSecretPass#2026'

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
            self.owner.save()
            UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})
        else:
            self.owner.set_password(self.test_password)
            self.owner.role = User.Role.PLATFORM_OWNER
            self.owner.is_active = True
            self.owner.email_verified = True
            self.owner.approval_status = User.ApprovalStatus.APPROVED
            self.owner.save()
            UserRole.objects.filter(user=self.owner).exclude(role=User.Role.PLATFORM_OWNER).delete()
            UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})

        # Ensure TOTP config is clean for each test
        PlatformOwnerTOTP.objects.filter(user=self.owner).delete()

        # Test Admin
        self.admin = User.objects.filter(email='test_admin_step18@campus.edu').first()
        if not self.admin:
            self.admin = User.objects.create_user(
                username='test_admin_step18',
                email='test_admin_step18@campus.edu',
                password='AdminPassword123!',
                role=User.Role.ADMIN,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.admin, role=User.Role.ADMIN, defaults={'is_active': True})

        # Test Student
        self.student = User.objects.filter(email='test_student_step18@campus.edu').first()
        if not self.student:
            self.student = User.objects.create_user(
                username='test_student_step18',
                email='test_student_step18@campus.edu',
                password='StudentPassword123!',
                role=User.Role.STUDENT,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.student, role=User.Role.STUDENT, defaults={'is_active': True})

        # Test Shop Owner
        self.shop_owner = User.objects.filter(email='test_shopowner_step18@campus.edu').first()
        if not self.shop_owner:
            self.shop_owner = User.objects.create_user(
                username='test_shopowner_step18',
                email='test_shopowner_step18@campus.edu',
                password='ShopPassword123!',
                role=User.Role.SHOP_OWNER,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.shop_owner, role=User.Role.SHOP_OWNER, defaults={'is_active': True})

        # Test Courier
        self.courier = User.objects.filter(email='test_courier_step18@campus.edu').first()
        if not self.courier:
            self.courier = User.objects.create_user(
                username='test_courier_step18',
                email='test_courier_step18@campus.edu',
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
        return str(refresh.access_token)

    def _get_user_jwt(self, user, role):
        refresh = RefreshToken.for_user(user)
        refresh['roles'] = [role]
        refresh['active_role'] = role
        refresh.access_token['roles'] = [role]
        refresh.access_token['active_role'] = role
        return str(refresh.access_token)

    # 1. Owner TOTP model creation
    def test_01_owner_totp_model_creation(self):
        totp = PlatformOwnerTOTP.objects.create(user=self.owner)
        totp.set_secret('JBSWY3DPEHPK3PXP')
        totp.save()
        self.assertEqual(totp.user, self.owner)
        self.assertFalse(totp.enabled)
        self.assertFalse(totp.verified)
        self.assertEqual(totp.get_secret(), 'JBSWY3DPEHPK3PXP')
        self.assertNotEqual(totp.encrypted_secret, 'JBSWY3DPEHPK3PXP')

    # 2. Only Platform Owner can enroll
    def test_02_only_platform_owner_can_enroll(self):
        token = self._get_owner_jwt()
        response = self.client.post(
            '/api/platform-owner/security/totp/setup/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data['success'])
        self.assertIn('qr_code_data_uri', data)
        self.assertIn('manual_entry_key', data)
        self.assertIn('provisioning_uri', data)

    # 3. Normal Student cannot enroll
    def test_03_normal_student_cannot_enroll(self):
        token = self._get_user_jwt(self.student, User.Role.STUDENT)
        response = self.client.post(
            '/api/platform-owner/security/totp/setup/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 4. Shop Owner cannot enroll
    def test_04_shop_owner_cannot_enroll(self):
        token = self._get_user_jwt(self.shop_owner, User.Role.SHOP_OWNER)
        response = self.client.post(
            '/api/platform-owner/security/totp/setup/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 5. Courier cannot enroll
    def test_05_courier_cannot_enroll(self):
        token = self._get_user_jwt(self.courier, User.Role.DELIVERY_AGENT)
        response = self.client.post(
            '/api/platform-owner/security/totp/setup/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 6. Admin cannot enroll
    def test_06_admin_cannot_enroll(self):
        token = self._get_user_jwt(self.admin, User.Role.ADMIN)
        response = self.client.post(
            '/api/platform-owner/security/totp/setup/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 7. TOTP secret generated securely
    def test_07_totp_secret_generated_securely(self):
        enroll1 = OwnerTOTPService.initiate_enrollment(self.owner)
        secret1 = enroll1['manual_entry_key']
        enroll2 = OwnerTOTPService.initiate_enrollment(self.owner)
        secret2 = enroll2['manual_entry_key']
        self.assertEqual(len(secret1), 32)
        self.assertEqual(len(secret2), 32)
        self.assertNotEqual(secret1, secret2)

    # 8. Secret not returned after enrollment
    def test_08_secret_not_returned_after_enrollment(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()

        # Confirm enrollment
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        # GET status must never include secret
        token = self._get_owner_jwt()
        response = self.client.get(
            '/api/platform-owner/security/totp/status/',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(data['enabled'])
        self.assertTrue(data['verified'])
        self.assertNotIn('secret', data)
        self.assertNotIn('encrypted_secret', data)
        self.assertNotIn('manual_entry_key', data)

    # 9. QR provisioning URI generated correctly
    def test_09_qr_provisioning_uri_generated_correctly(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        uri = enroll['provisioning_uri']
        self.assertTrue(uri.startswith('otpauth://totp/CampusCart:garibhokya%40gmail.com?') or uri.startswith('otpauth://totp/CampusCart:garibhokya@gmail.com?'))
        self.assertIn('issuer=CampusCart', uri)
        self.assertIn('secret=', uri)

    # 10. Correct TOTP verifies
    def test_10_correct_totp_verifies(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()

    # 10. Correct TOTP verifies
    def test_10_correct_totp_verifies(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()

        # Confirm
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        # Verify login code (advance time step slightly to avoid replay check with confirm)
        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        valid, msg = OwnerTOTPService.verify_login_code(self.owner, totp.now())
        self.assertTrue(valid)

    # 11. Wrong TOTP rejected
    def test_11_wrong_totp_rejected(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        valid, msg = OwnerTOTPService.verify_login_code(self.owner, "000000" if code != "000000" else "111111")
        self.assertFalse(valid)
        self.assertIn("Invalid Authenticator code", msg)

    # 12. Non-6-digit code rejected
    def test_12_non_6_digit_code_rejected(self):
        for bad_code in ["12345", "1234567", "abcdef", "1234a6", ""]:
            valid, msg = OwnerTOTPService.verify_login_code(self.owner, bad_code)
            self.assertFalse(valid)
            self.assertIn("6 digits", msg)

    # 13. Expired/invalid challenge rejected
    def test_13_expired_invalid_challenge_rejected(self):
        # Invalid signature
        res = self.client.post('/api/auth/owner/verify-totp/', {'pre_auth_token': 'bad.token.here', 'code': '123456'})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid authentication challenge", res.json()['message'])

        # Expired token
        expired_token = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email,
                'purpose': 'OWNER_TOTP',
                'stage': 'OWNER_TOTP',
                'ts': timezone.now().timestamp() - 400
            },
            salt='owner-totp-preauth-salt'
        )
        with patch('django.core.signing.loads', side_effect=signing.SignatureExpired("Expired")):
            res2 = self.client.post('/api/auth/owner/verify-totp/', {'pre_auth_token': expired_token, 'code': '123456'})
            self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertIn("expired", res2.json()['message'].lower())

    # 14. TOTP challenge cannot access Owner API
    def test_14_totp_challenge_cannot_access_owner_api(self):
        totp_challenge = signing.dumps(
            {
                'user_id': self.owner.id,
                'email': self.owner.email,
                'purpose': 'OWNER_TOTP',
                'stage': 'OWNER_TOTP',
                'ts': timezone.now().timestamp()
            },
            salt='owner-totp-preauth-salt'
        )
        response = self.client.get(
            '/api/platform-owner/dashboard-stats/',
            HTTP_AUTHORIZATION=f'Bearer {totp_challenge}'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 15. Full JWT not issued before TOTP
    def test_15_full_jwt_not_issued_before_totp(self):
        # Enable TOTP on owner account
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        code = pyotp.TOTP(secret).now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        # Generate Owner 2FA OTP
        otp_rec = EmailVerificationOTP.objects.create(
            user=self.owner,
            email=self.owner.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            expires_at=timezone.now() + timedelta(minutes=10)
        )
        otp_rec.set_otp('654321')
        otp_rec.save()

        pre_auth_token = signing.dumps(
            {'user_id': self.owner.id, 'email': self.owner.email, 'purpose': 'OWNER_2FA', 'ts': timezone.now().timestamp()},
            salt='owner-2fa-preauth-salt'
        )

        # Verify Gmail OTP
        res = self.client.post(
            '/api/auth/owner/verify-2fa/',
            {'email': self.owner.email, 'otp': '654321', 'pre_auth_token': pre_auth_token}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data.get('requires_totp'))
        self.assertNotIn('access', data)
        self.assertNotIn('refresh', data)
        self.assertIn('pre_auth_token', data)

    # 16. Full JWT issued after valid TOTP
    def test_16_full_jwt_issued_after_valid_totp(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        totp_pre_auth = signing.dumps(
            {'user_id': self.owner.id, 'email': self.owner.email, 'purpose': 'OWNER_TOTP', 'stage': 'OWNER_TOTP', 'ts': timezone.now().timestamp()},
            salt='owner-totp-preauth-salt'
        )

        res = self.client.post(
            '/api/auth/owner/verify-totp/',
            {'pre_auth_token': totp_pre_auth, 'code': code}
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data['success'])
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['active_role'], User.Role.PLATFORM_OWNER)

    # 17. TOTP attempt limit works
    def test_17_totp_attempt_limit_works(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.failed_attempts = 0
        config.save(update_fields=['last_used_time_step', 'failed_attempts'])

        # Fail 5 times
        for i in range(5):
            valid, msg = OwnerTOTPService.verify_login_code(self.owner, "000000")
            self.assertFalse(valid)

        # 6th attempt should be locked out
        valid, msg = OwnerTOTPService.verify_login_code(self.owner, totp.now())
        self.assertFalse(valid)
        self.assertIn("Maximum verification attempts exceeded", msg)

    # 18. Replay protection works
    def test_18_replay_protection_works(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        # First verification succeeds
        valid1, _ = OwnerTOTPService.verify_login_code(self.owner, code)
        self.assertTrue(valid1)

        # Second verification with exact same code/time-step must be rejected
        valid2, msg2 = OwnerTOTPService.verify_login_code(self.owner, code)
        self.assertFalse(valid2)
        self.assertIn("already been used", msg2)

    # 19. Clock drift ±1 works
    def test_19_clock_drift_plus_minus_1_works(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        # Test code for offset - 1
        now = timezone.now()
        code_prev = totp.at(now, counter_offset=-1)

        valid, _ = OwnerTOTPService.verify_login_code(self.owner, code_prev)
        self.assertTrue(valid)

    # 20. Large clock drift rejected
    def test_20_large_clock_drift_rejected(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        now = timezone.now()
        code_drift_3 = totp.at(now, counter_offset=-3)

        valid, msg = OwnerTOTPService.verify_login_code(self.owner, code_drift_3)
        self.assertFalse(valid)
        self.assertIn("Invalid Authenticator code", msg)

    # 21. Owner cannot switch role
    def test_21_owner_cannot_switch_role(self):
        token = self._get_owner_jwt()
        for target_role in [User.Role.STUDENT, User.Role.SHOP_OWNER, User.Role.DELIVERY_AGENT, User.Role.ADMIN]:
            response = self.client.post(
                '/api/auth/switch-role/',
                {'role': target_role},
                HTTP_AUTHORIZATION=f'Bearer {token}'
            )
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 22. Admin cannot disable Owner TOTP
    def test_22_admin_cannot_disable_owner_totp(self):
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        totp = pyotp.TOTP(enroll['manual_entry_key'])
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, totp.now())
        self.assertTrue(success)

        admin_token = self._get_user_jwt(self.admin, User.Role.ADMIN)
        # Attempt to reset/disable Owner TOTP
        response = self.client.post(
            '/api/platform-owner/security/totp/reset/',
            {'password': 'SomePassword', 'code': '123456'},
            HTTP_AUTHORIZATION=f'Bearer {admin_token}'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Confirm Owner TOTP remains enabled
        self.assertTrue(PlatformOwnerTOTP.objects.get(user=self.owner).enabled)

    # 23. Student cannot manipulate Owner TOTP
    def test_23_student_cannot_manipulate_owner_totp(self):
        student_token = self._get_user_jwt(self.student, User.Role.STUDENT)
        for ep in ['setup', 'confirm', 'reset']:
            res = self.client.post(
                f'/api/platform-owner/security/totp/{ep}/',
                {},
                HTTP_AUTHORIZATION=f'Bearer {student_token}'
            )
            self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # 24. JWT tampering rejected
    def test_24_jwt_tampering_rejected(self):
        token = self._get_owner_jwt()
        tampered_token = token[:-5] + "ABCDE"
        response = self.client.get(
            '/api/platform-owner/dashboard-stats/',
            HTTP_AUTHORIZATION=f'Bearer {tampered_token}'
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # 25. localStorage role manipulation rejected
    def test_25_localstorage_role_manipulation_rejected(self):
        student_token = self._get_user_jwt(self.student, User.Role.STUDENT)
        response = self.client.get(
            '/api/platform-owner/dashboard-stats/',
            HTTP_AUTHORIZATION=f'Bearer {student_token}',
            HTTP_X_ROLE='PLATFORM_OWNER'
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # 26. Logout invalidates refresh token
    def test_26_logout_invalidates_refresh_token(self):
        refresh = RefreshToken.for_user(self.owner)
        token = str(refresh.access_token)
        response = self.client.post(
            '/api/auth/logout/',
            {'refresh': str(refresh)},
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Attempt to refresh token after logout must fail
        refresh_res = self.client.post(
            '/api/auth/token/refresh/',
            {'refresh': str(refresh)}
        )
        self.assertEqual(refresh_res.status_code, status.HTTP_401_UNAUTHORIZED)

    # 27. Owner email cannot register as another role
    def test_27_owner_email_cannot_register_as_another_role(self):
        response = self.client.post(
            '/api/auth/register/',
            {
                'name': 'Attacker',
                'email': self.owner.email,
                'password': 'SomeStrongPassword123!',
                'role': User.Role.STUDENT
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # 28. Existing multi-role users remain unaffected
    def test_28_existing_multi_role_users_remain_unaffected(self):
        # Give student an extra role SHOP_OWNER
        UserRole.objects.get_or_create(user=self.student, role=User.Role.SHOP_OWNER, defaults={'is_active': True})
        self.assertIn(User.Role.STUDENT, self.student.roles)
        self.assertIn(User.Role.SHOP_OWNER, self.student.roles)

        # Switch role works for student
        student_token = self._get_user_jwt(self.student, User.Role.STUDENT)
        response = self.client.post(
            '/api/auth/switch-role/',
            {'role': User.Role.SHOP_OWNER},
            HTTP_AUTHORIZATION=f'Bearer {student_token}'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['user']['active_role'], User.Role.SHOP_OWNER)

    # 29. Student login still works
    def test_29_student_login_still_works(self):
        response = self.client.post(
            '/api/auth/login/',
            {'email': self.student.email, 'password': 'StudentPassword123!'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertFalse(data.get('requires_2fa', False))

    # 30. Shop Owner login still works
    def test_30_shop_owner_login_still_works(self):
        response = self.client.post(
            '/api/auth/login/',
            {'email': self.shop_owner.email, 'password': 'ShopPassword123!'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertFalse(data.get('requires_2fa', False))

    # 31. Courier login still works
    def test_31_courier_login_still_works(self):
        response = self.client.post(
            '/api/auth/login/',
            {'email': self.courier.email, 'password': 'CourierPassword123!'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertFalse(data.get('requires_2fa', False))

    # 32. Admin login still works
    def test_32_admin_login_still_works(self):
        response = self.client.post(
            '/api/auth/login/',
            {'email': self.admin.email, 'password': 'AdminPassword123!'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('access', data)
        self.assertFalse(data.get('requires_2fa', False))

    # 33. Owner password + Gmail OTP + TOTP full flow works
    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_33_owner_password_plus_gmail_otp_plus_totp_full_flow_works(self, mock_dispatch):
        # 1. Enroll TOTP
        enroll = OwnerTOTPService.initiate_enrollment(self.owner)
        secret = enroll['manual_entry_key']
        totp = pyotp.TOTP(secret)
        code = totp.now()
        success, _ = OwnerTOTPService.confirm_enrollment(self.owner, code)
        self.assertTrue(success)

        config = PlatformOwnerTOTP.objects.get(user=self.owner)
        config.last_used_time_step = 0
        config.save(update_fields=['last_used_time_step'])

        # Step 1: Owner login with Password
        login_res = self.client.post(
            '/api/auth/login/',
            {'email': self.owner.email, 'password': self.test_password}
        )
        self.assertEqual(login_res.status_code, status.HTTP_200_OK)
        login_data = login_res.json()
        self.assertTrue(login_data['requires_2fa'])
        pre_auth_1 = login_data['pre_auth_token']

        # Retrieve the OTP record created and set code to '987654'
        otp_rec = EmailVerificationOTP.objects.filter(
            email=self.owner.email,
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp_rec.set_otp('987654')
        otp_rec.save()

        # Step 2: Owner enters Gmail OTP
        res_2fa = self.client.post(
            '/api/auth/owner/verify-2fa/',
            {'email': self.owner.email, 'otp': '987654', 'pre_auth_token': pre_auth_1}
        )
        self.assertEqual(res_2fa.status_code, status.HTTP_200_OK)
        data_2fa = res_2fa.json()
        self.assertTrue(data_2fa['requires_totp'])
        self.assertNotIn('access', data_2fa)
        pre_auth_2 = data_2fa['pre_auth_token']

        # Step 3: Owner enters Microsoft Authenticator TOTP
        res_totp = self.client.post(
            '/api/auth/owner/verify-totp/',
            {'pre_auth_token': pre_auth_2, 'code': code}
        )
        self.assertEqual(res_totp.status_code, status.HTTP_200_OK)
        data_totp = res_totp.json()
        self.assertTrue(data_totp['success'])
        self.assertIn('access', data_totp)
        self.assertIn('refresh', data_totp)
        self.assertEqual(data_totp['active_role'], User.Role.PLATFORM_OWNER)

        # Step 4: Verify access to Platform Owner Dashboard API
        owner_access = data_totp['access']
        dash_res = self.client.get(
            '/api/platform-owner/dashboard-stats/',
            HTTP_AUTHORIZATION=f'Bearer {owner_access}'
        )
        self.assertEqual(dash_res.status_code, status.HTTP_200_OK)


if __name__ == '__main__':
    from django.test.runner import DiscoverRunner
    test_runner = DiscoverRunner(verbosity=2)
    failures = test_runner.run_tests(['test_step18_platform_owner_totp'])
    sys.exit(bool(failures))
