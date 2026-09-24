from datetime import timedelta
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from django.utils import timezone

from .models import (
    Institution,
    AcademicYear,
    Semester,
    AcademicCalendar,
    AcademicEventImpact,
    StudentAcademicProfile,
    StudentNote,
    StudentTask,
    StudentChecklist,
    StudentChecklistItem,
    AcademicAuditLog,
    log_academic_action,
)
from .serializers import (
    InstitutionSerializer,
    AcademicYearSerializer,
    SemesterSerializer,
    AcademicCalendarSerializer,
    AcademicEventImpactSerializer,
    StudentAcademicProfileSerializer,
    StudentNoteSerializer,
    StudentTaskSerializer,
    StudentChecklistSerializer,
    StudentChecklistItemSerializer,
)
from .services.planner_service import SmartPlannerService
from users.permissions import IsAdmin, IsShopOwnerOrAdmin, IsOwnerOrAdmin
from .event_intelligence import (
    get_upcoming_events,
    get_relevant_events_for_student,
    get_affected_categories_and_products,
    get_academic_demand_analytics,
    calculate_event_proximity,
    calculate_event_intensity,
    get_academic_feature_vector,
)


class InstitutionViewSet(viewsets.ModelViewSet):
    """
    CRUD API for Colleges & Universities.
    Admin has full control; Authenticated users can list and view institutions.
    """
    queryset = Institution.objects.all().order_by('name')
    serializer_class = InstitutionSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search')
        is_active = self.request.query_params.get('is_active')

        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(code__icontains=search) | Q(city__icontains=search))
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() in ('true', '1'))

        return qs


class AcademicYearViewSet(viewsets.ModelViewSet):
    """
    Academic Years (e.g. 2026-2027) for institutions.
    """
    queryset = AcademicYear.objects.select_related('institution').all().order_by('-start_date')
    serializer_class = AcademicYearSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        inst_id = self.request.query_params.get('institution')
        if inst_id:
            qs = qs.filter(institution_id=inst_id)
        return qs


class SemesterViewSet(viewsets.ModelViewSet):
    """
    Semesters & Terms within academic years.
    """
    queryset = Semester.objects.select_related('institution', 'academic_year').all().order_by('academic_year', 'number')
    serializer_class = SemesterSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        inst_id = self.request.query_params.get('institution')
        ay_id = self.request.query_params.get('academic_year')

        if inst_id:
            qs = qs.filter(institution_id=inst_id)
        if ay_id:
            qs = qs.filter(academic_year_id=ay_id)
        return qs


