import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Filter,
  Search,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  BookOpen,
  GraduationCap,
  Layers,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  XCircle,
  TrendingUp,
  Sliders,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Printer,
  FileText,
  Building2,
  Info,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Modal from '../../components/common/Modal';
import DataTable from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import Loader from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';
import academicService from '../../services/academicService';
import categoryService from '../../services/categoryService';

const EVENT_TYPE_CHOICES = [
  { value: 'INTERNAL_EXAM', label: 'Internal Exam' },
  { value: 'FINAL_EXAM', label: 'Final Exam' },
  { value: 'ASSIGNMENT', label: 'Assignment Submission' },
  { value: 'PROJECT_SUBMISSION', label: 'Project Submission' },
  { value: 'PROJECT_PRESENTATION', label: 'Project Presentation' },
  { value: 'PRACTICAL', label: 'Practical Exam' },
  { value: 'LAB_SUBMISSION', label: 'Lab Submission' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'VIVA', label: 'Viva Voce' },
  { value: 'SEMESTER_START', label: 'Semester Start' },
  { value: 'SEMESTER_END', label: 'Semester End' },
  { value: 'COLLEGE_EVENT', label: 'College Event / Fest' },
  { value: 'HOLIDAY', label: 'Holiday / Vacation' },
  { value: 'OTHER', label: 'Other Academic Event' },
];

const IMPORTANCE_CHOICES = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const SERVICE_CHOICES = [
  { value: '', label: 'None (Stationery Product/Category)' },
  { value: 'PRINTING', label: 'Document Printing Service' },
  { value: 'BINDING', label: 'Spiral / Hard Binding Service' },
  { value: 'XEROX', label: 'Photocopy / Xerox Service' },
];

