from rest_framework import serializers
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
)
from products.serializers import ProductSummarySerializer, CategorySerializer


class InstitutionSerializer(serializers.ModelSerializer):
    events_count = serializers.IntegerField(source='events.count', read_only=True)
    academic_years_count = serializers.IntegerField(source='academic_years.count', read_only=True)

    class Meta:
        model = Institution
        fields = [
            'id',
            'name',
            'code',
            'address',
            'city',
            'state',
            'pincode',
            'contact_email',
            'contact_phone',
            'is_active',
            'events_count',
            'academic_years_count',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcademicYearSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source='institution.name', read_only=True)
    institution_code = serializers.CharField(source='institution.code', read_only=True)

    class Meta:
        model = AcademicYear
        fields = [
            'id',
            'institution',
            'institution_name',
            'institution_code',
            'name',
            'start_date',
            'end_date',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and start >= end:
            raise serializers.ValidationError({"end_date": "End date must be strictly after start date."})
        return attrs


class SemesterSerializer(serializers.ModelSerializer):
    institution_name = serializers.CharField(source='institution.name', read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', read_only=True)

    class Meta:
        model = Semester
        fields = [
            'id',
            'institution',
            'institution_name',
            'academic_year',
            'academic_year_name',
            'name',
            'number',
            'start_date',
            'end_date',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and start > end:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})
        return attrs


class AcademicEventImpactSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', default=None, read_only=True)
    product_name = serializers.CharField(source='product.name', default=None, read_only=True)
    event_title = serializers.CharField(source='event.title', default=None, read_only=True)
    impact_type_display = serializers.CharField(source='get_impact_type_display', read_only=True)
    impact_strength_display = serializers.CharField(source='get_impact_strength_display', read_only=True)

    class Meta:
        model = AcademicEventImpact
        fields = [
            'id',
            'event',
            'event_title',
            'event_type',
            'category',
            'category_name',
            'product',
            'product_name',
            'service_type',
            'impact_type',
            'impact_type_display',
            'impact_strength',
            'impact_strength_display',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class AcademicCalendarSerializer(serializers.ModelSerializer):
    event_type_display = serializers.CharField(source='get_event_type_display', read_only=True)
    importance_display = serializers.CharField(source='get_importance_display', read_only=True)
    status = serializers.CharField(read_only=True)
    days_until = serializers.IntegerField(source='days_until_event', read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    event_category = serializers.CharField(read_only=True)
    institution_name = serializers.CharField(source='institution.name', default=None, read_only=True)
    institution_code = serializers.CharField(source='institution.code', default=None, read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', default=None, read_only=True)
    semester_name = serializers.CharField(source='semester_ref.name', default=None, read_only=True)
    impacts = AcademicEventImpactSerializer(many=True, read_only=True)

    class Meta:
        model = AcademicCalendar
        fields = [
            'id',
            'institution',
            'institution_name',
            'institution_code',
            'academic_year',
            'academic_year_name',
            'semester_ref',
            'semester_name',
            'title',
            'event_type',
            'event_type_display',
            'importance',
            'importance_display',
            'status',
            'status_override',
            'days_until',
            'days_remaining',
            'event_category',
            'start_date',
            'end_date',
            'description',
            'course',
            'department',
            'is_active',
            'college',
            'semester',
            'expected_demand_multiplier',
            'impacts',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "End date cannot be earlier than start date."})
        return attrs


class StudentAcademicProfileSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source='student.username', read_only=True)
    student_email = serializers.CharField(source='student.email', read_only=True)
    institution_name = serializers.CharField(source='institution.name', default=None, read_only=True)
    institution_code = serializers.CharField(source='institution.code', default=None, read_only=True)
    academic_year_name = serializers.CharField(source='academic_year.name', default=None, read_only=True)
    semester_name = serializers.CharField(source='semester.name', default=None, read_only=True)

    class Meta:
        model = StudentAcademicProfile
        fields = [
            'id',
            'student',
            'student_username',
            'student_email',
            'institution',
            'institution_name',
            'institution_code',
            'course',
            'department',
            'year',
            'semester',
            'semester_name',
            'semester_number',
            'academic_year',
            'academic_year_name',
            'roll_number',
            'notify_academic_reminders',
            'notify_exam_reminders',
            'notify_assignment_reminders',
            'notify_project_reminders',
            'reminder_window_days',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student', 'created_at', 'updated_at']


class AcademicAuditLogSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', default='System', read_only=True)

    class Meta:
        from .models import AcademicAuditLog
        model = AcademicAuditLog
        fields = [
            'id',
            'user',
            'username',
            'action',
            'object_type',
            'object_id',
            'object_repr',
            'details',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class StudentNoteSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source='student.username', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = StudentNote
        fields = [
            'id',
            'student',
            'student_username',
            'title',
            'subject',
            'content',
            'category',
            'category_display',
            'color',
            'is_pinned',
            'is_archived',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student', 'created_at', 'updated_at']


class StudentTaskSerializer(serializers.ModelSerializer):
    student_username = serializers.CharField(source='student.username', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    days_remaining = serializers.IntegerField(read_only=True)
    hours_remaining = serializers.FloatField(read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    due_status = serializers.CharField(read_only=True)
    academic_event_title = serializers.CharField(source='academic_event.title', read_only=True, default=None)

    class Meta:
        model = StudentTask
        fields = [
            'id',
            'student',
            'student_username',
            'title',
            'description',
            'category',
            'category_display',
            'priority',
            'priority_display',
            'status',
            'status_display',
            'due_date',
            'due_time',
            'deadline',
            'completed',
            'completed_at',
            'days_remaining',
            'hours_remaining',
            'is_overdue',
            'due_status',
            'academic_event',
            'academic_event_title',
            'associated_order',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student', 'created_at', 'updated_at', 'days_remaining', 'hours_remaining', 'is_overdue', 'due_status']

    def validate(self, attrs):
        event = attrs.get('academic_event')
        student = self.context['request'].user if 'request' in self.context else getattr(self.instance, 'student', None)
        if event and event.institution_id and student:
            profile = getattr(student, 'academic_profile', None)
            if profile and profile.institution_id and profile.institution_id != event.institution_id:
                raise serializers.ValidationError({'academic_event': 'Cannot link an academic event from a different institution.'})
        return attrs


class StudentChecklistItemSerializer(serializers.ModelSerializer):
    item_type_display = serializers.CharField(source='get_item_type_display', read_only=True)

    class Meta:
        model = StudentChecklistItem
        fields = [
            'id',
            'checklist',
            'title',
            'is_completed',
            'order',
            'item_type',
            'item_type_display',
            'linked_task',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class StudentChecklistSerializer(serializers.ModelSerializer):
    items = StudentChecklistItemSerializer(many=True, read_only=True)
    total_items = serializers.IntegerField(read_only=True)
    completed_items = serializers.IntegerField(read_only=True)
    progress_percentage = serializers.FloatField(read_only=True)
    academic_event_title = serializers.CharField(source='academic_event.title', read_only=True, default=None)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = StudentChecklist
        fields = [
            'id',
            'student',
            'title',
            'category',
            'category_display',
            'is_template',
            'academic_event',
            'academic_event_title',
            'total_items',
            'completed_items',
            'progress_percentage',
            'items',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'student', 'total_items', 'completed_items', 'progress_percentage', 'created_at', 'updated_at']