class AcademicCalendarViewSet(viewsets.ModelViewSet):
    """
    University Academic Calendar Events & Intelligence ViewSet.
    """
    queryset = AcademicCalendar.objects.select_related(
        'institution', 'academic_year', 'semester_ref'
    ).prefetch_related('impacts').all().order_by('start_date')
    serializer_class = AcademicCalendarSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'upcoming', 'relevant', 'demand_insights', 'analytics', 'features', 'feature_report']:
            permission_classes = [permissions.AllowAny]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        queryset = super().get_queryset()
        inst_id = self.request.query_params.get('institution')
        event_type = self.request.query_params.get('event_type')
        importance = self.request.query_params.get('importance')
        semester = self.request.query_params.get('semester')
        search = self.request.query_params.get('search')
        status_filter = self.request.query_params.get('status')

        if inst_id:
            queryset = queryset.filter(Q(institution_id=inst_id) | Q(institution__isnull=True))
        if event_type:
            queryset = queryset.filter(event_type=event_type)
        if importance:
            queryset = queryset.filter(importance=importance)
        if semester:
            queryset = queryset.filter(Q(semester__icontains=semester) | Q(semester_ref__name__icontains=semester))
        if search:
            queryset = queryset.filter(Q(title__icontains=search) | Q(description__icontains=search))

        today = timezone.now().date()
        if status_filter == 'UPCOMING':
            queryset = queryset.filter(start_date__gt=today).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED)
        elif status_filter == 'ACTIVE':
            queryset = queryset.filter(start_date__lte=today, end_date__gte=today).exclude(status_override=AcademicCalendar.StatusOverride.CANCELLED)
        elif status_filter == 'COMPLETED':
            queryset = queryset.filter(end_date__lt=today)
        elif status_filter == 'CANCELLED':
            queryset = queryset.filter(Q(status_override=AcademicCalendar.StatusOverride.CANCELLED) | Q(is_active=False))

        return queryset

    def perform_create(self, serializer):
        ev = serializer.save(created_by=self.request.user)
        log_academic_action(self.request.user, 'EVENT_CREATED', ev, {"title": ev.title, "event_type": ev.event_type})

    def perform_update(self, serializer):
        ev = serializer.save()
        action = 'EVENT_DEACTIVATED' if not ev.is_active else 'EVENT_UPDATED'
        log_academic_action(self.request.user, action, ev, {"title": ev.title, "is_active": ev.is_active})

    def perform_destroy(self, instance):
        log_academic_action(self.request.user, 'EVENT_DELETED', instance, {"title": instance.title})
        instance.delete()

    @action(detail=False, methods=['get'], url_path='upcoming')
    def upcoming(self, request):
        """
        GET /api/academic/upcoming/?days=30&institution=1
        Returns upcoming and active academic events with proximity metrics.
        """
        try:
            days = int(request.query_params.get('days', 30))
        except (ValueError, TypeError):
            days = 30

        inst_id = request.query_params.get('institution')
        inst = Institution.objects.filter(id=inst_id).first() if inst_id else None

        events = get_upcoming_events(institution=inst, days=days)
        serializer = self.get_serializer(events, many=True)
        return Response({
            "success": True,
            "window_days": days,
            "count": events.count(),
            "events": serializer.data
        })

    @action(detail=False, methods=['get'], url_path='relevant', permission_classes=[permissions.IsAuthenticated])
    def relevant(self, request):
        """
        GET /api/academic/relevant/?days=30
        Surfaces events relevant to the authenticated student's institution and semester.
        """
        try:
            days = int(request.query_params.get('days', 30))
        except (ValueError, TypeError):
            days = 30

        events = get_relevant_events_for_student(request.user, days=days)
        serializer = self.get_serializer(events, many=True)
        profile = getattr(request.user, 'academic_profile', None)

        return Response({
            "success": True,
            "has_academic_profile": profile is not None,
            "student_institution": profile.institution.name if profile and profile.institution else None,
            "student_semester": profile.semester_number if profile else None,
            "count": len(events),
            "events": serializer.data
        })

    @action(detail=False, methods=['get'], url_path='demand-insights', permission_classes=[permissions.IsAuthenticated, IsShopOwnerOrAdmin])
    def demand_insights(self, request):
        """
        GET /api/academic/demand-insights/?days=30
        Provides shopkeepers with upcoming academic events and anticipated affected stationery categories.
        """
        try:
            days = int(request.query_params.get('days', 30))
        except (ValueError, TypeError):
            days = 30

        events = get_upcoming_events(days=days)
        impacts_summary = get_affected_categories_and_products(events)

        events_data = []
        for ev in events:
            prox = calculate_event_proximity(ev)
            intensity = calculate_event_intensity(ev)
            events_data.append({
                "id": ev.id,
                "title": ev.title,
                "event_type": ev.event_type,
                "event_type_display": ev.get_event_type_display(),
                "importance": ev.importance,
                "start_date": ev.start_date.isoformat(),
                "end_date": ev.end_date.isoformat(),
                "days_until": prox['days_until'],
                "days_remaining": prox['days_remaining'],
                "is_active": prox['is_active'],
                "intensity_score": intensity,
                "institution_name": ev.institution.name if ev.institution else "All Campus",
            })

        return Response({
            "success": True,
            "window_days": days,
            "upcoming_events_count": len(events_data),
            "events": events_data,
            "affected_stationery": impacts_summary
        })

    @action(detail=False, methods=['get'], url_path='analytics')
    def analytics(self, request):
        """
        GET /api/academic/analytics/?days=60&shop=1
        Analyzes historical demand velocity during exam periods vs normal non-exam days.
        """
        try:
            days = int(request.query_params.get('days', 60))
        except (ValueError, TypeError):
            days = 60

        shop_id = request.query_params.get('shop')
        from shops.models import Shop
        shop = Shop.objects.filter(id=shop_id).first() if shop_id else None

        res = get_academic_demand_analytics(shop=shop, days=days)
        return Response({
            "success": True,
            "analytics": res
        })

    @action(detail=False, methods=['get'], url_path='features')
    def features(self, request):
        """
        GET /api/academic/features/?date=2026-09-10&shop=1
        Returns zero-leakage academic context feature vector for demand prediction.
        """
        from datetime import date
        date_str = request.query_params.get('date')
        if date_str:
            try:
                date_val = date.fromisoformat(date_str)
            except ValueError:
                return Response({"error": "Invalid date format. Use YYYY-MM-DD."}, status=400)
        else:
            date_val = timezone.now().date()

        shop_id = request.query_params.get('shop')
        shop = None
        if shop_id:
            from shops.models import Shop
            shop = Shop.objects.filter(id=shop_id).first()

        feat = get_academic_feature_vector(shop=shop, product=None, date_val=date_val)
        return Response({
            "success": True,
            **feat
        })

    @action(detail=False, methods=['get'], url_path='feature-report')
    def feature_report(self, request):
        """
        GET /api/academic/feature-report/
        Exposes demand regression features and academic context vectors for viva examination.
        """
        from ml.preprocessing.feature_engineering import FEATURE_COLUMNS, ACADEMIC_FEATURE_COLUMNS, FULL_FEATURE_COLUMNS
        return Response({
            "success": True,
            "total_features": len(FULL_FEATURE_COLUMNS),
            "baseline_regression_features": FEATURE_COLUMNS,
            "academic_event_features": ACADEMIC_FEATURE_COLUMNS,
            "all_features": FULL_FEATURE_COLUMNS,
            "leakage_safeguard": "Chronological train/test split (80/20) with no random shuffling. Features strictly lagged.",
            "model_strategy": "Step 17 regression model intact. Step 19 academic feature matrix generated and available for retraining in Step 20."
        })

    @action(detail=False, methods=['get'], url_path='audit-logs', permission_classes=[permissions.IsAuthenticated, IsAdmin])
    def audit_logs(self, request):
        """
        GET /api/academic/audit-logs/
        Returns audit entries for academic calendar operations.
        """
        logs = AcademicAuditLog.objects.select_related('user').all()[:100]
        from .serializers import AcademicAuditLogSerializer
        serializer = AcademicAuditLogSerializer(logs, many=True)
        return Response({
            "success": True,
            "count": logs.count(),
            "logs": serializer.data
        })

    @action(detail=True, methods=['post'], url_path='cancel', permission_classes=[permissions.IsAuthenticated, IsAdmin])
    def cancel(self, request, id=None):
        """
        POST /api/academic/{id}/cancel/
        Soft cancels an academic event, preserving historical context for analytics.
        """
        event = self.get_object()
        event.status_override = AcademicCalendar.StatusOverride.CANCELLED
        event.save(update_fields=['status_override', 'updated_at'])
        log_academic_action(request.user, 'EVENT_CANCELLED', event, {"title": event.title})
        return Response({
            "success": True,
            "message": f"Academic event '{event.title}' marked as CANCELLED.",
            "event": self.get_serializer(event).data
        })


