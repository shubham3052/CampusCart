import re
from datetime import timedelta
from django.core import mail
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import EmailVerificationOTP
from users.services.email_service import EmailService

User = get_user_model()


class EmailVerificationTests(APITestCase):
    """
    Comprehensive test suite for STEP 26A:
    Email OTP Verification & Account Email Verification.
    """

    def setUp(self):
        mail.outbox = []
        self.reg_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        self.send_otp_url = '/api/auth/email/send-otp/'
        self.verify_otp_url = '/api/auth/email/verify-otp/'
        self.resend_otp_url = '/api/auth/email/resend-otp/'
        self.email_change_req_url = '/api/auth/email/change/request/'
        self.email_change_conf_url = '/api/auth/email/change/confirm/'
        self.pwd_reset_req_url = '/api/auth/password-reset/request/'
        self.pwd_reset_ver_url = '/api/auth/password-reset/verify/'
        self.pwd_reset_conf_url = '/api/auth/password-reset/confirm/'

    # -------------------------------------------------------------
    # 1. REGISTRATION & UNVERIFIED INITIAL STATE
    # -------------------------------------------------------------
    def test_student_registration_creates_unverified_account_and_sends_email_otp(self):
        """
        Student registration creates an unverified account and dispatches a 6-digit OTP email.
        """
        payload = {
            "name": "Rohan Verma",
            "email": "rohan@campus.edu",
            "password": "SecurePassword123!",
            "role": "STUDENT"
        }
        res = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data['user']['email_verified'])
        self.assertNotIn('otp', str(res.data))

        # Verify User record in DB
        user = User.objects.get(email="rohan@campus.edu")
        self.assertFalse(user.email_verified)

        # Verify Email was sent via mail.outbox
        self.assertEqual(len(mail.outbox), 1)
        sent_email = mail.outbox[0]
        self.assertIn("rohan@campus.edu", sent_email.to)
        self.assertIn("Verify your Smart Stationery account", sent_email.subject)

        # Extract 6-digit OTP from email body
        match = re.search(r'\b(\d{6})\b', sent_email.body)
        self.assertIsNotNone(match)
        raw_otp = match.group(1)

        # Verify OTP record in DB
        otp_rec = EmailVerificationOTP.objects.filter(email="rohan@campus.edu").latest('created_at')
        self.assertFalse(otp_rec.is_verified)
        self.assertEqual(otp_rec.purpose, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION)
        # Verify raw OTP is NOT stored in plaintext
        self.assertNotEqual(otp_rec.otp_hash, raw_otp)
        self.assertTrue(otp_rec.check_otp(raw_otp))

    def test_shop_owner_registration_requires_email_verification(self):
        """
        Shop owner registration creates an unverified account and dispatches email OTP.
        """
        payload = {
            "name": "Kavita Stationery",
            "email": "kavita@campus.edu",
            "password": "MerchantPass123!",
            "role": "SHOP_OWNER"
        }
        res = self.client.post(self.reg_url, payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertFalse(res.data['user']['email_verified'])
        self.assertEqual(res.data['user']['role'], "SHOP_OWNER")

        owner = User.objects.get(email="kavita@campus.edu")
        self.assertFalse(owner.email_verified)
        self.assertEqual(len(mail.outbox), 1)

    # -------------------------------------------------------------
    # 2. OTP VERIFICATION & ONE-TIME USE
    # -------------------------------------------------------------
    def test_successful_otp_verification_marks_email_verified(self):
        """
        Valid 6-digit OTP verifies the account and updates email_verified to True.
        """
        user = User.objects.create(
            username="neha@campus.edu",
            email="neha@campus.edu",
            email_verified=False
        )
        user.set_password("StudentPass123!")
        user.save()

        # Send OTP
        EmailService.create_and_send_otp(user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, user)
        self.assertEqual(len(mail.outbox), 1)
        raw_otp = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # Verify OTP
        verify_payload = {
            "email": "neha@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }
        res = self.client.post(self.verify_otp_url, verify_payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        self.assertTrue(res.data['email_verified'])

        # Check DB updates
        user.refresh_from_db()
        self.assertTrue(user.email_verified)

        otp_rec = EmailVerificationOTP.objects.get(email="neha@campus.edu")
        self.assertTrue(otp_rec.is_verified)
        self.assertIsNotNone(otp_rec.verified_at)

    def test_invalid_otp_decrements_remaining_attempts(self):
        """
        Invalid OTP code rejects with bad request and counts attempts.
        """
        user = User.objects.create(
            username="invalid_test@campus.edu",
            email="invalid_test@campus.edu",
            email_verified=False
        )
        EmailService.create_and_send_otp(user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, user)

        res = self.client.post(self.verify_otp_url, {
            "email": "invalid_test@campus.edu",
            "otp": "000000",
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(res.data['success'])
        self.assertIn("attempt(s) remaining", res.data['message'])

        otp_rec = EmailVerificationOTP.objects.get(email="invalid_test@campus.edu")
        self.assertEqual(otp_rec.attempts, 1)

    def test_max_attempts_locks_otp(self):
        """
        After 5 failed attempts, OTP code is locked and cannot be verified even with correct code.
        """
        user = User.objects.create(
            username="lockout@campus.edu",
            email="lockout@campus.edu",
            email_verified=False
        )
        EmailService.create_and_send_otp(user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, user)
        raw_otp = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # Exhaust 5 attempts
        for _ in range(5):
            self.client.post(self.verify_otp_url, {
                "email": "lockout@campus.edu",
                "otp": "111111",
                "purpose": "EMAIL_VERIFICATION"
            }, format='json')

        otp_rec = EmailVerificationOTP.objects.get(email="lockout@campus.edu")
        self.assertGreaterEqual(otp_rec.attempts, 5)

        # Trying with the actual correct OTP now must fail
        res = self.client.post(self.verify_otp_url, {
            "email": "lockout@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Maximum verification attempts exceeded", res.data['message'])

    def test_expired_otp_rejected(self):
        """
        Expired OTP code cannot be verified.
        """
        user = User.objects.create(
            username="expired@campus.edu",
            email="expired@campus.edu",
            email_verified=False
        )
        EmailService.create_and_send_otp(user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, user)
        raw_otp = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # Fast forward expiration to the past
        EmailVerificationOTP.objects.filter(email="expired@campus.edu").update(
            expires_at=timezone.now() - timedelta(minutes=10)
        )

        res = self.client.post(self.verify_otp_url, {
            "email": "expired@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res.data['message'].lower())

    def test_replay_attack_prevention(self):
        """
        A verified OTP is single-use and cannot be verified a second time.
        """
        user = User.objects.create(
            username="replay@campus.edu",
            email="replay@campus.edu",
            email_verified=False
        )
        EmailService.create_and_send_otp(user.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, user)
        raw_otp = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # First verification succeeds
        res1 = self.client.post(self.verify_otp_url, {
            "email": "replay@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)

        # Replay attempt must fail
        res2 = self.client.post(self.verify_otp_url, {
            "email": "replay@campus.edu",
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 3. RESEND & RATE LIMITS
    # -------------------------------------------------------------
    def test_resend_cooldown_enforced(self):
        """
        Requesting an OTP resend before 60 seconds returns 429 Too Many Requests.
        """
        user = User.objects.create(
            username="cooldown@campus.edu",
            email="cooldown@campus.edu",
            email_verified=False
        )
        # Initial send
        self.client.post(self.send_otp_url, {"email": user.email}, format='json')

        # Immediate resend attempt (within 60s)
        res = self.client.post(self.resend_otp_url, {"email": user.email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn("Please wait", res.data['message'])

    def test_resend_after_cooldown_succeeds_and_invalidates_prior_otp(self):
        """
        Resending after cooldown invalidates previous OTP and generates a new active code.
        """
        user = User.objects.create(
            username="cooldown_pass@campus.edu",
            email="cooldown_pass@campus.edu",
            email_verified=False
        )
        self.client.post(self.send_otp_url, {"email": user.email}, format='json')
        otp1_raw = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # Simulate 65 seconds passed
        EmailVerificationOTP.objects.filter(email=user.email).update(
            last_sent_at=timezone.now() - timedelta(seconds=65)
        )

        res = self.client.post(self.resend_otp_url, {"email": user.email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 2)
        otp2_raw = re.search(r'\b(\d{6})\b', mail.outbox[1].body).group(1)

        # Old OTP should now be expired / rejected
        res_old = self.client.post(self.verify_otp_url, {
            "email": user.email,
            "otp": otp1_raw,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res_old.status_code, status.HTTP_400_BAD_REQUEST)

        # New OTP should verify successfully
        res_new = self.client.post(self.verify_otp_url, {
            "email": user.email,
            "otp": otp2_raw,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')
        self.assertEqual(res_new.status_code, status.HTTP_200_OK)

    # -------------------------------------------------------------
    # 4. PASSWORD RESET VIA EMAIL OTP
    # -------------------------------------------------------------
    def test_password_reset_enumeration_safe_request(self):
        """
        Password reset request returns identical generic message whether email exists or not.
        """
        # Non-existent email
        res1 = self.client.post(self.pwd_reset_req_url, {"email": "nobody@campus.edu"}, format='json')
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        self.assertIn("If an account with that email exists", res1.data['message'])
        self.assertEqual(len(mail.outbox), 0)

        # Existing active email
        user = User.objects.create(username="existing@campus.edu", email="existing@campus.edu")
        res2 = self.client.post(self.pwd_reset_req_url, {"email": "existing@campus.edu"}, format='json')
        self.assertEqual(res2.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Reset your Smart Stationery account password", mail.outbox[0].subject)

    def test_password_reset_full_flow(self):
        """
        End-to-end password reset: Request -> Verify OTP -> Confirm New Password -> Login.
        """
        user = User.objects.create(username="resetme@campus.edu", email="resetme@campus.edu")
        user.set_password("OldPassword123!")
        user.save()

        # 1. Request Reset
        self.client.post(self.pwd_reset_req_url, {"email": "resetme@campus.edu"}, format='json')
        otp_raw = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # 2. Verify OTP -> get reset_token
        res_ver = self.client.post(self.pwd_reset_ver_url, {
            "email": "resetme@campus.edu",
            "otp": otp_raw
        }, format='json')
        self.assertEqual(res_ver.status_code, status.HTTP_200_OK)
        self.assertIn('reset_token', res_ver.data)
        reset_token = res_ver.data['reset_token']

        # 3. Confirm New Password
        res_conf = self.client.post(self.pwd_reset_conf_url, {
            "email": "resetme@campus.edu",
            "reset_token": reset_token,
            "new_password": "NewBrandSecurePass2026!"
        }, format='json')
        self.assertEqual(res_conf.status_code, status.HTTP_200_OK)

        # 4. Old password fails, new password succeeds
        res_old_login = self.client.post(self.login_url, {
            "email": "resetme@campus.edu",
            "password": "OldPassword123!"
        }, format='json')
        self.assertEqual(res_old_login.status_code, status.HTTP_400_BAD_REQUEST)

        res_new_login = self.client.post(self.login_url, {
            "email": "resetme@campus.edu",
            "password": "NewBrandSecurePass2026!"
        }, format='json')
        self.assertEqual(res_new_login.status_code, status.HTTP_200_OK)
        self.assertIn('access', res_new_login.data)

    # -------------------------------------------------------------
    # 5. EMAIL CHANGE FLOW
    # -------------------------------------------------------------
    def test_email_change_requires_otp_verification(self):
        """
        Changing account email sends OTP to the new email and updates only after successful verification.
        """
        user = User.objects.create(
            username="student_change@campus.edu",
            email="student_change@campus.edu",
            email_verified=True
        )
        refresh = RefreshToken.for_user(user)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {refresh.access_token}')

        # Request change to new email
        res_req = self.client.post(self.email_change_req_url, {
            "new_email": "updated_student@campus.edu"
        }, format='json')
        self.assertEqual(res_req.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("updated_student@campus.edu", mail.outbox[0].to)
        otp_raw = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        # Confirm change with OTP
        res_conf = self.client.post(self.email_change_conf_url, {
            "new_email": "updated_student@campus.edu",
            "otp": otp_raw
        }, format='json')
        self.assertEqual(res_conf.status_code, status.HTTP_200_OK)

        # Check user record updated
        user.refresh_from_db()
        self.assertEqual(user.email, "updated_student@campus.edu")
        self.assertTrue(user.email_verified)

    # -------------------------------------------------------------
    # 6. SECURITY & ROLE ESCALATION SAFEGUARDS
    # -------------------------------------------------------------
    def test_public_admin_registration_strictly_forbidden(self):
        """
        Public self-registration with role=ADMIN is completely rejected.
        """
        res = self.client.post(self.reg_url, {
            "name": "Intruder Admin",
            "email": "intruder@campus.edu",
            "password": "IntruderPass123!",
            "role": "ADMIN"
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(email="intruder@campus.edu").exists())

    def test_email_verification_does_not_grant_admin_or_shop_approval(self):
        """
        Verifying an email does not grant administrator privileges or approve a merchant shop.
        """
        owner = User.objects.create(
            username="unapproved_owner@campus.edu",
            email="unapproved_owner@campus.edu",
            role=User.Role.SHOP_OWNER,
            email_verified=False
        )
        EmailService.create_and_send_otp(owner.email, EmailVerificationOTP.Purpose.EMAIL_VERIFICATION, owner)
        raw_otp = re.search(r'\b(\d{6})\b', mail.outbox[0].body).group(1)

        self.client.post(self.verify_otp_url, {
            "email": owner.email,
            "otp": raw_otp,
            "purpose": "EMAIL_VERIFICATION"
        }, format='json')

        owner.refresh_from_db()
        self.assertTrue(owner.email_verified)
        self.assertFalse(owner.is_admin)
        self.assertFalse(owner.is_staff)
        self.assertFalse(owner.is_superuser)
