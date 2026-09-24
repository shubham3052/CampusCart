import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  IndianRupee,
  Users,
  Store,
  Printer,
  Truck,
  RotateCcw,
  Building2,
  Calendar,
  AlertCircle,
  BarChart3,
  Award,
  Layers,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

import analyticsService from '../../services/analyticsService';
import DateRangeFilter from '../../components/analytics/DateRangeFilter';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const AdminAnalytics = () => {
  const [filterParams, setFilterParams] = useState({ preset: '30d' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [adminData, setAdminData] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await analyticsService.getAdminOverview(filterParams);
      setAdminData(data);
    } catch (err) {
      console.error('Failed to load platform analytics:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load platform analytics.');
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const kpis = adminData?.platform_kpis || {};
  const streams = adminData?.revenue_streams || {};
  const userGrowth = adminData?.user_growth_trend || [];
  const shopComparison = adminData?.shop_comparison || [];

  // Revenue streams doughnut chart
  const revenueStreamsChartData = useMemo(() => {
    const values = [streams.stationery || 0, streams.printing || 0, streams.delivery || 0, streams.bulk_orders || 0];
    if (values.every((v) => v === 0)) return null;
    return {
      labels: ['Stationery Catalog', 'Document Printing', 'Campus Delivery', 'Bulk Orders'],
      datasets: [
        {
          data: values,
          backgroundColor: ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [streams]);

  // User growth line chart
  const userGrowthChartData = useMemo(() => {
    if (!userGrowth.length) return null;
    return {
      labels: userGrowth.map((u) => u.date.slice(5)),
      datasets: [
        {
          label: 'New Registrations',
          data: userGrowth.map((u) => u.new_users),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: userGrowth.length > 31 ? 0 : 3,
        },
      ],
    };
  }, [userGrowth]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Platform Business Intelligence"
        subtitle="Ecosystem revenue breakdown, merchant performance comparison, and campus growth"
      />

      <DateRangeFilter
        activePreset={filterParams.preset}
        onFilterChange={(newFilters) => setFilterParams(newFilters)}
        onRefresh={loadData}
        loading={loading}
      />

      {error && (
        <div
          style={{
            padding: '1rem',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '10px',
            color: '#b91c1c',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
          <Button size="sm" variant="outline" onClick={loadData}>
            Retry
          </Button>
        </div>
      )}

      {/* Platform KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          title="Platform Net Revenue"
          value={`₹${parseFloat(kpis.net_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtitle={`Gross: ₹${parseFloat(kpis.gross_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          icon={IndianRupee}
          color="success"
        />
        <StatCard
          title="Total Campus Orders"
          value={kpis.total_orders || 0}
          subtitle={`${kpis.completed_orders || 0} completed`}
          icon={ShoppingBag}
          color="primary"
        />
        <StatCard
          title="Registered Students & Users"
          value={kpis.total_users || 0}
          subtitle={`${kpis.verified_users || 0} verified accounts`}
          icon={Users}
          color="info"
        />
        <StatCard
          title="Active Partner Shops"
          value={kpis.active_shops || 0}
          subtitle={`${kpis.total_shops || 0} total enrolled`}
          icon={Store}
          color="warning"
        />
      </div>

      {/* Revenue Streams & User Growth */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <Card title="Revenue Stream Attribution">
          <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {revenueStreamsChartData ? (
              <Doughnut data={revenueStreamsChartData} options={{ responsive: true, maintainAspectRatio: false }} />
            ) : (
              <div style={{ color: '#94a3b8' }}>No revenue records.</div>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.8125rem' }}>
            <div>Printing: ₹{(streams.printing || 0).toFixed(2)}</div>
            <div>Delivery: ₹{(streams.delivery || 0).toFixed(2)}</div>
            <div>Bulk Orders: ₹{(streams.bulk_orders || 0).toFixed(2)}</div>
            <div>Stationery: ₹{(streams.stationery || 0).toFixed(2)}</div>
          </div>
        </Card>

        <Card title="Campus User Registration Growth">
          <div style={{ height: '320px', padding: '0.5rem' }}>
            {userGrowthChartData ? (
              <Line data={userGrowthChartData} options={{ responsive: true, maintainAspectRatio: false }} />
            ) : (
              <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No user growth data.</div>
            )}
          </div>
        </Card>
      </div>

      {/* Multi-Shop Performance Comparison */}
      <Card title="Merchant Performance Comparison">
        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                <th style={{ padding: '0.75rem' }}>Shop Name</th>
                <th style={{ padding: '0.75rem' }}>Owner</th>
                <th style={{ padding: '0.75rem' }}>Net Revenue</th>
                <th style={{ padding: '0.75rem' }}>Gross Sales</th>
                <th style={{ padding: '0.75rem' }}>Orders</th>
                <th style={{ padding: '0.75rem' }}>Completed</th>
                <th style={{ padding: '0.75rem' }}>AOV</th>
                <th style={{ padding: '0.75rem' }}>Customers</th>
                <th style={{ padding: '0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shopComparison.map((s) => (
                <tr key={s.shop_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{s.shop_name}</td>
                  <td style={{ padding: '0.75rem', color: '#64748b' }}>{s.owner_name}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 700, color: '#10b981' }}>
                    ₹{s.net_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: '0.75rem' }}>₹{s.gross_revenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{s.total_orders}</td>
                  <td style={{ padding: '0.75rem', color: '#10b981' }}>{s.completed_orders}</td>
                  <td style={{ padding: '0.75rem' }}>₹{s.average_order_value.toFixed(2)}</td>
                  <td style={{ padding: '0.75rem' }}>{s.unique_customers}</td>
                  <td style={{ padding: '0.75rem' }}>
                    <Badge variant={s.is_active ? 'success' : 'danger'}>{s.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default AdminAnalytics;
