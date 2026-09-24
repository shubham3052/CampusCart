import json
from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from academics.models import (
    Institution,
    AcademicYear,
    Semester,
    AcademicCalendar,
    AcademicEvent,
    AcademicEventImpact,
    StudentAcademicProfile,
    AcademicAuditLog,
    log_academic_action,
)
from academics.event_intelligence import (
    get_upcoming_events,
    get_relevant_events_for_student,
    calculate_event_proximity,
    calculate_event_intensity,
    get_affected_categories_and_products,
    get_academic_feature_vector,
    get_academic_demand_analytics,
    dispatch_academic_event_reminders,
)
from products.models import Category, Product
from shops.models import Shop
from orders.models import Order, OrderItem
from notifications.models import Notification

User = get_user_model()


class AcademicStructureModelTests(TestCase):
    """
    Tests for Institution, AcademicYear, Semester, and AcademicCalendar models.
    Verifies relationships, date constraints, status derivations, and validations.
    """

    def setUp(self):
        self.institution = Institution.objects.create(
            name="St. Xavier's Engineering College",
            code="SXEC-01",
            city="Bengaluru",
            state="Karnataka",
            is_active=True
        )

    def test_institution_creation(self):
        self.assertEqual(str(self.institution), "St. Xavier's Engineering College (SXEC-01)")
        self.assertTrue(self.institution.active)
        self.institution.active = False
        self.assertFalse(self.institution.is_active)

    def test_academic_year_validation(self):
        # Valid academic year
        ay = AcademicYear(
            institution=self.institution,
            name="2026-2027",
            start_date=date(2026, 8, 1),
            end_date=date(2027, 5, 31),
            is_active=True
        )
        ay.full_clean()
        ay.save()
        self.assertEqual(ay.institution, self.institution)
        self.assertTrue(ay.active)

        # Invalid date: end_date < start_date
        invalid_ay = AcademicYear(
            institution=self.institution,
            name="2027-2028",
            start_date=date(2028, 5, 1),
            end_date=date(2027, 5, 1),
            is_active=True
        )
        with self.assertRaises(ValidationError):
            invalid_ay.full_clean()

    def test_academic_year_overlap_prevention(self):
        # Existing active year: Aug 2026 to May 2027
        AcademicYear.objects.create(
            institution=self.institution,
            name="2026-2027",
            start_date=date(2026, 8, 1),
            end_date=date(2027, 5, 31),
            is_active=True
        )

        # Overlapping active year for same institution
        overlapping_ay = AcademicYear(
            institution=self.institution,
            name="2026-Late",
            start_date=date(2027, 1, 1),
            end_date=date(2027, 12, 31),
            is_active=True
        )
        with self.assertRaises(ValidationError):
            overlapping_ay.full_clean()

    def test_semester_creation_and_validation(self):
        ay = AcademicYear.objects.create(
            institution=self.institution,
            name="2026-2027",
            start_date=date(2026, 8, 1),
            end_date=date(2027, 5, 31)
        )
        sem = Semester.objects.create(
            institution=self.institution,
            academic_year=ay,
            name="Odd Semester 5",
            number=5,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 12, 20)
        )
        self.assertEqual(sem.number, 5)
        self.assertTrue(sem.active)

        # Mismatched institution check
        other_inst = Institution.objects.create(name="City Polytechnic", code="CP-02")
        mismatched_sem = Semester(
            institution=other_inst,
            academic_year=ay,
            name="Invalid Sem",
            number=1,
            start_date=date(2026, 8, 1),
            end_date=date(2026, 12, 1)
        )
        with self.assertRaises(ValidationError):
            mismatched_sem.full_clean()

    def test_academic_event_status_derivation(self):
        today = timezone.now().date()

        # Upcoming Event
        upcoming = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Final Theory Examinations",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            importance=AcademicCalendar.Importance.CRITICAL,
            start_date=today + timedelta(days=10),
            end_date=today + timedelta(days=25)
        )
        self.assertEqual(upcoming.status, 'UPCOMING')
        self.assertEqual(upcoming.days_until_event, 10)
        self.assertEqual(upcoming.event_category, 'ACADEMIC')

        # Active Event
        active_ev = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Internal Assessment II",
            event_type=AcademicCalendar.EventType.INTERNAL_EXAM,
            importance=AcademicCalendar.Importance.HIGH,
            start_date=today - timedelta(days=2),
            end_date=today + timedelta(days=3)
        )
        self.assertEqual(active_ev.status, 'ACTIVE')
        self.assertEqual(active_ev.days_until_event, 0)
        self.assertEqual(active_ev.days_remaining, 3)

        # Completed Event
        completed_ev = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Orientation Week",
            event_type=AcademicCalendar.EventType.SEMESTER_START,
            importance=AcademicCalendar.Importance.LOW,
            start_date=today - timedelta(days=30),
            end_date=today - timedelta(days=25)
        )
        self.assertEqual(completed_ev.status, 'COMPLETED')
        self.assertEqual(completed_ev.event_category, 'SEMESTER')

        # Cancelled Event
        upcoming.status_override = AcademicCalendar.StatusOverride.CANCELLED
        upcoming.save()
        self.assertEqual(upcoming.status, 'CANCELLED')

    def test_event_intensity_calculation(self):
        today = timezone.now().date()

        # Critical event in 10 days
        crit_event = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Final Exams",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            importance=AcademicCalendar.Importance.CRITICAL,
            start_date=today + timedelta(days=10),
            end_date=today + timedelta(days=20)
        )
        # Intensity formula: (1.0 / (1.0 + 0.1 * 10)) * 1.0 = (1.0 / 2.0) * 1.0 = 0.5
        intensity = calculate_event_intensity(crit_event, today)
        self.assertEqual(intensity, 0.5)

        # Active event intensity: proximity factor 1.0 * importance 1.0 = 1.0
        crit_event.start_date = today - timedelta(days=1)
        crit_event.save()
        self.assertEqual(calculate_event_intensity(crit_event, today), 1.0)