class AcademicEventImpactViewSet(viewsets.ModelViewSet):
    """
    CRUD API for configuring how academic events impact stationery categories and printing services.
    """
    queryset = AcademicEventImpact.objects.select_related('event', 'category', 'product').all()
    serializer_class = AcademicEventImpactSerializer
    lookup_field = 'id'

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            permission_classes = [permissions.IsAuthenticated]
        else:
            permission_classes = [permissions.IsAuthenticated, IsAdmin]
        return [permission() for permission in permission_classes]

    def get_queryset(self):
        qs = super().get_queryset()
        event_id = self.request.query_params.get('event')
        event_type = self.request.query_params.get('event_type')
        category_id = self.request.query_params.get('category')

        if event_id:
            qs = qs.filter(event_id=event_id)
        if event_type:
            qs = qs.filter(event_type=event_type)
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def perform_create(self, serializer):
        impact = serializer.save()
        log_academic_action(self.request.user, 'IMPACT_CREATED', impact, {"impact_type": impact.impact_type, "impact_strength": impact.impact_strength})

    def perform_update(self, serializer):
        impact = serializer.save()
        log_academic_action(self.request.user, 'IMPACT_UPDATED', impact, {"impact_type": impact.impact_type, "impact_strength": impact.impact_strength})

    def perform_destroy(self, instance):
        log_academic_action(self.request.user, 'IMPACT_REMOVED', instance)
        instance.delete()


