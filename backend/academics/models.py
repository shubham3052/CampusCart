from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import date


class Institution(models.Model):
    """
    University, College, or Academic Institution affiliated with campus shops.
    """
    name = models.CharField(max_length=200, help_text="Institution / College Name")
    code = models.CharField(max_length=50, unique=True, db_index=True, help_text="Short institutional code (e.g. SXEC-01)")
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    state = models.CharField(max_length=100, blank=True)
    pincode = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=25, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def active(self):
        return self.is_active

    @active.setter
    def active(self, value):
        self.is_active = bool(value)

    class Meta:
        db_table = 'institutions'
        verbose_name = 'Institution'
        verbose_name_plural = 'Institutions'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.code})"


class AcademicYear(models.Model):
    """
    Academic cycle year (e.g. 2026-2027) for an institution.
    """
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name='academic_years',
        db_index=True
    )
    name = models.CharField(max_length=50, help_text="e.g. 2026–2027")
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def active(self):
        return self.is_active

    @active.setter
    def active(self, value):
        self.is_active = bool(value)

    class Meta:
        db_table = 'academic_years'
        verbose_name = 'Academic Year'
        verbose_name_plural = 'Academic Years'
        unique_together = ('institution', 'name')
        ordering = ['-start_date']

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_date and self.end_date and self.start_date >= self.end_date:
            raise ValidationError({'end_date': 'End date must be strictly after start date.'})
        if self.is_active and self.institution_id and self.start_date and self.end_date:
            overlapping = AcademicYear.objects.filter(
                institution_id=self.institution_id,
                is_active=True,
                start_date__lt=self.end_date,
                end_date__gt=self.start_date
            )
            if self.pk:
                overlapping = overlapping.exclude(pk=self.pk)
            if overlapping.exists():
                raise ValidationError({'start_date': 'An active academic year already overlaps with this date range for this institution.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} - {self.institution.code}"


class Semester(models.Model):
    """
    Distinct term/semester within an academic year for an institution.
    """
    institution = models.ForeignKey(
        Institution,
        on_delete=models.CASCADE,
        related_name='semesters',
        db_index=True
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.CASCADE,
        related_name='semesters',
        db_index=True
    )
    name = models.CharField(max_length=100, help_text="e.g. Semester 5 / Odd Semester")
    number = models.PositiveSmallIntegerField(default=1, help_text="Numeric semester identifier (1 to 10)")
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def active(self):
        return self.is_active

    @active.setter
    def active(self, value):
        self.is_active = bool(value)

    class Meta:
        db_table = 'semesters'
        verbose_name = 'Semester'
        verbose_name_plural = 'Semesters'
        unique_together = ('academic_year', 'number')
        ordering = ['academic_year', 'number']

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.institution_id and self.academic_year_id and self.academic_year.institution_id != self.institution_id:
            raise ValidationError({'academic_year': 'Academic year does not belong to the selected institution.'})

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.name} ({self.academic_year.name}) - {self.institution.code}"


class AcademicCalendar(models.Model):
    """
    University academic cycles, examination schedules, assignment deadlines, and student milestones.
    Acts as the core AcademicEvent model with explainable status and proximity metrics.
    """
    class EventType(models.TextChoices):
        SEMESTER_START = 'SEMESTER_START', 'Semester Start'
        SEMESTER_END = 'SEMESTER_END', 'Semester End'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment Submission'
        INTERNAL_EXAM = 'INTERNAL_EXAM', 'Internal Exam'
        FINAL_EXAM = 'FINAL_EXAM', 'Final Exam'
        PRACTICAL = 'PRACTICAL', 'Practical Exam'
        PROJECT_SUBMISSION = 'PROJECT_SUBMISSION', 'Project Submission'
        PROJECT_PRESENTATION = 'PROJECT_PRESENTATION', 'Project Presentation'
        LAB_SUBMISSION = 'LAB_SUBMISSION', 'Lab Submission'
        QUIZ = 'QUIZ', 'Quiz'
        VIVA = 'VIVA', 'Viva Voce'
        COLLEGE_EVENT = 'COLLEGE_EVENT', 'College Event / Fest'
        HOLIDAY = 'HOLIDAY', 'Holiday / Vacation'
        OTHER = 'OTHER', 'Other Academic Event'

    class Importance(models.TextChoices):
        LOW = 'LOW', 'Low Importance'
        MEDIUM = 'MEDIUM', 'Medium Importance'
        HIGH = 'HIGH', 'High Importance'
        CRITICAL = 'CRITICAL', 'Critical Importance'

    class StatusOverride(models.TextChoices):
        AUTO = 'AUTO', 'Automatic Status from Dates'
        CANCELLED = 'CANCELLED', 'Cancelled by Administration'

    # Multi-Institution & Hierarchy
    institution = models.ForeignKey(
        Institution,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
        db_index=True
    )
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
        db_index=True
    )
    semester_ref = models.ForeignKey(
        Semester,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='events',
        db_index=True
    )

    # Core Event Details
    title = models.CharField(max_length=150, help_text="Event title")
    event_type = models.CharField(
        max_length=30,
        choices=EventType.choices,
        default=EventType.INTERNAL_EXAM,
        db_index=True
    )
    importance = models.CharField(
        max_length=15,
        choices=Importance.choices,
        default=Importance.MEDIUM,
        db_index=True
    )
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    description = models.TextField(blank=True)
    course = models.CharField(max_length=100, blank=True, help_text="Specific course/program filter (e.g. BCA, B.Tech CSE)")
    department = models.CharField(max_length=100, blank=True)

    # Status Control & Metadata
    status_override = models.CharField(
        max_length=20,
        choices=StatusOverride.choices,
        default=StatusOverride.AUTO,
        db_index=True
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='created_academic_events'
    )

    # Backward compatibility fields
    college = models.CharField(max_length=150, default="Campus University")
    semester = models.CharField(max_length=50, blank=True, help_text="e.g. Fall 2026 / Semester 5")
    expected_demand_multiplier = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=1.50
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academic_calendar'
        verbose_name = 'Academic Event'
        verbose_name_plural = 'Academic Events'
        ordering = ['start_date']
        indexes = [
            models.Index(fields=['institution', 'start_date']),
            models.Index(fields=['event_type', 'start_date']),
            models.Index(fields=['importance', 'start_date']),
        ]

    @property
    def active(self):
        return self.is_active

    @active.setter
    def active(self, value):
        self.is_active = bool(value)

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({'end_date': 'End date cannot be earlier than start date.'})
        if self.institution_id and self.academic_year_id and self.academic_year.institution_id != self.institution_id:
            raise ValidationError({'academic_year': 'Academic year does not belong to the selected institution.'})
        if self.institution_id and self.semester_ref_id and self.semester_ref.institution_id != self.institution_id:
            raise ValidationError({'semester_ref': 'Semester does not belong to the selected institution.'})

    def save(self, *args, **kwargs):
        self.clean()
        if self.institution and not self.college:
            self.college = self.institution.name
        if self.semester_ref and not self.semester:
            self.semester = self.semester_ref.name
        super().save(*args, **kwargs)

    @property
    def status(self):
        """Derives current status explainably based on system date or cancellation override."""
        if not self.is_active or self.status_override == self.StatusOverride.CANCELLED:
            return 'CANCELLED'
        today = timezone.now().date()
        if today < self.start_date:
            return 'UPCOMING'
        elif self.start_date <= today <= self.end_date:
            return 'ACTIVE'
        else:
            return 'COMPLETED'

    @property
    def days_until_event(self):
        """Days remaining until event commences. Returns 0 if already active, negative if completed."""
        today = timezone.now().date()
        diff = (self.start_date - today).days
        return max(0, diff) if today < self.start_date else 0

    @property
    def days_remaining(self):
        """For active events, days remaining until conclusion."""
        today = timezone.now().date()
        if today > self.end_date:
            return 0
        return max(0, (self.end_date - today).days)

    @property
    def event_category(self):
        """High-level semantic categorization for downstream recommendation engine."""
        if self.event_type in [
            self.EventType.INTERNAL_EXAM,
            self.EventType.FINAL_EXAM,
            self.EventType.PRACTICAL,
            self.EventType.ASSIGNMENT,
            self.EventType.PROJECT_SUBMISSION,
            self.EventType.PROJECT_PRESENTATION,
            self.EventType.LAB_SUBMISSION,
            self.EventType.QUIZ,
            self.EventType.VIVA
        ]:
            return 'ACADEMIC'
        elif self.event_type in [self.EventType.SEMESTER_START, self.EventType.SEMESTER_END]:
            return 'SEMESTER'
        else:
            return 'CAMPUS'

    def __str__(self):
        inst_str = f" - {self.institution.code}" if self.institution else ""
        return f"{self.title} ({self.get_event_type_display()}) [{self.start_date} to {self.end_date}]{inst_str}"