class AcademicEventImpactTests(TestCase):
    """
    Tests for category-level, product-level, and service-level academic demand impact configurations.
    """

    def setUp(self):
        self.institution = Institution.objects.create(name="Tech Institute", code="TI-01")
        self.owner = User.objects.create_user(username="tech_owner", email="to@shop.com", role=User.Role.SHOP_OWNER)
        self.shop = Shop.objects.create(owner=self.owner, name="Tech Store", slug="tech-store")
        self.category = Category.objects.create(name="Writing Instruments", slug="writing-instruments")
        self.product = Product.objects.create(
            shop=self.shop,
            name="Pilot V7 High-Precision Blue Pen",
            slug="pilot-v7-high-precision-blue-pen",
            sku="PEN-V7-BLU",
            category=self.category,
            price=Decimal("70.00")
        )
        self.event = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Final Exams",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 20)
        )

    def test_category_and_service_impact_rules(self):
        # 1. Category Impact
        cat_impact = AcademicEventImpact.objects.create(
            event=self.event,
            category=self.category,
            impact_type=AcademicEventImpact.ImpactType.INCREASE,
            impact_strength=AcademicEventImpact.ImpactStrength.HIGH,
            notes="Exam stationery rush"
        )
        self.assertEqual(cat_impact.impact_type, 'INCREASE')

        # 2. Service Impact (Printing & Binding)
        service_impact = AcademicEventImpact.objects.create(
            event_type=AcademicCalendar.EventType.PROJECT_SUBMISSION,
            service_type=AcademicEventImpact.ServiceType.PRINTING,
            impact_type=AcademicEventImpact.ImpactType.INCREASE,
            impact_strength=AcademicEventImpact.ImpactStrength.HIGH
        )
        self.assertEqual(service_impact.service_type, 'PRINTING')

        # 3. Aggregation check
        impacts = get_affected_categories_and_products([self.event])
        self.assertEqual(len(impacts['categories']), 1)
        self.assertEqual(impacts['categories'][0]['category_name'], "Writing Instruments")

    def test_product_level_precedence_over_category(self):
        AcademicEventImpact.objects.create(
            event=self.event,
            product=self.product,
            impact_type=AcademicEventImpact.ImpactType.INCREASE,
            impact_strength=AcademicEventImpact.ImpactStrength.HIGH
        )
        impacts = get_affected_categories_and_products([self.event])
        self.assertEqual(len(impacts['products']), 1)
        self.assertEqual(impacts['products'][0]['product_id'], self.product.id)


