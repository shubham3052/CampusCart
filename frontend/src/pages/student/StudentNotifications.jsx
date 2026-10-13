import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Package,
  Printer,
  Truck,
  Tag,
  AlertTriangle,
  RefreshCw,
  Clock,
  ArrowRight,
  Filter,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';
import notificationService from '../../services/notificationService';

export default function StudentNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const [listRes, unreadRes] = await Promise.all([
        notificationService.getNotifications(),
        notificationService.getUnreadNotificationCount(),
      ]);
      const list = listRes.results || listRes || [];
      setNotifications(list);
      setUnreadCount(unreadRes.unread_count ?? list.filter((n) => !n.is_read).length);
    } catch (err) {
      console.error('Failed to load student notifications:', err);
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
  }, []);

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

  const getIcon = (type) => {
    switch (type) {
      case 'ORDER_STATUS':
        return <Package size={18} color="var(--primary-600)" />;
      case 'PRINT_READY':
        return <Printer size={18} color="#059669" />;
      case 'DELIVERY_UPDATE':
        return <Truck size={18} color="#2563eb" />;
      case 'PICKUP_READY':
        return <CheckCircle2 size={18} color="#10b981" />;
      case 'OFFER_ALERT':
        return <Tag size={18} color="#7c3aed" />;
      case 'WISHLIST_ALERT':
        return <Bell size={18} color="#f59e0b" />;
      default:
        return <Bell size={18} color="var(--text-secondary)" />;
    }
  };

  const handleItemClick = (notif) => {
    if (!notif.is_read) {
      handleMarkAsRead(notif.id);
    }
    if (notif.notification_type === 'PRINT_READY') {
      if (notif.reference_id) {
        navigate(`/student/printing/orders/${notif.reference_id}`);
      } else {
        navigate('/student/printing/orders');
      }
    } else if (
      notif.notification_type === 'ORDER_STATUS' ||
      notif.notification_type === 'DELIVERY_UPDATE' ||
      notif.notification_type === 'PICKUP_READY'
    ) {
      if (notif.reference_id) {
        navigate(`/student/orders/${notif.reference_id}`);
      } else {
        navigate('/student/orders');
      }
    } else if (notif.notification_type === 'OFFER_ALERT') {
      navigate('/student/offers');
    } else if (notif.notification_type === 'WISHLIST_ALERT') {
      navigate('/student/wishlist');
    } else if (notif.notification_type === 'COMPLAINT_REPLY') {
      navigate('/student/complaints');
    }
  };

  const filtered = notifications.filter((n) => {
    if (showUnreadOnly && n.is_read) return false;
    if (filterType === 'ALL') return true;
    return n.notification_type === filterType;
  });

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Notifications & Alerts"
          subtitle="Real-time updates on orders, Xerox printing, deliveries, and campus specials"
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
          {unreadCount > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleMarkAllRead}
              icon={CheckCheck}
            >
              Mark all as read ({unreadCount})
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

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.75rem',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--border-light)',
        }}
      >
        {[
          { id: 'ALL', label: 'All Alerts' },
          { id: 'ORDER_STATUS', label: 'Orders' },
          { id: 'PRINT_READY', label: 'Printing' },
          { id: 'DELIVERY_UPDATE', label: 'Delivery' },
          { id: 'OFFER_ALERT', label: 'Offers' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterType(tab.id)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.8rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              backgroundColor: filterType === tab.id ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
              color: filterType === tab.id ? '#ffffff' : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              transition: 'all 150ms ease',
            }}
          >
            {tab.label}
          </button>
        ))}

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
            whiteSpace: 'nowrap',
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
          <Spinner size="lg" message="Loading notifications..." />
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
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Bell size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            No notifications found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            {showUnreadOnly ? 'You have caught up with all your alerts!' : 'You currently do not have any alerts in this category.'}
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => handleItemClick(item)}
              style={{
                backgroundColor: item.is_read ? 'var(--bg-surface)' : 'rgba(99, 102, 241, 0.04)',
                border: item.is_read ? '1px solid var(--border-light)' : '1px solid rgba(99, 102, 241, 0.25)',
                borderLeft: item.is_read ? '3px solid transparent' : '3px solid var(--primary-600)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                cursor: 'pointer',
                transition: 'transform 120ms ease, box-shadow 120ms ease',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.85rem',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
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
                {getIcon(item.notification_type)}
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

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Badge variant={item.is_read ? 'neutral' : 'primary'} size="sm">
                      {item.notification_type?.replace(/_/g, ' ')}
                    </Badge>
                    {item.reference_id && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Ref: #{item.reference_id.slice(0, 8)}
                      </span>
                    )}
                  </div>

                  {item.reference_id && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--primary-600)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                    >
                      View Details <ArrowRight size={13} />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
