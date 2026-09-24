"""
Academic Calendar & Event Intelligence Engine.
Computes upcoming event timelines, student collegiate relevance, explainable proximity & intensity,
impacted stationery categories and printing services, and zero-leakage feature vectors for ML demand modeling.
"""

from datetime import timedelta, date
from decimal import Decimal
from django.utils import timezone
from django.db.models import Q, Avg, Sum, Count

from .models import (
    Institution,
    AcademicYear,
    Semester,
    AcademicCalendar,
    AcademicEventImpact,
    StudentAcademicProfile,
)
from products.models import Category, Product
from orders.models import Order, OrderItem

IMPORTANCE_WEIGHTS = {
    AcademicCalendar.Importance.CRITICAL: 1.0,
    AcademicCalendar.Importance.HIGH: 0.8,
    AcademicCalendar.Importance.MEDIUM: 0.5,
    AcademicCalendar.Importance.LOW: 0.2,
}


def get_upcoming_events(institution=None, days=30):
    """
    Retrieves upcoming and active academic events within the specified calendar day window.
    Strictly excludes cancelled and inactive events.
    """
    today = timezone.now().date()
    cutoff = today + timedelta(days=days)

    qs = AcademicCalendar.objects.filter(
        is_active=True,
        start_date__lte=cutoff,
        end_date__gte=today
    ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED).select_related(
        'institution', 'academic_year', 'semester_ref'
    ).order_by('start_date', 'importance')

    if institution:
        qs = qs.filter(Q(institution=institution) | Q(institution__isnull=True))

    return qs


def get_relevant_events_for_student(user, days=30):
    """
    Filters upcoming events tailored to a student's enrolled college, semester, and course.
    Enforces strict multi-college isolation: students never receive events from another institution.
    """
    today = timezone.now().date()
    cutoff = today + timedelta(days=days)

    base_qs = AcademicCalendar.objects.filter(
        is_active=True,
        start_date__lte=cutoff,
        end_date__gte=today
    ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED).select_related(
        'institution', 'academic_year', 'semester_ref'
    )

    profile = getattr(user, 'academic_profile', None)
    if not profile or not profile.institution:
        # General student not tied to a college: return platform-wide general events
        return base_qs.filter(institution__isnull=True).order_by('start_date')

    # Student belongs to an institution: strictly filter by student's institution
    qs = base_qs.filter(institution=profile.institution)

    # Relevant if:
    # 1. Event is institution-wide (semester_ref and course are blank)
    # 2. Event matches student's semester or course
    filter_q = Q(semester_ref__isnull=True, course='')
    if profile.semester:
        filter_q |= Q(semester_ref=profile.semester)
    elif profile.semester_number:
        filter_q |= Q(semester_ref__number=profile.semester_number)

    if profile.course:
        filter_q |= Q(course__iexact=profile.course)

    if profile.department:
        filter_q |= Q(department__iexact=profile.department)

    return qs.filter(filter_q).order_by('start_date')


def calculate_event_proximity(event, target_date=None):
    """
    Computes explainable timeline proximity metrics for an academic event.
    """
    ref_date = target_date or timezone.now().date()

    if ref_date < event.start_date:
        days_until = (event.start_date - ref_date).days
        is_active = False
        is_completed = False
        days_remaining = (event.end_date - event.start_date).days
    elif event.start_date <= ref_date <= event.end_date:
        days_until = 0
        is_active = True
        is_completed = False
        days_remaining = (event.end_date - ref_date).days
    else:
        days_until = 0
        is_active = False
        is_completed = True
        days_remaining = 0

    return {
        "event_id": event.id,
        "title": event.title,
        "event_type": event.event_type,
        "importance": event.importance,
        "start_date": event.start_date,
        "end_date": event.end_date,
        "days_until": days_until,
        "days_remaining": days_remaining,
        "is_active": is_active,
        "is_completed": is_completed,
        "status": event.status,
    }


