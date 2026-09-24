import React, { useState, useEffect } from 'react';
import { Bell, Lock, CheckCircle2, ShieldCheck } from 'lucide-react';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const StudentNotificationPreferences = () => {
  const [prefs, setPrefs] = useState({
    order_updates: true,
    delivery_updates: true,
    printing_updates: true,
    pickup_reminders: true,
    stock_alerts: true,
    offers_promotions: true,
    wishlist_alerts: true,
    academic_reminders: true,
    recommendations: true,
    complaint_updates: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const fetchPrefs = async () => {
    setLoading(true);
    try {
      const data = await engagementService.getNotificationPreferences();
      if (data) setPrefs(data);
    } catch (err) {
      console.error('Failed to load notification preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrefs();
  }, []);

  const handleToggle = (key) => {
    // Critical order and delivery alerts cannot be disabled
    if (key === 'order_updates' || key === 'delivery_updates') return;
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await engagementService.updateNotificationPreferences(prefs);
      setSavedMsg('Preferences updated successfully!');
      setTimeout(() => setSavedMsg(''), 3000);
    } catch (err) {
      alert('Failed to update preferences.');
    } finally {
      setSaving(false);
    }
  };

  const preferenceCategories = [
    {
      key: 'order_updates',
      title: 'Order Status Updates',
      desc: 'Notifications when your stationery order is confirmed, ready, or completed.',
      critical: true,
    },
    {
      key: 'delivery_updates',
      title: 'Hostel & Campus Delivery',
      desc: 'Real-time updates when a delivery agent is assigned and out for delivery.',
      critical: true,
    },
    {
      key: 'printing_updates',
      title: 'Printing & Xerox Ready',
      desc: 'Alerts when your uploaded PDFs, assignments, and thesis prints finish processing.',
      critical: false,
    },
    {
      key: 'pickup_reminders',
      title: 'Store Counter Pickup Reminders',
      desc: 'Reminders with your 6-digit pickup OTP when visiting store counters.',
      critical: false,
    },
    {
      key: 'stock_alerts',
      title: 'Product Stock & Restock Notices',
      desc: 'Alerts when previously unavailable items arrive in store inventory.',
      critical: false,
    },
    {
      key: 'wishlist_alerts',
      title: 'Wishlist Restock & Price Alerts',
      desc: 'Notices when items in your personal wishlist are back in stock or discounted.',
      critical: false,
    },
    {
      key: 'offers_promotions',
      title: 'Discounts & Promotional Offers',
      desc: 'Campus merchant promo codes, semester kickoff sales, and flash discounts.',
      critical: false,
    },
    {
      key: 'academic_reminders',
      title: 'Academic Exam & Task Deadlines',
      desc: 'Stationery preparation reminders aligned with university exam and project cycles.',
      critical: false,
    },
    {
      key: 'recommendations',
      title: 'Personalized AI Recommendations',
      desc: 'Smart recommendations for textbooks, lab manuals, and architecture instruments.',
      critical: false,
    },
    {
      key: 'complaint_updates',
      title: 'Support Ticket Resolutions',
      desc: 'Official updates when administrators or shop owners respond to grievances.',
      critical: false,
    },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Bell size={28} color="var(--primary-600, #4F46E5)" />
          Notification Preferences
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
          Customize what alerts you receive across academic, shop, and delivery channels
        </p>
      </div>

      {savedMsg && (
        <div style={{ padding: '0.75rem 1.25rem', background: '#ECFDF5', color: '#047857', borderRadius: '10px', marginBottom: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} /> {savedMsg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {preferenceCategories.map((item) => {
              const isEnabled = Boolean(prefs[item.key]);
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingBottom: '1.25rem',
                    borderBottom: '1px solid #F3F4F6',
                  }}
                >
                  <div style={{ flex: 1, paddingRight: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.98rem', color: '#1F2937' }}>{item.title}</span>
                      {item.critical && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', background: '#F1F5F9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          <Lock size={11} /> Mandatory
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6B7280' }}>{item.desc}</p>
                  </div>

                  <div>
                    {item.critical ? (
                      <div style={{ padding: '6px 12px', background: '#E2E8F0', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>
                        Always On
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggle(item.key)}
                        style={{
                          width: '46px',
                          height: '24px',
                          background: isEnabled ? '#4F46E5' : '#D1D5DB',
                          borderRadius: '12px',
                          border: 'none',
                          cursor: 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s',
                          padding: '2px',
                        }}
                      >
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            background: '#FFFFFF',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '2px',
                            left: isEnabled ? '24px' : '2px',
                            transition: 'left 0.2s',
                          }}
                        />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default StudentNotificationPreferences;
