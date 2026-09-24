import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  ShieldCheck,
  Users,
  Store,
  Building2,
  Truck,
  ShoppingBag,
  CreditCard,
  Boxes,
  TrendingUp,
  Printer,
  Tag,
  MapPin,
  FileText,
  Bell,
  User as UserIcon,
  Crown,
  Activity,
} from 'lucide-react';
import Sidebar from '../components/navigation/Sidebar';
import Navbar from '../components/navigation/Navbar';
import Badge from '../components/common/Badge';

const PlatformOwnerLayout = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarItems = [
    { label: 'Executive Dashboard', path: '/platform-owner/dashboard', icon: LayoutDashboard },
    { label: 'Admin Management', path: '/platform-owner/admins', icon: ShieldCheck, badge: 'Apex', badgeColor: '#6366f1' },
    { label: 'Students Oversight', path: '/platform-owner/users', icon: Users },
    { label: 'Shop Owners', path: '/platform-owner/shop-owners', icon: Store },
    { label: 'Stores Network', path: '/platform-owner/shops', icon: Building2 },
    { label: 'Delivery Couriers', path: '/platform-owner/deliveries', icon: Truck },
    { label: 'Orders Stream', path: '/platform-owner/orders', icon: ShoppingBag },
    { label: 'Payments & Ledger', path: '/platform-owner/payments', icon: CreditCard },
    { label: 'Inventory Health', path: '/platform-owner/inventory', icon: Boxes },
    { label: 'Demand Intelligence', path: '/platform-owner/predictions', icon: TrendingUp },
    { label: 'Printing Oversight', path: '/platform-owner/printing', icon: Printer },
    { label: 'Promos & Offers', path: '/platform-owner/offers', icon: Tag },
    { label: 'Campus Locations', path: '/platform-owner/locations', icon: MapPin },
    { label: 'Security & Audit Logs', path: '/platform-owner/audit-logs', icon: FileText },
    { label: 'Alerts & Broadcasts', path: '/platform-owner/notifications', icon: Bell },
    { label: 'Owner Profile', path: '/platform-owner/profile', icon: UserIcon },
  ];

  return (
    <div
      className="app-container dark theme-dark"
      data-theme="dark"
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-main, #0b0f19)',
        color: 'var(--text-primary, #f8fafc)',
      }}
    >
      <Sidebar
        title="Platform Owner"
        subtitle="System Governance"
        badgeText="Apex Level"
        items={sidebarItems}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div
        className="main-content"
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          minWidth: 0,
          backgroundColor: 'var(--bg-main, #0b0f19)',
          color: 'var(--text-primary, #f8fafc)',
        }}
      >
        <Navbar
          title="Platform Owner Control Center"
          subtitle="Highest Authority System Oversight & Campus Governance"
          onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          badge={
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <Badge variant="primary" icon={Crown}>
                Platform Owner
              </Badge>
              <Badge variant="success" icon={Activity}>
                Live Database Synced
              </Badge>
            </div>
          }
        />
        <main className="page-container" style={{ padding: 'clamp(1rem, 2.5vw, 1.75rem)', flex: 1 }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default PlatformOwnerLayout;