def calculate_event_intensity(event, target_date=None):
    """
    Calculates a normalized, explainable event intensity score (0.0 to 1.0).
    Formula:
        Proximity Factor = 1.0 / (1.0 + 0.1 * days_until)  [if not yet started]
        Proximity Factor = 1.0                             [if currently active]
        Intensity = round(Proximity Factor * Importance_Weight, 3)
    """
    prox = calculate_event_proximity(event, target_date)
    if prox['is_completed']:
        return 0.0

    weight = IMPORTANCE_WEIGHTS.get(event.importance, 0.5)

    if prox['is_active']:
        proximity_factor = 1.0
    else:
        proximity_factor = 1.0 / (1.0 + (0.1 * prox['days_until']))

    intensity = round(proximity_factor * weight, 3)
    return intensity


def get_affected_categories_and_products(events_list):
    """
    Derives anticipated category and printing service impacts from configured AcademicEventImpact rules.
    Product-level overrides take precedence over category-level rules.
    """
    if not events_list:
        return {
            "categories": [],
            "products": [],
            "services": [],
            "total_impact_rules": 0
        }

    event_ids = [e.id for e in events_list]
    event_types = [e.event_type for e in events_list]

    impact_rules = AcademicEventImpact.objects.filter(
        Q(event_id__in=event_ids) | Q(event_type__in=event_types),
        is_active=True
    ).select_related('category', 'product', 'event')

    categories_map = {}
    products_map = {}
    services_map = {}

    for rule in impact_rules:
        # Category impact
        if rule.category:
            c_id = rule.category.id
            if c_id not in categories_map:
                categories_map[c_id] = {
                    "category_id": c_id,
                    "category_name": rule.category.name,
                    "impact_type": rule.impact_type,
                    "impact_strength": rule.impact_strength,
                    "notes": rule.notes
                }

        # Specific product impact
        if rule.product:
            p_id = rule.product.id
            products_map[p_id] = {
                "product_id": p_id,
                "product_name": rule.product.name,
                "sku": rule.product.sku,
                "impact_type": rule.impact_type,
                "impact_strength": rule.impact_strength,
                "notes": rule.notes
            }

        # Service impact (Printing, Binding, Xerox)
        if rule.service_type:
            s_type = rule.service_type
            services_map[s_type] = {
                "service_type": s_type,
                "service_name": rule.get_service_type_display(),
                "impact_type": rule.impact_type,
                "impact_strength": rule.impact_strength,
                "notes": rule.notes
            }

    return {
        "categories": list(categories_map.values()),
        "products": list(products_map.values()),
        "services": list(services_map.values()),
        "total_impact_rules": impact_rules.count()
    }


def get_academic_feature_vector(shop, product, date_val):
    """
    Produces a zero-leakage academic context feature vector for a specific calendar date.
    Strictly relies only on events whose start/end dates are chronologically compatible.
    """
    if isinstance(date_val, str):
        date_val = date.fromisoformat(date_val)

    # Active events on date_val
    active_events = AcademicCalendar.objects.filter(
        is_active=True,
        start_date__lte=date_val,
        end_date__gte=date_val
    ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED)

    # Upcoming events from date_val into the next 45 days
    upcoming_events = AcademicCalendar.objects.filter(
        is_active=True,
        start_date__gt=date_val,
        start_date__lte=date_val + timedelta(days=45)
    ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED)

    # Multi-college filter
    if shop and getattr(shop, 'institution', None):
        active_events = active_events.filter(Q(institution=shop.institution) | Q(institution__isnull=True))
        upcoming_events = upcoming_events.filter(Q(institution=shop.institution) | Q(institution__isnull=True))

    # Exam indicators
    exam_types = [
        AcademicCalendar.EventType.FINAL_EXAM,
        AcademicCalendar.EventType.INTERNAL_EXAM,
        AcademicCalendar.EventType.PRACTICAL,
        AcademicCalendar.EventType.VIVA
    ]

    is_exam_period = bool(active_events.filter(event_type__in=exam_types).exists())
    is_assignment_period = bool(active_events.filter(event_type=AcademicCalendar.EventType.ASSIGNMENT).exists())
    is_project_period = bool(active_events.filter(event_type__in=[
        AcademicCalendar.EventType.PROJECT_SUBMISSION,
        AcademicCalendar.EventType.PROJECT_PRESENTATION
    ]).exists())
    is_semester_start_period = bool(active_events.filter(event_type=AcademicCalendar.EventType.SEMESTER_START).exists())

    # Days to next events
    next_exam = upcoming_events.filter(event_type__in=exam_types).order_by('start_date').first()
    days_to_next_exam = (next_exam.start_date - date_val).days if next_exam else None

    next_assign = upcoming_events.filter(event_type=AcademicCalendar.EventType.ASSIGNMENT).order_by('start_date').first()
    days_to_next_assignment = (next_assign.start_date - date_val).days if next_assign else None

    next_project = upcoming_events.filter(event_type__in=[
        AcademicCalendar.EventType.PROJECT_SUBMISSION,
        AcademicCalendar.EventType.PROJECT_PRESENTATION
    ]).order_by('start_date').first()
    days_to_project_submission = (next_project.start_date - date_val).days if next_project else None

    next_sem_start = upcoming_events.filter(event_type=AcademicCalendar.EventType.SEMESTER_START).order_by('start_date').first()
    days_to_semester_start = (next_sem_start.start_date - date_val).days if next_sem_start else None

    # Max intensity score on date_val
    all_relevant = list(active_events) + list(upcoming_events[:5])
    intensity_scores = [calculate_event_intensity(e, date_val) for e in all_relevant]
    max_intensity = max(intensity_scores) if intensity_scores else 0.0

    return {
        "date": date_val.isoformat(),
        "days_to_next_exam": days_to_next_exam,
        "days_to_next_assignment": days_to_next_assignment,
        "days_to_project_submission": days_to_project_submission,
        "days_to_semester_start": days_to_semester_start,
        "is_exam_period": is_exam_period,
        "is_assignment_period": is_assignment_period,
        "is_project_period": is_project_period,
        "is_semester_start_period": is_semester_start_period,
        "academic_event_intensity": max_intensity,
    }


