import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  Truck,
  ShieldCheck,
  CheckCircle2,
  Edit2,
  Calendar,
  LogOut,
  AlertCircle,
  Activity,
  Package,
  Clock,
  Power,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';
import orderService from '../../services/orderService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';

export default function DeliveryAgentProfile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState(null);
  const [deliveriesStats, setDeliveriesStats] = useState({ total: 0, completed: 0, active: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Edit Modal State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
  });

  const loadProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const [userProfile, deliveriesRes] = await Promise.all([
        authService.getUserProfile(),
        orderService.getDeliveries().catch(() => []),
      ]);

      setProfileData(userProfile);
      setFormData({
        first_name: userProfile.first_name || '',
        last_name: userProfile.last_name || '',
        phone_number: userProfile.phone_number || '',
      });

      const list = deliveriesRes.results || deliveriesRes || [];
      const completed = list.filter((d) => d.delivery_status === 'DELIVERED').length;
      const active = list.filter((d) => ['ASSIGNED', 'ARRIVED_AT_SHOP', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(d.delivery_status)).length;
      setDeliveriesStats({
        total: list.length,
        completed,
        active,
      });
    } catch (err) {
      console.error('Failed to load courier profile:', err);
      setError('Failed to load profile details. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updated = await authService.updateUserProfile(formData);
      setProfileData((prev) => ({ ...prev, ...updated }));
      setEditModalOpen(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to update courier profile:', err);
      alert('Unable to update profile. Please verify your input and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center' }}>
        <Spinner size="lg" message="Loading courier profile..." />
      </div>
    );
  }

  if (error && !profileData) {
    return (
      <div style={{ padding: '2rem 1rem', maxWidth: '600px', margin: '0 auto' }}>
        <Card style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <AlertCircle size={44} color="var(--danger-500)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Unable to Load Profile
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>{error}</p>
          <Button variant="primary" onClick={loadProfile}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const p = profileData || user || {};

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
      <PageHeader
        title="Delivery Partner Profile"
        subtitle="Manage your courier credentials, shift status, and campus logistics account"
      />

      {saveSuccess && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-md)',
            color: '#065f46',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} />
          Profile updated successfully!
        </div>
      )}

      {/* Main Profile Header Card */}
      <Card style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: '#eff6ff',
                border: '2px solid var(--primary-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-600)',
                flexShrink: 0,
              }}
            >
              <Truck size={32} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username}
                </h2>
                <Badge variant="primary">Campus Courier</Badge>
                {p.email_verified && <Badge variant="success">Verified Courier</Badge>}
              </div>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                {p.email} &bull; Campus Delivery Fleet
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Button variant="outline" size="sm" onClick={() => setEditModalOpen(true)} icon={Edit2}>
              Edit Profile
            </Button>
            <Button variant="danger" size="sm" onClick={handleLogout} icon={LogOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--primary-600)', marginBottom: '0.5rem' }}>
            <Package size={20} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Assigned</span>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {deliveriesStats.total}
          </p>
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#059669', marginBottom: '0.5rem' }}>
            <CheckCircle2 size={20} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Completed Drop-offs</span>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {deliveriesStats.completed}
          </p>
        </Card>

        <Card style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#2563eb', marginBottom: '0.5rem' }}>
            <Activity size={20} />
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Active Deliveries</span>
          </div>
          <p style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            {deliveriesStats.active}
          </p>
        </Card>
      </div>

      {/* Courier Details Card */}
      <Card style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--text-primary)' }}>
          Courier Identification & Contact
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.25rem' }}>
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Full Name
            </span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>
              {p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Not set'}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Email Address
            </span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>
              {p.email}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Phone Number
            </span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>
              {p.phone_number || p.phone || 'No phone registered'}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Account Role
            </span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>
              DELIVERY_AGENT
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Account Created
            </span>
            <p style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0.2rem 0 0', color: 'var(--text-primary)' }}>
              {p.created_at ? new Date(p.created_at).toLocaleDateString() : 'Active Member'}
            </p>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Dispatch Status
            </span>
            <div style={{ marginTop: '0.2rem' }}>
              <Badge variant="success">Authorized Courier</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Edit Profile Modal */}
      {editModalOpen && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="Edit Courier Profile"
        >
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                First Name
              </label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Last Name
              </label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button type="button" variant="outline" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={saving}>
                Save Changes
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
