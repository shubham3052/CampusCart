"""
STEP 17 — PLATFORM OWNER ACCOUNT HARDENING + MANDATORY 2FA TEST SUITE
Executes and validates all 40 mandatory security test cases.
"""

import os
import sys
import django
from datetime import timedelta
from unittest.mock import patch

# Setup Django environment
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.test import Client, TestCase
from django.utils import timezone
from django.core import signing
from django.core.exceptions import ValidationError
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import User, UserRole, EmailVerificationOTP, AuditLog
from users.services.role_service import RoleService
from users.services.email_service import EmailService


class Step17PlatformOwnerHardeningTests(TestCase):
    """
    Test suite containing all 40 mandatory tests from Step 17.
    """

    def setUp(self):
        self.client = Client()

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
            self.owner.set_password('TestOwnerSecretPass#2026')
            self.owner.save()
            UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})
        else:
            # Ensure safe test password for automated login test cases
            self.test_password = 'TestOwnerSecretPass#2026'
            self.owner.set_password(self.test_password)
            self.owner.role = User.Role.PLATFORM_OWNER
            self.owner.is_active = True
            self.owner.email_verified = True
            self.owner.approval_status = User.ApprovalStatus.APPROVED
            self.owner.save()
            UserRole.objects.filter(user=self.owner).exclude(role=User.Role.PLATFORM_OWNER).delete()
            UserRole.objects.get_or_create(user=self.owner, role=User.Role.PLATFORM_OWNER, defaults={'is_active': True})

        # Test Admin
        self.admin = User.objects.filter(email='test_admin_step17@campus.edu').first()
        if not self.admin:
            self.admin = User.objects.create_user(
                username='test_admin_step17',
                email='test_admin_step17@campus.edu',
                password='AdminPassword123!',
                role=User.Role.ADMIN,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.admin, role=User.Role.ADMIN, defaults={'is_active': True})

        # Test Student
        self.student = User.objects.filter(email='test_student_step17@campus.edu').first()
        if not self.student:
            self.student = User.objects.create_user(
                username='test_student_step17',
                email='test_student_step17@campus.edu',
                password='StudentPassword123!',
                role=User.Role.STUDENT,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.student, role=User.Role.STUDENT, defaults={'is_active': True})

        # Test Shop Owner
        self.shop_owner = User.objects.filter(email='test_shopowner_step17@campus.edu').first()
        if not self.shop_owner:
            self.shop_owner = User.objects.create_user(
                username='test_shopowner_step17',
                email='test_shopowner_step17@campus.edu',
                password='ShopPassword123!',
                role=User.Role.SHOP_OWNER,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.shop_owner, role=User.Role.SHOP_OWNER, defaults={'is_active': True})

        # Test Courier
        self.courier = User.objects.filter(email='test_courier_step17@campus.edu').first()
        if not self.courier:
            self.courier = User.objects.create_user(
                username='test_courier_step17',
                email='test_courier_step17@campus.edu',
                password='CourierPassword123!',
                role=User.Role.DELIVERY_AGENT,
                is_active=True,
                email_verified=True,
                approval_status=User.ApprovalStatus.APPROVED
            )
            UserRole.objects.get_or_create(user=self.courier, role=User.Role.DELIVERY_AGENT, defaults={'is_active': True})

    # ==========================================
    # TESTS 1 - 5: OWNER ACCOUNT STATE
    # ==========================================

    def test_01_owner_account_exists_exactly_once(self):
        """TEST 1: garibhokya@gmail.com exists exactly once."""
        count = User.objects.filter(email__iexact='garibhokya@gmail.com').count()
        self.assertEqual(count, 1)

    def test_02_owner_has_exactly_one_role_platform_owner(self):
        """TEST 2: Owner has exactly one role: PLATFORM_OWNER."""
        active_roles = list(UserRole.objects.filter(user=self.owner, is_active=True).values_list('role', flat=True))
        self.assertEqual(active_roles, [User.Role.PLATFORM_OWNER])
        self.assertEqual(self.owner.roles, [User.Role.PLATFORM_OWNER])

    def test_03_owner_active_role_is_platform_owner(self):
        """TEST 3: Owner active_role: PLATFORM_OWNER."""
        self.assertEqual(self.owner.active_role, User.Role.PLATFORM_OWNER)

    def test_04_owner_email_is_verified(self):
        """TEST 4: Owner email is verified."""
        self.assertTrue(self.owner.email_verified)

    def test_05_owner_account_is_active(self):
        """TEST 5: Owner account is active."""
        self.assertTrue(self.owner.is_active)

    # ==========================================
    # TESTS 6 - 15: 2FA & OTP LIFECYCLE
    # ==========================================

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_06_correct_password_does_not_immediately_provide_tokens(self, mock_dispatch):
        """TEST 6: Correct password does NOT immediately provide fully authenticated Owner access."""
        res = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertTrue(data.get('requires_2fa'))
        self.assertNotIn('access', data)
        self.assertNotIn('refresh', data)
        self.assertIn('pre_auth_token', data)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_07_correct_password_generates_owner_otp(self, mock_dispatch):
        """TEST 7: Correct password generates Owner OTP."""
        res = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        otp = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).order_by('-created_at').first()
        self.assertIsNotNone(otp)
        self.assertFalse(otp.is_expired)

    def test_08_wrong_password_does_not_generate_authenticated_session(self):
        """TEST 8: Wrong password does not generate authenticated Owner session."""
        res = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'WrongPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_09_wrong_otp_fails(self, mock_dispatch):
        """TEST 9: Wrong OTP fails."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        res_verify = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '000000',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_verify.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Invalid", res_verify.json()['message'])

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_10_correct_otp_completes_authentication(self, mock_dispatch):
        """TEST 10: Correct OTP completes authentication."""
        # Clean previous OTPs
        EmailVerificationOTP.objects.filter(email='garibhokya@gmail.com').delete()

        # Login to generate OTP
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        # Retrieve raw OTP that was generated by overriding generate_numeric_otp
        otp_rec = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp_rec.set_otp('654321')
        otp_rec.save()

        res_verify = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '654321',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_verify.status_code, status.HTTP_200_OK)
        data = res_verify.json()
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['active_role'], User.Role.PLATFORM_OWNER)
        self.assertEqual(data['user']['email'], 'garibhokya@gmail.com')

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_11_expired_otp_fails(self, mock_dispatch):
        """TEST 11: Expired OTP fails."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp_rec.set_otp('123456')
        otp_rec.expires_at = timezone.now() - timedelta(minutes=10)
        otp_rec.save()

        res_verify = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '123456',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_verify.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res_verify.json()['message'].lower())

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_12_otp_replay_fails(self, mock_dispatch):
        """TEST 12: OTP replay fails."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp_rec.set_otp('789123')
        otp_rec.save()

        # First verification succeeds
        res1 = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '789123',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Replay attempt fails
        res2 = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '789123',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_13_old_otp_fails_after_resend(self, mock_dispatch):
        """TEST 13: Old OTP fails after resend."""
        # 1. First OTP
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        otp1 = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp1.set_otp('111111')
        otp1.last_sent_at = timezone.now() - timedelta(seconds=70)  # bypass cooldown
        otp1.save()

        # 2. Resend new OTP
        res_resend = self.client.post('/api/auth/owner/resend-2fa/', {
            'email': 'garibhokya@gmail.com',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_resend.status_code, status.HTTP_200_OK)

        # Verify old OTP record was invalidated (expired)
        otp1.refresh_from_db()
        self.assertTrue(otp1.is_expired)

        # Verifying with old OTP code fails
        res_verify_old = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '111111',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_verify_old.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_14_otp_attempt_limit_works(self, mock_dispatch):
        """TEST 14: OTP attempt limit works."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        # Attempt 5 wrong OTPs
        for _ in range(5):
            res = self.client.post('/api/auth/owner/verify-2fa/', {
                'email': 'garibhokya@gmail.com',
                'otp': '999999',
                'pre_auth_token': pre_auth_token
            }, content_type='application/json')
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6th attempt is locked
        res6 = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '999999',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res6.status_code, status.HTTP_400_BAD_REQUEST)
        msg_lower = res6.json()['message'].lower()
        self.assertTrue('exceeded' in msg_lower or 'locked' in msg_lower)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_15_otp_resend_cooldown_works(self, mock_dispatch):
        """TEST 15: OTP resend cooldown works."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        # Immediate resend attempt should hit 60s cooldown
        res_resend = self.client.post('/api/auth/owner/resend-2fa/', {
            'email': 'garibhokya@gmail.com',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        self.assertEqual(res_resend.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("wait", res_resend.json()['message'].lower())

    # ==========================================
    # TESTS 16 - 17: PRE-AUTH SECURITY
    # ==========================================

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_16_owner_can_access_api_only_after_otp(self, mock_dispatch):
        """TEST 16: Owner can access Platform Owner API only after OTP."""
        # 1. Login & OTP setup
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        otp_rec = EmailVerificationOTP.objects.filter(
            email='garibhokya@gmail.com',
            purpose=EmailVerificationOTP.Purpose.OWNER_2FA,
            is_verified=False
        ).first()
        otp_rec.set_otp('333333')
        otp_rec.save()

        # 2. Verify 2FA to receive full JWT
        res_verify = self.client.post('/api/auth/owner/verify-2fa/', {
            'email': 'garibhokya@gmail.com',
            'otp': '333333',
            'pre_auth_token': pre_auth_token
        }, content_type='application/json')
        jwt_access = res_verify.json()['access']

        # 3. Access Platform Owner API with validated JWT
        res_api = self.client.get(
            '/api/platform-owner/admins/',
            HTTP_AUTHORIZATION=f'Bearer {jwt_access}'
        )
        self.assertEqual(res_api.status_code, status.HTTP_200_OK)

    @patch('users.services.email_service.EmailService._send_email_dispatch', return_value=(True, "Sent"))
    def test_17_pre_auth_token_cannot_access_platform_owner_api(self, mock_dispatch):
        """TEST 17: Password-authenticated-but-OTP-unverified temporary state cannot access Platform Owner API."""
        res_login = self.client.post('/api/auth/login/', {
            'email': 'garibhokya@gmail.com',
            'password': 'TestOwnerSecretPass#2026'
        }, content_type='application/json')
        pre_auth_token = res_login.json()['pre_auth_token']

        # Attempt to access Platform Owner API using the pre_auth_token
        res_api = self.client.get(
            '/api/platform-owner/admins/',
            HTTP_AUTHORIZATION=f'Bearer {pre_auth_token}'
        )
        self.assertEqual(res_api.status_code, status.HTTP_401_UNAUTHORIZED)

    # ==========================================
    # TESTS 18 - 21: ROLE SWITCHING RESTRICTIONS
    # ==========================================

    def _get_authenticated_owner_client(self):
        refresh = RefreshToken.for_user(self.owner)
        refresh['roles'] = [User.Role.PLATFORM_OWNER]
        refresh['active_role'] = User.Role.PLATFORM_OWNER
        refresh.access_token['roles'] = [User.Role.PLATFORM_OWNER]
        refresh.access_token['active_role'] = User.Role.PLATFORM_OWNER
        token = str(refresh.access_token)
        return token

    def test_18_owner_cannot_switch_to_admin(self):
        """TEST 18: Owner cannot switch to ADMIN."""
        token = self._get_authenticated_owner_client()
        res = self.client.post(
            '/api/auth/switch-role/',
            {'role': 'ADMIN'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_19_owner_cannot_switch_to_student(self):
        """TEST 19: Owner cannot switch to STUDENT."""
        token = self._get_authenticated_owner_client()
        res = self.client.post(
            '/api/auth/switch-role/',
            {'role': 'STUDENT'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_20_owner_cannot_switch_to_shop_owner(self):
        """TEST 20: Owner cannot switch to SHOP_OWNER."""
        token = self._get_authenticated_owner_client()
        res = self.client.post(
            '/api/auth/switch-role/',
            {'role': 'SHOP_OWNER'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_21_owner_cannot_switch_to_delivery_agent(self):
        """TEST 21: Owner cannot switch to DELIVERY_AGENT."""
        token = self._get_authenticated_owner_client()
        res = self.client.post(
            '/api/auth/switch-role/',
            {'role': 'DELIVERY_AGENT'},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # ==========================================
    # TESTS 22 - 26: ESCALATION & REGISTRATION
    # ==========================================

    def test_22_admin_cannot_promote_itself_to_platform_owner(self):
        """TEST 22: Admin cannot promote itself to Platform Owner."""
        with self.assertRaises(ValidationError):
            RoleService.assign_role(user=self.admin, role=User.Role.PLATFORM_OWNER, assigned_by=self.admin)

    def test_23_admin_cannot_promote_another_user_to_platform_owner(self):
        """TEST 23: Admin cannot promote another user to Platform Owner."""
        with self.assertRaises(ValidationError):
            RoleService.assign_role(user=self.student, role=User.Role.PLATFORM_OWNER, assigned_by=self.admin)

    def test_24_student_cannot_promote_itself_to_platform_owner(self):
        """TEST 24: Student cannot promote itself to Platform Owner."""
        with self.assertRaises(ValidationError):
            RoleService.assign_role(user=self.student, role=User.Role.PLATFORM_OWNER, assigned_by=self.student)

    def test_25_public_registration_with_platform_owner_fails(self):
        """TEST 25: Public registration with PLATFORM_OWNER fails."""
        res = self.client.post('/api/auth/register/', {
            'name': 'Hacker Owner',
            'email': 'hacker_owner@test.edu',
            'password': 'Password123!',
            'role': 'PLATFORM_OWNER'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("strictly forbidden", str(res.json()))

    def test_26_registration_using_garibhokya_fails(self):
        """TEST 26: Registration using garibhokya@gmail.com as another role fails."""
        res = self.client.post('/api/auth/register/', {
            'name': 'Duplicate Owner Attempt',
            'email': 'garibhokya@gmail.com',
            'password': 'Password123!',
            'role': 'STUDENT'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # ==========================================
    # TESTS 27 - 30: ADMIN RESTRICTIONS
    # ==========================================

    def _get_authenticated_admin_client(self):
        refresh = RefreshToken.for_user(self.admin)
        refresh['roles'] = [User.Role.ADMIN]
        refresh['active_role'] = User.Role.ADMIN
        return str(refresh.access_token)

    def test_27_admin_cannot_deactivate_owner(self):
        """TEST 27: Admin cannot deactivate Owner."""
        admin_token = self._get_authenticated_admin_client()
        res = self.client.post(
            f'/api/admin/management/admins/{self.owner.id}/toggle-status/',
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {admin_token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.owner.refresh_from_db()
        self.assertTrue(self.owner.is_active)

    def test_28_admin_cannot_delete_owner(self):
        """TEST 28: Admin cannot delete Owner."""
        admin_token = self._get_authenticated_admin_client()
        res = self.client.delete(
            f'/api/users/{self.owner.id}/',
            HTTP_AUTHORIZATION=f'Bearer {admin_token}'
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(User.objects.filter(id=self.owner.id).exists())

    def test_29_admin_cannot_remove_platform_owner_role(self):
        """TEST 29: Admin cannot remove PLATFORM_OWNER role."""
        with self.assertRaises(ValidationError):
            RoleService.remove_role(user=self.owner, role=User.Role.PLATFORM_OWNER, removed_by=self.admin)

    def test_30_admin_cannot_add_another_role_to_owner(self):
        """TEST 30: Admin cannot add another role to Owner."""
        with self.assertRaises(ValidationError):
            RoleService.assign_role(user=self.owner, role=User.Role.ADMIN, assigned_by=self.admin)

    # ==========================================
    # TESTS 31 - 33: JWT INTEGRITY & LOGOUT
    # ==========================================

    def test_31_tampered_role_does_not_bypass_authorization(self):
        """TEST 31: Tampered active_role does not bypass authorization."""
        # Authenticate as student
        refresh = RefreshToken.for_user(self.student)
        # Attempt to forge active_role to PLATFORM_OWNER on an unauthorized student user
        refresh['active_role'] = 'PLATFORM_OWNER'
        refresh.access_token['active_role'] = 'PLATFORM_OWNER'
        student_tampered_token = str(refresh.access_token)

        res = self.client.get(
            '/api/platform-owner/admins/',
            HTTP_AUTHORIZATION=f'Bearer {student_tampered_token}'
        )
        # Server verifies actual authorized DB roles via MultiRoleJWTAuthentication and rejects
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_32_tampered_jwt_signature_fails(self):
        """TEST 32: Tampered JWT fails."""
        token = self._get_authenticated_owner_client()
        parts = token.split('.')
        # Tamper payload part
        tampered_token = f"{parts[0]}.eyJhY3RpdmVfcm9sZSI6ICJBRE1JTiJ9.{parts[2]}"

        res = self.client.get(
            '/api/platform-owner/admins/',
            HTTP_AUTHORIZATION=f'Bearer {tampered_token}'
        )
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_33_owner_logout_invalidates_refresh_token(self):
        """TEST 33: Owner logout invalidates refresh token."""
        refresh = RefreshToken.for_user(self.owner)
        res = self.client.post(
            '/api/auth/logout/',
            {'refresh': str(refresh)},
            content_type='application/json',
            HTTP_AUTHORIZATION=f'Bearer {str(refresh.access_token)}'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Attempt to use blacklisted refresh token fails
        res_refresh = self.client.post('/api/auth/token/refresh/', {
            'refresh': str(refresh)
        }, content_type='application/json')
        self.assertEqual(res_refresh.status_code, status.HTTP_401_UNAUTHORIZED)

    # ==========================================
    # TESTS 34 - 37: NORMAL USERS UNCHANGED
    # ==========================================

    def test_34_normal_student_login_remains_unchanged(self):
        """TEST 34: Normal Student login remains unchanged (no 2FA required)."""
        res = self.client.post('/api/auth/login/', {
            'email': 'test_student_step17@campus.edu',
            'password': 'StudentPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertNotIn('requires_2fa', data)
        self.assertIn('access', data)
        self.assertIn('refresh', data)
        self.assertEqual(data['user']['active_role'], User.Role.STUDENT)

    def test_35_normal_shop_owner_login_remains_unchanged(self):
        """TEST 35: Normal Shop Owner login remains unchanged."""
        res = self.client.post('/api/auth/login/', {
            'email': 'test_shopowner_step17@campus.edu',
            'password': 'ShopPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertNotIn('requires_2fa', data)
        self.assertIn('access', data)
        self.assertEqual(data['user']['active_role'], User.Role.SHOP_OWNER)

    def test_36_normal_courier_login_remains_unchanged(self):
        """TEST 36: Normal Courier login remains unchanged."""
        res = self.client.post('/api/auth/login/', {
            'email': 'test_courier_step17@campus.edu',
            'password': 'CourierPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertNotIn('requires_2fa', data)
        self.assertIn('access', data)
        self.assertEqual(data['user']['active_role'], User.Role.DELIVERY_AGENT)

    def test_37_normal_admin_login_remains_unchanged(self):
        """TEST 37: Normal Admin login remains unchanged."""
        res = self.client.post('/api/auth/login/', {
            'email': 'test_admin_step17@campus.edu',
            'password': 'AdminPassword123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertNotIn('requires_2fa', data)
        self.assertIn('access', data)
        self.assertEqual(data['user']['active_role'], User.Role.ADMIN)

    # ==========================================
    # TESTS 38 - 40: MULTI-ROLE COMPATIBILITY
    # ==========================================

    def test_38_multirole_student_and_admin_works(self):
        """TEST 38: Existing multi-role Student+Admin account still works."""
        # Create student+admin
        user = User.objects.create_user(
            username='multi_student_admin_17',
            email='multi_student_admin_17@campus.edu',
            password='Password123!',
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True,
        )
        UserRole.objects.get_or_create(user=user, role=User.Role.STUDENT, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=user, role=User.Role.ADMIN, defaults={'is_active': True})

        res = self.client.post('/api/auth/login/', {
            'email': user.email,
            'password': 'Password123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('access', data)
        self.assertCountEqual(data['user']['roles'], [User.Role.STUDENT, User.Role.ADMIN])

    def test_39_multirole_shop_owner_and_admin_works(self):
        """TEST 39: Existing multi-role Shop Owner+Admin behavior still works."""
        user = User.objects.create_user(
            username='multi_shop_admin_17',
            email='multi_shop_admin_17@campus.edu',
            password='Password123!',
            role=User.Role.SHOP_OWNER,
            is_active=True,
            email_verified=True,
        )
        UserRole.objects.get_or_create(user=user, role=User.Role.SHOP_OWNER, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=user, role=User.Role.ADMIN, defaults={'is_active': True})

        res = self.client.post('/api/auth/login/', {
            'email': user.email,
            'password': 'Password123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('access', data)
        self.assertCountEqual(data['user']['roles'], [User.Role.SHOP_OWNER, User.Role.ADMIN])

    def test_40_multirole_courier_and_admin_works(self):
        """TEST 40: Existing multi-role Courier+Admin behavior still works."""
        user = User.objects.create_user(
            username='multi_courier_admin_17',
            email='multi_courier_admin_17@campus.edu',
            password='Password123!',
            role=User.Role.DELIVERY_AGENT,
            is_active=True,
            email_verified=True,
        )
        UserRole.objects.get_or_create(user=user, role=User.Role.DELIVERY_AGENT, defaults={'is_active': True})
        UserRole.objects.get_or_create(user=user, role=User.Role.ADMIN, defaults={'is_active': True})

        res = self.client.post('/api/auth/login/', {
            'email': user.email,
            'password': 'Password123!'
        }, content_type='application/json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        data = res.json()
        self.assertIn('access', data)
        self.assertCountEqual(data['user']['roles'], [User.Role.DELIVERY_AGENT, User.Role.ADMIN])


if __name__ == '__main__':
    from django.test.runner import DiscoverRunner
    test_runner = DiscoverRunner(verbosity=2)
    failures = test_runner.run_tests(['test_step17_platform_owner_hardening'])
    sys.exit(bool(failures))
