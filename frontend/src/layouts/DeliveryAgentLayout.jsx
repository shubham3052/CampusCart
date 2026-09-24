import React, { useState, useEffect, useRef } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { Truck, LogOut, Package, Bell, Check, Store, Clock, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import orderService from '../services/orderService';

const DeliveryAgentLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeCount, setActiveCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const notifRef = useRef(null);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchActiveDeliveriesCount = async () => {
    try {
      const data = await orderService.getDeliveries();
      const active = (data.results || data || []).filter(
        (d) => ['ASSIGNED', 'ARRIVED_AT_SHOP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)
      ).length;
      setActiveCount(active);
    } catch {
      // silent fallback
    }
  };

  const fetchNotifications = async () => {
    try {
      const data = await orderService.getNotifications();
      const list = data.results || data || [];
      setNotifications(list);
      const unread = list.filter((n) => !n.is_read).length;
      setUnreadCount(unread);
    } catch {
      // silent fallback
    }
  };

  useEffect(() => {
    fetchActiveDeliveriesCount();
    fetchNotifications();

    const interval = setInterval(() => {
      fetchActiveDeliveriesCount();
      fetchNotifications();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      await orderService.markNotificationRead(id);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await orderService.markAllNotificationsRead();
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      await handleMarkAsRead(notif.id);
    }
    setNotifDropdownOpen(false);
    navigate('/delivery-agent/deliveries');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-app, #f8fafc)' }}>
      {/* Courier Top Header */}
      <header
        className="courier-header"
        style={{
          backgroundColor: '#1e293b',
          color: 'white',
          padding: '0.65rem 1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          gap: '0.5rem',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0, flexShrink: 1 }}>
          <img
            src="/assets/campuscart-logo.png"
            alt="CampusCart"
            className="courier-brand-logo"
            style={{
              height: '32px',
              width: 'auto',
              objectFit: 'contain',
              borderRadius: '4px',
              flexShrink: 0,
            }}
          />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 'clamp(0.88rem, 2.8vw, 1.05rem)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'nowrap' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>CampusCart</span>
              <span style={{ color: '#f59e0b', fontSize: '0.78rem', fontWeight: 700, backgroundColor: 'rgba(245, 158, 11, 0.15)', padding: '0.1rem 0.35rem', borderRadius: '4px', flexShrink: 0 }}>Courier</span>
              {activeCount > 0 && (
                <span style={{ fontSize: '0.68rem', backgroundColor: '#ef4444', color: 'white', padding: '0.1rem 0.35rem', borderRadius: '12px', fontWeight: 700, flexShrink: 0 }}>
                  {activeCount}
                </span>
              )}
            </div>
            <div className="desktop-sidebar-only" style={{ fontSize: '0.72rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Campus Delivery Logistics
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          {/* Notification Bell with Badge */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
              className="courier-bell-btn"
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: notifDropdownOpen ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
              title="Delivery Notifications"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    backgroundColor: '#ef4444',
                    color: 'white',
                    fontSize: '11px',
                    fontWeight: 800,
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #1e293b',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown Drawer */}
            {notifDropdownOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '115%',
                  right: 0,
                  width: '340px',
                  maxWidth: 'calc(100vw - 24px)',
                  backgroundColor: '#ffffff',
                  color: '#1e293b',
                  borderRadius: '10px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -6px rgba(0, 0, 0, 0.15)',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden',
                  zIndex: 100,
                }}
              >
                {/* Header */}
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#f8fafc',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.875rem' }}>
                    <Bell size={15} color="#4f46e5" />
                    <span>Pickup & Task Alerts</span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4f46e5',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                      }}
                    >
                      <Check size={13} /> Mark all read
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '2rem 1rem', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                      No notifications yet. New assigned orders will appear here.
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                          padding: '0.75rem 1rem',
                          borderBottom: '1px solid #f8fafc',
                          backgroundColor: n.is_read ? '#ffffff' : '#f0fdf4',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '0.65rem',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = n.is_read ? '#ffffff' : '#f0fdf4')}
                      >
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: n.title?.includes('Pickup') ? '#eef2ff' : '#ecfdf5',
                            color: n.title?.includes('Pickup') ? '#4f46e5' : '#059669',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: '2px',
                          }}
                        >
                          {n.title?.includes('Pickup') ? <Store size={15} /> : <Package size={15} />}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>
                              {n.title}
                            </span>
                            {!n.is_read && (
                              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', flexShrink: 0 }}></span>
                            )}
                          </div>
                          <p style={{ margin: '0.2rem 0 0.35rem 0', fontSize: '0.8rem', color: '#475569', lineHeight: 1.35 }}>
                            {n.message}
                          </p>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(n.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate('/delivery-agent/profile')}
            title="Courier Profile & Settings"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'white',
              textAlign: 'right',
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              borderRadius: 'var(--radius-md)',
              transition: 'background-color 150ms ease',
            }}
            className="desktop-sidebar-only"
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{user?.name || user?.username}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{user?.phone_number || 'View Profile'}</div>
          </button>

          <button
            onClick={handleLogout}
            className="courier-logout-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              backgroundColor: 'rgba(255,255,255,0.1)',
              border: 'none',
              color: 'white',
              padding: '0.45rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
              flexShrink: 0,
            }}
            aria-label="Logout"
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.2)')}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)')}
          >
            <LogOut size={16} />
            <span className="courier-logout-text">Logout</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="page-container" style={{ flex: 1, maxWidth: '1100px', width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>

      {/* Mobile-friendly Bottom Footer */}
      <footer style={{ padding: '1rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
        Campus Courier Network &bull; Smart Student Stationery & Document Printing
      </footer>

      {/* Responsive Styles for Courier Header */}
      <style>{`
        @media (max-width: 768px) {
          .courier-header {
            padding: 0.4rem 0.65rem !important;
            gap: 0.4rem !important;
          }
          .courier-brand-logo {
            height: 26px !important;
          }
          .courier-bell-btn {
            width: 34px !important;
            height: 34px !important;
          }
        }
        @media (max-width: 480px) {
          .courier-logout-text {
            display: none !important;
          }
          .courier-logout-btn {
            padding: 0.45rem !important;
            min-width: 34px !important;
            min-height: 34px !important;
            justify-content: center !important;
          }
        }
        @media (max-width: 360px) {
          .courier-header {
            padding: 0.35rem 0.4rem !important;
            gap: 0.3rem !important;
          }
          .courier-brand-logo {
            height: 22px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default DeliveryAgentLayout;