def get_academic_demand_analytics(shop=None, days=60):
    """
    Analyzes completed orders across historical academic periods to compute observed sales velocity
    during exam windows versus normal non-exam days. Uses real completed orders only.
    """
    today = timezone.now().date()
    start_history = today - timedelta(days=days)

    orders_qs = Order.objects.filter(
        status=Order.Status.COMPLETED,
        created_at__date__gte=start_history
    )
    if shop:
        orders_qs = orders_qs.filter(shop=shop)

    total_orders = orders_qs.count()
    if total_orders < 5:
        return {
            "has_sufficient_data": False,
            "message": "Insufficient historical academic sales data to calculate correlations.",
            "total_orders_analyzed": total_orders,
            "observation_window_days": days,
            "exam_period_avg_daily": 0.0,
            "normal_period_avg_daily": 0.0,
            "observed_percentage_change": 0.0
        }

    # Find exam event dates within observation window
    exam_events = AcademicCalendar.objects.filter(
        event_type__in=[
            AcademicCalendar.EventType.FINAL_EXAM,
            AcademicCalendar.EventType.INTERNAL_EXAM,
            AcademicCalendar.EventType.PRACTICAL
        ],
        start_date__lte=today,
        end_date__gte=start_history
    )

    exam_dates = set()
    for ev in exam_events:
        curr = max(start_history, ev.start_date)
        end_c = min(today, ev.end_date)
        while curr <= end_c:
            exam_dates.add(curr)
            curr += timedelta(days=1)

    # Aggregate sales by date
    daily_totals = {}
    for ord_obj in orders_qs.prefetch_related('items'):
        o_date = ord_obj.created_at.date()
        units = sum(it.quantity for it in ord_obj.items.all())
        daily_totals[o_date] = daily_totals.get(o_date, 0) + units

    exam_units = [qty for d, qty in daily_totals.items() if d in exam_dates]
    normal_units = [qty for d, qty in daily_totals.items() if d not in exam_dates]

    exam_avg = round(float(sum(exam_units) / len(exam_units)), 1) if exam_units else 0.0
    normal_avg = round(float(sum(normal_units) / len(normal_units)), 1) if normal_units else round(float(sum(daily_totals.values()) / max(1, len(daily_totals))), 1)

    if normal_avg > 0 and exam_avg > 0:
        pct_change = round(((exam_avg - normal_avg) / normal_avg) * 100, 1)
    else:
        pct_change = 0.0

    return {
        "has_sufficient_data": len(exam_units) >= 2,
        "message": "Observed historical relationship (correlation, not causation)" if len(exam_units) >= 2 else "Insufficient historical exam days observed.",
        "total_orders_analyzed": total_orders,
        "observation_window_days": days,
        "exam_days_count": len(exam_units),
        "exam_period_avg_daily": exam_avg,
        "normal_period_avg_daily": normal_avg,
        "observed_percentage_change": pct_change,
    }