# Alias for explicit naming in Step 19
AcademicEvent = AcademicCalendar


class AcademicEventImpact(models.Model):
    """
    Configurable mapping defining anticipated stationery and printing demand shifts
    driven by academic calendar milestones.
    """
    class ImpactType(models.TextChoices):
        INCREASE = 'INCREASE', 'Demand Increase'
        DECREASE = 'DECREASE', 'Demand Decrease'
        NO_EFFECT = 'NO_EFFECT', 'No Discernible Effect'

    class ImpactStrength(models.TextChoices):
        LOW = 'LOW', 'Low Impact (+10% to +25%)'
        MEDIUM = 'MEDIUM', 'Medium Impact (+25% to +60%)'
        HIGH = 'HIGH', 'High Impact (+60% to +150%+)'

    class ServiceType(models.TextChoices):
        PRINTING = 'PRINTING', 'Document Printing Service'
        BINDING = 'BINDING', 'Spiral / Hard Binding Service'
        XEROX = 'XEROX', 'Photocopy / Xerox Service'

    event = models.ForeignKey(
        AcademicCalendar,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='impacts',
        help_text="Impact rule tied to a specific unique calendar event"
    )
    event_type = models.CharField(
        max_length=30,
        choices=AcademicCalendar.EventType.choices,
        blank=True,
        help_text="Generic event type pattern if not bound to a specific event"
    )
    category = models.ForeignKey(
        'products.Category',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='academic_impacts',
        help_text="Category-level impact (e.g. Pens, Notebooks, Project Files)"
    )
    product = models.ForeignKey(
        'products.Product',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='academic_impacts',
        help_text="Specific product override (takes precedence over category impact)"
    )
    service_type = models.CharField(
        max_length=30,
        choices=ServiceType.choices,
        blank=True,
        help_text="Printing or finishing service affected"
    )
    impact_type = models.CharField(
        max_length=20,
        choices=ImpactType.choices,
        default=ImpactType.INCREASE
    )
    impact_strength = models.CharField(
        max_length=20,
        choices=ImpactStrength.choices,
        default=ImpactStrength.HIGH
    )
    notes = models.CharField(max_length=255, blank=True, help_text="Rationale for viva/audit")
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'academic_event_impacts'
        verbose_name = 'Academic Event Impact'
        verbose_name_plural = 'Academic Event Impacts'

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.event_id and not self.event_type:
            raise ValidationError('Either a specific event or generic event_type must be specified.')
        if not self.category_id and not self.product_id and not self.service_type:
            raise ValidationError('At least one target (Category, Product, or Service) must be specified.')

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)

    def __str__(self):
        target = self.product.name if self.product else (self.category.name if self.category else self.service_type)
        ref = self.event.title if self.event else self.get_event_type_display()
        return f"{ref} -> {target} [{self.get_impact_type_display()} - {self.get_impact_strength_display()}]"


