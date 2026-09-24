import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Shield,
  LogOut,
  GraduationCap,
  Building2,
  BookOpen,
  Calendar,
  Bell,
  CheckCircle2,
  Edit2,
  Save,
  X,
  Info,
  Heart,
  Store,
  Tag,
  AlertCircle,
  Sliders,
  ChevronRight,
  Trash2,
  Key,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import academicService from '../../services/academicService';
import authService from '../../services/authService';
import DeleteAccountModal from '../../components/auth/DeleteAccountModal';

const StudentProfile = () => {
  const { user, logout, setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Personal Info Edit State
  const [personalModalOpen, setPersonalModalOpen] = useState(false);
  const [personalData, setPersonalData] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
  });
  const [personalSaving, setPersonalSaving] = useState(false);
  const [personalError, setPersonalError] = useState('');

  // Change Password State
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    institution: '',
    course: '',
    department: '',
    year: 1,
    semester_number: 1,
    roll_number: '',
    notify_academic_reminders: true,
    notify_exam_reminders: true,
    notify_assignment_reminders: true,
    notify_project_reminders: true,
  });

  const fetchProfileData = async () => {
    try {
      setLoading(true);
      const [profileRes, instRes] = await Promise.allSettled([
        academicService.getStudentProfile(),
        academicService.getInstitutions(),
      ]);

      if (profileRes.status === 'fulfilled' && profileRes.value?.profile) {
        const p = profileRes.value.profile;
        setProfile(p);
        setFormData({
          institution: p.institution || '',
          course: p.course || '',
          department: p.department || '',
          year: p.year || 1,
          semester_number: p.semester_number || 1,
          roll_number: p.roll_number || '',
          notify_academic_reminders: p.notify_academic_reminders ?? true,
          notify_exam_reminders: p.notify_exam_reminders ?? true,
          notify_assignment_reminders: p.notify_assignment_reminders ?? true,
          notify_project_reminders: p.notify_project_reminders ?? true,
        });
      }

      if (instRes.status === 'fulfilled') {
        setInstitutions(instRes.value?.results || instRes.value || []);
      }
    } catch (err) {
      console.error('Failed to load student academic profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload = { ...formData };
      if (!payload.institution) payload.institution = null;
      payload.year = parseInt(payload.year, 10) || 1;
      payload.semester_number = parseInt(payload.semester_number, 10) || 1;

      const res = await academicService.updateStudentProfile(payload);
      if (res?.success) {
        setProfile(res.profile);
        setEditModalOpen(false);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to update academic profile:', err);
      alert('Failed to update academic profile.');
    } finally {
      setSaving(false);
    }
  };

  const openPersonalModal = () => {
    setPersonalData({
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      phone_number: user?.phone_number || '',
    });
    setPersonalError('');
    setPersonalModalOpen(true);
  };

  const handleSavePersonal = async (e) => {
    e.preventDefault();
    setPersonalSaving(true);
    setPersonalError('');
    try {
      const updated = await authService.updateUserProfile({
        first_name: personalData.first_name.trim(),
        last_name: personalData.last_name.trim(),
        phone_number: personalData.phone_number.trim(),
      });
      setUser((prev) => ({ ...prev, ...updated }));
      const stored = authService.getStoredUser();
      if (stored) {
        localStorage.setItem('user', JSON.stringify({ ...stored, ...updated }));
      }
      setPersonalModalOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update personal details:', err);
      setPersonalError(err.response?.data?.message || err.response?.data?.detail || 'Failed to update personal details.');
    } finally {
      setPersonalSaving(false);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    if (passwordData.new_password !== passwordData.confirm_password) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (passwordData.new_password.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError('');
    try {
      const res = await authService.changePassword({
        current_password: passwordData.current_password,
        new_password: passwordData.new_password,
        confirm_password: passwordData.confirm_password,
      });
      if (res.success) {
        setPasswordModalOpen(false);
        setPasswordData({ current_password: '', new_password: '', confirm_password: '' });
        alert('Password changed successfully.');
      }
    } catch (err) {
      console.error('Failed to change password:', err);
      setPasswordError(err.response?.data?.message || err.response?.data?.detail || 'Failed to change password. Please check your current password.');
    } finally {
      setPasswordSaving(false);
    }
  };

  const hasCollegiateProfile = Boolean(profile && profile.institution);

  return (
    <div className="page-container" style={{ maxWidth: '750px', margin: '0 auto' }}>
      <PageHeader title="Student Profile" subtitle="Account details, collegiate credentials & notifications" />

      {saveSuccess && (
        <div style={{ padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.85rem' }}>
          <CheckCircle2 size={18} color="#059669" />
          Academic profile updated successfully.
        </div>
      )}

      {/* Account Info Card */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-full)',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 800,
              }}
            >
              {(user?.first_name || user?.username || 'S').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>
                  {user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : user?.username}
                </h2>
                <Badge variant="primary" size="sm">{user?.role || 'STUDENT'}</Badge>
                <Badge variant={user?.email_verified ? 'success' : 'warning'} size="sm">
                  {user?.email_verified ? '✓ Email Verified' : 'Unverified Email'}
                </Badge>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem', margin: 0 }}>
                @{user?.username} • Active Campus Member
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              leftIcon={Edit2}
              onClick={openPersonalModal}
            >
              Edit Details
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={Key}
              onClick={() => {
                setPasswordError('');
                setPasswordModalOpen(true);
              }}
            >
              Change Password
            </Button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Mail size={18} color="var(--primary-600)" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Email Address</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user?.email}</div>
              </div>
            </div>
            <Badge variant={user?.email_verified ? 'success' : 'warning'} size="sm">
              {user?.email_verified ? '✓ Verified' : 'Unverified'}
            </Badge>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Phone size={18} color="var(--primary-600)" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Phone Number</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>{user?.phone_number || 'No phone set'}</div>
              </div>
            </div>
            <button
              onClick={openPersonalModal}
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--primary-600)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Update
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <MapPin size={18} color="var(--primary-600)" />
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Campus Delivery Address Book</div>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Manage Hostels, Blocks & Rooms</div>
              </div>
            </div>
            <a
              href="/student/addresses"
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--primary-600)',
                textDecoration: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-50)',
                border: '1px solid var(--primary-100)',
              }}
            >
              Manage
            </a>
          </div>
        </div>
      </Card>

      {/* Academic Profile Card */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb' }}>
              <GraduationCap size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Collegiate Academic Profile</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Enables campus-specific calendar events, exam reminders, and personalized stationery packs
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            leftIcon={Edit2}
            onClick={() => setEditModalOpen(true)}
          >
            {hasCollegiateProfile ? 'Edit Profile' : 'Configure Profile'}
          </Button>
        </div>

        {hasCollegiateProfile ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>College / University</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                {profile.institution_name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: 600 }}>Code: {profile.institution_code}</div>
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Program / Degree</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                {profile.course || 'Undergraduate'}
              </div>
              {profile.department && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{profile.department}</div>
              )}
            </div>

            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Current Term</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                Year {profile.year} • Semester {profile.semester_number}
              </div>
              {profile.roll_number && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Roll: {profile.roll_number}</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f8fafc', border: '1px dashed var(--border-light)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              You are currently registered as a general shopper. Configure your college details to unlock semester exam schedules and printing deadlines.
            </p>
            <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(true)}>
              Add Collegiate Profile (Optional)
            </Button>
          </div>
        )}

        {/* Notification Preferences */}
        <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Bell size={16} color="var(--primary-600)" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Academic Reminder Preferences</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
            {[
              { label: 'Exam Milestones', enabled: profile?.notify_exam_reminders ?? true },
              { label: 'Assignment Deadlines', enabled: profile?.notify_assignment_reminders ?? true },
              { label: 'Project Submissions', enabled: profile?.notify_project_reminders ?? true },
              { label: 'General Alerts', enabled: profile?.notify_academic_reminders ?? true },
            ].map((pref, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-main)' }}>
                <CheckCircle2 size={14} color={pref.enabled ? '#059669' : '#94a3b8'} />
                <span>{pref.label}</span>
                <span style={{ fontSize: '0.7rem', color: pref.enabled ? '#059669' : '#94a3b8', fontWeight: 600 }}>
                  ({pref.enabled ? 'Enabled' : 'Off'})
                </span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Engagement & Preferences Hub */}
      <Card>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 1rem', color: 'var(--text-primary)' }}>
          Campus Shopping & Engagement
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {[
            { label: 'My Saved Wishlist', path: '/student/wishlist', icon: Heart, desc: 'Track stationery stock and alternatives' },
            { label: 'Favorite Campus Shops', path: '/student/favorites', icon: Store, desc: 'Quick access to your preferred stationery stores' },
            { label: 'Student Offers & Promo Codes', path: '/student/offers', icon: Tag, desc: 'Active coupon codes and semester discounts' },
            { label: 'Support & Grievance Tickets', path: '/student/complaints', icon: AlertCircle, desc: 'Report print defects or missing order items' },
            { label: 'Notification Settings', path: '/student/notification-preferences', icon: Sliders, desc: 'Manage order, print and promotional alerts' },
          ].map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <Link
                key={idx}
                to={item.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'var(--primary-50)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)'
                  }}>
                    <IconComponent size={18} />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.desc}
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="var(--text-muted)" />
              </Link>
            );
          })}
        </div>
      </Card>

      {/* Active Session & Sign Out Card */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Active Session
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Log out of your current device session. Your account, order history, and preferences remain preserved.
            </div>
          </div>
          <Button variant="outline" onClick={logout} leftIcon={LogOut}>
            Sign Out
          </Button>
        </div>
      </Card>

      {/* Danger Zone: Account Deletion */}
      <Card style={{ border: '1px solid #fee2e2', backgroundColor: '#fffbfb', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Trash2 size={16} color="#b91c1c" />
              Danger Zone: Delete Account
            </div>
            <div style={{ fontSize: '0.8rem', color: '#7f1d1d', marginTop: '0.2rem' }}>
              Permanently delete your CampusCart account. A 6-digit verification code will be sent to your registered email to confirm deletion.
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            leftIcon={Trash2}
          >
            Delete Account
          </Button>
        </div>
      </Card>

      {/* Delete Account Modal */}
      {deleteModalOpen && (
        <DeleteAccountModal
          isOpen={deleteModalOpen}
          userEmail={user?.email}
          onSuccess={() => {
            logout();
            window.location.href = '/login';
          }}
          onClose={() => setDeleteModalOpen(false)}
        />
      )}

      {/* EDIT ACADEMIC PROFILE MODAL */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Collegiate Academic Credentials"
        maxWidth="550px"
      >
        <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Affiliated College / Institution (Optional)
            </label>
            <select
              value={formData.institution}
              onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.9rem' }}
            >
              <option value="">General User (Not affiliated with a campus)</option>
              {institutions.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name} ({inst.code})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Degree / Course
              </label>
              <input
                type="text"
                placeholder="e.g. BCA, B.Tech CSE, MBA"
                value={formData.course}
                onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Department
              </label>
              <input
                type="text"
                placeholder="e.g. Computer Science"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Year (1–4)
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Semester (1–10)
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={formData.semester_number}
                onChange={(e) => setFormData({ ...formData, semester_number: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Roll / Register No.
              </label>
              <input
                type="text"
                placeholder="Reg / ID"
                value={formData.roll_number}
                onChange={(e) => setFormData({ ...formData, roll_number: e.target.value })}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.75rem' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.5rem' }}>
              Notification Preferences
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {[
                { key: 'notify_exam_reminders', label: 'Exam and quiz announcements' },
                { key: 'notify_assignment_reminders', label: 'Assignment deadline notifications' },
                { key: 'notify_project_reminders', label: 'Project submission reminders' },
                { key: 'notify_academic_reminders', label: 'General campus academic broadcasts' },
              ].map((item) => (
                <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={formData[item.key]}
                    onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.75rem' }}>
            <Button variant="outline" type="button" onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Save Academic Profile
            </Button>
          </div>
        </form>
      </Modal>

      {/* EDIT PERSONAL PROFILE MODAL */}
      <Modal
        isOpen={personalModalOpen}
        onClose={() => setPersonalModalOpen(false)}
        title="Edit Personal Information"
        maxWidth="480px"
      >
        <form onSubmit={handleSavePersonal} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {personalError && (
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.85rem' }}>
              {personalError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                First Name
              </label>
              <input
                type="text"
                value={personalData.first_name}
                onChange={(e) => setPersonalData({ ...personalData, first_name: e.target.value })}
                placeholder="First name"
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                Last Name
              </label>
              <input
                type="text"
                value={personalData.last_name}
                onChange={(e) => setPersonalData({ ...personalData, last_name: e.target.value })}
                placeholder="Last name"
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Contact Phone Number
            </label>
            <input
              type="tel"
              value={personalData.phone_number}
              onChange={(e) => setPersonalData({ ...personalData, phone_number: e.target.value })}
              placeholder="e.g. +91 98765 43210"
              style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
              Used by courier to coordinate campus hostel deliveries and counter pickup OTPs.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button variant="outline" size="sm" type="button" onClick={() => setPersonalModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={personalSaving}>
              Save Changes
            </Button>
          </div>
        </form>
      </Modal>

      {/* CHANGE PASSWORD MODAL */}
      <Modal
        isOpen={passwordModalOpen}
        onClose={() => {
          setPasswordModalOpen(false);
          setPasswordError('');
        }}
        title="Change Account Password"
        maxWidth="460px"
      >
        <form onSubmit={handleSavePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {passwordError && (
            <div style={{ padding: '0.65rem 0.85rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#dc2626', fontSize: '0.85rem' }}>
              {passwordError}
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Current Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={passwordData.current_password}
                onChange={(e) => setPasswordData({ ...passwordData, current_password: e.target.value })}
                placeholder="Enter current password"
                required
                style={{ width: '100%', padding: '0.55rem 2.5rem 0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {showPasswords.current ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              New Password (minimum 8 characters)
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={passwordData.new_password}
                onChange={(e) => setPasswordData({ ...passwordData, new_password: e.target.value })}
                placeholder="Enter new password"
                required
                minLength={8}
                style={{ width: '100%', padding: '0.55rem 2.5rem 0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {showPasswords.new ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
              Confirm New Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={passwordData.confirm_password}
                onChange={(e) => setPasswordData({ ...passwordData, confirm_password: e.target.value })}
                placeholder="Re-enter new password"
                required
                minLength={8}
                style={{ width: '100%', padding: '0.55rem 2.5rem 0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                {showPasswords.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setPasswordModalOpen(false);
                setPasswordError('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={passwordSaving}>
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StudentProfile;
