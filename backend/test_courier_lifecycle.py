"""
End-to-End Automated Test for Courier Self-Registration, Approval Lifecycle, and Permission Guards.
"""
import os
import django
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings
from django.core import mail
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()
client = APIClient()

def authenticate(user):
    refresh = RefreshToken.for_user(user)
    token = str(refresh.access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return str(refresh), token

def clear_auth():
    client.credentials()

def run_tests():
    print("=" * 80)
    print("COURIER REGISTRATION & APPROVAL LIFECYCLE VERIFICATION SUITE")
    print("=" * 80)

    # Enforce in-memory email backend
    settings.EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
    mail.outbox = []

    # 1. Platform Owner and Admin setup
    admin_user = User.objects.filter(role=User.Role.ADMIN, is_active=True).first()
    if not admin_user:
        admin_user = User.objects.create_user(
            username=f"admin_test_{uuid.uuid4().hex[:6]}",
            email=f"admin_{uuid.uuid4().hex[:6]}@campus.edu",
            password="TestAdminPassword123!",
            role=User.Role.ADMIN,
            is_active=True
        )

    # 2. Public Registration as Courier
    clear_auth()
    suffix = uuid.uuid4().hex[:6]
    courier_email = f"courier_applicant_{suffix}@campus.edu"
    courier_username = f"courier_{suffix}"
    courier_password = "SecureCourierPass123!"

    import random
    reg_phone = f"987{random.randint(1000000, 9999999)}"
    reg_payload = {
        "name": "Test Applicant",
        "email": courier_email,
        "username": courier_username,
        "password": courier_password,
        "phone": reg_phone,
        "role": User.Role.DELIVERY_AGENT,
        "approval_status": "APPROVED", # Malicious attempt to self-approve
    }

    res = client.post("/api/auth/register/", reg_payload, format="json")
    assert res.status_code in [200, 201], f"Registration failed: {res.data}"
    created_courier = User.objects.get(email=courier_email)
    print("[PASS] Courier self-registration succeeded via /api/auth/register/.")

    # 3. Verify approval_status is forced to PENDING (preventing self-approval)
    assert created_courier.approval_status == User.ApprovalStatus.PENDING, \
        f"Expected PENDING approval status, got {created_courier.approval_status}"
    assert created_courier.is_pending_courier is True
    assert created_courier.is_approved_courier is False
    print("[PASS] Courier approval_status correctly defaults to PENDING (ignoring malicious client self-approval).")

    # 4. Courier login
    login_res = client.post("/api/auth/login/", {
        "email": courier_email,
        "password": courier_password
    }, format="json")
    assert login_res.status_code == 200, f"Login failed: {login_res.data}"
    user_meta = login_res.data.get("user", {})
    assert user_meta.get("role") == "DELIVERY_AGENT", f"Expected DELIVERY_AGENT, got {user_meta}"
    assert user_meta.get("approval_status") == "PENDING", f"Expected PENDING, got {user_meta}"
    print("[PASS] Courier logged in successfully; JWT and approval_status='PENDING' returned.")

    # Authenticate as pending courier
    authenticate(created_courier)

    # 5. Restricted Actions Blocked for Pending Courier
    # 5a. Toggle availability should return 403 PermissionDenied
    toggle_res = client.post("/api/deliveries/toggle-availability/", {"availability_status": "AVAILABLE"}, format="json")
    assert toggle_res.status_code == 403, f"Expected 403 for pending courier shift toggle, got {toggle_res.status_code}"
    print("[PASS] Pending courier blocked from toggling shift availability (403 Forbidden).")

    # 5b. Update GPS location should return 403 PermissionDenied
    loc_res = client.post("/api/deliveries/location/", {
        "latitude": 28.5450,
        "longitude": 77.1926,
        "timestamp": "2026-09-23T12:00:00Z"
    }, format="json")
    assert loc_res.status_code == 403, f"Expected 403 for pending courier GPS update, got {loc_res.status_code}"
    print("[PASS] Pending courier blocked from updating GPS location (403 Forbidden).")

    # 5c. Deliveries list should return empty queryset
    deliv_res = client.get("/api/deliveries/")
    assert deliv_res.status_code == 200
    deliveries_list = deliv_res.data.get("results", deliv_res.data) if isinstance(deliv_res.data, dict) else deliv_res.data
    assert len(deliveries_list) == 0, f"Expected 0 deliveries for pending courier, got {len(deliveries_list)}"
    print("[PASS] Pending courier cannot view active delivery orders (empty queryset).")

    # 6. Self-approval and unauthorized approval attempts
    self_approve_res = client.post(f"/api/users/{created_courier.id}/approve-courier/")
    assert self_approve_res.status_code == 403, f"Expected 403 on courier self-approval, got {self_approve_res.status_code}"
    print("[PASS] Courier self-approval blocked (403 Forbidden).")

    # 7. Admin Review & Approval
    authenticate(admin_user)
    approve_res = client.post(f"/api/users/{created_courier.id}/approve-courier/")
    assert approve_res.status_code == 200, f"Admin approval failed: {approve_res.data}"
    assert approve_res.data.get("approval_status") == "APPROVED"
    created_courier.refresh_from_db()
    assert created_courier.approval_status == User.ApprovalStatus.APPROVED
    assert created_courier.is_approved_courier is True
    print("[PASS] Authorized Administrator successfully approved courier application.")

    # 8. Verify Notification and Audit Log
    from notifications.models import Notification
    notif = Notification.objects.filter(recipient=created_courier, title__icontains="Approved").first()
    assert notif is not None, "Expected courier approval notification"
    print(f"[PASS] Courier in-app notification delivered: '{notif.title}' - '{notif.message}'")

    # 9. Verify Approved Courier Can Now Perform Operations
    authenticate(created_courier)
    toggle_res2 = client.post("/api/deliveries/toggle-availability/", {"availability_status": "AVAILABLE"}, format="json")
    assert toggle_res2.status_code == 200, f"Expected 200 for approved courier shift toggle, got {toggle_res2.status_code}: {toggle_res2.data}"
    print("[PASS] Approved courier successfully toggled shift availability (200 OK).")

    from django.utils import timezone
    loc_res2 = client.post("/api/deliveries/location/", {
        "latitude": 28.5450,
        "longitude": 77.1926,
        "timestamp": timezone.now().isoformat()
    }, format="json")
    assert loc_res2.status_code == 200, f"Expected 200 for approved courier GPS update, got {loc_res2.status_code}: {loc_res2.data}"
    print("[PASS] Approved courier successfully posted GPS coordinates (200 OK).")

    # 10. Rejection Workflow
    authenticate(admin_user)
    reject_res = client.post(f"/api/users/{created_courier.id}/reject-courier/")
    assert reject_res.status_code == 200, f"Admin rejection failed: {reject_res.data}"
    assert reject_res.data.get("approval_status") == "REJECTED"
    created_courier.refresh_from_db()
    assert created_courier.approval_status == User.ApprovalStatus.REJECTED
    print("[PASS] Administrator successfully rejected courier application.")

    # 11. Rejected courier blocked again
    authenticate(created_courier)
    toggle_res3 = client.post("/api/deliveries/toggle-availability/", {"availability_status": "AVAILABLE"}, format="json")
    assert toggle_res3.status_code == 403
    print("[PASS] Rejected courier successfully blocked from restricted delivery operations (403 Forbidden).")

    print("=" * 80)
    print("ALL COURIER LIFECYCLE TESTS PASSED 100%!")
    print("=" * 80)

if __name__ == "__main__":
    run_tests()
