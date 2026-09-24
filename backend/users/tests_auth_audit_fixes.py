from django.core import mail
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from users.services.email_service import EmailService

User = get_user_model()


class AuthAuditAndAccountDeletionTests(APITestCase):
    """
    Test suite verifying fixes for:
    1. Account Deletion HTTP 405 Method Not Allowed protection (UserViewSet & AdminManagementViewSet).
    2. Multi-Identifier Login (email, mobile phone number, username).
    3. Registration validation for unverified existing accounts.
    4. Admin Email Verification endpoint (/api/users/<id>/verify-email/).
    5. EmailService safe masking and diagnostics.
    """

    def setUp(self):
        mail.outbox = []
        # Create standard student
        self.student = User.objects.create_user(
            username="student_audit_test",
            email="student_audit@campus.edu",
            password="StrongPassword123!",
            first_name="Audit",
            last_name="Student",
            role=User.Role.STUDENT,
            phone_number="9876543210",
            email_verified=False,
            is_active=True
        )

        # Create Admin
        self.admin = User.objects.create_user(
            username="admin_audit_test",
            email="admin_audit@campus.edu",
            password="AdminPassword123!",
            first_name="Admin",
            last_name="User",
            role=User.Role.ADMIN,
            phone_number="9876543211",
            email_verified=True,
            is_active=True
        )

        # Create Platform Owner
        self.platform_owner = User.objects.create_user(
            username="po_audit_test",
            email="po_audit@campus.edu",
            password="PoPassword123!",
            first_name="Platform",
            last_name="Owner",
            role=User.Role.PLATFORM_OWNER,
            phone_number="9876543212",
            email_verified=True,
            is_active=True
        )

    # -------------------------------------------------------------
    # 1. ACCOUNT DELETION PROTECTION (405 METHOD NOT ALLOWED)
    # -------------------------------------------------------------
    def test_user_viewset_delete_is_prohibited_405(self):
        """
        DELETE /api/users/<id>/ must return HTTP 405 Method Not Allowed.
        User records and related models must NEVER be deleted.
        """
        self.client.force_authenticate(user=self.admin)
        student_id = self.student.id
        initial_count = User.objects.count()

        res = self.client.delete(f'/api/users/{student_id}/')
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(res.data.get('success'))
        self.assertEqual(res.data.get('error'), 'AccountDeletionProhibited')

        # Verify DB integrity: record still exists!
        self.assertEqual(User.objects.count(), initial_count)
        self.assertTrue(User.objects.filter(id=student_id).exists())

    def test_admin_management_viewset_delete_is_prohibited_405(self):
        """
        DELETE /api/platform-owner/admins/<id>/ must return HTTP 405 Method Not Allowed.
        Admin records must NEVER be deleted.
        """
        self.client.force_authenticate(user=self.platform_owner)
        admin_id = self.admin.id
        initial_count = User.objects.count()

        res = self.client.delete(f'/api/platform-owner/admins/{admin_id}/')
        self.assertEqual(res.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertFalse(res.data.get('success'))
        self.assertEqual(res.data.get('error'), 'AccountDeletionProhibited')

        # Verify DB integrity: record still exists!
        self.assertEqual(User.objects.count(), initial_count)
        self.assertTrue(User.objects.filter(id=admin_id).exists())

    # -------------------------------------------------------------
    # 2. MULTI-IDENTIFIER LOGIN (EMAIL, PHONE NUMBER, USERNAME)
    # -------------------------------------------------------------
    def test_login_with_email_success(self):
        """Login using registered email address succeeds."""
        payload = {
            "email": "student_audit@campus.edu",
            "password": "StrongPassword123!"
        }
        res = self.client.post('/api/auth/login/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertEqual(res.data['user']['email'], "student_audit@campus.edu")
        self.assertTrue(res.data.get('requires_verification'))

    def test_login_with_10_digit_phone_number_success(self):
        """Login using 10-digit mobile phone number succeeds."""
        payload = {
            "email": "9876543210",
            "password": "StrongPassword123!"
        }
        res = self.client.post('/api/auth/login/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertEqual(res.data['user']['email'], "student_audit@campus.edu")

    def test_login_with_prefixed_phone_number_success(self):
        """Login using +91 formatted phone number succeeds."""
        payload = {
            "email": "+919876543210",
            "password": "StrongPassword123!"
        }
        res = self.client.post('/api/auth/login/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertEqual(res.data['user']['email'], "student_audit@campus.edu")

    def test_login_with_username_success(self):
        """Login using username succeeds."""
        payload = {
            "email": "student_audit_test",
            "password": "StrongPassword123!"
        }
        res = self.client.post('/api/auth/login/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.data)
        self.assertEqual(res.data['user']['email'], "student_audit@campus.edu")

    def test_login_with_invalid_credentials_fails(self):
        """Login with wrong password fails with standard message."""
        payload = {
            "email": "9876543210",
            "password": "WrongPassword999!"
        }
        res = self.client.post('/api/auth/login/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    # -------------------------------------------------------------
    # 3. REGISTRATION VALIDATION FOR UNVERIFIED ACCOUNTS
    # -------------------------------------------------------------
    def test_register_duplicate_unverified_email_returns_helpful_message(self):
        """Attempting to register with an existing unverified email gives guidance."""
        payload = {
            "name": "Audit Student 2",
            "email": "student_audit@campus.edu",
            "password": "NewPassword123!",
            "phone": "9998887776"
        }
        res = self.client.post('/api/auth/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        error_text = str(res.data)
        self.assertIn("already exists but is unverified", error_text)

    def test_register_duplicate_unverified_phone_returns_helpful_message(self):
        """Attempting to register with an existing unverified phone gives guidance."""
        payload = {
            "name": "Audit Student 3",
            "email": "different_email@campus.edu",
            "password": "NewPassword123!",
            "phone": "9876543210"
        }
        res = self.client.post('/api/auth/register/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        error_text = str(res.data)
        self.assertIn("already exists but is unverified", error_text)

    # -------------------------------------------------------------
    # 4. ADMIN EMAIL VERIFICATION ENDPOINT
    # -------------------------------------------------------------
    def test_admin_can_verify_user_email(self):
        """Admin can call POST /api/users/<id>/verify-email/ to mark an account verified."""
        self.assertFalse(self.student.email_verified)
        self.client.force_authenticate(user=self.admin)

        res = self.client.post(f'/api/users/{self.student.id}/verify-email/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data.get('success'))
        self.assertTrue(res.data.get('email_verified'))

        # Check DB
        self.student.refresh_from_db()
        self.assertTrue(self.student.email_verified)

    def test_non_admin_cannot_verify_user_email(self):
        """Non-admin student cannot verify user email."""
        self.client.force_authenticate(user=self.student)
        res = self.client.post(f'/api/users/{self.student.id}/verify-email/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -------------------------------------------------------------
    # 5. EMAIL SERVICE MASKING & DIAGNOSTICS
    # -------------------------------------------------------------
    def test_email_service_masks_email_safely(self):
        """EmailService._mask_email safely masks email without leaking identity."""
        masked = EmailService._mask_email("garibhokya@gmail.com")
        self.assertTrue(masked.startswith("g*"))
        self.assertTrue(masked.endswith("a@gmail.com"))
        self.assertNotIn("garibhokya", masked)

        masked_short = EmailService._mask_email("ab@campus.edu")
        self.assertEqual(masked_short, "a*@campus.edu")
