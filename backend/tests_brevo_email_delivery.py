"""
Comprehensive Test Suite: Brevo HTTPS Email Delivery for CampusCart OTP

Validates:
 1. User A registration creates/sends OTP to User A's email.
 2. User B registration creates/sends OTP to User B's email.
 3. User A's OTP verifies User A.
 4. User B's OTP verifies User B.
 5. User A's OTP cannot verify User B.
 6. Expired OTP is rejected.
 7. Reused OTP is rejected.
 8. Rate limiting still works.
 9. Missing BREVO_API_KEY produces a safe configuration error.
10. Brevo API failure produces a safe email-delivery error.
11. API key never appears in logs/responses.
12. Existing admin invitation OTP still works.
13. Existing account deletion OTP still works.

Run with: python manage.py test tests_brevo_email_delivery --verbosity=2
"""

import io
import json
import logging
from datetime import timedelta
from unittest.mock import patch, MagicMock

from django.contrib.auth import get_user_model
from django.test import override_settings, TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import EmailVerificationOTP
from users.services.email_service import EmailService

User = get_user_model()


# ---------------------------------------------------------------------------
# Helper: Generate a controlled OTP via direct DB manipulation for testing
# ---------------------------------------------------------------------------
def _create_otp_record(user, email, purpose, raw_otp, minutes_valid=5):
    """Create an OTP record with a known plaintext OTP for verification testing."""
    record = EmailVerificationOTP(
        user=user,
        email=email.strip().lower(),
        purpose=purpose,
        expires_at=timezone.now() + timedelta(minutes=minutes_valid),
        max_attempts=5,
        last_sent_at=timezone.now(),
    )
    record.set_otp(raw_otp)
    record.save()
    return record


