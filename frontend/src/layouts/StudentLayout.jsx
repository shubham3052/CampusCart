import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Store,
  ShoppingCart,
  Package,
  Printer,
  User,
  Bell,
  MapPin,
  Sparkles,
  LogOut,
  ClipboardList,
  Users,
  CreditCard,
  ChevronDown,
  Menu,
  X,
  Plus,
  Check,
  Building,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import Badge from '../components/common/Badge';
import notificationService from '../services/notificationService';
import orderService from '../services/orderService';

const StudentLayout = () => {
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  // Notifications state
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // Dropdown states
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  // Delivery Addresses state
  const [addresses, setAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);

  const profileRef = useRef(null);
  const locationRef = useRef(null);

  // 1. Fetch unread notifications count
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await notificationService.getUnreadNotificationCount();
        setUnreadNotifs(res.unread_count ?? 0);
      } catch {
        // silent fallback
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  // 2. Fetch saved delivery addresses for location selector
  useEffect(() => {
    if (!user) return;
    const fetchAddresses = async () => {
      try {
        const data = await orderService.getStudentAddresses();
        const list = Array.isArray(data) ? data : data.results || [];
        setAddresses(list);
        // Default to address marked as default, or the first address, or fallback
        const def = list.find((a) => a.is_default) || list[0];
        if (def) {
          setSelectedAddress(def);
        }
      } catch {
        // silent fallback
      }
    };
    fetchAddresses();
  }, [user]);

  // 3. Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false);
      }
      if (locationRef.current && !locationRef.current.contains(e.target)) {
        setIsLocationOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsProfileOpen(false);
        setIsLocationOpen(false);
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 4. Close menus on route change
  useEffect(() => {
    setIsProfileOpen(false);
    setIsLocationOpen(false);
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // 5. Logout handler
  const handleLogout = async () => {
    try {
      setLogoutError('');
      await logout();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Logout failed:', err);
      setLogoutError('Failed to log out cleanly. Redirecting...');
      setTimeout(() => {
        navigate('/login', { replace: true });
      }, 1000);
    }
  };

  // Navigation Links configuration
  const navItems = [
    { label: 'Home', path: '/student/home', icon: Home },
    { label: 'Shops', path: '/student/shops', icon: Store },
    { label: 'Class Orders', path: '/student/bulk-orders', icon: Users },
    { label: 'Printing', path: '/student/printing', icon: Printer },
    { label: 'Planner', path: '/student/planner', icon: ClipboardList },
    { label: 'Addresses', path: '/student/addresses', icon: MapPin },
    { label: 'Orders', path: '/student/orders', icon: Package },
    { label: 'Alerts', path: '/student/notifications', icon: Bell, badge: unreadNotifs },
    { label: 'Payments', path: '/student/payments', icon: CreditCard },
    { label: 'Profile', path: '/student/profile', icon: User },
  ];

  // Mobile Bottom Navigation (5 quick access tabs)
  const mobileNavItems = [
    { label: 'Home', path: '/student/home', icon: Home },
    { label: 'Shops', path: '/student/shops', icon: Store },
    { label: 'Printing', path: '/student/printing', icon: Printer },
    { label: 'Orders', path: '/student/orders', icon: Package },
    { label: 'Profile', path: '/student/profile', icon: User },
  ];

  // Active address label calculation
  const getActiveAddressDisplay = () => {
    if (selectedAddress) {
      const parts = [];
      if (selectedAddress.hostel_block) parts.push(selectedAddress.hostel_block);
      if (selectedAddress.room_number) parts.push(`Rm ${selectedAddress.room_number}`);
      if (parts.length > 0) return parts.join(', ');
      if (selectedAddress.label) return selectedAddress.label;
    }
    return 'Block A / Library Gate';
  };

  const activeAddressTitle = selectedAddress
    ? `${selectedAddress.label || 'Delivery'}: ${selectedAddress.hostel_block || ''} ${selectedAddress.room_number ? `Room ${selectedAddress.room_number}` : ''} ${selectedAddress.landmark ? `(${selectedAddress.landmark})` : ''}`.trim()
    : 'Campus Delivery: Block A / Library Gate';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'var(--bg-main)' }}>
      {/* ============================================================ */}
      {/* TIER 1: PRIMARY HEADER BAR (Logo, Location, Actions & Profile) */}
      {/* ============================================================ */}
      {/* ============================================================ */}
      {/* TIER 1: PRIMARY HEADER BAR (Logo, Location, Actions & Profile) */}
      {/* ============================================================ */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-light)',
          boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)',
        }}
      >
        <div className="student-header-inner">
          {/* LEFT: Mobile Menu Toggle + Brand Logo + Location Selector */}
          <div className="student-left-group">
            {/* Mobile Hamburger Toggle */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="student-mobile-menu-btn"
              style={{
                display: 'none',
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                width: '38px',
                height: '38px',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-primary)',
                flexShrink: 0,
              }}
              aria-label="Open navigation menu"
            >
              <Menu size={18} />
            </button>

            {/* CampusCart Brand Logo & Name */}
            <NavLink
              to="/student/home"
              className="student-brand-link"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                textDecoration: 'none',
                flexShrink: 0,
              }}
              title="CampusCart Student Portal"
            >
              <img
                src="/assets/campuscart-logo.png"
                alt="CampusCart Logo"
                className="student-brand-logo"
              />
              <span className="student-brand-name">
                Campus<span style={{ color: 'var(--primary-600, #2563eb)' }}>Cart</span>
              </span>
            </NavLink>

            {/* Clearly Separated Delivery Location Selector (Desktop/Tablet) */}
            <div
              ref={locationRef}
              className="student-location-container"
              style={{ position: 'relative', marginLeft: '0.35rem' }}
            >
              <button
                type="button"
                onClick={() => setIsLocationOpen((prev) => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.35rem 0.75rem',
                  cursor: 'pointer',
                  maxWidth: '220px',
                  transition: 'all 0.15s ease',
                  textAlign: 'left',
                }}
                title={activeAddressTitle}
                aria-haspopup="true"
                aria-expanded={isLocationOpen}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <MapPin size={13} color="var(--primary-600, #2563eb)" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                  <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Deliver To
                  </span>
                  <span
                    style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {getActiveAddressDisplay()}
                  </span>
                </div>
                <ChevronDown
                  size={14}
                  color="var(--text-muted)"
                  style={{
                    flexShrink: 0,
                    transition: 'transform 0.2s ease',
                    transform: isLocationOpen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>

              {/* Delivery Location Quick-Select Popover */}
              {isLocationOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    left: 0,
                    width: '280px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-xl)',
                    padding: '0.75rem',
                    zIndex: 60,
                  }}
                  className="animate-fade-in"
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Choose Campus Spot
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLocationOpen(false);
                        navigate('/student/addresses');
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-600)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      + Manage
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {/* Default Campus Gate Option */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAddress(null);
                        setIsLocationOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.45rem 0.65rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: !selectedAddress ? 'var(--primary-50)' : 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Building size={14} color={!selectedAddress ? 'var(--primary-600)' : 'var(--text-muted)'} />
                        <div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: !selectedAddress ? 'var(--primary-700)' : 'var(--text-primary)' }}>
                            Block A / Library Gate
                          </div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Main Campus Pickup Point</div>
                        </div>
                      </div>
                      {!selectedAddress && <Check size={14} color="var(--primary-600)" />}
                    </button>

                    {/* Saved Student Addresses */}
                    {addresses.map((addr) => {
                      const isSelected = selectedAddress?.id === addr.id;
                      return (
                        <button
                          key={addr.id}
                          type="button"
                          onClick={() => {
                            setSelectedAddress(addr);
                            setIsLocationOpen(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.45rem 0.65rem',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: isSelected ? 'var(--primary-50)' : 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            textAlign: 'left',
                            width: '100%',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                            <MapPin size={14} color={isSelected ? 'var(--primary-600)' : 'var(--text-muted)'} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: isSelected ? 'var(--primary-700)' : 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {addr.label || 'Hostel Room'}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {addr.hostel_block} {addr.room_number ? `Room ${addr.room_number}` : ''}
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check size={14} color="var(--primary-600)" flexShrink={0} />}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLocationOpen(false);
                        navigate('/student/addresses');
                      }}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        padding: '0.45rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-surface-secondary)',
                        border: '1px solid var(--border-light)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        color: 'var(--primary-600)',
                        cursor: 'pointer',
                      }}
                    >
                      <Plus size={14} /> Add New Address
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Notifications, Cart, and Profile Menu Dropdown */}
          <div className="student-right-group">
            {/* Notification Bell */}
            <button
              onClick={() => navigate('/student/notifications')}
              className="student-action-btn"
              title={unreadNotifs > 0 ? `${unreadNotifs} unread alert(s)` : 'Notifications'}
              style={{
                color: unreadNotifs > 0 ? 'var(--primary-600)' : 'var(--text-secondary)',
              }}
              aria-label="Notifications"
            >
              <Bell size={17} />
              {unreadNotifs > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    backgroundColor: 'var(--primary-600)',
                    color: 'white',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 3px',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px var(--bg-surface)',
                  }}
                >
                  {unreadNotifs > 9 ? '9+' : unreadNotifs}
                </span>
              )}
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={() => navigate('/student/cart')}
              className="student-action-btn"
              style={{
                color: itemCount > 0 ? 'var(--primary-600)' : 'var(--text-secondary)',
              }}
              aria-label="Shopping Cart"
              title="Shopping Cart"
            >
              <ShoppingCart size={17} />
              {itemCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    backgroundColor: 'var(--primary-600)',
                    color: 'white',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '16px',
                    height: '16px',
                    padding: '0 3px',
                    borderRadius: 'var(--radius-full)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 0 2px var(--bg-surface)',
                  }}
                >
                  {itemCount}
                </span>
              )}
            </button>

            {/* PROFILE DROPDOWN MENU */}
            <div ref={profileRef} style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setIsProfileOpen((prev) => !prev)}
                className="student-profile-btn"
                aria-haspopup="true"
                aria-expanded={isProfileOpen}
                aria-label="Student profile and account settings"
              >
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: 'var(--primary-600)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    flexShrink: 0,
                  }}
                >
                  {(user?.first_name || user?.name || user?.username || 'S').charAt(0).toUpperCase()}
                </div>
                <span
                  className="student-name-header"
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    maxWidth: '100px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user?.first_name || user?.name?.split(' ')[0] || user?.username || 'Student'}
                </span>
                <ChevronDown
                  size={14}
                  color="var(--text-muted)"
                  className="student-profile-chevron"
                  style={{
                    flexShrink: 0,
                    transition: 'transform 0.2s ease',
                    transform: isProfileOpen ? 'rotate(180deg)' : 'none',
                  }}
                />
              </button>

              {/* Profile Dropdown Content */}
              {isProfileOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '260px',
                    maxWidth: 'calc(100vw - 16px)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-xl)',
                    boxShadow: 'var(--shadow-xl)',
                    overflow: 'hidden',
                    zIndex: 60,
                  }}
                  className="animate-fade-in"
                >
                  {/* Account Header Banner */}
                  <div
                    style={{
                      padding: '1rem',
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(79, 70, 229, 0.04) 100%)',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--primary-600)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '1rem',
                          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
                          flexShrink: 0,
                        }}
                      >
                        {(user?.first_name || user?.name || user?.username || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: '0.9rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user?.name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Student User'}
                        </div>
                        <div
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {user?.email}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Badge variant="primary" size="sm">Student Account</Badge>
                      {user?.email_verified && <Badge variant="success" size="sm">Verified</Badge>}
                    </div>
                  </div>

                  {/* Dropdown Navigation Links */}
                  <div style={{ padding: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <NavLink
                      to="/student/profile"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <User size={16} color="var(--primary-600)" />
                      <span>My Profile</span>
                    </NavLink>

                    <NavLink
                      to="/student/orders"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Package size={16} color="var(--primary-600)" />
                      <span>My Orders</span>
                    </NavLink>

                    <NavLink
                      to="/student/addresses"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <MapPin size={16} color="var(--primary-600)" />
                      <span>Saved Addresses</span>
                    </NavLink>

                    <NavLink
                      to="/student/notifications"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Bell size={16} color="var(--primary-600)" />
                      <span>Notifications</span>
                      {unreadNotifs > 0 && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            backgroundColor: 'var(--primary-600)',
                            color: '#ffffff',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.4rem',
                            borderRadius: 'var(--radius-full)',
                          }}
                        >
                          {unreadNotifs}
                        </span>
                      )}
                    </NavLink>

                    <NavLink
                      to="/student/payments"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <CreditCard size={16} color="var(--primary-600)" />
                      <span>Payments</span>
                    </NavLink>

                    <NavLink
                      to="/student/planner"
                      onClick={() => setIsProfileOpen(false)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.55rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.85rem',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        textDecoration: 'none',
                        transition: 'background-color 0.15s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <ClipboardList size={16} color="var(--primary-600)" />
                      <span>Academic Planner</span>
                    </NavLink>
                  </div>

                  {/* Dropdown Divider */}
                  <div style={{ height: '1px', backgroundColor: 'var(--border-light)', margin: '0.25rem 0' }} />

                  {/* Visible, Prominent Logout Option */}
                  <div style={{ padding: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={handleLogout}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        padding: '0.65rem 0.75rem',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: '#dc2626',
                        fontSize: '0.875rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fef2f2';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <LogOut size={16} color="#dc2626" />
                      <span>Sign Out / Logout</span>
                    </button>
                    {logoutError && (
                      <div style={{ fontSize: '0.72rem', color: '#dc2626', marginTop: '0.25rem', padding: '0 0.5rem' }}>
                        {logoutError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* TIER 2: HORIZONTAL NAVIGATION STRIP (10 Student Links) */}
      {/* ============================================================ */}
      <nav
        className="student-nav-strip"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-light)',
          position: 'sticky',
          top: '57px',
          zIndex: 40,
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)',
        }}
        aria-label="Student primary navigation"
      >
        <div
          style={{
            maxWidth: '1360px',
            margin: '0 auto',
            padding: '0 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
          }}
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.65rem 0.85rem',
                  color: isActive ? 'var(--primary-600, #2563eb)' : 'var(--text-secondary)',
                  borderBottom: isActive ? '2px solid var(--primary-600, #2563eb)' : '2px solid transparent',
                  fontWeight: isActive ? 700 : 500,
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transition: 'all 0.15s ease',
                  backgroundColor: isActive ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                })}
              >
                <Icon size={16} />
                <span>{item.label}</span>
                {item.badge > 0 && (
                  <span
                    style={{
                      backgroundColor: 'var(--primary-600)',
                      color: 'white',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '0.1rem 0.4rem',
                      borderRadius: 'var(--radius-full)',
                      lineHeight: 1,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>

      {/* ============================================================ */}
      {/* MOBILE DRAWER (Slide-over with all links & Logout) */}
      {/* ============================================================ */}
      {isMobileMenuOpen && (
        <>
          <div
            onClick={() => setIsMobileMenuOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.55)',
              backdropFilter: 'blur(3px)',
              zIndex: 90,
            }}
            className="animate-fade-in"
          />
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              bottom: 0,
              width: '82%',
              maxWidth: '320px',
              backgroundColor: 'var(--bg-surface)',
              zIndex: 100,
              boxShadow: 'var(--shadow-xl)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drawer Header */}
            <div
              style={{
                padding: '1.25rem 1rem',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <img src="/assets/campuscart-logo.png" alt="CampusCart" style={{ height: '30px', width: 'auto' }} />
                <span style={{ fontWeight: 900, fontSize: '1.15rem', color: 'var(--text-primary)' }}>
                  Campus<span style={{ color: 'var(--primary-600)' }}>Cart</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* User Quick Info */}
            <div style={{ padding: '0.85rem 1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'var(--bg-surface-secondary)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {user?.name || user?.username || 'Student User'}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{user?.email}</div>
            </div>

            {/* Campus Delivery Spot in Drawer (Ensures Mobile Accessibility) */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', backgroundColor: 'rgba(37, 99, 235, 0.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  <MapPin size={13} color="var(--primary-600)" />
                  <span>Delivery Spot</span>
                </div>
                <NavLink
                  to="/student/addresses"
                  onClick={() => setIsMobileMenuOpen(false)}
                  style={{ fontSize: '0.72rem', color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}
                >
                  + Manage
                </NavLink>
              </div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {getActiveAddressDisplay()}
              </div>
            </div>

            {/* Navigation Links in Drawer */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 0.5rem' }}>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    style={({ isActive }) => ({
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.7rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? 'var(--primary-600)' : 'var(--text-primary)',
                      backgroundColor: isActive ? 'var(--primary-50)' : 'transparent',
                      textDecoration: 'none',
                      marginBottom: '0.2rem',
                    })}
                  >
                    <Icon size={18} />
                    <span>{item.label}</span>
                    {item.badge > 0 && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          backgroundColor: 'var(--primary-600)',
                          color: '#ffffff',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.45rem',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>

            {/* Drawer Logout Footer */}
            <div style={{ padding: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.65rem',
                  padding: '0.75rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  color: '#dc2626',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============================================================ */}
      {/* MAIN CONTENT OUTLET */}
      {/* ============================================================ */}
      <main style={{ flex: 1, paddingBottom: '3rem' }}>
        <Outlet />
      </main>

      {/* ============================================================ */}
      {/* MOBILE BOTTOM NAVIGATION BAR (Screens < 768px) */}
      {/* ============================================================ */}
      <nav
        className="student-mobile-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 'var(--mobile-nav-height, 60px)',
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-light)',
          display: 'none',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 40,
          boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.05)',
        }}
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.2rem',
                color: isActive ? 'var(--primary-600)' : 'var(--text-muted)',
                textDecoration: 'none',
                fontSize: '0.72rem',
                fontWeight: isActive ? 700 : 500,
                padding: '0.35rem 0.5rem',
                minWidth: '48px',
                minHeight: '48px',
              })}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Responsive Styles */}
      <style>{`
        .student-header-inner {
          max-width: 1360px;
          margin: 0 auto;
          padding: 0.65rem 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          box-sizing: border-box;
          width: 100%;
        }
        .student-left-group {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          min-width: 0;
          flex-shrink: 1;
        }
        .student-right-group {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-shrink: 0;
        }
        .student-brand-logo {
          height: 34px;
          width: auto;
          object-fit: contain;
          display: block;
          flex-shrink: 0;
        }
        .student-brand-name {
          font-weight: 900;
          font-size: 1.25rem;
          color: var(--text-primary);
          letter-spacing: -0.025em;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .student-action-btn {
          position: relative;
          background: var(--bg-surface-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-md);
          width: 38px;
          height: 38px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s ease;
        }
        .student-profile-btn {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.25rem 0.5rem 0.25rem 0.35rem;
          background: var(--bg-surface-secondary);
          border: 1px solid var(--border-light);
          border-radius: var(--radius-full);
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .student-nav-strip {
            display: none !important;
          }
          .student-mobile-bottom-nav {
            display: flex !important;
          }
          .student-mobile-menu-btn {
            display: flex !important;
            width: 34px !important;
            height: 34px !important;
            border-radius: var(--radius-md);
            flex-shrink: 0;
          }
          .student-header-inner {
            padding: 0.4rem 0.65rem !important;
            gap: 0.35rem !important;
          }
          .student-left-group {
            gap: 0.45rem !important;
          }
          .student-right-group {
            gap: 0.35rem !important;
          }
          .student-brand-logo {
            height: 26px !important;
          }
          .student-brand-name {
            font-size: 1.05rem !important;
          }
          .student-name-header {
            display: none !important;
          }
          .student-profile-chevron {
            display: none !important;
          }
          .student-profile-btn {
            padding: 0 !important;
            border: none !important;
            background: transparent !important;
          }
          .student-action-btn {
            width: 34px !important;
            height: 34px !important;
          }
          .student-location-container {
            display: none !important;
          }
        }

        @media (max-width: 480px) {
          .student-header-inner {
            padding: 0.35rem 0.5rem !important;
            gap: 0.3rem !important;
          }
          .student-left-group {
            gap: 0.35rem !important;
          }
          .student-right-group {
            gap: 0.3rem !important;
          }
          .student-brand-logo {
            height: 25px !important;
          }
          .student-brand-name {
            font-size: 0.98rem !important;
          }
        }

        @media (max-width: 360px) {
          .student-header-inner {
            padding: 0.35rem 0.35rem !important;
            gap: 0.25rem !important;
          }
          .student-left-group {
            gap: 0.25rem !important;
          }
          .student-right-group {
            gap: 0.25rem !important;
          }
          .student-brand-logo {
            height: 22px !important;
          }
          .student-brand-name {
            font-size: 0.9rem !important;
          }
          .student-mobile-menu-btn {
            width: 32px !important;
            height: 32px !important;
          }
          .student-action-btn {
            width: 32px !important;
            height: 32px !important;
          }
        }
      `}</style>
    </div>
  );
};

export default StudentLayout;
