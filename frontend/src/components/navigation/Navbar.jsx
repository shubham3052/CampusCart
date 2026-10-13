import React, { useState, useEffect } from 'react';
import { Bell, Search, ShieldCheck, Menu, User as UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Badge from '../common/Badge';
import notificationService from '../../services/notificationService';

const Navbar = ({
  title,
  subtitle,
  actions,
  badge,
  showSearch = true,
  searchPlaceholder = 'Quick search...',
  onSearch,
  onToggleSidebar,
}) => {
  const { user, roles, activeRole, switchRole } = useAuth();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await notificationService.getUnreadNotificationCount();
        setUnreadCount(res.unread_count ?? 0);
      } catch {
        // silent fallback
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const getProfilePath = () => {
    if (user?.role === 'PLATFORM_OWNER') return '/platform-owner/profile';
    if (user?.role === 'SHOP_OWNER') return '/shop-owner/profile';
    if (user?.role === 'ADMIN') return '/admin/profile';
    if (user?.role === 'STUDENT') return '/student/profile';
    if (user?.role === 'DELIVERY_AGENT') return '/delivery-agent/profile';
    return '#';
  };

  const getNotificationsPath = () => {
    if (user?.role === 'PLATFORM_OWNER') return '/platform-owner/notifications';
    if (user?.role === 'SHOP_OWNER') return '/shop-owner/notifications';
    if (user?.role === 'ADMIN') return '/admin/notifications';
    if (user?.role === 'STUDENT') return '/student/notifications';
    if (user?.role === 'DELIVERY_AGENT') return '/delivery-agent/deliveries';
    return '#';
  };

  return (
    <header
      className="app-header"
      style={{
        minHeight: 'var(--header-height, 56px)',
        height: 'auto',
        backgroundColor: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-light)',
        padding: '0.65rem 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        gap: '0.65rem',
        boxSizing: 'border-box',
        width: '100%',
      }}
    >
      {/* Left side title / status & mobile toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flexShrink: 1 }}>
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="mobile-menu-btn"
            style={{
              background: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-md)',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--text-primary)',
              flexShrink: 0,
            }}
            aria-label="Toggle navigation menu"
          >
            <Menu size={18} />
          </button>
        )}

        <img
          src="/assets/campuscart-logo.png"
          alt="CampusCart"
          className="mobile-logo-navbar"
          style={{
            height: '24px',
            width: 'auto',
            objectFit: 'contain',
            display: 'none',
            flexShrink: 0,
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
            <h2 style={{ fontSize: 'clamp(0.85rem, 3vw, 1.05rem)', fontWeight: 700, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'clamp(110px, 34vw, 260px)' }}>
              {title || 'CampusCart'}
            </h2>
            {badge && (
              <span className="desktop-sidebar-only" style={{ flexShrink: 0 }}>
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="desktop-sidebar-only" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Right side actions, notifications, profile */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexShrink: 0 }}>
        {actions && <div style={{ flexShrink: 0 }}>{actions}</div>}

        {/* Notifications Icon */}
        <button
          type="button"
          onClick={() => navigate(getNotificationsPath())}
          title={unreadCount > 0 ? `${unreadCount} unread alert(s)` : 'Notifications'}
          style={{
            position: 'relative',
            background: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-light)',
            borderRadius: 'var(--radius-md)',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: unreadCount > 0 ? 'var(--primary-600)' : 'var(--text-secondary)',
            flexShrink: 0,
            transition: 'background-color 150ms ease, color 150ms ease',
          }}
          aria-label="Notifications"
        >
          <Bell size={17} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-3px',
                right: '-3px',
                minWidth: '16px',
                height: '16px',
                padding: '0 3px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--primary-600)',
                color: '#ffffff',
                fontSize: '0.62rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 0 0 2px var(--bg-surface)',
              }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Multi-Role Switcher Header Control */}
        {roles && roles.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', marginRight: '0.25rem' }}>
            <select
              value={activeRole || user?.role}
              onChange={async (e) => {
                const targetRole = e.target.value;
                if (targetRole && targetRole !== (activeRole || user?.role)) {
                  await switchRole(targetRole);
                  if (targetRole === 'PLATFORM_OWNER') navigate('/platform-owner/dashboard');
                  else if (targetRole === 'ADMIN') navigate('/admin/dashboard');
                  else if (targetRole === 'SHOP_OWNER') navigate('/shop-owner/dashboard');
                  else if (targetRole === 'DELIVERY_AGENT') navigate('/delivery-agent/deliveries');
                  else navigate('/student/home');
                }
              }}
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-surface-secondary, #f1f5f9)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
              title="Switch Active Portal / Role"
              aria-label="Switch Active Role"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r === 'STUDENT' ? 'Student' :
                   r === 'SHOP_OWNER' ? 'Shop Owner' :
                   r === 'DELIVERY_AGENT' ? 'Courier' :
                   r === 'ADMIN' ? 'Admin' :
                   r === 'PLATFORM_OWNER' ? 'Platform Owner' : r}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* User preview button navigating to profile */}
        {user && (
          <button
            type="button"
            onClick={() => navigate(getProfilePath())}
            title="View Profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.2rem 0.35rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: 'var(--radius-md)',
              transition: 'background 150ms ease',
              textAlign: 'left',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--primary-100)',
                color: 'var(--primary-700)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.85rem',
                flexShrink: 0,
              }}
            >
              {(user.username || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="desktop-sidebar-only" style={{ flexDirection: 'column' }}>
              <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {user.first_name || user.username}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                {activeRole || user.role}
              </span>
            </div>
          </button>
        )}
      </div>

      {/* Responsive Header CSS */}
      <style>{`
        @media (max-width: 768px) {
          .app-header {
            padding: 0.4rem 0.65rem !important;
            gap: 0.4rem !important;
          }
          .mobile-menu-btn {
            width: 34px !important;
            height: 34px !important;
          }
        }
        @media (max-width: 360px) {
          .app-header {
            padding: 0.35rem 0.4rem !important;
            gap: 0.3rem !important;
          }
          .mobile-menu-btn {
            width: 32px !important;
            height: 32px !important;
          }
        }
      `}</style>
    </header>
  );
};

export default Navbar;