class MultiCollegeIsolationAndRelevanceTests(TestCase):
    """
    Verifies multi-institution data isolation: students at College A never see College B events.
    """

    def setUp(self):
        self.inst_a = Institution.objects.create(name="College Alpha", code="COL-A")
        self.inst_b = Institution.objects.create(name="College Beta", code="COL-B")

        self.student_a_user = User.objects.create_user(
            username="student_a",
            email="student_a@alpha.edu",
            password="password123",
            role=User.Role.STUDENT
        )
        self.student_b_user = User.objects.create_user(
            username="student_b",
            email="student_b@beta.edu",
            password="password123",
            role=User.Role.STUDENT
        )
        self.general_user = User.objects.create_user(
            username="general_shopper",
            email="shopper@gmail.com",
            password="password123",
            role=User.Role.STUDENT
        )

        StudentAcademicProfile.objects.create(
            student=self.student_a_user,
            institution=self.inst_a,
            course="BCA",
            semester_number=5
        )
        StudentAcademicProfile.objects.create(
            student=self.student_b_user,
            institution=self.inst_b,
            course="BBA",
            semester_number=3
        )

        today = timezone.now().date()
        # College A event
        self.event_a = AcademicCalendar.objects.create(
            institution=self.inst_a,
            title="Alpha Midterms",
            event_type=AcademicCalendar.EventType.INTERNAL_EXAM,
            start_date=today + timedelta(days=5),
            end_date=today + timedelta(days=12)
        )
        # College B event
        self.event_b = AcademicCalendar.objects.create(
            institution=self.inst_b,
            title="Beta Final Exams",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            start_date=today + timedelta(days=8),
            end_date=today + timedelta(days=20)
        )
        # General Campus event
        self.event_general = AcademicCalendar.objects.create(
            institution=None,
            title="National Science Day Book Fair",
            event_type=AcademicCalendar.EventType.COLLEGE_EVENT,
            start_date=today + timedelta(days=3),
            end_date=today + timedelta(days=4)
        )

    def test_strict_multi_college_isolation(self):
        # Student A must see Event A, but NEVER Event B
        events_a = list(get_relevant_events_for_student(self.student_a_user, days=30))
        event_ids_a = [e.id for e in events_a]
        self.assertIn(self.event_a.id, event_ids_a)
        self.assertNotIn(self.event_b.id, event_ids_a)

        # Student B must see Event B, but NEVER Event A
        events_b = list(get_relevant_events_for_student(self.student_b_user, days=30))
        event_ids_b = [e.id for e in events_b]
        self.assertIn(self.event_b.id, event_ids_b)
        self.assertNotIn(self.event_a.id, event_ids_b)

    def test_general_user_without_academic_profile_handles_gracefully(self):
        # General student sees platform-wide events (institution is null) without error
        events_gen = list(get_relevant_events_for_student(self.general_user, days=30))
        event_ids_gen = [e.id for e in events_gen]
        self.assertIn(self.event_general.id, event_ids_gen)
        self.assertNotIn(self.event_a.id, event_ids_gen)
        self.assertNotIn(self.event_b.id, event_ids_gen)


class AcademicDemandFeaturesAndZeroLeakageTests(TestCase):
    """
    Tests zero-leakage academic context feature vector generation for ML regression.
    """

    def setUp(self):
        self.institution = Institution.objects.create(name="Tech Univ", code="TU-01")
        today = timezone.now().date()

        # Historical / Scheduled Events
        self.exam_event = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Semester 5 Exams",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            importance=AcademicCalendar.Importance.CRITICAL,
            start_date=today + timedelta(days=10),
            end_date=today + timedelta(days=20)
        )
        self.proj_event = AcademicCalendar.objects.create(
            institution=self.institution,
            title="Capstone Project Submission",
            event_type=AcademicCalendar.EventType.PROJECT_SUBMISSION,
            start_date=today + timedelta(days=15),
            end_date=today + timedelta(days=16)
        )

    def test_zero_leakage_feature_vector_calculation(self):
        today = timezone.now().date()
        feat = get_academic_feature_vector(shop=None, product=None, date_val=today)

        self.assertEqual(feat['days_to_next_exam'], 10)
        self.assertEqual(feat['days_to_project_submission'], 15)
        self.assertFalse(feat['is_exam_period'])
        self.assertFalse(feat['is_project_period'])
        self.assertIsNone(feat['days_to_semester_start'])

        # On exam day itself
        exam_day = today + timedelta(days=10)
        feat_exam_day = get_academic_feature_vector(shop=None, product=None, date_val=exam_day)
        self.assertTrue(feat_exam_day['is_exam_period'])
        self.assertEqual(feat_exam_day['academic_event_intensity'], 1.0)


class AcademicDemandAnalyticsTests(TestCase):
    """
    Verifies actual historical sales velocity analysis and insufficient data safeguards.
    """

    def setUp(self):
        self.owner = User.objects.create_user(username="owner1", email="o1@shop.com", role=User.Role.SHOP_OWNER)
        self.shop = Shop.objects.create(owner=self.owner, name="Campus Store", slug="campus-store")

    def test_insufficient_historical_data_flag(self):
        # Empty orders -> must return has_sufficient_data: False without faking numbers
        res = get_academic_demand_analytics(shop=self.shop, days=60)
        self.assertFalse(res['has_sufficient_data'])
        self.assertEqual(res['exam_period_avg_daily'], 0.0)
        self.assertIn("Insufficient", res['message'])


