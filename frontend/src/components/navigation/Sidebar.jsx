import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, LogOut, Sparkles, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const Sidebar = ({
  items = [],
  title = 'CampusCart',
  subtitle = 'Dashboard',
  badgeText,
  isOpen = false,
  onClose,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const getProfilePath = () => {
    if (user?.role === 'PLATFORM_OWNER') return '/platform-owner/profile';
    if (user?.role === 'SHOP_OWNER') return '/shop-owner/profile';
    if (user?.role === 'ADMIN') return '/admin/profile';
    if (user?.role === 'STUDENT') return '/student/profile';
    return '#';
  };

  return (
    <>
      {/* Mobile Drawer Overlay Backdrop */}
      {isOpen && (
        <div
          className="sidebar-mobile-backdrop"
          onClick={onClose}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={`sidebar-drawer ${isOpen ? 'open' : ''}`}
        style={{
          width: collapsed ? '72px' : '260px',
          minHeight: '100vh',
          backgroundColor: '#0f172a', // Sleek dark sidebar for SaaS look
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
          boxShadow: '4px 0 16px rgba(0, 0, 0, 0.08)',
          flexShrink: 0,
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: collapsed ? '1.25rem 0.5rem' : '1.25rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
        {collapsed ? (
          <img
            src="/assets/campuscart-logo.png"
            alt="CampusCart"
            style={{
              height: '32px',
              width: '32px',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        ) : (
          <div style={{ minWidth: 0, flex: 1, marginRight: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <img
                src="/assets/campuscart-logo.png"
                alt="CampusCart Logo"
                style={{
                  height: '28px',
                  width: 'auto',
                  maxWidth: '32px',
                  objectFit: 'contain',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em', color: '#ffffff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {title}
              </span>
            </div>
            {subtitle && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>{subtitle}</span>
                {badgeText && (
                  <span
                    style={{
                      fontSize: '0.62rem',
                      padding: '0.1rem 0.45rem',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'rgba(99, 102, 241, 0.25)',
                      color: '#a5b4fc',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      border: '1px solid rgba(99, 102, 241, 0.35)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {badgeText}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
          {onClose && (
            <button
              onClick={onClose}
              className="mobile-close-btn"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 150ms ease',
              }}
              title="Close navigation drawer"
              aria-label="Close navigation drawer"
            >
              <X size={18} />
            </button>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="desktop-sidebar-only"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 150ms ease',
            }}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          flex: 1,
          padding: '1rem 0.5rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.25rem',
        }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end !== undefined ? item.end : true}
              title={collapsed ? item.label : undefined}
              onClick={() => {
                if (onClose) onClose();
              }}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
                padding: collapsed ? '0.75rem' : '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                color: isActive ? '#ffffff' : '#94a3b8',
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                fontWeight: isActive ? 600 : 500,
                fontSize: '0.875rem',
                textDecoration: 'none',
                transition: 'all 150ms ease',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
              })}
            >
              {Icon && <Icon size={18} style={{ flexShrink: 0 }} />}
              {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              {!collapsed && item.badge && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: item.badgeColor || '#4f46e5',
                    color: '#ffffff',
                    fontWeight: 600,
                  }}
                >
                  {item.badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / User Profile & Logout */}
      <div
        style={{
          padding: '1rem 0.75rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        {!collapsed && user && (
          <div
            onClick={() => {
              if (onClose) onClose();
              navigate(getProfilePath());
            }}
            title="View Profile"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              padding: '0.5rem 0.6rem',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: '#334155',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 600,
                fontSize: '0.85rem',
              }}
            >
              {(user.username || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.first_name ? `${user.first_name} ${user.last_name || ''}` : user.username}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.email}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '0.75rem',
            width: '100%',
            padding: '0.65rem',
            borderRadius: 'var(--radius-md)',
            background: 'transparent',
            border: 'none',
            color: '#ef4444',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'background 150ms ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  </>
  );
};

export default Sidebar;