def dispatch_academic_event_reminders(target_date=None, reminder_windows=None, dry_run=False):
    """
    Scans upcoming academic events and dispatches idempotent alerts for students and shop owners
    across configured reminder windows (e.g. 7 days, 3 days, 1 day before event).
    Respects student notification preferences and prevents duplicate notifications.
    """
    from notifications.models import Notification
    from shops.models import Shop
    from .models import StudentAcademicProfile

    if reminder_windows is None:
        reminder_windows = [7, 3, 1]

    ref_date = target_date or timezone.now().date()
    stats = {
        "student_notifications_sent": 0,
        "shopkeeper_notifications_sent": 0,
        "events_processed": 0,
        "skipped_duplicate": 0,
        "skipped_preference": 0,
    }

    for window in reminder_windows:
        event_date = ref_date + timedelta(days=window)
        # Events commencing on event_date
        events = AcademicCalendar.objects.filter(
            is_active=True,
            start_date=event_date
        ).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED).select_related(
            'institution', 'academic_year', 'semester_ref'
        )

        for ev in events:
            stats["events_processed"] += 1
            # 1. Target relevant Students
            student_profiles = StudentAcademicProfile.objects.filter(
                is_active=True
            ).select_related('student', 'institution', 'semester')

            if ev.institution:
                student_profiles = student_profiles.filter(institution=ev.institution)

            for prof in student_profiles:
                # Semester & course relevance
                if ev.semester_ref and prof.semester and ev.semester_ref != prof.semester:
                    continue
                if ev.course and prof.course and ev.course.lower() != prof.course.lower():
                    continue

                # Student notification preferences
                if 'EXAM' in ev.event_type and not prof.notify_exam_reminders:
                    stats["skipped_preference"] += 1
                    continue
                if 'ASSIGNMENT' in ev.event_type and not prof.notify_assignment_reminders:
                    stats["skipped_preference"] += 1
                    continue
                if 'PROJECT' in ev.event_type and not prof.notify_project_reminders:
                    stats["skipped_preference"] += 1
                    continue
                if not prof.notify_academic_reminders:
                    stats["skipped_preference"] += 1
                    continue

                # Idempotency check: unique reference ID per recipient, event, and window
                ref_id = f"ACADEMIC_EVENT_{ev.id}_WIN_{window}D"
                if Notification.objects.filter(recipient=prof.student, reference_id=ref_id).exists():
                    stats["skipped_duplicate"] += 1
                    continue

                if not dry_run:
                    Notification.objects.create(
                        recipient=prof.student,
                        title=f"Academic Reminder: {ev.title} in {window} day{'s' if window > 1 else ''}",
                        message=f"{ev.title} ({ev.get_event_type_display()}) starts on {ev.start_date}. Review study supplies and campus printing requirements.",
                        notification_type=Notification.NotificationType.ACADEMIC_ALERT,
                        reference_id=ref_id
                    )
                stats["student_notifications_sent"] += 1

            # 2. Target affiliated Shop Owners
            shops_qs = Shop.objects.filter(is_active=True).select_related('owner', 'institution')
            if ev.institution:
                shops_qs = shops_qs.filter(Q(institution=ev.institution) | Q(institution__isnull=True))

            for shop in shops_qs:
                if not shop.owner:
                    continue
                shop_ref_id = f"SHOP_ACADEMIC_ALERT_{shop.id}_{ev.id}_WIN_{window}D"
                if Notification.objects.filter(recipient=shop.owner, reference_id=shop_ref_id).exists():
                    stats["skipped_duplicate"] += 1
                    continue

                if not dry_run:
                    Notification.objects.create(
                        recipient=shop.owner,
                        title=f"Academic Demand Alert: {ev.title} in {window} days",
                        message=f"{ev.title} starts in {window} day{'s' if window > 1 else ''} ({ev.start_date}) at {ev.institution.name if ev.institution else 'Campus'}. Check inventory and printing capacity.",
                        notification_type=Notification.NotificationType.ACADEMIC_ALERT,
                        reference_id=shop_ref_id
                    )
                stats["shopkeeper_notifications_sent"] += 1

    return stats