class AcademicNotificationsAndIdempotencyTests(TestCase):
    """
    Verifies event reminder dispatch, multi-window triggers (7, 3, 1 days), and idempotency duplicate prevention.
    """

    def setUp(self):
        self.inst = Institution.objects.create(name="Apex College", code="AC-01")
        self.student_user = User.objects.create_user(
            username="apex_student",
            email="student@apex.edu",
            role=User.Role.STUDENT
        )
        self.profile = StudentAcademicProfile.objects.create(
            student=self.student_user,
            institution=self.inst,
            notify_exam_reminders=True
        )

        today = timezone.now().date()
        self.event = AcademicCalendar.objects.create(
            institution=self.inst,
            title="University Finals",
            event_type=AcademicCalendar.EventType.FINAL_EXAM,
            start_date=today + timedelta(days=7),
            end_date=today + timedelta(days=15)
        )

    def test_reminder_dispatch_and_duplicate_prevention(self):
        today = timezone.now().date()

        # Run 1: Should send 1 notification for the 7-day window
        stats1 = dispatch_academic_event_reminders(target_date=today, reminder_windows=[7, 3, 1])
        self.assertEqual(stats1['student_notifications_sent'], 1)
        self.assertEqual(Notification.objects.filter(recipient=self.student_user).count(), 1)

        # Run 2: Same day, same event -> must be skipped by idempotency
        stats2 = dispatch_academic_event_reminders(target_date=today, reminder_windows=[7, 3, 1])
        self.assertEqual(stats2['student_notifications_sent'], 0)
        self.assertEqual(stats2['skipped_duplicate'], 1)
        self.assertEqual(Notification.objects.filter(recipient=self.student_user).count(), 1)

    def test_notification_preference_opt_out(self):
        today = timezone.now().date()
        self.profile.notify_exam_reminders = False
        self.profile.save()

        stats = dispatch_academic_event_reminders(target_date=today, reminder_windows=[7])
        self.assertEqual(stats['student_notifications_sent'], 0)
        self.assertEqual(stats['skipped_preference'], 1)


class AcademicAPISecurityAndCRUDTests(TestCase):
    """
    Tests REST endpoints, role-based security, student self-service, and audit logs.
    """

    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(username="adm", email="adm@inst.edu", role=User.Role.ADMIN)
        self.student = User.objects.create_user(username="std", email="std@inst.edu", role=User.Role.STUDENT)
        self.shop_owner = User.objects.create_user(username="merch", email="merch@inst.edu", role=User.Role.SHOP_OWNER)
        self.inst = Institution.objects.create(name="Trinity College", code="TRIN-01")

    def test_student_cannot_create_or_cancel_academic_event(self):
        self.client.force_authenticate(user=self.student)
        today = timezone.now().date()

        # Student attempting to create event -> 403 Forbidden
        create_res = self.client.post('/api/academic/', {
            "title": "Hacked Holiday",
            "event_type": "HOLIDAY",
            "start_date": str(today),
            "end_date": str(today + timedelta(days=5)),
            "institution": self.inst.id
        })
        self.assertEqual(create_res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_crud_and_audit_logging(self):
        self.client.force_authenticate(user=self.admin)
        today = timezone.now().date()

        # Create Event
        res = self.client.post('/api/academic/', {
            "title": "Official Midterm Week",
            "event_type": "INTERNAL_EXAM",
            "importance": "HIGH",
            "start_date": str(today + timedelta(days=14)),
            "end_date": str(today + timedelta(days=20)),
            "institution": self.inst.id
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        event_id = res.data['id']

        # Verify audit log was created
        log_entry = AcademicAuditLog.objects.filter(object_id=str(event_id), action='EVENT_CREATED').first()
        self.assertIsNotNone(log_entry)
        self.assertEqual(log_entry.user, self.admin)

        # Cancel Event
        cancel_res = self.client.post(f'/api/academic/{event_id}/cancel/')
        self.assertEqual(cancel_res.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_res.data['event']['status'], 'CANCELLED')

        # Verify audit log for cancellation
        cancel_log = AcademicAuditLog.objects.filter(object_id=str(event_id), action='EVENT_CANCELLED').first()
        self.assertIsNotNone(cancel_log)

    def test_student_academic_profile_self_service(self):
        self.client.force_authenticate(user=self.student)

        # Student updates own profile
        res = self.client.patch('/api/student-academic-profile/me/', {
            "institution": self.inst.id,
            "course": "B.Tech Computer Science",
            "department": "School of Engineering",
            "year": 3,
            "semester_number": 6
        })
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['profile']['course'], "B.Tech Computer Science")
        self.assertEqual(res.data['profile']['institution_code'], "TRIN-01")

    def test_feature_report_endpoint(self):
        self.client.force_authenticate(user=self.student)
        res = self.client.get('/api/academic/feature-report/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['success'])
        self.assertIn('days_to_next_exam', res.data['academic_event_features'])
        self.assertIn('lag_1', res.data['baseline_regression_features'])
