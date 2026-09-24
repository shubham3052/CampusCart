import React, { useState, useEffect } from 'react';
import {
  Users,
  Store,
  Building2,
  Truck,
  ShieldCheck,
  ShoppingBag,
  CreditCard,
  AlertTriangle,
  ArrowUpRight,
  TrendingUp,
  RefreshCw,
  Clock,
  ShieldAlert,
  Bell,
  Sparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      setError(null);
      const data = await platformOwnerService.getDashboardStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load platform owner dashboard statistics:', err);
      setError('Unable to aggregate live platform telemetry. Please verify backend service.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Spinner size="lg" message="Aggregating authentic platform telemetry & database records..." />
      </div>
    );
  }

  const users = stats?.users || {};
  const shops = stats?.shops || {};
  const orders = stats?.orders || {};
  const financials = stats?.financials || {};
  const inventory = stats?.inventory || {};

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Page Header */}
      <PageHeader
        title="Apex Platform Command"
        subtitle="Real-time operational metrics across campus commerce, logistics, and administrators"
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              leftIcon={RefreshCw}
              isLoading={refreshing}
              onClick={() => fetchStats(true)}
            >
              Refresh Telemetry
            </Button>
            <Link to="/platform-owner/admins">
              <Button variant="primary" size="sm" leftIcon={ShieldCheck}>
                Manage Admins
              </Button>
            </Link>
          </div>
        }
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* High-Level Executive KPI Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
        }}
      >
        <StatCard
          title="Total Users"
          value={users.total || 0}
          icon={Users}
          description={`${users.students || 0} Students · ${users.shop_owners || 0} Merchants`}
          trend={`${users.active || 0} Active`}
          trendDirection="up"
          color="primary"
        />

        <StatCard
          title="Campus Stores"
          value={`${shops.active || 0} / ${shops.total || 0}`}
          icon={Building2}
          description={`${shops.inactive || 0} Inactive · ${Object.keys(shops.by_type || {}).length} Categories`}
          trend="Store Network"
          color="secondary"
        />

        <StatCard
          title="Campus Couriers"
          value={users.delivery_agents || 0}
          icon={Truck}
          description="Designated campus delivery partners"
          trend="Doorstep Logistics"
          color="accent-purple"
        />

        <StatCard
          title="System Administrators"
          value={users.admins || 0}
          icon={ShieldCheck}
          description={`${users.platform_owners || 1} Platform Owner(s)`}
          trend="Apex Governed"
          color="warning"
        />

        <StatCard
          title="Total Platform Orders"
          value={orders.total || 0}
          icon={ShoppingBag}
          description={`${orders.pending || 0} Pending · ${orders.preparing || 0} In Progress`}
          trend={`${orders.completed || 0} Completed`}
          trendDirection="up"
          color="success"
        />

        <StatCard
          title="Gross Captured Volume"
          value={`₹${(financials.gross_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          icon={CreditCard}
          description={`${financials.successful_payments_count || 0} Paid · ${financials.refunds_count || 0} Refunds`}
          trend="Financial Ledger"
          color="primary"
        />

        <StatCard
          title="Low-Stock Alerts"
          value={inventory.low_stock_count || 0}
          icon={AlertTriangle}
          description={`${inventory.shops_with_low_stock || 0} stores affected · ${inventory.out_of_stock_count || 0} stockouts`}
          trend={inventory.low_stock_count > 0 ? 'Action Needed' : 'Inventory Healthy'}
          trendDirection={inventory.low_stock_count > 0 ? 'down' : 'up'}
          color={inventory.low_stock_count > 0 ? 'danger' : 'success'}
        />

        <StatCard
          title="Active Platform Health"
          value="100%"
          icon={TrendingUp}
          description="All microservices & MySQL running"
          trend="Healthy"
          color="success"
        />
      </div>

      {/* Two Column Layout: Orders & Low Stock */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Recent Orders Table */}
        <Card
          title="Recent Campus Orders"
          subtitle="Real-time order feed across all campus shops"
          actions={
            <Link
              to="/platform-owner/orders"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}
            >
              View All Orders →
            </Link>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recent_orders?.length > 0 ? (
                  stats.recent_orders.map((ord) => (
                    <tr key={ord.id}>
                      <td style={{ fontWeight: 600 }}>{String(ord.order_number).slice(0, 8)}...</td>
                      <td>{ord.customer_name || 'Student'}</td>
                      <td>{ord.shop_name}</td>
                      <td style={{ fontWeight: 600 }}>₹{ord.total_amount}</td>
                      <td>
                        <Badge
                          variant={
                            ord.status === 'COMPLETED'
                              ? 'success'
                              : ord.status === 'CANCELLED'
                              ? 'danger'
                              : 'primary'
                          }
                        >
                          {ord.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      No orders placed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Recent Registered Users */}
        <Card
          title="Recent Account Registrations"
          subtitle="Newly onboarded campus students and partners"
          actions={
            <Link
              to="/platform-owner/users"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}
            >
              User Directory →
            </Link>
          }
        >
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recent_users?.length > 0 ? (
                  stats.recent_users.map((usr) => (
                    <tr key={usr.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{usr.name || usr.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{usr.email}</div>
                      </td>
                      <td>
                        <Badge
                          variant={
                            usr.role === 'PLATFORM_OWNER'
                              ? 'primary'
                              : usr.role === 'ADMIN'
                              ? 'warning'
                              : usr.role === 'SHOP_OWNER'
                              ? 'secondary'
                              : 'info'
                          }
                        >
                          {usr.role}
                        </Badge>
                      </td>
                      <td>
                        <Badge variant={usr.is_active ? 'success' : 'danger'}>
                          {usr.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(usr.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                      No users registered.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Security Audit & Stores Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* Recent Stores */}
        <Card
          title="Campus Stores Directory"
          subtitle="Affiliated stationary and print centers"
          actions={
            <Link
              to="/platform-owner/shops"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}
            >
              Manage Shops →
            </Link>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {stats?.recent_shops?.length > 0 ? (
              stats.recent_shops.map((shp) => (
                <div
                  key={shp.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    backgroundColor: 'var(--bg-surface-secondary)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{shp.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {shp.campus_location} · Owner: {shp.owner_name}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Badge variant={shp.is_active ? 'success' : 'danger'}>
                      {shp.is_active ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                No shops registered.
              </div>
            )}
          </div>
        </Card>

        {/* Security Audit Log Activity */}
        <Card
          title="Security & System Audit Log"
          subtitle="Real-time access events, state transitions, and administrative actions"
          actions={
            <Link
              to="/platform-owner/audit-logs"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 600, textDecoration: 'none' }}
            >
              Full Audit Trail →
            </Link>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {stats?.recent_audit_logs?.length > 0 ? (
              stats.recent_audit_logs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--primary-500)',
                    backgroundColor: 'var(--bg-surface-secondary)',
                    fontSize: '0.8rem',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{log.action}</span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                      by {log.actor_email || 'SYSTEM'}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                No audit events recorded yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default PlatformOwnerDashboard;
