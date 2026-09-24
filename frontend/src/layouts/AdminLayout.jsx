import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Activity,
  LayoutDashboard,
  Users,
  Store,
  Building2,
  Package,
  Layers,
  ShoppingBag,
  Printer,
  Truck,
  AlertTriangle,
  Star,
  Bell,
  Calendar,
  Sparkles,
  FileText,
  ShieldCheck,
  Tag,
  TrendingUp,
  FileSpreadsheet,
  User,
} from 'lucide-react';
import Sidebar from '../components/navigation/Sidebar';
import Navbar from '../components/navigation/Navbar';
import Badge from '../components/common/Badge';

const AdminLayout = () => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarItems = [
    { label: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Admin Management', path: '/admin/management', icon: ShieldCheck, badge: 'RBAC', badgeColor: '#6366f1' },
    { label: 'Users', path: '/admin/users', icon: Users },
    { label: 'Shop Owners', path: '/admin/shop-owners', icon: Store },
    { label: 'Shops', path: '/admin/shops', icon: Building2 },
    { label: 'Products', path: '/admin/products', icon: Package },
    { label: 'Categories', path: '/admin/categories', icon: Layers },
    { label: 'Orders', path: '/admin/orders', icon: ShoppingBag },
    { label: 'Printing Services', path: '/admin/printing', icon: Printer },
    { label: 'Deliveries', path: '/admin/deliveries', icon: Truck },
    { label: 'Complaints', path: '/admin/complaints', icon: AlertTriangle, badge: '2', badgeColor: '#ef4444' },
    { label: 'Reviews', path: '/admin/reviews', icon: Star },
    { label: 'Offers & Coupons', path: '/admin/offers', icon: Tag },
    { label: 'Notifications', path: '/admin/notifications', icon: Bell },
    { label: 'Academic Calendar', path: '/admin/academic-calendar', icon: Calendar },
    { label: 'Recommendations', path: '/admin/recommendations', icon: Sparkles },
    { label: 'Payments & Ledger', path: '/admin/payments', icon: FileText },
    { label: 'Analytics & BI', path: '/admin/analytics', icon: TrendingUp },
    { label: 'Reports', path: '/admin/reports', icon: FileSpreadsheet },
    { label: 'Admin Profile', path: '/admin/profile', icon: User },
  ];

  return (
    <div className="app-container">
      <Sidebar
        title="Admin Control"
        subtitle="System Management"
        badgeText="SuperAdmin"
        items={sidebarItems}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="main-content">
        <Navbar
          title="Platform Administration"
          subtitle="System oversight, users, orders and intelligence engine"
          onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          badge={
            <Badge variant="success" icon={Activity}>
              Django API Online
            </Badge>
          }
        />
        <div className="page-container">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default AdminLayout;