class BrevoMultiRecipientOTPTests(APITestCase):
    """
    Tests 1-5: Multi-recipient OTP delivery and cross-user isolation.
    Uses Brevo HTTPS API (mocked) to verify emails are dispatched to the
    actual recipient addresses, not a hardcoded owner email.
    """

    def setUp(self):
        self.reg_url = '/api/auth/register/'
        self.verify_url = '/api/auth/email/verify-otp/'

    @override_settings(BREVO_API_KEY='xkeysib-test-dummy-key-for-unit-tests')
    def test_01_user_a_registration_sends_otp_to_user_a_email(self):
        """Test 1: User A registration dispatches OTP to User A's email via Brevo."""
        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "brevo_test_001"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            res = self.client.post(self.reg_url, {
                "name": "User Alpha",
                "email": "user_alpha@gmail.com",
                "password": "SecureAlpha123!",
                "role": "STUDENT"
            }, format='json')

            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertTrue(res.data['success'])
            self.assertEqual(res.data['user']['email'], 'user_alpha@gmail.com')

            # Verify Brevo was called with user_alpha's email as recipient
            self.assertTrue(mock_urlopen.called)
            call_args = mock_urlopen.call_args
            request_obj = call_args[0][0]
            payload = json.loads(request_obj.data.decode('utf-8'))
            self.assertEqual(payload['to'][0]['email'], 'user_alpha@gmail.com')

    @override_settings(BREVO_API_KEY='xkeysib-test-dummy-key-for-unit-tests')
    def test_02_user_b_registration_sends_otp_to_user_b_email(self):
        """Test 2: User B registration dispatches OTP to User B's email via Brevo."""
        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "brevo_test_002"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            res = self.client.post(self.reg_url, {
                "name": "User Beta",
                "email": "user_beta@outlook.com",
                "password": "SecureBeta456!",
                "role": "STUDENT"
            }, format='json')

            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertEqual(res.data['user']['email'], 'user_beta@outlook.com')

            # Verify Brevo was called with user_beta's email as recipient
            call_args = mock_urlopen.call_args
            request_obj = call_args[0][0]
            payload = json.loads(request_obj.data.decode('utf-8'))
            self.assertEqual(payload['to'][0]['email'], 'user_beta@outlook.com')

    def test_03_user_a_otp_verifies_user_a(self):
        """Test 3: User A's OTP successfully verifies User A."""
        user_a = User.objects.create_user(
            username='verify_a@test.com', email='verify_a@test.com',
            password='SecurePass123!', role=User.Role.STUDENT
        )
        raw_otp = '123456'
        _create_otp_record(user_a, user_a.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, raw_otp)

        res = self.client.post(self.verify_url, {
            "email": "verify_a@test.com",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        user_a.refresh_from_db()
        self.assertTrue(user_a.email_verified)

    def test_04_user_b_otp_verifies_user_b(self):
        """Test 4: User B's OTP successfully verifies User B."""
        user_b = User.objects.create_user(
            username='verify_b@test.com', email='verify_b@test.com',
            password='SecurePass456!', role=User.Role.STUDENT
        )
        raw_otp = '654321'
        _create_otp_record(user_b, user_b.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, raw_otp)

        res = self.client.post(self.verify_url, {
            "email": "verify_b@test.com",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        user_b.refresh_from_db()
        self.assertTrue(user_b.email_verified)

    def test_05_user_a_otp_cannot_verify_user_b(self):
        """Test 5: User A's OTP cannot be used to verify User B."""
        user_a = User.objects.create_user(
            username='cross_a@test.com', email='cross_a@test.com',
            password='SecurePass123!', role=User.Role.STUDENT
        )
        user_b = User.objects.create_user(
            username='cross_b@test.com', email='cross_b@test.com',
            password='SecurePass456!', role=User.Role.STUDENT
        )
        otp_a = '111222'
        _create_otp_record(user_a, user_a.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, otp_a)

        # Try verifying user B with user A's OTP
        res = self.client.post(self.verify_url, {
            "email": "cross_b@test.com",
            "otp": otp_a,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        user_b.refresh_from_db()
        self.assertFalse(user_b.email_verified)


class OTPExpiryReplayRateLimitTests(APITestCase):
    """
    Tests 6-8: OTP expiry, replay prevention, and rate limiting.
    """

    def setUp(self):
        self.verify_url = '/api/auth/email/verify-otp/'
        self.user = User.objects.create_user(
            username='rate_user@test.com', email='rate_user@test.com',
            password='SecurePass123!', role=User.Role.STUDENT
        )

    def test_06_expired_otp_is_rejected(self):
        """Test 6: Expired OTP is rejected."""
        record = EmailVerificationOTP(
            user=self.user,
            email=self.user.email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            expires_at=timezone.now() - timedelta(seconds=10),  # Already expired
            max_attempts=5,
            last_sent_at=timezone.now() - timedelta(minutes=2),
        )
        record.set_otp('999888')
        record.save()

        res = self.client.post(self.verify_url, {
            "email": self.user.email,
            "otp": "999888",
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        self.assertIn('expired', res.data['message'].lower())

    def test_07_reused_otp_is_rejected(self):
        """Test 7: OTP that has already been verified cannot be reused."""
        raw_otp = '777666'
        _create_otp_record(self.user, self.user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, raw_otp)

        # First verification: should succeed
        res1 = self.client.post(self.verify_url, {
            "email": self.user.email,
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertTrue(res1.data['success'])

        # Second verification with same OTP: should fail (replay prevention)
        res2 = self.client.post(self.verify_url, {
            "email": self.user.email,
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res2.data['success'])

    @override_settings(
        EMAIL_OTP_RESEND_COOLDOWN_SECONDS=60,
        EMAIL_OTP_MAX_RESENDS_PER_HOUR=3,
    )
    def test_08_rate_limiting_works(self):
        """Test 8: Rate limiting prevents excessive OTP requests."""
        # Create multiple OTP records to simulate hourly limit reached
        now = timezone.now()
        for i in range(3):
            record = EmailVerificationOTP(
                user=self.user,
                email=self.user.email,
                purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                expires_at=now + timedelta(minutes=5),
                max_attempts=5,
                last_sent_at=now - timedelta(minutes=10),  # Not in cooldown
                created_at=now - timedelta(minutes=5 * i),
            )
            record.set_otp(f'{100000 + i}')
            record.save()

        # The next attempt should hit the hourly rate limit
        success, message, _ = EmailService.create_and_send_otp(
            email=self.user.email,
            purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
            user=self.user
        )
        self.assertFalse(success)
        self.assertIn('maximum', message.lower())


class BrevoConfigurationErrorTests(TestCase):
    """
    Tests 9-11: Missing API key, API failure, and secret non-exposure.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='config_test@test.com', email='config_test@test.com',
            password='SecurePass123!', role=User.Role.STUDENT
        )

    @override_settings(BREVO_API_KEY='', RESEND_API_KEY='', DEBUG=False)
    def test_09_missing_brevo_api_key_produces_safe_error(self):
        """Test 9: Missing BREVO_API_KEY in production produces a safe configuration error."""
        # Patch sys.argv to simulate a non-test production environment
        # (Django's test runner has 'test' in sys.argv which activates the Django email fallback)
        import sys
        original_argv = sys.argv
        sys.argv = ['manage.py', 'runserver']
        try:
            success, message, record = EmailService.create_and_send_otp(
                email=self.user.email,
                purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                user=self.user
            )
            self.assertFalse(success)
            # Should NOT expose the key name to the end user in a way that leaks internals
            self.assertNotIn('xkeysib', message.lower())
            # Should indicate a configuration issue
            self.assertTrue(
                'not configured' in message.lower() or 'configuration' in message.lower(),
                f"Expected configuration error message, got: {message}"
            )
        finally:
            sys.argv = original_argv

    @override_settings(
        BREVO_API_KEY='xkeysib-test-dummy-key',
        DEFAULT_FROM_EMAIL='test-sender@example.com',
        DEFAULT_FROM_NAME='CampusCart'
    )
    def test_10_brevo_api_failure_produces_safe_error(self):
        """Test 10: Brevo API failure (HTTP 500) produces a safe user-facing error."""
        import urllib.error
        with patch('urllib.request.urlopen') as mock_urlopen:
            err = urllib.error.HTTPError(
                url='https://api.brevo.com/v3/smtp/email',
                code=500,
                msg='Internal Server Error',
                hdrs={},
                fp=io.BytesIO(b'{"message": "Internal server error"}')
            )
            mock_urlopen.side_effect = err

            success, message, record = EmailService.create_and_send_otp(
                email=self.user.email,
                purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                user=self.user
            )
            self.assertFalse(success)
            self.assertIsNone(record)
            # Should not expose API key in the error message
            self.assertNotIn('xkeysib', message)
            self.assertNotIn('dummy-key', message)

    @override_settings(
        BREVO_API_KEY='xkeysib-secret-production-key-never-expose',
        DEFAULT_FROM_EMAIL='test-sender@example.com',
        DEFAULT_FROM_NAME='CampusCart'
    )
    def test_11_api_key_never_appears_in_logs_or_responses(self):
        """Test 11: The BREVO_API_KEY never appears in log output or error messages."""
        secret_key = 'xkeysib-secret-production-key-never-expose'

        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "test_msg_id"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            # Capture log output
            log_stream = io.StringIO()
            handler = logging.StreamHandler(log_stream)
            handler.setLevel(logging.DEBUG)
            logger = logging.getLogger('users.services.email_service')
            logger.addHandler(handler)

            try:
                success, message, record = EmailService.create_and_send_otp(
                    email='log_test@test.com',
                    purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                    user=self.user
                )

                log_output = log_stream.getvalue()
                self.assertNotIn(secret_key, log_output,
                                 "API key must NEVER appear in log output")
                self.assertNotIn(secret_key, message,
                                 "API key must NEVER appear in user-facing messages")

                # Also verify the key is in the request header but NOT logged
                if mock_urlopen.called:
                    request_obj = mock_urlopen.call_args[0][0]
                    self.assertEqual(request_obj.get_header('Api-key'), secret_key)
            finally:
                logger.removeHandler(handler)


class BrevoAdminInvitationOTPTests(APITestCase):
    """
    Test 12: Admin invitation OTP flow works with Brevo.
    """

    def setUp(self):
        # Create a platform owner to perform the invitation
        self.platform_owner = User.objects.create_user(
            username='owner@campuscart.edu',
            email='owner@campuscart.edu',
            password='OwnerPass123!',
            role=User.Role.PLATFORM_OWNER,
            is_staff=True,
            is_superuser=True,
        )
        self.platform_owner.email_verified = True
        self.platform_owner.save()

    @override_settings(
        BREVO_API_KEY='xkeysib-test-admin-invite-key',
        DEFAULT_FROM_EMAIL='admin@campuscart.edu',
        DEFAULT_FROM_NAME='CampusCart'
    )
    def test_12_admin_invitation_otp_via_brevo(self):
        """Test 12: Admin invitation dispatches OTP via Brevo to the invitee's email."""
        self.client.force_authenticate(user=self.platform_owner)

        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "brevo_admin_invite"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            res = self.client.post('/api/admin/management/invite/', {
                "email": "new_admin@campus.edu",
                "name": "New Admin",
                "department": "IT Department"
            }, format='json')

            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            self.assertTrue(res.data['success'])

            # Verify Brevo was called with the invitee's email
            self.assertTrue(mock_urlopen.called)
            call_args = mock_urlopen.call_args
            request_obj = call_args[0][0]
            payload = json.loads(request_obj.data.decode('utf-8'))
            self.assertEqual(payload['to'][0]['email'], 'new_admin@campus.edu')
            self.assertIn('CampusCart', payload['subject'])

            # Verify the OTP record exists
            otp_exists = EmailVerificationOTP.objects.filter(
                email='new_admin@campus.edu',
                purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION
            ).exists()
            self.assertTrue(otp_exists)


class BrevoAccountDeletionOTPTests(APITestCase):
    """
    Test 13: Account deletion OTP flow works with Brevo.
    """

    def setUp(self):
        self.user = User.objects.create_user(
            username='delete_me@test.com',
            email='delete_me@test.com',
            password='DeletePass123!',
            role=User.Role.STUDENT
        )
        self.user.email_verified = True
        self.user.save()

    @override_settings(
        BREVO_API_KEY='xkeysib-test-deletion-key',
        DEFAULT_FROM_EMAIL='noreply@campuscart.edu',
        DEFAULT_FROM_NAME='CampusCart'
    )
    def test_13_account_deletion_otp_via_brevo(self):
        """Test 13: Account deletion OTP is dispatched via Brevo to the user's email."""
        self.client.force_authenticate(user=self.user)

        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "brevo_deletion"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            res = self.client.post('/api/auth/account-deletion/request-otp/', format='json')

            self.assertEqual(res.status_code, status.HTTP_200_OK)
            self.assertTrue(res.data['success'])

            # Verify Brevo was called with the user's actual email
            self.assertTrue(mock_urlopen.called)
            call_args = mock_urlopen.call_args
            request_obj = call_args[0][0]
            payload = json.loads(request_obj.data.decode('utf-8'))
            self.assertEqual(payload['to'][0]['email'], 'delete_me@test.com')

            # Verify OTP record exists for deletion purpose
            otp_exists = EmailVerificationOTP.objects.filter(
                email='delete_me@test.com',
                purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION
            ).exists()
            self.assertTrue(otp_exists)

        # Now verify the deletion flow completes
        otp_rec = EmailVerificationOTP.objects.filter(
            email='delete_me@test.com',
            purpose=EmailVerificationOTP.Purpose.ACCOUNT_DELETION
        ).latest('created_at')

        deletion_otp = '998877'
        otp_rec.set_otp(deletion_otp)
        otp_rec.save()

        res2 = self.client.post('/api/auth/account-deletion/confirm/', {
            "otp": deletion_otp
        }, format='json')

        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertTrue(res2.data['success'])
        self.assertFalse(User.objects.filter(email='delete_me@test.com').exists())


class BrevoPayloadValidationTests(TestCase):
    """
    Additional tests: Verify Brevo API payload structure and sender configuration.
    """

    @override_settings(
        BREVO_API_KEY='xkeysib-test-payload-key',
        DEFAULT_FROM_EMAIL='verified@campuscart.edu',
        DEFAULT_FROM_NAME='CampusCart Support'
    )
    def test_brevo_payload_has_correct_sender(self):
        """Brevo payload uses DEFAULT_FROM_EMAIL and DEFAULT_FROM_NAME as sender."""
        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "test"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            user = User.objects.create_user(
                username='payload_test@test.com', email='payload_test@test.com',
                password='Test1234!', role=User.Role.STUDENT
            )

            EmailService.create_and_send_otp(
                email=user.email,
                purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                user=user
            )

            self.assertTrue(mock_urlopen.called)
            request_obj = mock_urlopen.call_args[0][0]
            payload = json.loads(request_obj.data.decode('utf-8'))

            # Validate sender
            self.assertEqual(payload['sender']['email'], 'verified@campuscart.edu')
            self.assertEqual(payload['sender']['name'], 'CampusCart Support')

            # Validate recipient
            self.assertEqual(payload['to'][0]['email'], 'payload_test@test.com')

            # Validate content
            self.assertIn('htmlContent', payload)
            self.assertIn('textContent', payload)
            self.assertIn('CampusCart', payload['htmlContent'])
            self.assertIn('subject', payload)

    @override_settings(
        BREVO_API_KEY='xkeysib-test-endpoint-key',
        DEFAULT_FROM_EMAIL='sender@test.com',
        DEFAULT_FROM_NAME='CampusCart'
    )
    def test_brevo_uses_correct_api_endpoint(self):
        """Brevo dispatch sends to https://api.brevo.com/v3/smtp/email"""
        with patch('urllib.request.urlopen') as mock_urlopen:
            mock_resp = MagicMock()
            mock_resp.status = 201
            mock_resp.read.return_value = b'{"messageId": "test"}'
            mock_urlopen.return_value.__enter__.return_value = mock_resp

            user = User.objects.create_user(
                username='endpoint_test@test.com', email='endpoint_test@test.com',
                password='Test1234!', role=User.Role.STUDENT
            )

            EmailService.create_and_send_otp(
                email=user.email,
                purpose=EmailVerificationOTP.Purpose.EMAIL_VERIFICATION,
                user=user
            )

            request_obj = mock_urlopen.call_args[0][0]
            self.assertEqual(request_obj.full_url, 'https://api.brevo.com/v3/smtp/email')
            self.assertEqual(request_obj.get_header('Content-type'), 'application/json')
            self.assertEqual(request_obj.get_header('Accept'), 'application/json')

    @override_settings(
        BREVO_API_KEY='',
        DEFAULT_FROM_EMAIL='',
        DEFAULT_FROM_NAME=''
    )
    def test_missing_from_email_with_brevo_key_fails_gracefully(self):
        """Missing DEFAULT_FROM_EMAIL with BREVO_API_KEY configured fails safely."""
        # When BREVO_API_KEY is empty, it should fall through
        # When both are empty in production, should fail safely
        with override_settings(BREVO_API_KEY='xkeysib-test', DEFAULT_FROM_EMAIL='', DEBUG=False):
            success, message = EmailService._dispatch_via_brevo_api(
                recipient_email='test@test.com',
                recipient_name='Test User',
                subject='Test',
                text_content='Test',
                html_content='<p>Test</p>'
            )
            self.assertFalse(success)
            self.assertIn('configuration', message.lower())
