import React, { useState, useEffect } from 'react';
import {
  User,
  Mail,
  Phone,
  Store,
  MapPin,
  Clock,
  Star,
  ShieldCheck,
  CheckCircle2,
  Edit2,
  Calendar,
  LogOut,
  Navigation,
  AlertCircle,
  Sparkles,
  Info,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import authService from '../../services/authService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';

const ShopOwnerProfile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [profileData, setProfileData] = useState(null);
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
      const data = await authService.getUserProfile();
      setProfileData(data);
      setFormData({
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        phone_number: data.phone_number || '',
      });
    } catch (err) {
      console.error('Failed to load merchant profile:', err);
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
      console.error('Failed to update profile:', err);
      alert('Unable to update profile. Please verify your input and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center' }}>
        <Spinner size="lg" message="Loading merchant profile..." />
      </div>
    );
  }

  if (error && !profileData) {
    return (
      <div style={{ padding: '2rem 1rem' }}>
        <Card style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
          <AlertCircle size={44} color="var(--danger-500)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Unable to Load Profile
          </h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            {error}
          </p>
          <Button variant="primary" onClick={loadProfile}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  const shop = profileData?.shop;
  const displayName = profileData?.full_name || profileData?.username || user?.username || 'Merchant';
  const memberDate = profileData?.created_at
    ? new Date(profileData.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Active';

  return (
    <div>
      <PageHeader
        title="Merchant Profile & Account"
        subtitle="Store operations, contact coordinates, and registered account credentials"
        actions={
          <Button
            variant="outline"
            size="sm"
            leftIcon={Edit2}
            onClick={() => setEditModalOpen(true)}
          >
            Edit Personal Info
          </Button>
        }
      />

      {saveSuccess && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <CheckCircle2 size={18} color="#059669" />
          Account credentials updated successfully.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* TOP ROW: Account Overview & Shop Overview Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1.5rem' }}>
          
          {/* 1. Account Credentials Card */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.45rem',
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>{displayName}</h3>
                  <Badge variant="primary" size="sm">Shop Owner</Badge>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                  @{profileData?.username} • Active Merchant
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.15rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', flexShrink: 0 }}>
                  <Mail size={16} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Email Address</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                    {profileData?.email || 'Not provided'}
                  </div>
                </div>
                {profileData?.email_verified && (
                  <Badge variant="success" size="xs" style={{ marginLeft: 'auto' }}>Verified</Badge>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', flexShrink: 0 }}>
                  <Phone size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Contact Phone</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {profileData?.phone_number || 'No phone added'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5', flexShrink: 0 }}>
                  <Calendar size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Member Since</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {memberDate}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 2. Registered Store Profile Card */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', gap: '0.5rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', backgroundColor: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Store Information</h3>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Campus Retail Entity</div>
                </div>
              </div>
              {shop?.is_active ? (
                <Badge variant="success">Store Active</Badge>
              ) : (
                <Badge variant="warning">Pending Activation</Badge>
              )}
            </div>

            {shop ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.15rem' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Registered Store Name</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {shop.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--primary-600)', fontWeight: 600, marginTop: '0.15rem' }}>
                    {shop.shop_type_display || shop.shop_type}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <MapPin size={16} color="var(--primary-600)" style={{ marginTop: '3px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Physical Store Address</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {shop.address || 'Address not specified'}
                    </div>
                    {shop.campus_location && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        Landmark: {shop.campus_location}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Clock size={16} color="var(--primary-600)" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Business Hours</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {shop.opening_time ? `${shop.opening_time.slice(0, 5)} - ${shop.closing_time?.slice(0, 5)}` : '08:00 - 20:00'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Star size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
                    <div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Customer Rating</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        ★ {Number(shop.rating || 5.0).toFixed(1)} / 5.0
                      </div>
                    </div>
                  </div>
                </div>

                {/* GPS Coordinates Readout & Location Manager Link */}
                <div style={{ marginTop: '0.5rem', padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>GPS Map Coordinates</div>
                    <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {shop.latitude && shop.longitude
                        ? `${Number(shop.latitude).toFixed(5)}, ${Number(shop.longitude).toFixed(5)}`
                        : 'Coordinates not yet calibrated'}
                    </div>
                  </div>
                  <Link
                    to="/shop-owner/location"
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: 'var(--primary-600)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      textDecoration: 'none',
                    }}
                  >
                    <Navigation size={14} />
                    Map Calibration
                  </Link>
                </div>
              </div>
            ) : (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No affiliated store linked to this owner account yet.
              </div>
            )}
          </Card>
        </div>

        {/* BOTTOM CARD: Operational Capabilities & Sign Out */}
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ShieldCheck size={22} />
              </div>
              <div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Authorized Merchant Privileges</h4>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Full inventory control, printing queue processing, delivery dispatch, and analytics
                </div>
              </div>
            </div>

            <Button
              variant="danger"
              size="sm"
              leftIcon={LogOut}
              onClick={async () => {
                await logout();
                navigate('/login');
              }}
            >
              Sign Out of Merchant Portal
            </Button>
          </div>
        </Card>
      </div>

      {/* EDIT PERSONAL INFO MODAL */}
      {editModalOpen && (
        <Modal
          isOpen={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          title="Edit Owner Profile"
          size="sm"
        >
          <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                First Name
              </label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                placeholder="Enter first name"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Last Name
              </label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                placeholder="Enter last name"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setEditModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ShopOwnerProfile;