class StudentAcademicProfile(models.Model):
    """
    Student collegiate credentials enabling hyper-relevant event surfacing and future recommendations.
    Optional for general users to ensure non-students can continue shopping seamlessly.
    """
    student = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='academic_profile',
        db_index=True
    )
    institution = models.ForeignKey(
        Institution,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_profiles',
        db_index=True
    )
    course = models.CharField(max_length=100, blank=True, help_text="e.g. BCA, B.Tech Computer Science, BBA")
    department = models.CharField(max_length=100, blank=True, help_text="e.g. School of Computing")
    year = models.PositiveSmallIntegerField(default=1, help_text="Current study year (1, 2, 3, 4)")
    semester = models.ForeignKey(
        Semester,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_profiles'
    )
    semester_number = models.PositiveSmallIntegerField(default=1, help_text="Current numeric semester (1 to 10)")
    academic_year = models.ForeignKey(
        AcademicYear,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_profiles'
    )
    roll_number = models.CharField(max_length=50, blank=True, help_text="Student University Register Number")
    notify_academic_reminders = models.BooleanField(default=True, help_text="Receive general academic deadline notifications")
    notify_exam_reminders = models.BooleanField(default=True, help_text="Receive internal and final examination alerts")
    notify_assignment_reminders = models.BooleanField(default=True, help_text="Receive assignment submission alerts")
    notify_project_reminders = models.BooleanField(default=True, help_text="Receive project submission alerts")
    reminder_window_days = models.CharField(max_length=50, default="7,3,1", help_text="Comma-separated reminder day intervals before event")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_academic_profiles'
        verbose_name = 'Student Academic Profile'
        verbose_name_plural = 'Student Academic Profiles'

    def __str__(self):
        inst_name = self.institution.code if self.institution else "General"
        return f"{self.student.username} ({self.course or 'Student'} - Sem {self.semester_number}) [{inst_name}]"