class StudentAcademicProfileViewSet(viewsets.ModelViewSet):
    """
    API for managing student collegiate credentials (College, Course, Semester).
    Students manage their own profile; Admins can view/manage platform-wide.
    """
    serializer_class = StudentAcademicProfileSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if user.is_admin:
            return StudentAcademicProfile.objects.select_related('student', 'institution', 'semester', 'academic_year').all()
        return StudentAcademicProfile.objects.filter(student=user).select_related('student', 'institution', 'semester', 'academic_year')

    @action(detail=False, methods=['get', 'put', 'patch'], url_path='me')
    def me(self, request):
        """
        GET /api/student-academic-profile/me/
        PUT /api/student-academic-profile/me/
        Self-service endpoint for students to view or update their collegiate profile.
        """
        profile, created = StudentAcademicProfile.objects.get_or_create(student=request.user)

        if request.method in ['PUT', 'PATCH']:
            serializer = self.get_serializer(profile, data=request.data, partial=True)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response({
                "success": True,
                "message": "Academic profile updated successfully.",
                "profile": serializer.data
            })

        serializer = self.get_serializer(profile)
        return Response({
            "success": True,
            "profile": serializer.data
        })


class StudentNoteViewSet(viewsets.ModelViewSet):
    """
    Student Study Notes & Reminders ViewSet.
    
    SECURITY:
    - Strictly scoped to the authenticated student (IsOwnerOrAdmin).
    - Students cannot view or modify another student's notes.
    """
    serializer_class = StudentNoteSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return StudentNote.objects.none()

        queryset = StudentNote.objects.all() if user.is_admin else StudentNote.objects.filter(student=user)

        category = self.request.query_params.get('category')
        is_pinned = self.request.query_params.get('is_pinned')
        is_archived = self.request.query_params.get('is_archived')
        search = self.request.query_params.get('search')

        if category:
            queryset = queryset.filter(category=category)
        if is_pinned is not None:
            queryset = queryset.filter(is_pinned=is_pinned.lower() in ('true', '1'))
        if is_archived is not None:
            queryset = queryset.filter(is_archived=is_archived.lower() in ('true', '1'))
        elif self.action == 'list':
            # By default exclude archived notes from list views unless requested
            queryset = queryset.filter(is_archived=False)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(content__icontains=search) | Q(subject__icontains=search)
            )

        ordering = self.request.query_params.get('ordering')
        if ordering:
            queryset = queryset.order_by(ordering)
        else:
            queryset = queryset.order_by('-is_pinned', '-updated_at')

        return queryset

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

    @action(detail=True, methods=['post'], url_path='pin')
    def pin(self, request, id=None):
        note = self.get_object()
        note.is_pinned = True
        note.save(update_fields=['is_pinned', 'updated_at'])
        return Response({"success": True, "message": "Note pinned.", "note": self.get_serializer(note).data})

    @action(detail=True, methods=['post'], url_path='unpin')
    def unpin(self, request, id=None):
        note = self.get_object()
        note.is_pinned = False
        note.save(update_fields=['is_pinned', 'updated_at'])
        return Response({"success": True, "message": "Note unpinned.", "note": self.get_serializer(note).data})

    @action(detail=True, methods=['post'], url_path='archive')
    def archive(self, request, id=None):
        note = self.get_object()
        note.is_archived = True
        note.save(update_fields=['is_archived', 'updated_at'])
        return Response({"success": True, "message": "Note archived.", "note": self.get_serializer(note).data})

    @action(detail=True, methods=['post'], url_path='unarchive')
    def unarchive(self, request, id=None):
        note = self.get_object()
        note.is_archived = False
        note.save(update_fields=['is_archived', 'updated_at'])
        return Response({"success": True, "message": "Note unarchived.", "note": self.get_serializer(note).data})


