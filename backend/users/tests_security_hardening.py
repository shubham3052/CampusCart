from decimal import Decimal
import io
from datetime import timedelta
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APITestCase
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken

from users.models import User, AuditLog
from users.services.audit_service import AuditService
from users.services.security_service import SecurityMonitoringService
from shops.models import Shop
from products.models import Product, Category
from inventory.models import Inventory
from orders.models import Order, OTPVerification, Payment, Refund
from printing.models import PrintingOrder, UploadedDocument, ShopPrintingConfig
from delivery.models import Delivery


class SecurityHardeningTestCase(APITestCase):
    """
    Step 26: Comprehensive Security & Production Hardening Test Suite.
    Validates IDOR isolation, RBAC access boundaries, file upload magic bytes,
    document retention safeguards, OTP lockout, and audit log scrubbing.
    """

    def setUp(self):
        # 1. Students
        self.student_a = User.objects.create_user(
            username='student_a@campus.edu',
            email='student_a@campus.edu',
            password='SecurePass123!',
            role=User.Role.STUDENT,
            email_verified=True
        )
        self.student_b = User.objects.create_user(
            username='student_b@campus.edu',
            email='student_b@campus.edu',
            password='SecurePass123!',
            role=User.Role.STUDENT,
            email_verified=True
        )

        # 2. Shop Owners
        self.owner_a = User.objects.create_user(
            username='owner_a@campus.edu',
            email='owner_a@campus.edu',
            password='SecurePass123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )
        self.owner_b = User.objects.create_user(
            username='owner_b@campus.edu',
            email='owner_b@campus.edu',
            password='SecurePass123!',
            role=User.Role.SHOP_OWNER,
            email_verified=True
        )

        # 3. Admin
        self.admin = User.objects.create_superuser(
            username='admin@campus.edu',
            email='admin@campus.edu',
            password='AdminSecurePass123!',
            role=User.Role.ADMIN,
            email_verified=True
        )

        # 4. Shops
        self.shop_a = Shop.objects.create(
            name="Alpha Stationery",
            slug="alpha-stationery",
            owner=self.owner_a,
            campus_location="North Campus",
            address="Building A, Room 101",
            contact_phone="9876543210",
            is_active=True
        )
        self.shop_b = Shop.objects.create(
            name="Beta Book Depot",
            slug="beta-book-depot",
            owner=self.owner_b,
            campus_location="South Campus",
            address="Building B, Room 202",
            contact_phone="9876543211",
            is_active=True
        )

        # 5. Product & Inventory
        self.cat = Category.objects.create(name="Notebooks")
        self.product_a = Product.objects.create(
            shop=self.shop_a,
            category=self.cat,
            name="Alpha Ruled Notebook",
            price=Decimal("40.00"),
            is_active=True
        )
        self.inv_a = Inventory.objects.create(
            shop=self.shop_a,
            product=self.product_a,
            current_stock=50,
            reorder_level=10
        )

        # 6. Printing Config for Shop A
        self.print_config_a = ShopPrintingConfig.objects.create(
            shop=self.shop_a,
            is_printing_enabled=True,
            bw_rate_per_page=Decimal('1.50'),
            color_rate_per_page=Decimal('5.00')
        )

        # 7. Student A Order & Print Order
        self.order_a = Order.objects.create(
            customer=self.student_a,
            shop=self.shop_a,
            status=Order.Status.PENDING,
            total_amount=Decimal('80.00'),
            payment_status=Order.PaymentStatus.PENDING,
            fulfillment_type=Order.FulfillmentType.PICKUP
        )

        self.print_order_a = PrintingOrder.objects.create(
            order=self.order_a,
            shop=self.shop_a,
            total_pages=10,
            copies=1,
            price=Decimal('15.00'),
            status=PrintingOrder.PrintingStatus.WAITING
        )

        # Minimal valid PDF payload with %PDF magic header
        valid_pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
        self.uploaded_doc_a = UploadedDocument.objects.create(
            printing_order=self.print_order_a,
            file=SimpleUploadedFile("thesis.pdf", valid_pdf_bytes, content_type="application/pdf"),
            original_filename="thesis.pdf",
            file_size_bytes=len(valid_pdf_bytes),
            page_count=1,
            retention_expiry_date=timezone.now() - timedelta(days=5)  # Expired
        )

        # 8. JWT Tokens
        self.token_student_a = str(RefreshToken.for_user(self.student_a).access_token)
        self.token_student_b = str(RefreshToken.for_user(self.student_b).access_token)
        self.token_owner_a = str(RefreshToken.for_user(self.owner_a).access_token)
        self.token_owner_b = str(RefreshToken.for_user(self.owner_b).access_token)
        self.token_admin = str(RefreshToken.for_user(self.admin).access_token)

    # --------------------------------------------------------------------------
    # 1. IDOR & Authorization Tests
    # --------------------------------------------------------------------------
    def test_idor_student_cannot_view_another_student_order(self):
        """Student B must receive 404 or 403 when trying to access Student A's order."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_b}')
        response = self.client.get(f'/api/orders/{self.order_a.id}/')
        self.assertIn(response.status_code, [status.HTTP_404_NOT_FOUND, status.HTTP_403_FORBIDDEN])

    def test_idor_student_cannot_download_another_student_document(self):
        """Student B must be rejected when attempting to download Student A's print document."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_b}')
        url = f'/api/printing/{self.print_order_a.id}/documents/{self.uploaded_doc_a.id}/download/'
        response = self.client.get(url)
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    def test_authorized_student_can_download_own_document_with_security_headers(self):
        """Student A can download own document, verifying security headers."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_a}')
        url = f'/api/printing/{self.print_order_a.id}/documents/{self.uploaded_doc_a.id}/download/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(response.headers.get('Content-Security-Policy'), "default-src 'none'")

    def test_shop_isolation_merchant_cannot_adjust_other_shop_inventory(self):
        """Shop Owner B cannot adjust stock belonging to Shop Owner A."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_owner_b}')
        url = f'/api/inventory/{self.inv_a.id}/adjust/'
        response = self.client.post(url, {'quantity_change': 10, 'reason': 'Malicious adjustment'})
        self.assertIn(response.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

    # --------------------------------------------------------------------------
    # 2. File Upload Security & Magic Byte Tests
    # --------------------------------------------------------------------------
    def test_file_upload_rejects_non_pdf_extension(self):
        """File upload rejects executable or non-PDF extension."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_a}')
        fake_exe = SimpleUploadedFile("payload.exe", b"binary content", content_type="application/octet-stream")
        url = f'/api/printing/{self.print_order_a.id}/upload-document/'
        response = self.client.post(url, {'file': fake_exe}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Only PDF documents", response.data.get('message', ''))

    def test_file_upload_rejects_fake_pdf_failing_magic_bytes(self):
        """File renamed to .pdf but lacking %PDF header is rejected."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_a}')
        fake_pdf = SimpleUploadedFile("fake.pdf", b"This is plain text pretending to be a PDF", content_type="application/pdf")
        url = f'/api/printing/{self.print_order_a.id}/upload-document/'
        response = self.client.post(url, {'file': fake_pdf}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Magic bytes mismatch", response.data.get('message', ''))

    def test_file_upload_rejects_empty_file(self):
        """0-byte file is rejected."""
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_student_a}')
        empty_pdf = SimpleUploadedFile("empty.pdf", b"", content_type="application/pdf")
        url = f'/api/printing/{self.print_order_a.id}/upload-document/'
        response = self.client.post(url, {'file': empty_pdf}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("empty", response.data.get('message', '').lower())

    # --------------------------------------------------------------------------
    # 3. OTP Security Tests
    # --------------------------------------------------------------------------
    def test_otp_lockout_after_max_failed_attempts(self):
        """OTP is locked after 5 consecutive incorrect attempts."""
        self.order_a.fulfillment_type = Order.FulfillmentType.PICKUP
        self.order_a.status = Order.Status.READY
        self.order_a.save()
        plain_otp, otp_rec = self.order_a.generate_pickup_otp(expiry_minutes=60)

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_owner_a}')
        url = f'/api/orders/{self.order_a.id}/verify-pickup-otp/'

        # Fail 5 times
        for i in range(5):
            res = self.client.post(url, {'otp': '999999'})
            self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

        # 6th attempt with correct OTP must fail due to lockout
        res = self.client.post(url, {'otp': plain_otp})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", res.data.get('message', '').lower())

    def test_expired_otp_is_rejected(self):
        """Expired OTP is rejected."""
        self.order_a.fulfillment_type = Order.FulfillmentType.PICKUP
        self.order_a.status = Order.Status.READY
        self.order_a.save()
        plain_otp, otp_rec = self.order_a.generate_pickup_otp(expiry_minutes=60)
        otp_rec.expires_at = timezone.now() - timedelta(minutes=10)
        otp_rec.save()

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.token_owner_a}')
        url = f'/api/orders/{self.order_a.id}/verify-pickup-otp/'
        res = self.client.post(url, {'otp': plain_otp})
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("expired", res.data.get('message', '').lower())

    # --------------------------------------------------------------------------
    # 4. Audit Logging & Credential Scrubbing
    # --------------------------------------------------------------------------
    def test_audit_service_scrubs_passwords_and_secrets(self):
        """AuditService strictly redacts passwords, tokens, OTP codes, and secrets from metadata."""
        log_entry = AuditService.log(
            action=AuditLog.Action.LOGIN_SUCCESS,
            actor=self.student_a,
            metadata={
                "username": "student_a",
                "password": "SuperSecretPassword123!",
                "token": "bearer-jwt-token-string",
                "otp_code": "123456",
                "payment_secret": "sk_live_secret999",
                "nested": {
                    "card_cvv": "999",
                    "safe_field": "public_data"
                }
            }
        )
        self.assertIsNotNone(log_entry)
        meta = log_entry.metadata
        self.assertEqual(meta['password'], '[REDACTED]')
        self.assertEqual(meta['token'], '[REDACTED]')
        self.assertEqual(meta['otp_code'], '[REDACTED]')
        self.assertEqual(meta['payment_secret'], '[REDACTED]')
        self.assertEqual(meta['nested']['card_cvv'], '[REDACTED]')
        self.assertEqual(meta['nested']['safe_field'], 'public_data')

    # --------------------------------------------------------------------------
    # 5. Document Retention Policy & Active Job Protection
    # --------------------------------------------------------------------------
    def test_document_retention_preserves_active_print_jobs(self):
        """Expired documents on WAITING or PRINTING jobs must NEVER be purged."""
        self.print_order_a.status = PrintingOrder.PrintingStatus.WAITING
        self.print_order_a.save()

        # Run retention command
        call_command('cleanup_expired_documents', days=1)

        # Document must still exist because job is WAITING
        self.assertTrue(UploadedDocument.objects.filter(id=self.uploaded_doc_a.id).exists())

    def test_document_retention_purges_completed_jobs(self):
        """Expired documents on COMPLETED jobs are safely purged."""
        self.print_order_a.status = PrintingOrder.PrintingStatus.COMPLETED
        self.print_order_a.save()

        # Run retention command
        call_command('cleanup_expired_documents', days=1)

        # Document must be deleted from DB
        self.assertFalse(UploadedDocument.objects.filter(id=self.uploaded_doc_a.id).exists())

        # Audit log entry must exist for DOCUMENT_PURGED
        purged_log = AuditLog.objects.filter(
            action=AuditLog.Action.DOCUMENT_PURGED,
            target_id=str(self.uploaded_doc_a.id)
        ).first()
        self.assertIsNotNone(purged_log)
