import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingBag,
  PackageCheck,
  Boxes,
  Printer,
  Clock,
  Truck,
  Users,
  BarChart3,
  TrendingUp,
  BrainCircuit,
  Bell,
  Settings,
  Store,
  CheckCircle2,
  Tag,
  Star,
  Percent,
  MapPin,
  User,
} from 'lucide-react';
import Sidebar from '../components/navigation/Sidebar';
import Navbar from '../components/navigation/Navbar';
import Badge from '../components/common/Badge';

const ShopOwnerLayout = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarItems = [
    { label: 'Dashboard', path: '/shop-owner/dashboard', icon: LayoutDashboard },
    { label: 'Orders', path: '/shop-owner/orders', icon: ShoppingBag, badge: '5' },
    { label: 'Bulk Pricing', path: '/shop-owner/bulk-pricing', icon: Tag },
    { label: 'Store Offers', path: '/shop-owner/offers', icon: Percent },
    { label: 'Reviews', path: '/shop-owner/reviews', icon: Star },
    { label: 'Products', path: '/shop-owner/products', icon: PackageCheck },
    { label: 'Inventory', path: '/shop-owner/inventory', icon: Boxes, badge: 'Low', badgeColor: '#f59e0b' },
    { label: 'Printing Queue', path: '/shop-owner/printing', icon: Printer, badge: '3' },
    { label: 'Pickup Slots', path: '/shop-owner/pickup-slots', icon: Clock },
    { label: 'Delivery', path: '/shop-owner/delivery', icon: Truck },
    { label: 'Customers', path: '/shop-owner/customers', icon: Users },
    { label: 'Payments & Revenue', path: '/shop-owner/payments', icon: BarChart3 },
    { label: 'Analytics & BI', path: '/shop-owner/analytics', icon: TrendingUp },
    { label: 'Demand Prediction', path: '/shop-owner/demand-prediction', icon: TrendingUp },
    { label: 'Purchase Advisor', path: '/shop-owner/purchase-advisor', icon: BrainCircuit },
    { label: 'Notifications', path: '/shop-owner/notifications', icon: Bell },
    { label: 'Shop Location', path: '/shop-owner/location', icon: MapPin },
    { label: 'Profile & Account', path: '/shop-owner/profile', icon: User },
    { label: 'Settings', path: '/shop-owner/location', icon: Settings },
  ];

  return (
    <div className="app-container">
      <Sidebar
        title="Campus Print & Stationery"
        subtitle="Shop Owner Portal"
        badgeText="Merchant"
        items={sidebarItems}
        isOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
      />
      <div className="main-content">
        <Navbar
          title="Merchant Dashboard"
          subtitle="Real-time sales, live orders & queue management"
          onToggleSidebar={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          badge={
            <Badge variant={isOpen ? 'success' : 'neutral'} icon={CheckCircle2}>
              {isOpen ? 'Store Open' : 'Store Closed'}
            </Badge>
          }
          actions={
            <button
              onClick={() => setIsOpen(!isOpen)}
              style={{
                background: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
              title={`Store is currently ${isOpen ? 'Open' : 'Closed'}. Click to toggle.`}
            >
              <span className="desktop-sidebar-only">Toggle Status </span>
              ({isOpen ? 'Close' : 'Open'})
            </button>
          }
        />
        <div className="page-container">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default ShopOwnerLayout;