class StudentTaskViewSet(viewsets.ModelViewSet):
    """
    Student To-Do & Academic Task Management ViewSet.
    
    SECURITY:
    - Strictly scoped to the authenticated student (IsOwnerOrAdmin).
    - Students cannot view or modify another student's academic tasks.
    """
    serializer_class = StudentTaskSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return StudentTask.objects.none()
        
        queryset = StudentTask.objects.select_related('student', 'academic_event').all() if user.is_admin else StudentTask.objects.filter(student=user).select_related('academic_event')

        priority = self.request.query_params.get('priority')
        category = self.request.query_params.get('category')
        task_status = self.request.query_params.get('status')
        completed = self.request.query_params.get('completed')
        due_status = self.request.query_params.get('due_status')
        academic_event = self.request.query_params.get('academic_event')
        search = self.request.query_params.get('search')

        today = timezone.now().date()

        if priority:
            queryset = queryset.filter(priority=priority)
        if category:
            queryset = queryset.filter(category=category)
        if task_status:
            queryset = queryset.filter(status=task_status)
        if academic_event:
            queryset = queryset.filter(academic_event_id=academic_event)
        if completed is not None:
            queryset = queryset.filter(completed=completed.lower() in ('true', '1'))

        # Authoritative backend due status filtering
        if due_status == 'OVERDUE':
            queryset = queryset.filter(
                due_date__lt=today
            ).exclude(status__in=[StudentTask.Status.COMPLETED, StudentTask.Status.CANCELLED])
        elif due_status in ['DUE_TODAY', 'TODAY']:
            queryset = queryset.filter(
                due_date=today
            ).exclude(status__in=[StudentTask.Status.COMPLETED, StudentTask.Status.CANCELLED])
        elif due_status in ['DUE_TOMORROW', 'TOMORROW']:
            queryset = queryset.filter(
                due_date=today + timedelta(days=1)
            ).exclude(status__in=[StudentTask.Status.COMPLETED, StudentTask.Status.CANCELLED])
        elif due_status == 'UPCOMING':
            queryset = queryset.filter(
                due_date__gt=today
            ).exclude(status__in=[StudentTask.Status.COMPLETED, StudentTask.Status.CANCELLED])
        elif due_status == 'COMPLETED':
            queryset = queryset.filter(status=StudentTask.Status.COMPLETED)

        if search:
            queryset = queryset.filter(
                Q(title__icontains=search) | Q(description__icontains=search)
            )

        ordering = self.request.query_params.get('ordering')
        if ordering:
            return queryset.order_by(ordering)
        return queryset.order_by('completed', 'due_date', 'deadline', 'priority')

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

    @action(detail=True, methods=['post'], url_path='toggle-complete')
    def toggle_complete(self, request, id=None):
        """
        POST /api/tasks/{id}/toggle-complete/
        Flips task completion state and automatically handles completed_at timestamp.
        """
        task = self.get_object()
        if task.status == StudentTask.Status.COMPLETED or task.completed:
            task.completed = False
            task.status = StudentTask.Status.TODO
            task.completed_at = None
        else:
            task.completed = True
            task.status = StudentTask.Status.COMPLETED
            task.completed_at = timezone.now()
        task.save()
        return Response({
            "success": True,
            "message": f"Task marked as {'Completed' if task.completed else 'To Do'}.",
            "task": self.get_serializer(task).data
        })

    @action(detail=True, methods=['patch', 'post'], url_path='change-priority')
    def change_priority(self, request, id=None):
        """
        POST/PATCH /api/tasks/{id}/change-priority/
        """
        task = self.get_object()
        new_priority = request.data.get('priority')
        if new_priority not in dict(StudentTask.Priority.choices):
            return Response(
                {"success": False, "message": f"Invalid priority. Choices: {list(dict(StudentTask.Priority.choices).keys())}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.priority = new_priority
        task.save(update_fields=['priority', 'updated_at'])
        return Response({
            "success": True,
            "message": f"Priority updated to {task.get_priority_display()}.",
            "task": self.get_serializer(task).data
        })

    @action(detail=True, methods=['patch', 'post'], url_path='change-status')
    def change_status(self, request, id=None):
        """
        POST/PATCH /api/tasks/{id}/change-status/
        """
        task = self.get_object()
        new_status = request.data.get('status')
        if new_status not in dict(StudentTask.Status.choices):
            return Response(
                {"success": False, "message": f"Invalid status. Choices: {list(dict(StudentTask.Status.choices).keys())}"},
                status=status.HTTP_400_BAD_REQUEST
            )
        task.status = new_status
        task.save()
        return Response({
            "success": True,
            "message": f"Status updated to {task.get_status_display()}.",
            "task": self.get_serializer(task).data
        })


class StudentChecklistViewSet(viewsets.ModelViewSet):
    """
    Student Preparation Checklists & Semester Milestones ViewSet.
    """
    serializer_class = StudentChecklistSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    lookup_field = 'id'

    def get_queryset(self):
        user = self.request.user
        if not user or not user.is_authenticated:
            return StudentChecklist.objects.none()
        if user.is_admin:
            return StudentChecklist.objects.prefetch_related('items').all().order_by('-updated_at')
        return StudentChecklist.objects.filter(student=user).prefetch_related('items').order_by('-updated_at')

    def perform_create(self, serializer):
        serializer.save(student=self.request.user)

    @action(detail=True, methods=['post'], url_path='add-item')
    def add_item(self, request, id=None):
        checklist = self.get_object()
        title = request.data.get('title')
        item_type = request.data.get('item_type', 'ACADEMIC')
        order = request.data.get('order', checklist.items.count() + 1)

        if not title or not title.strip():
            return Response({"success": False, "message": "Item title is required."}, status=status.HTTP_400_BAD_REQUEST)

        item = StudentChecklistItem.objects.create(
            checklist=checklist,
            title=title.strip(),
            item_type=item_type,
            order=order
        )
        return Response({
            "success": True,
            "message": "Item added to checklist.",
            "item": StudentChecklistItemSerializer(item).data
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post', 'patch'], url_path='toggle-item')
    def toggle_item(self, request, id=None):
        checklist = self.get_object()
        item_id = request.data.get('item_id')
        item = checklist.items.filter(id=item_id).first()
        if not item:
            return Response({"success": False, "message": "Checklist item not found."}, status=status.HTTP_404_NOT_FOUND)

        if 'is_completed' in request.data:
            val = request.data.get('is_completed')
            item.is_completed = str(val).lower() in ('true', '1') if val is not None else False
        else:
            item.is_completed = not item.is_completed
        item.save()

        return Response({
            "success": True,
            "message": "Checklist item updated.",
            "item": StudentChecklistItemSerializer(item).data,
            "checklist_progress": checklist.progress_percentage
        })

    @action(detail=True, methods=['post', 'delete'], url_path='remove-item')
    def remove_item(self, request, id=None):
        checklist = self.get_object()
        item_id = request.data.get('item_id')
        item = checklist.items.filter(id=item_id).first()
        if not item:
            return Response({"success": False, "message": "Checklist item not found."}, status=status.HTTP_404_NOT_FOUND)

        item.delete()
        return Response({"success": True, "message": "Item removed from checklist."})

    @action(detail=False, methods=['get'], url_path='templates')
    def templates(self, request):
        templates_data = SmartPlannerService.get_semester_checklist_templates(request.user)
        return Response({
            "success": True,
            "templates": templates_data
        })

    @action(detail=False, methods=['post'], url_path='create-from-template')
    def create_from_template(self, request):
        template_id = request.data.get('template_id')
        templates_data = SmartPlannerService.get_semester_checklist_templates(request.user)
        selected_tpl = next((tpl for tpl in templates_data if tpl['id'] == template_id), None)

        if not selected_tpl:
            return Response({"success": False, "message": "Invalid template identifier."}, status=status.HTTP_400_BAD_REQUEST)

        checklist = StudentChecklist.objects.create(
            student=request.user,
            title=selected_tpl['title'],
            category=selected_tpl['category']
        )

        for item_data in selected_tpl['items']:
            StudentChecklistItem.objects.create(
                checklist=checklist,
                title=item_data['title'],
                item_type=item_data.get('item_type', 'ACADEMIC'),
                order=item_data.get('order', 1)
            )

        return Response({
            "success": True,
            "message": f"Created '{checklist.title}' from template.",
            "checklist": StudentChecklistSerializer(checklist).data
        }, status=status.HTTP_201_CREATED)


class PlannerViewSet(viewsets.ViewSet):
    """
    Central Student Planner intelligence and orchestration ViewSet.
    """
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='overview')
    def overview(self, request):
        """
        GET /api/planner/overview/
        Unified student planner summary: tasks due today, upcoming, overdue,
        smart suggestions, buy again items, and real progress metrics.
        """
        data = SmartPlannerService.get_planner_summary(request.user)
        return Response(data)

    @action(detail=False, methods=['get'], url_path='suggestions')
    def suggestions(self, request):
        """
        GET /api/planner/suggestions/?task_id=12
        Returns smart stationery and printing suggestions based on tasks.
        """
        task_id = request.query_params.get('task_id')
        try:
            task_id_int = int(task_id) if task_id else None
        except (ValueError, TypeError):
            task_id_int = None

        suggs = SmartPlannerService.get_task_shopping_suggestions(request.user, task_id=task_id_int)
        return Response({
            "success": True,
            "task_id": task_id_int,
            "count": len(suggs),
            "suggestions": suggs
        })

    @action(detail=False, methods=['get'], url_path='academic-task-suggestions')
    def academic_task_suggestions(self, request):
        """
        GET /api/planner/academic-task-suggestions/
        Surfaces suggested academic tasks derived from approaching calendar events.
        """
        suggs = SmartPlannerService.get_academic_task_suggestions(request.user)
        return Response({
            "success": True,
            "count": len(suggs),
            "suggested_tasks": suggs
        })

    @action(detail=False, methods=['post'], url_path='create-suggested-tasks')
    def create_suggested_tasks(self, request):
        """
        POST /api/planner/create-suggested-tasks/
        Creates one or more confirmed suggested tasks.
        """
        import json
        tasks_data = request.data.get('tasks')
        if not tasks_data:
            # Single task creation fallback
            tasks_data = [request.data]

        created_tasks = []
        for t_data in tasks_data:
            if isinstance(t_data, str):
                try:
                    t_data = json.loads(t_data)
                except Exception:
                    continue
            if not isinstance(t_data, dict):
                continue
            title = t_data.get('title')
            if not title:
                continue
            due_date = t_data.get('due_date')
            academic_event_id = t_data.get('academic_event_id')

            task = StudentTask.objects.create(
                student=request.user,
                title=title,
                category=t_data.get('category', 'STUDY'),
                priority=t_data.get('priority', 'MEDIUM'),
                due_date=due_date,
                academic_event_id=academic_event_id
            )
            created_tasks.append(StudentTaskSerializer(task).data)

        return Response({
            "success": True,
            "message": f"Successfully created {len(created_tasks)} task(s).",
            "created_tasks": created_tasks
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'], url_path='add-to-cart')
    def add_to_cart(self, request):
        """
        POST /api/planner/add-to-cart/
        Authoritatively validates stock, price, and shop affiliation for products
        before confirming addition to cart.
        """
        items_data = request.data.get('items', [])
        result = SmartPlannerService.validate_and_add_to_cart(request.user, items_data)
        return Response(result, status=status.HTTP_200_OK if result['success'] else status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['get'], url_path='admin-stats', permission_classes=[permissions.IsAuthenticated, IsAdmin])
    def admin_stats(self, request):
        """
        GET /api/planner/admin-stats/
        Anonymized aggregate planner statistics. Zero personal student data leaked.
        """
        stats_data = SmartPlannerService.get_admin_planner_stats()
        return Response(stats_data)

    @action(detail=False, methods=['get'], url_path='shopkeeper-insights', permission_classes=[permissions.IsAuthenticated, IsShopOwnerOrAdmin])
    def shopkeeper_insights(self, request):
        """
        GET /api/planner/shopkeeper-insights/
        Campus-level aggregate demand indicators for merchants.
        """
        insights = SmartPlannerService.get_shopkeeper_demand_insights()
        return Response(insights)