class StudentNote(models.Model):
    """
    Personal study notes, subject memos, and reminders for students.
    Strictly private to the student.
    """
    class Category(models.TextChoices):
        GENERAL = 'GENERAL', 'General'
        STUDY = 'STUDY', 'Study'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment'
        PROJECT = 'PROJECT', 'Project'
        EXAM = 'EXAM', 'Exam'
        SHOPPING = 'SHOPPING', 'Shopping'
        PERSONAL = 'PERSONAL', 'Personal'
        OTHER = 'OTHER', 'Other'

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notes',
        db_index=True
    )
    title = models.CharField(max_length=200)
    subject = models.CharField(max_length=100, blank=True)
    content = models.TextField()
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.GENERAL,
        db_index=True
    )
    color = models.CharField(max_length=20, default='#ffffff', blank=True)
    is_pinned = models.BooleanField(default=False, db_index=True)
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_notes'
        verbose_name = 'Student Note'
        verbose_name_plural = 'Student Notes'
        ordering = ['-is_pinned', '-updated_at']
        indexes = [
            models.Index(fields=['student', 'is_pinned', 'updated_at']),
            models.Index(fields=['student', 'is_archived', 'category']),
        ]

    def __str__(self):
        return f"{self.title} ({self.student.username})"


class StudentTask(models.Model):
    """
    Academic tasks, print job reminders, and study milestones.
    Integrates with academic calendar, smart shopping suggestions, and authoritative deadlines.
    """
    class Priority(models.TextChoices):
        LOW = 'LOW', 'Low'
        MEDIUM = 'MEDIUM', 'Medium'
        HIGH = 'HIGH', 'High'
        URGENT = 'URGENT', 'Urgent'

    class Status(models.TextChoices):
        TODO = 'TODO', 'To Do'
        IN_PROGRESS = 'IN_PROGRESS', 'In Progress'
        COMPLETED = 'COMPLETED', 'Completed'
        CANCELLED = 'CANCELLED', 'Cancelled'

    class Category(models.TextChoices):
        STUDY = 'STUDY', 'Study'
        ASSIGNMENT = 'ASSIGNMENT', 'Assignment'
        PROJECT = 'PROJECT', 'Project'
        EXAM = 'EXAM', 'Exam'
        PRACTICAL = 'PRACTICAL', 'Practical'
        LAB = 'LAB', 'Lab'
        SHOPPING = 'SHOPPING', 'Shopping'
        PERSONAL = 'PERSONAL', 'Personal'
        OTHER = 'OTHER', 'Other'

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='tasks',
        db_index=True
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.STUDY,
        db_index=True
    )
    priority = models.CharField(
        max_length=15,
        choices=Priority.choices,
        default=Priority.MEDIUM,
        db_index=True
    )
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.TODO,
        db_index=True
    )
    due_date = models.DateField(null=True, blank=True, db_index=True)
    due_time = models.TimeField(null=True, blank=True)
    deadline = models.DateTimeField(null=True, blank=True)
    completed = models.BooleanField(default=False, db_index=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    academic_event = models.ForeignKey(
        AcademicCalendar,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='student_tasks',
        db_index=True
    )
    associated_order = models.ForeignKey(
        'orders.Order',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_tasks'
        verbose_name = 'Student Task'
        verbose_name_plural = 'Student Tasks'
        ordering = ['completed', 'due_date', 'deadline', 'priority']
        indexes = [
            models.Index(fields=['student', 'status', 'due_date']),
            models.Index(fields=['student', 'priority', 'status']),
            models.Index(fields=['academic_event', 'status']),
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        if not self.title or not self.title.strip():
            raise ValidationError({'title': 'Task title is required.'})
        if len(self.title.strip()) > 200:
            raise ValidationError({'title': 'Task title cannot exceed 200 characters.'})

        # Academic event validation: ensure event is accessible to student context
        if self.academic_event and self.academic_event.institution_id and self.student_id:
            profile = getattr(self.student, 'academic_profile', None)
            if profile and profile.institution_id and profile.institution_id != self.academic_event.institution_id:
                raise ValidationError({'academic_event': 'Cannot link an academic event from a different institution.'})

    def save(self, *args, **kwargs):
        from datetime import datetime, time, date
        self.clean()

        # Parse string due_date if passed as ISO string
        if isinstance(self.due_date, str) and self.due_date:
            try:
                self.due_date = date.fromisoformat(self.due_date)
            except ValueError:
                pass

        if isinstance(self.due_time, str) and self.due_time:
            try:
                self.due_time = time.fromisoformat(self.due_time)
            except ValueError:
                pass

        # Synchronize due_date, due_time and deadline
        if self.due_date and not self.deadline:
            t = self.due_time or time(23, 59, 59)
            dt = datetime.combine(self.due_date, t)
            self.deadline = timezone.make_aware(dt) if timezone.is_naive(dt) else dt
        elif self.deadline and not self.due_date:
            local_dt = timezone.localtime(self.deadline) if timezone.is_aware(self.deadline) else self.deadline
            self.due_date = local_dt.date()
            if not self.due_time:
                self.due_time = local_dt.time()

        # Synchronize status, completed flag and completed_at
        if self.status == self.Status.COMPLETED or self.completed:
            self.completed = True
            self.status = self.Status.COMPLETED
            if not self.completed_at:
                self.completed_at = timezone.now()
        else:
            self.completed = False
            if self.status == self.Status.COMPLETED:
                self.status = self.Status.TODO
            self.completed_at = None

        super().save(*args, **kwargs)

    @property
    def target_date(self):
        if self.due_date:
            return self.due_date
        if self.deadline:
            return timezone.localtime(self.deadline).date() if timezone.is_aware(self.deadline) else self.deadline.date()
        return None

    @property
    def days_remaining(self):
        """Authoritative days remaining calculation. Negative if overdue."""
        t_date = self.target_date
        if not t_date:
            return None
        today = timezone.now().date()
        return (t_date - today).days

    @property
    def hours_remaining(self):
        """Authoritative hours remaining if a specific deadline time exists."""
        if not self.deadline:
            days = self.days_remaining
            return days * 24 if days is not None else None
        now = timezone.now()
        diff = (self.deadline - now).total_seconds()
        return round(diff / 3600, 1)

    @property
    def is_overdue(self):
        """Authoritative overdue status evaluated server-side."""
        if self.status in [self.Status.COMPLETED, self.Status.CANCELLED]:
            return False
        days = self.days_remaining
        return days is not None and days < 0

    @property
    def due_status(self):
        """Authoritative categorical status for badges and notifications."""
        if self.status == self.Status.COMPLETED:
            return 'COMPLETED'
        if self.status == self.Status.CANCELLED:
            return 'CANCELLED'
        days = self.days_remaining
        if days is None:
            return 'NO_DEADLINE'
        if days < 0:
            return 'OVERDUE'
        if days == 0:
            return 'DUE_TODAY'
        if days == 1:
            return 'DUE_TOMORROW'
        return 'UPCOMING'

    def __str__(self):
        return f"{self.title} [{self.get_status_display()} - {self.get_priority_display()}]"


class StudentChecklist(models.Model):
    """
    Structured academic preparation and project milestone checklists.
    Supports predefined semester templates as well as student custom checklists.
    """
    class Category(models.TextChoices):
        SEMESTER = 'SEMESTER', 'Semester Preparation'
        PROJECT = 'PROJECT', 'Project Checklist'
        EXAM = 'EXAM', 'Exam Preparation'
        SHOPPING = 'SHOPPING', 'Shopping & Supplies'
        GENERAL = 'GENERAL', 'General Checklist'

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='checklists',
        db_index=True
    )
    title = models.CharField(max_length=200)
    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.GENERAL,
        db_index=True
    )
    is_template = models.BooleanField(default=False)
    academic_event = models.ForeignKey(
        AcademicCalendar,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checklists'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_checklists'
        verbose_name = 'Student Checklist'
        verbose_name_plural = 'Student Checklists'
        ordering = ['-updated_at']

    @property
    def total_items(self):
        return self.items.count()

    @property
    def completed_items(self):
        return self.items.filter(is_completed=True).count()

    @property
    def progress_percentage(self):
        total = self.total_items
        if total == 0:
            return 0
        return round((self.completed_items / total) * 100, 1)

    def __str__(self):
        return f"{self.title} ({self.completed_items}/{self.total_items})"


class StudentChecklistItem(models.Model):
    """
    Checkable item belonging to a StudentChecklist.
    """
    class ItemType(models.TextChoices):
        ACADEMIC = 'ACADEMIC', 'Academic Task'
        SHOPPING = 'SHOPPING', 'Stationery Shopping'
        PRINTING = 'PRINTING', 'Document Printing'

    checklist = models.ForeignKey(
        StudentChecklist,
        on_delete=models.CASCADE,
        related_name='items'
    )
    title = models.CharField(max_length=255)
    is_completed = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)
    item_type = models.CharField(
        max_length=20,
        choices=ItemType.choices,
        default=ItemType.ACADEMIC
    )
    linked_task = models.ForeignKey(
        StudentTask,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='checklist_items'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'student_checklist_items'
        ordering = ['order', 'created_at']

    def __str__(self):
        status = '✓' if self.is_completed else '□'
        return f"[{status}] {self.title}"



class AcademicAuditLog(models.Model):
    """
    Immutable audit trail recording administrative actions on academic events and impact rules.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='academic_audit_logs'
    )
    action = models.CharField(max_length=50, db_index=True)
    object_type = models.CharField(max_length=50)
    object_id = models.CharField(max_length=50)
    object_repr = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'academic_audit_logs'
        verbose_name = 'Academic Audit Log'
        verbose_name_plural = 'Academic Audit Logs'
        ordering = ['-created_at']

    def __str__(self):
        user_str = self.user.username if self.user else 'System'
        return f"[{self.created_at.strftime('%Y-%m-%d %H:%M')}] {user_str} {self.action} on {self.object_type} #{self.object_id}"


def log_academic_action(user, action, instance, details=None):
    """
    Utility helper to reliably record audit entries for academic calendar operations.
    """
    try:
        AcademicAuditLog.objects.create(
            user=user if getattr(user, 'is_authenticated', False) else None,
            action=action,
            object_type=instance.__class__.__name__,
            object_id=str(getattr(instance, 'id', getattr(instance, 'pk', ''))),
            object_repr=str(instance)[:250],
            details=details or {}
        )
    except Exception:
        # Audit logging failure must not crash business transaction
        pass

