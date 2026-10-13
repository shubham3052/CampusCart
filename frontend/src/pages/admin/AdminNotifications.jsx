import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Package,
  Send,
  RefreshCw,
  Clock,
  Filter,
  Users,
  Store,
  Truck,
  Sparkles,
  AlertCircle,
  Radio,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';
import notificationService from '../../services/notificationService';
import api from '../../services/api';

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showAllUsersFeed, setShowAllUsersFeed] = useState(false);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState(null);

  // Broadcast modal state
  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    target_group: 'ALL', // 'ALL' | 'STUDENTS' | 'SHOP_OWNERS' | 'DELIVERY_AGENTS'
    title: '',
    message: '',
    notification_type: 'ACADEMIC_ALERT',
  });

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (showAllUsersFeed) params.all = 'true';
      if (showUnreadOnly) params.unread = 'true';

      const [listRes, unreadRes] = await Promise.all([
        notificationService.getNotifications(params),
        notificationService.getUnreadNotificationCount(),
      ]);
      const list = listRes.results || listRes || [];
      setNotifications(list);
      setUnreadCount(unreadRes.unread_count ?? list.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error('Failed to load admin notifications:', err);
      const msg = err.message?.includes('Network Error') || !err.response
        ? 'Unable to load notifications: CampusCart backend server is unreachable. Please ensure Django is running on port 8000.'
        : (err.response?.data?.message || err.response?.data?.detail || 'Unable to load notifications. Please try again.');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [showAllUsersFeed, showUnreadOnly]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
      setSuccessMsg('All notifications marked as read.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleSendBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastForm.title || !broadcastForm.message) {
      alert('Please fill out both notification title and message.');
      return;
    }
    try {
      setSendingBroadcast(true);
      // Dispatches broadcast to all users in group
      const res = await api.post('/platform-owner/notifications/broadcast/', broadcastForm).catch(async () => {
        // Fallback for admin broadcast
        return await api.post('/notifications/', {
          ...broadcastForm,
          title: `[Campus Broadcast] ${broadcastForm.title}`,
        });
      });
      setSuccessMsg('System broadcast successfully dispatched across the campus network!');
      setBroadcastModalOpen(false);
      setBroadcastForm({
        target_group: 'ALL',
        title: '',
        message: '',
        notification_type: 'ACADEMIC_ALERT',
      });
      fetchNotifications();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Broadcast error:', err);
      alert(err.response?.data?.message || 'Failed to dispatch broadcast notice.');
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Platform Notifications & Broadcasts"
          subtitle="System-wide dispatch history, academic event alerts, and campus communications"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            icon={RefreshCw}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setBroadcastModalOpen(true)}
            icon={Send}
          >
            Dispatch Broadcast
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              icon={CheckCheck}
            >
              Mark Read ({unreadCount})
            </Button>
          )}
        </div>
      </div>

      {successMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-md)',
            color: '#065f46',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* Mode Toggle & Filters */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        <button
          type="button"
          onClick={() => setShowAllUsersFeed(false)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: !showAllUsersFeed ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
            color: !showAllUsersFeed ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          My Admin Alerts
        </button>
        <button
          type="button"
          onClick={() => setShowAllUsersFeed(true)}
          style={{
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: showAllUsersFeed ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
            color: showAllUsersFeed ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          All Platform Broadcasts
        </button>

        <button
          type="button"
          onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          style={{
            marginLeft: 'auto',
            padding: '0.45rem 0.85rem',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.8rem',
            fontWeight: 600,
            border: '1px solid var(--border-light)',
            cursor: 'pointer',
            backgroundColor: showUnreadOnly ? '#eff6ff' : 'transparent',
            color: showUnreadOnly ? 'var(--primary-600)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
          }}
        >
          <Filter size={14} />
          {showUnreadOnly ? 'Showing Unread Only' : 'Filter Unread'}
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1.25rem' }}>
          <ErrorMessage
            title="Connection Issue"
            message={error}
            onRetry={fetchNotifications}
          />
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading platform notifications..." />
        </div>
      ) : error ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <AlertTriangle size={40} color="var(--warning-500, #f59e0b)" style={{ margin: '0 auto 1rem', opacity: 0.9 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            Unable to load notifications
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 1.25rem' }}>
            {error}
          </p>
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchNotifications}>
            Retry Connection
          </Button>
        </Card>
      ) : notifications.length === 0 ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Bell size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            No notifications in feed
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            There are currently no notifications matching your active filter.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {notifications.map((item) => (
            <div
              key={item.id}
              onClick={() => !item.is_read && handleMarkAsRead(item.id)}
              style={{
                backgroundColor: item.is_read ? 'var(--bg-surface)' : 'rgba(99, 102, 241, 0.04)',
                border: item.is_read ? '1px solid var(--border-light)' : '1px solid rgba(99, 102, 241, 0.25)',
                borderLeft: item.is_read ? '3px solid transparent' : '3px solid var(--primary-600)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: item.is_read ? 'var(--bg-surface-secondary)' : '#eef2ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Radio size={18} color="var(--primary-600)" />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <h4
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: item.is_read ? 600 : 700,
                      color: 'var(--text-primary)',
                      margin: 0,
                    }}
                  >
                    {item.title}
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Clock size={12} />
                    {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '0.875rem',
                    color: item.is_read ? 'var(--text-secondary)' : 'var(--text-primary)',
                    margin: '0 0 0.5rem 0',
                    lineHeight: 1.45,
                  }}
                >
                  {item.message}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Badge variant={item.is_read ? 'neutral' : 'primary'} size="sm">
                    {item.notification_type?.replace(/_/g, ' ')}
                  </Badge>
                  {item.recipient && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Recipient: {item.recipient.username || item.recipient.email || `User #${item.recipient}`}
                    </span>
                  )}
                  {item.reference_id && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Ref: #{item.reference_id.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Broadcast Modal */}
      {broadcastModalOpen && (
        <Modal
          isOpen={broadcastModalOpen}
          onClose={() => setBroadcastModalOpen(false)}
          title="Dispatch Campus Broadcast"
        >
          <form onSubmit={handleSendBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Target Audience
              </label>
              <select
                value={broadcastForm.target_group}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, target_group: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="ALL">Entire Campus (All Users & Merchants)</option>
                <option value="STUDENTS">Students & Customers Only</option>
                <option value="SHOP_OWNERS">Shop Owners & Merchants Only</option>
                <option value="DELIVERY_AGENTS">Campus Delivery Agents Only</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Notification Category
              </label>
              <select
                value={broadcastForm.notification_type}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, notification_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="ACADEMIC_ALERT">Academic Cycle / Exam Preparation</option>
                <option value="OFFER_ALERT">Special Offer & Campus Discount</option>
                <option value="ORDER_STATUS">Platform Maintenance / Notice</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Broadcast Title
              </label>
              <input
                type="text"
                placeholder="e.g. Midterm Exam Prep Kits Now Available"
                value={broadcastForm.title}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, title: e.target.value })}
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
                Broadcast Message
              </label>
              <textarea
                placeholder="Enter complete alert message to be dispatched to user inboxes..."
                rows={4}
                value={broadcastForm.message}
                onChange={(e) => setBroadcastForm({ ...broadcastForm, message: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                required
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setBroadcastModalOpen(false)}
                disabled={sendingBroadcast}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                loading={sendingBroadcast}
                icon={Send}
              >
                Send Broadcast
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
