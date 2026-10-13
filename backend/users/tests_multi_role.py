from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from rest_framework.test import APITestCase
from rest_framework import status
from users.models import UserRole, EmailVerificationOTP
from users.services.role_service import RoleService

User = get_user_model()


class MultiRoleArchitectureTests(APITestCase):
    """
    Comprehensive test suite for STEP 11 Multi-Role Architecture:
    One Account / One Email -> Multiple Authorized Roles.
    Tests A through T and Mandatory Real-World Scenarios.
    """

    def setUp(self):
        self.password = "StrongPassword123!@#"
        self.student_email = "student_mr@campus.edu"
        self.admin_email = "admin_mr@campus.edu"
        self.owner_email = "owner_mr@campus.edu"

        # Platform owner caller for privileged invitations
        self.platform_owner = User.objects.create_user(
            username="system_owner_mr",
            email="platform_owner_mr@campus.edu",
            password=self.password,
            role=User.Role.PLATFORM_OWNER,
            is_active=True,
            email_verified=True
        )
        RoleService.assign_role(self.platform_owner, User.Role.PLATFORM_OWNER)

    # -----------------------------------------------------------------
    # A & C & G: Existing Student receives Admin role (Same email, One User)
    # -----------------------------------------------------------------
    def test_existing_student_receives_admin_role_preserves_single_identity(self):
        student = User.objects.create_user(
            username="student_user",
            email=self.student_email,
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        user_id = student.id

        # Authorized Admin invites existing student
        self.client.force_authenticate(user=self.platform_owner)
        invite_res = self.client.post('/api/admin/management/invite/', {
            'email': self.student_email,
            'name': 'Student Admin',
            'department': 'Operations'
        }, format='json')
        self.assertEqual(invite_res.status_code, status.HTTP_201_CREATED)

        # Existing student remains active and uncorrupted
        student.refresh_from_db()
        self.assertEqual(student.id, user_id)
        self.assertTrue(student.is_active)
        self.assertTrue(student.email_verified)
        self.assertEqual(student.role, User.Role.STUDENT)

        # Retrieve OTP and verify
        otp_rec = EmailVerificationOTP.objects.filter(
            email=self.student_email,
            purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION
        ).latest('created_at')
        otp_rec.set_otp("112233")
        otp_rec.save()

        self.client.force_authenticate(user=None)
        verify_res = self.client.post('/api/admin/management/invitations/verify/', {
            'email': self.student_email,
            'otp': '112233'
        }, format='json')
        self.assertEqual(verify_res.status_code, status.HTTP_200_OK)
        self.assertFalse(verify_res.data.get('requires_password_setup', True))

        # Verification of same account & roles
        student.refresh_from_db()
        self.assertEqual(student.id, user_id)
        self.assertEqual(User.objects.filter(email=self.student_email).count(), 1)
        self.assertTrue(student.has_role(User.Role.STUDENT))
        self.assertTrue(student.has_role(User.Role.ADMIN))
        self.assertEqual(set(student.roles), {User.Role.STUDENT, User.Role.ADMIN})

    # -----------------------------------------------------------------
    # B: Duplicate role assignment is idempotent and rejected/handled safely
    # -----------------------------------------------------------------
    def test_duplicate_role_assignment_is_idempotent(self):
        user = User.objects.create_user(
            username="dup_test",
            email="dup@campus.edu",
            password=self.password,
            role=User.Role.STUDENT
        )
        # Assign STUDENT again
        ur1, created1 = RoleService.assign_role(user, User.Role.STUDENT)
        self.assertFalse(created1)
        self.assertEqual(UserRole.objects.filter(user=user, role=User.Role.STUDENT).count(), 1)

    # -----------------------------------------------------------------
    # D, E, F: Combinations (Student+ShopOwner, Student+Courier, ShopOwner+Courier)
    # -----------------------------------------------------------------
    def test_multi_role_combinations(self):
        combo_user = User.objects.create_user(
            username="combo_user",
            email="combo@campus.edu",
            password=self.password,
            role=User.Role.STUDENT
        )
        RoleService.assign_role(combo_user, User.Role.SHOP_OWNER)
        RoleService.assign_role(combo_user, User.Role.DELIVERY_AGENT)

        self.assertTrue(combo_user.has_role(User.Role.STUDENT))
        self.assertTrue(combo_user.has_role(User.Role.SHOP_OWNER))
        self.assertTrue(combo_user.has_role(User.Role.DELIVERY_AGENT))
        self.assertEqual(set(combo_user.roles), {User.Role.STUDENT, User.Role.SHOP_OWNER, User.Role.DELIVERY_AGENT})

    # -----------------------------------------------------------------
    # H: Brand new Admin account flow still works
    # -----------------------------------------------------------------
    def test_new_admin_account_flow_still_works(self):
        new_email = "brand_new_admin@campus.edu"
        self.client.force_authenticate(user=self.platform_owner)
        inv = self.client.post('/api/admin/management/invite/', {
            'email': new_email,
            'name': 'New Admin',
            'department': 'HR'
        }, format='json')
        self.assertEqual(inv.status_code, status.HTTP_201_CREATED)

        otp_rec = EmailVerificationOTP.objects.filter(
            email=new_email,
            purpose=EmailVerificationOTP.Purpose.ADMIN_INVITATION
        ).latest('created_at')
        otp_rec.set_otp("998877")
        otp_rec.save()

        self.client.force_authenticate(user=None)
        ver = self.client.post('/api/admin/management/invitations/verify/', {
            'email': new_email,
            'otp': '998877'
        }, format='json')
        self.assertEqual(ver.status_code, status.HTTP_200_OK)
        token = ver.data['invitation_token']

        sp = self.client.post('/api/admin/management/invitations/set-password/', {
            'email': new_email,
            'invitation_token': token,
            'password': 'NewAdminPass123!@#',
            'confirm_password': 'NewAdminPass123!@#'
        }, format='json')
        self.assertEqual(sp.status_code, status.HTTP_200_OK)

        new_admin = User.objects.get(email=new_email)
        self.assertTrue(new_admin.is_active)
        self.assertEqual(new_admin.roles, [User.Role.ADMIN])

    # -----------------------------------------------------------------
    # I & J: Multi-Role login response returns roles list and active_role
    # -----------------------------------------------------------------
    def test_multi_role_login_response(self):
        user = User.objects.create_user(
            username="mr_login_user",
            email="mr_login@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        RoleService.assign_role(user, User.Role.ADMIN)

        res = self.client.post('/api/auth/login/', {
            'email': 'mr_login@campus.edu',
            'password': self.password
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(set(res.data['user']['roles']), {User.Role.STUDENT, User.Role.ADMIN})
        self.assertIn('active_role', res.data['user'])

    # -----------------------------------------------------------------
    # K & L: Valid role switching and invalid role switching
    # -----------------------------------------------------------------
    def test_role_switching_valid_and_invalid(self):
        user = User.objects.create_user(
            username="switcher",
            email="switcher@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        RoleService.assign_role(user, User.Role.ADMIN)

        # Login to get token
        login_res = self.client.post('/api/auth/login/', {'email': 'switcher@campus.edu', 'password': self.password}, format='json')
        token = login_res.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # 1. Switch to ADMIN (Valid)
        sw_res = self.client.post('/api/auth/switch-role/', {'role': User.Role.ADMIN}, format='json')
        self.assertEqual(sw_res.status_code, status.HTTP_200_OK)
        self.assertEqual(sw_res.data['active_role'], User.Role.ADMIN)
        admin_token = sw_res.data['access']

        # 2. Switch to SHOP_OWNER (Invalid - not possessed)
        sw_invalid = self.client.post('/api/auth/switch-role/', {'role': User.Role.SHOP_OWNER}, format='json')
        self.assertEqual(sw_invalid.status_code, status.HTTP_403_FORBIDDEN)

        # 3. Switch to PLATFORM_OWNER (Invalid - not possessed)
        sw_owner = self.client.post('/api/auth/switch-role/', {'role': User.Role.PLATFORM_OWNER}, format='json')
        self.assertEqual(sw_owner.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------
    # M & N: Admin & Platform Owner privilege escalation blocked
    # -----------------------------------------------------------------
    def test_escalation_blocked(self):
        student = User.objects.create_user(
            username="pure_student",
            email="pure_student@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        login_res = self.client.post('/api/auth/login/', {'email': 'pure_student@campus.edu', 'password': self.password}, format='json')
        token = login_res.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

        # Attempt to access admin APIs
        res = self.client.get('/api/admin/management/admins/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

        # Attempt to switch to admin
        res_sw = self.client.post('/api/auth/switch-role/', {'role': User.Role.ADMIN}, format='json')
        self.assertEqual(res_sw.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------
    # O & P: Role removal and verification
    # -----------------------------------------------------------------
    def test_role_removal(self):
        user = User.objects.create_user(
            username="rem_user",
            email="rem_user@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        RoleService.assign_role(user, User.Role.ADMIN)
        self.assertEqual(set(user.roles), {User.Role.STUDENT, User.Role.ADMIN})

        # Remove ADMIN
        RoleService.remove_role(user, User.Role.ADMIN)
        self.assertEqual(user.roles, [User.Role.STUDENT])
        self.assertFalse(user.has_role(User.Role.ADMIN))

        # Attempt to remove last remaining role (must fail)
        with self.assertRaises(ValidationError):
            RoleService.remove_role(user, User.Role.STUDENT)

    # -----------------------------------------------------------------
    # Q: Cross-user role isolation
    # -----------------------------------------------------------------
    def test_cross_user_role_isolation(self):
        user_a = User.objects.create_user(
            username="user_a",
            email="user_a@campus.edu",
            password=self.password,
            role=User.Role.ADMIN,
            is_active=True,
            email_verified=True
        )
        RoleService.assign_role(user_a, User.Role.ADMIN)

        user_b = User.objects.create_user(
            username="user_b",
            email="user_b@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        login_b = self.client.post('/api/auth/login/', {'email': 'user_b@campus.edu', 'password': self.password}, format='json')
        token_b = login_b.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')

        # User B cannot access admin endpoint
        res = self.client.get('/api/admin/management/admins/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    # -----------------------------------------------------------------
    # R: Logout blacklists refresh token
    # -----------------------------------------------------------------
    def test_logout_blacklists_token(self):
        user = User.objects.create_user(
            username="logout_user",
            email="logout@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        login_res = self.client.post('/api/auth/login/', {'email': 'logout@campus.edu', 'password': self.password}, format='json')
        access = login_res.data['access']
        refresh = login_res.data['refresh']

        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {access}')
        logout_res = self.client.post('/api/auth/logout/', {'refresh': refresh}, format='json')
        self.assertEqual(logout_res.status_code, status.HTTP_200_OK)

        # Refresh attempt with blacklisted token must fail
        ref_res = self.client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(ref_res.status_code, status.HTTP_401_UNAUTHORIZED)

    # -----------------------------------------------------------------
    # T: Tampered JWT rejected
    # -----------------------------------------------------------------
    def test_tampered_jwt_rejected(self):
        user = User.objects.create_user(
            username="tamp_user",
            email="tamp@campus.edu",
            password=self.password,
            role=User.Role.STUDENT,
            is_active=True,
            email_verified=True
        )
        login_res = self.client.post('/api/auth/login/', {'email': 'tamp@campus.edu', 'password': self.password}, format='json')
        access = login_res.data['access']

        # Tamper with token
        tampered = access + "xyz"
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {tampered}')
        res = self.client.get('/api/auth/me/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