const AdminAcademicCalendar = () => {
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar', 'directory', 'impacts', 'analytics', 'audit'
  const [events, setEvents] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [categories, setCategories] = useState([]);
  const [impactRules, setImpactRules] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filters
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [selectedEventType, setSelectedEventType] = useState('');
  const [selectedImportance, setSelectedImportance] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Calendar navigation
  const [calendarDate, setCalendarDate] = useState(new Date());

  // Modals
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [impactModalOpen, setImpactModalOpen] = useState(false);
  const [selectedEventForImpact, setSelectedEventForImpact] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [eventToCancel, setEventToCancel] = useState(null);

  // Event Form State
  const [eventFormData, setEventFormData] = useState({
    title: '',
    event_type: 'INTERNAL_EXAM',
    importance: 'MEDIUM',
    start_date: '',
    end_date: '',
    description: '',
    institution: '',
    academic_year: '',
    semester_ref: '',
    course: '',
    department: '',
  });

  // Impact Form State
  const [impactFormData, setImpactFormData] = useState({
    event: '',
    event_type: 'FINAL_EXAM',
    category: '',
    service_type: '',
    impact_type: 'INCREASE',
    impact_strength: 'HIGH',
    notes: '',
  });

  // Fetch initial master data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [instRes, ayRes, semRes, catRes] = await Promise.allSettled([
        academicService.getInstitutions(),
        academicService.getAcademicYears(),
        academicService.getSemesters(),
        categoryService.getCategories(),
      ]);

      if (instRes.status === 'fulfilled') setInstitutions(instRes.value?.results || instRes.value || []);
      if (ayRes.status === 'fulfilled') setAcademicYears(ayRes.value?.results || ayRes.value || []);
      if (semRes.status === 'fulfilled') setSemesters(semRes.value?.results || semRes.value || []);
      if (catRes.status === 'fulfilled') setCategories(catRes.value?.results || catRes.value || []);

      await fetchEvents();
    } catch (err) {
      console.error('Failed to load academic master data:', err);
      setError('Unable to load academic calendar records.');
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const params = {};
      if (selectedInstitution) params.institution = selectedInstitution;
      if (selectedEventType) params.event_type = selectedEventType;
      if (selectedImportance) params.importance = selectedImportance;
      if (selectedStatus) params.status = selectedStatus;
      if (searchQuery) params.search = searchQuery;

      const res = await academicService.getEvents(params);
      setEvents(res?.results || res || []);
    } catch (err) {
      console.error('Failed to query events:', err);
    }
  };

  const fetchImpactRules = async () => {
    try {
      const res = await academicService.getImpacts();
      setImpactRules(res?.results || res || []);
    } catch (err) {
      console.error('Failed to fetch impact rules:', err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await academicService.getDemandAnalytics(60);
      if (res?.success) setAnalyticsData(res.analytics);
    } catch (err) {
      console.error('Failed to fetch analytics:', err);
    }
  };

  const fetchAudit = async () => {
    try {
      const res = await academicService.getAuditLogs();
      if (res?.success) setAuditLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [selectedInstitution, selectedEventType, selectedImportance, selectedStatus]);

  useEffect(() => {
    if (activeTab === 'impacts') fetchImpactRules();
    if (activeTab === 'analytics') fetchAnalytics();
    if (activeTab === 'audit') fetchAudit();
  }, [activeTab]);

  // Derived KPI calculations
  const stats = useMemo(() => {
    const total = events.length;
    const upcoming = events.filter((e) => e.status === 'UPCOMING').length;
    const active = events.filter((e) => e.status === 'ACTIVE').length;
    const critical = events.filter((e) => e.importance === 'CRITICAL').length;
    return { total, upcoming, active, critical };
  }, [events]);

  // Handle Event Modal Open
  const handleOpenCreateEvent = () => {
    setEditingEvent(null);
    setEventFormData({
      title: '',
      event_type: 'INTERNAL_EXAM',
      importance: 'MEDIUM',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
      description: '',
      institution: institutions[0]?.id || '',
      academic_year: academicYears[0]?.id || '',
      semester_ref: '',
      course: '',
      department: '',
    });
    setEventModalOpen(true);
  };

  const handleOpenEditEvent = (ev) => {
    setEditingEvent(ev);
    setEventFormData({
      title: ev.title,
      event_type: ev.event_type,
      importance: ev.importance,
      start_date: ev.start_date,
      end_date: ev.end_date,
      description: ev.description || '',
      institution: ev.institution || '',
      academic_year: ev.academic_year || '',
      semester_ref: ev.semester_ref || '',
      course: ev.course || '',
      department: ev.department || '',
    });
    setEventModalOpen(true);
  };

  // Submit Event Form
  const handleSaveEvent = async (e) => {
    e.preventDefault();
    if (eventFormData.start_date > eventFormData.end_date) {
      alert('End date cannot be earlier than start date.');
      return;
    }

    try {
      setActionLoading(true);
      const payload = { ...eventFormData };
      if (!payload.institution) delete payload.institution;
      if (!payload.academic_year) delete payload.academic_year;
      if (!payload.semester_ref) delete payload.semester_ref;

      if (editingEvent) {
        await academicService.updateEvent(editingEvent.id, payload);
      } else {
        await academicService.createEvent(payload);
      }
      setEventModalOpen(false);
      await fetchEvents();
    } catch (err) {
      console.error('Failed to save event:', err);
      alert('Failed to save academic event. Please verify field values.');
    } finally {
      setActionLoading(false);
    }
  };

  // Soft Cancel Event
  const handleConfirmCancel = async () => {
    if (!eventToCancel) return;
    try {
      setActionLoading(true);
      await academicService.cancelEvent(eventToCancel.id);
      setCancelModalOpen(false);
      setEventToCancel(null);
      await fetchEvents();
    } catch (err) {
      console.error('Cancel event failed:', err);
      alert('Failed to cancel academic event.');
    } finally {
      setActionLoading(false);
    }
  };

  // Save Impact Rule
  const handleSaveImpactRule = async (e) => {
    e.preventDefault();
    try {
      setActionLoading(true);
      const payload = {
        impact_type: impactFormData.impact_type,
        impact_strength: impactFormData.impact_strength,
        notes: impactFormData.notes,
      };

      if (impactFormData.event) payload.event = impactFormData.event;
      else payload.event_type = impactFormData.event_type;

      if (impactFormData.service_type) {
        payload.service_type = impactFormData.service_type;
      } else if (impactFormData.category) {
        payload.category = impactFormData.category;
      } else {
        alert('Please select either a Category or a Service type.');
        setActionLoading(false);
        return;
      }

      await academicService.createImpact(payload);
      setImpactModalOpen(false);
      await fetchImpactRules();
      await fetchEvents();
    } catch (err) {
      console.error('Save impact failed:', err);
      alert('Failed to save impact rule.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteImpactRule = async (id) => {
    if (!window.confirm('Are you sure you want to delete this impact rule?')) return;
    try {
      await academicService.deleteImpact(id);
      await fetchImpactRules();
    } catch (err) {
      console.error('Delete rule failed:', err);
    }
  };

  // Helper Badge Renderers
  const renderImportanceBadge = (importance) => {
    const map = {
      CRITICAL: { variant: 'danger', label: 'Critical' },
      HIGH: { variant: 'warning', label: 'High' },
      MEDIUM: { variant: 'primary', label: 'Medium' },
      LOW: { variant: 'secondary', label: 'Low' },
    };
    const b = map[importance] || { variant: 'secondary', label: importance };
    return <Badge variant={b.variant} size="sm">{b.label}</Badge>;
  };

  const renderStatusBadge = (status) => {
    const map = {
      ACTIVE: { variant: 'success', label: 'Active Now' },
      UPCOMING: { variant: 'primary', label: 'Upcoming' },
      COMPLETED: { variant: 'neutral', label: 'Completed' },
      CANCELLED: { variant: 'danger', label: 'Cancelled' },
    };
    const b = map[status] || { variant: 'neutral', label: status };
    return <Badge variant={b.variant} size="sm">{b.label}</Badge>;
  };

  // Month Calendar View Generator
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const daysArray = [];
    for (let i = 0; i < firstDay; i++) {
      daysArray.push(null);
    }
    for (let d = 1; d <= totalDays; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = events.filter((ev) => ev.start_date <= dateStr && ev.end_date >= dateStr);
      daysArray.push({ dayNumber: d, dateStr, dayEvents });
    }
    return daysArray;
  }, [calendarDate, events]);

  return (
    <div className="page-container" style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Academic Calendar & Event Intelligence"
        subtitle="Manage university exam schedules, student milestones, demand impact profiles & audit history"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              leftIcon={RefreshCw}
              onClick={() => {
                fetchData();
                if (activeTab === 'impacts') fetchImpactRules();
                if (activeTab === 'analytics') fetchAnalytics();
              }}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              leftIcon={Sliders}
              onClick={() => {
                setImpactFormData({
                  event: '',
                  event_type: 'FINAL_EXAM',
                  category: categories[0]?.id || '',
                  service_type: '',
                  impact_type: 'INCREASE',
                  impact_strength: 'HIGH',
                  notes: '',
                });
                setImpactModalOpen(true);
              }}
            >
              Impact Rule
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={Plus}
              onClick={handleOpenCreateEvent}
            >
              New Academic Event
            </Button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <StatCard
          title="Total Academic Events"
          value={stats.total}
          icon={CalendarIcon}
          description="Institution schedules on record"
          variant="primary"
        />
        <StatCard
          title="Upcoming Milestones"
          value={stats.upcoming}
          icon={Clock}
          description="Within upcoming calendar windows"
          variant="info"
        />
        <StatCard
          title="Active Schedules"
          value={stats.active}
          icon={CheckCircle2}
          description="Currently underway today"
          variant="success"
        />
        <StatCard
          title="Critical Surge Events"
          value={stats.critical}
          icon={AlertTriangle}
          description="High stationery & printing surge"
          variant="warning"
        />
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { key: 'calendar', label: 'Calendar View', icon: CalendarIcon },
          { key: 'directory', label: 'Events Directory', icon: BookOpen },
          { key: 'impacts', label: 'Impact Profiles', icon: Sliders },
          { key: 'analytics', label: 'Demand Analytics', icon: TrendingUp },
          { key: 'audit', label: 'Audit Trail', icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: isActive ? 'var(--primary-600)' : 'var(--text-muted)',
                borderBottom: isActive ? '2px solid var(--primary-600)' : '2px solid transparent',
                transition: 'all 0.2s ease',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      <Card style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Institution / College
            </label>
            <select
              value={selectedInstitution}
              onChange={(e) => setSelectedInstitution(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              <option value="">All Affiliated Colleges</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Event Type
            </label>
            <select
              value={selectedEventType}
              onChange={(e) => setSelectedEventType(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              <option value="">All Event Categories</option>
              {EVENT_TYPE_CHOICES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Importance Priority
            </label>
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              <option value="">All Priority Levels</option>
              {IMPORTANCE_CHOICES.map((im) => (
                <option key={im.value} value={im.value}>{im.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Timeline Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              <option value="">All Statuses</option>
              <option value="UPCOMING">Upcoming</option>
              <option value="ACTIVE">Active Now</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
              Search Title
            </label>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                placeholder="Search event title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchEvents()}
                style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
              <Button variant="secondary" size="sm" onClick={fetchEvents}>
                <Search size={14} />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content Areas */}
      {loading ? (
        <Loader message="Loading academic calendars..." />
      ) : error ? (
        <ErrorMessage message={error} onRetry={fetchData} />
      ) : activeTab === 'calendar' ? (
        /* TAB 1: CALENDAR VIEW */
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {calendarDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
              >
                <ChevronLeft size={16} /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCalendarDate(new Date())}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
              >
                Next <ChevronRight size={16} />
              </Button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', backgroundColor: 'var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} style={{ backgroundColor: '#f8fafc', padding: '0.65rem', textAlign: 'center', fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {d}
              </div>
            ))}

            {calendarDays.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} style={{ backgroundColor: '#ffffff', minHeight: '110px' }} />;
              }

              const isToday = cell.dateStr === new Date().toISOString().split('T')[0];
              return (
                <div
                  key={cell.dateStr}
                  style={{
                    backgroundColor: isToday ? '#eff6ff' : '#ffffff',
                    minHeight: '110px',
                    padding: '0.45rem',
                    display: 'flex',
                    flexDirection: 'column',
                    borderTop: isToday ? '2px solid #3b82f6' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: isToday ? 800 : 600, color: isToday ? '#1e40af' : 'var(--text-main)' }}>
                      {cell.dayNumber}
                    </span>
                    {cell.dayEvents.length > 0 && (
                      <span style={{ fontSize: '0.65rem', backgroundColor: '#e2e8f0', borderRadius: '10px', padding: '1px 5px', fontWeight: 600 }}>
                        {cell.dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', maxHeight: '90px' }}>
                    {cell.dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => handleOpenEditEvent(ev)}
                        style={{
                          fontSize: '0.68rem',
                          padding: '0.2rem 0.35rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor:
                            ev.importance === 'CRITICAL' ? '#fee2e2' :
                            ev.importance === 'HIGH' ? '#ffedd5' :
                            ev.importance === 'MEDIUM' ? '#e0e7ff' : '#f1f5f9',
                          color:
                            ev.importance === 'CRITICAL' ? '#991b1b' :
                            ev.importance === 'HIGH' ? '#9a3412' :
                            ev.importance === 'MEDIUM' ? '#3730a3' : '#334155',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          borderLeft: `2px solid ${
                            ev.importance === 'CRITICAL' ? '#ef4444' :
                            ev.importance === 'HIGH' ? '#f97316' :
                            ev.importance === 'MEDIUM' ? '#6366f1' : '#94a3b8'
                          }`,
                        }}
                        title={`${ev.title} (${ev.event_type_display}) - ${ev.start_date} to ${ev.end_date}`}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {cell.dayEvents.length > 3 && (
                      <span style={{ fontSize: '0.65rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                        +{cell.dayEvents.length - 3} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : activeTab === 'directory' ? (
        /* TAB 2: EVENTS DIRECTORY */
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Academic Events Directory ({events.length})
            </h3>
          </div>

          {events.length === 0 ? (
            <EmptyState
              icon={CalendarIcon}
              title="No Academic Events Found"
              description="No calendar events matched your current filters. Create a new event or clear filters."
              actionLabel="Add Academic Event"
              onAction={handleOpenCreateEvent}
            />
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc', textAlign: 'left' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Event Title</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Category & Type</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Institution / College</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Dates & Proximity</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Importance</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{ev.title}</div>
                        {ev.course && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            Program: {ev.course} {ev.semester_name ? `• ${ev.semester_name}` : ''}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontWeight: 600 }}>{ev.event_type_display}</span>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Class: {ev.event_category}</div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{ev.institution_name || 'All Campuses'}</div>
                        {ev.institution_code && (
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Code: {ev.institution_code}</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600 }}>{ev.start_date} → {ev.end_date}</div>
                        <span style={{ fontSize: '0.75rem', color: ev.days_until > 0 ? '#2563eb' : '#059669', fontWeight: 600 }}>
                          {ev.status === 'UPCOMING' ? `Starts in ${ev.days_until} days` :
                           ev.status === 'ACTIVE' ? `Active now (${ev.days_remaining}d left)` :
                           ev.status === 'CANCELLED' ? 'Event cancelled' : 'Past event'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {renderImportanceBadge(ev.importance)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {renderStatusBadge(ev.status)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEditEvent(ev)}
                            title="Edit Event"
                          >
                            <Edit2 size={14} />
                          </Button>
                          {ev.status !== 'CANCELLED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              style={{ color: '#ef4444' }}
                              onClick={() => {
                                setEventToCancel(ev);
                                setCancelModalOpen(true);
                              }}
                              title="Cancel Event"
                            >
                              <XCircle size={14} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : activeTab === 'impacts' ? (
        /* TAB 3: EVENT IMPACT PROFILES */
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Academic Demand Impact Configuration</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Configure anticipated stationery category surges and printing service volume shifts per event type.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              leftIcon={Plus}
              onClick={() => setImpactModalOpen(true)}
            >
              Add Impact Rule
            </Button>
          </div>

          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Event / Type</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Affected Target</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Impact Shift</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Strength</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700 }}>Notes / Rationale</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {impactRules.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No impact configuration rules configured yet. Click "Add Impact Rule" to create one.
                    </td>
                  </tr>
                ) : (
                  impactRules.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>
                        {r.event_title ? (
                          <span>{r.event_title} <small style={{ color: 'var(--text-muted)' }}>(Specific Event)</small></span>
                        ) : (
                          <span>All {r.event_type.replace('_', ' ')}</span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {r.service_type ? (
                          <Badge variant="info" size="sm" icon={Printer}>{r.service_type} Service</Badge>
                        ) : r.product_name ? (
                          <Badge variant="primary" size="sm">Product: {r.product_name}</Badge>
                        ) : (
                          <Badge variant="secondary" size="sm">Category: {r.category_name}</Badge>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontWeight: 700, color: r.impact_type === 'INCREASE' ? '#059669' : '#dc2626' }}>
                          {r.impact_type === 'INCREASE' ? '↑ Demand Increase' : '↓ Demand Decrease'}
                        </span>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <Badge
                          variant={r.impact_strength === 'HIGH' ? 'danger' : r.impact_strength === 'MEDIUM' ? 'warning' : 'secondary'}
                          size="sm"
                        >
                          {r.impact_strength}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {r.notes || '—'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          style={{ color: '#ef4444' }}
                          onClick={() => handleDeleteImpactRule(r.id)}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'analytics' ? (
        /* TAB 4: DEMAND ANALYTICS */
        <Card>
          <div style={{ marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
              Academic Demand Velocity vs Normal Periods
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Computes observed daily order velocity across historical exam windows versus non-exam periods from real completed orders.
            </p>
          </div>

          {analyticsData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#1e40af' }}>Exam Period Sales Velocity</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a8a', marginTop: '0.25rem' }}>
                  {analyticsData.exam_period_avg_daily} units/day
                </div>
                <div style={{ fontSize: '0.75rem', color: '#3b82f6', marginTop: '0.2rem' }}>
                  Based on {analyticsData.exam_days_count || 0} observed exam days
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc', border: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Normal Non-Exam Sales Velocity</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                  {analyticsData.normal_period_avg_daily} units/day
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  Average daily baseline sales
                </div>
              </div>

              <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#166534' }}>Observed Shift (% Surge)</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                  {analyticsData.observed_percentage_change > 0 ? `+${analyticsData.observed_percentage_change}%` : `${analyticsData.observed_percentage_change}%`}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.2rem' }}>
                  Observed historical relationship
                </div>
              </div>
            </div>
          )}

          <div style={{ padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.85rem', color: '#475569' }}>
              <Info size={16} /> Explainable AI & Scientific Disclaimer
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.35rem', lineHeight: 1.5 }}>
              {analyticsData?.message || 'Correlation is evaluated strictly against completed customer orders. Data represents observed empirical velocity without artificial inflation.'}
            </p>
          </div>
        </Card>
      ) : (
        /* TAB 5: AUDIT TRAIL */
        <Card>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '1rem' }}>
            Administrative Audit Log
          </h3>
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Timestamp</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Admin User</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Action</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Target Entity</th>
                  <th style={{ padding: '0.65rem 1rem', fontWeight: 700 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                      No audit log records recorded yet.
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((lg) => (
                    <tr key={lg.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(lg.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        {lg.username}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant="secondary" size="sm">{lg.action}</Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                        {lg.object_type} #{lg.object_id}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', color: 'var(--text-muted)' }}>
                        {lg.object_repr}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* CREATE / EDIT EVENT MODAL */}
      <Modal
        isOpen={eventModalOpen}
        onClose={() => setEventModalOpen(false)}
        title={editingEvent ? 'Edit Academic Event' : 'Create Academic Event'}
        maxWidth="650px"
      >
        <form onSubmit={handleSaveEvent} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Event Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. End-Semester Final Examinations"
              value={eventFormData.title}
              onChange={(e) => setEventFormData({ ...eventFormData, title: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Event Type *
              </label>
              <select
                value={eventFormData.event_type}
                onChange={(e) => setEventFormData({ ...eventFormData, event_type: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                {EVENT_TYPE_CHOICES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Importance Level *
              </label>
              <select
                value={eventFormData.importance}
                onChange={(e) => setEventFormData({ ...eventFormData, importance: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                {IMPORTANCE_CHOICES.map((im) => (
                  <option key={im.value} value={im.value}>{im.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Start Date *
              </label>
              <input
                type="date"
                required
                value={eventFormData.start_date}
                onChange={(e) => setEventFormData({ ...eventFormData, start_date: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                End Date *
              </label>
              <input
                type="date"
                required
                value={eventFormData.end_date}
                onChange={(e) => setEventFormData({ ...eventFormData, end_date: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Institution / College (Optional)
              </label>
              <select
                value={eventFormData.institution}
                onChange={(e) => setEventFormData({ ...eventFormData, institution: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                <option value="">Campus-wide (All Colleges)</option>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.code})</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Academic Year
              </label>
              <select
                value={eventFormData.academic_year}
                onChange={(e) => setEventFormData({ ...eventFormData, academic_year: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                <option value="">General Term</option>
                {academicYears.map((ay) => (
                  <option key={ay.id} value={ay.id}>{ay.name} ({ay.institution_code})</option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Course / Program Filter
              </label>
              <input
                type="text"
                placeholder="e.g. BCA, B.Tech CSE (optional)"
                value={eventFormData.course}
                onChange={(e) => setEventFormData({ ...eventFormData, course: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Department
              </label>
              <input
                type="text"
                placeholder="e.g. Computing, Mechanical (optional)"
                value={eventFormData.department}
                onChange={(e) => setEventFormData({ ...eventFormData, department: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Description & Student Instructions
            </label>
            <textarea
              rows={3}
              placeholder="Provide context regarding exam materials, report templates, or submission deadlines..."
              value={eventFormData.description}
              onChange={(e) => setEventFormData({ ...eventFormData, description: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={() => setEventModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actionLoading}>
              {editingEvent ? 'Save Changes' : 'Create Event'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* CREATE IMPACT RULE MODAL */}
      <Modal
        isOpen={impactModalOpen}
        onClose={() => setImpactModalOpen(false)}
        title="Configure Academic Event Demand Impact"
        maxWidth="550px"
      >
        <form onSubmit={handleSaveImpactRule} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Apply to Event Type *
            </label>
            <select
              value={impactFormData.event_type}
              onChange={(e) => setImpactFormData({ ...impactFormData, event_type: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              {EVENT_TYPE_CHOICES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Printing / Finish Service Target
            </label>
            <select
              value={impactFormData.service_type}
              onChange={(e) => setImpactFormData({ ...impactFormData, service_type: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            >
              {SERVICE_CHOICES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {!impactFormData.service_type && (
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Stationery Category Target
              </label>
              <select
                value={impactFormData.category}
                onChange={(e) => setImpactFormData({ ...impactFormData, category: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Impact Shift Direction *
              </label>
              <select
                value={impactFormData.impact_type}
                onChange={(e) => setImpactFormData({ ...impactFormData, impact_type: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                <option value="INCREASE">Demand Surge (Increase)</option>
                <option value="DECREASE">Demand Drop (Decrease)</option>
                <option value="NO_EFFECT">No Discernible Effect</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Impact Strength *
              </label>
              <select
                value={impactFormData.impact_strength}
                onChange={(e) => setImpactFormData({ ...impactFormData, impact_strength: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              >
                <option value="LOW">Low (+10% to +25%)</option>
                <option value="MEDIUM">Medium (+25% to +60%)</option>
                <option value="HIGH">High (+60% to +150%+)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Rationale / Notes
            </label>
            <input
              type="text"
              placeholder="e.g. Higher spiral binding and Xerox volume before semester project submissions"
              value={impactFormData.notes}
              onChange={(e) => setImpactFormData({ ...impactFormData, notes: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="outline" type="button" onClick={() => setImpactModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={actionLoading}>
              Save Impact Rule
            </Button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM CANCEL EVENT MODAL */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Academic Event"
        maxWidth="450px"
      >
        <div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
            Are you sure you want to mark <strong>{eventToCancel?.title}</strong> as <strong>CANCELLED</strong>?
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Soft cancellation retains historical scheduling data for demand audits while immediately halting student notifications and recommendation flags.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
            <Button variant="outline" onClick={() => setCancelModalOpen(false)}>
              Keep Event
            </Button>
            <Button variant="danger" onClick={handleConfirmCancel} loading={actionLoading}>
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default AdminAcademicCalendar;
