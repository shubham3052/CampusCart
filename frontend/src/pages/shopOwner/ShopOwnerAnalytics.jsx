import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  TrendingUp,
  ShoppingBag,
  IndianRupee,
  Users,
  Printer,
  Truck,
  Boxes,
  BrainCircuit,
  Calendar,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Package,
  Layers,
  Percent,
  RotateCcw,
  CheckCircle2,
  XCircle,
  BarChart3,
  Activity,
  Award,
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
import DataTable from '../../components/common/DataTable';

// Register Chart.js components
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

const ShopOwnerAnalytics = () => {
  const [filterParams, setFilterParams] = useState({ preset: '30d' });
  const [activeTab, setActiveTab] = useState('sales');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [overviewData, setOverviewData] = useState(null);
  const [productsData, setProductsData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [demandData, setDemandData] = useState(null);
  const [printingData, setPrintingData] = useState(null);
  const [deliveryData, setDeliveryData] = useState(null);
  const [customersData, setCustomersData] = useState(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ov, prod, inv, dem, prt, del, cust] = await Promise.all([
        analyticsService.getShopOverview(filterParams),
        analyticsService.getShopProducts(filterParams),
        analyticsService.getShopInventory(filterParams),
        analyticsService.getShopDemand(),
        analyticsService.getShopPrinting(filterParams),
        analyticsService.getShopDelivery(filterParams),
        analyticsService.getShopCustomers(filterParams),
      ]);
      setOverviewData(ov);
      setProductsData(prod);
      setInventoryData(inv);
      setDemandData(dem);
      setPrintingData(prt);
      setDeliveryData(del);
      setCustomersData(cust);
    } catch (err) {
      console.error('Failed to load shop analytics:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load analytics records.');
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const kpis = overviewData?.kpis || {};
  const salesSeries = overviewData?.sales_series || [];
  const orderAnalytics = overviewData?.order_analytics || {};

  // Sales trend line chart
  const salesChartData = useMemo(() => {
    if (!salesSeries.length) return null;
    return {
      labels: salesSeries.map((s) => s.date.slice(5)), // MM-DD
      datasets: [
        {
          label: 'Net Revenue (₹)',
          data: salesSeries.map((s) => s.net_sales),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.12)',
          fill: true,
          tension: 0.3,
          pointRadius: salesSeries.length > 31 ? 0 : 3,
        },
        {
          label: 'Gross Sales (₹)',
          data: salesSeries.map((s) => s.gross_sales),
          borderColor: '#94a3b8',
          borderDash: [4, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    };
  }, [salesSeries]);

  // Orders volume chart
  const ordersChartData = useMemo(() => {
    if (!salesSeries.length) return null;
    return {
      labels: salesSeries.map((s) => s.date.slice(5)),
      datasets: [
        {
          label: 'Orders Count',
          data: salesSeries.map((s) => s.orders),
          backgroundColor: '#06b6d4',
          borderRadius: 4,
        },
      ],
    };
  }, [salesSeries]);

  // Order status distribution doughnut
  const statusDoughnutData = useMemo(() => {
    const dist = orderAnalytics.distribution || [];
    const filtered = dist.filter((d) => d.count > 0);
    if (!filtered.length) return null;
    return {
      labels: filtered.map((d) => d.label),
      datasets: [
        {
          data: filtered.map((d) => d.count),
          backgroundColor: ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [orderAnalytics]);

  // Top products bar chart
  const topProductsChartData = useMemo(() => {
    const top = productsData?.top_by_revenue || [];
    if (!top.length) return null;
    return {
      labels: top.slice(0, 7).map((p) => (p.product_name.length > 18 ? p.product_name.slice(0, 16) + '...' : p.product_name)),
      datasets: [
        {
          label: 'Revenue (₹)',
          data: top.slice(0, 7).map((p) => p.revenue),
          backgroundColor: '#4f46e5',
          borderRadius: 6,
        },
      ],
    };
  }, [productsData]);

  // Category sales bar chart
  const categoryChartData = useMemo(() => {
    const cats = productsData?.categories || [];
    if (!cats.length) return null;
    return {
      labels: cats.map((c) => c.category),
      datasets: [
        {
          label: 'Category Revenue (₹)',
          data: cats.map((c) => c.revenue),
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'],
          borderRadius: 6,
        },
      ],
    };
  }, [productsData]);

  // Inventory health doughnut
  const inventoryDoughnutData = useMemo(() => {
    const h = inventoryData?.health || {};
    if (!h.total_products) return null;
    return {
      labels: ['In Stock', 'Low Stock', 'Out of Stock', 'Overstocked'],
      datasets: [
        {
          data: [h.in_stock_count, h.low_stock_count, h.out_of_stock_count, h.overstocked_count],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [inventoryData]);

  // Demand forecast dual-series
  const demandComparisonChartData = useMemo(() => {
    const comp = demandData?.demand_predictions?.historical_comparison || [];
    if (!comp.length) return null;
    return {
      labels: comp.map((c) => `${c.date.slice(5)} (${c.product_name.slice(0, 10)})`),
      datasets: [
        {
          label: 'Actual Sold',
          data: comp.map((c) => c.actual),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          tension: 0.2,
        },
        {
          label: 'ML Predicted',
          data: comp.map((c) => c.predicted),
          borderColor: '#6366f1',
          borderDash: [5, 5],
          tension: 0.2,
        },
      ],
    };
  }, [demandData]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      <PageHeader
        title="Analytics & Business Intelligence"
        subtitle="Real-time revenue metrics, product velocity, inventory health, and demand predictions"
      />

      {/* Date Range Filter Bar */}
      <DateRangeFilter
        activePreset={filterParams.preset}
        onFilterChange={(newFilters) => setFilterParams(newFilters)}
        onRefresh={loadAnalytics}
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
          <Button size="sm" variant="outline" onClick={loadAnalytics}>
            Retry
          </Button>
        </div>
      )}

      {/* Top KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <StatCard
          title="Today's Sales"
          value={`₹${parseFloat(kpis.today_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtitle={`${kpis.today_orders || 0} orders today`}
          icon={IndianRupee}
          color="primary"
        />
        <StatCard
          title="Net Revenue"
          value={`₹${parseFloat(kpis.net_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtitle={`Gross: ₹${parseFloat(kpis.gross_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="success"
        />
        <StatCard
          title="Valid Orders"
          value={kpis.completed_orders + kpis.pending_orders || 0}
          subtitle={`AOV: ₹${parseFloat(kpis.average_order_value || 0).toFixed(2)}`}
          icon={ShoppingBag}
          color="info"
        />
        <StatCard
          title="Unique Customers"
          value={kpis.unique_customers || 0}
          subtitle={`${kpis.returning_customers || 0} returning`}
          icon={Users}
          color="warning"
        />
      </div>

      {/* Secondary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ padding: '0.85rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Printing Revenue</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#4f46e5', marginTop: '0.25rem' }}>
            ₹{parseFloat(kpis.printing_revenue || 0).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Delivery Revenue</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#06b6d4', marginTop: '0.25rem' }}>
            ₹{parseFloat(kpis.delivery_revenue || 0).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Bulk Order Revenue</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981', marginTop: '0.25rem' }}>
            ₹{parseFloat(kpis.bulk_order_revenue || 0).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Discounts Applied</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#f59e0b', marginTop: '0.25rem' }}>
            ₹{parseFloat(kpis.discount_amount || 0).toFixed(2)}
          </div>
        </div>
        <div style={{ padding: '0.85rem 1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Refunds Settled</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444', marginTop: '0.25rem' }}>
            ₹{parseFloat(kpis.refund_amount || 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #e2e8f0',
          gap: '1.5rem',
          marginBottom: '1.5rem',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'sales', label: 'Sales & Orders', icon: TrendingUp },
          { key: 'products', label: 'Products & Velocity', icon: Package },
          { key: 'inventory', label: 'Inventory Health', icon: Boxes },
          { key: 'demand', label: 'Demand Forecasting', icon: BrainCircuit },
          { key: 'printing', label: 'Printing & Xerox', icon: Printer },
          { key: 'delivery', label: 'Delivery Logistics', icon: Truck },
          { key: 'customers', label: 'Customers & Retention', icon: Users },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 0.25rem',
                border: 'none',
                background: 'none',
                borderBottom: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                color: isActive ? '#4f46e5' : '#64748b',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.925rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={18} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Sales & Orders */}
      {activeTab === 'sales' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <Card title="Sales & Net Revenue Trend">
              <div style={{ height: '320px', padding: '0.5rem' }}>
                {salesChartData ? (
                  <Line
                    data={salesChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: {
                        legend: { position: 'top' },
                        tooltip: { callbacks: { label: (ctx) => ` ₹${ctx.raw.toFixed(2)}` } },
                      },
                    }}
                  />
                ) : (
                  <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                    No sales data available for this period.
                  </div>
                )}
              </div>
            </Card>

            <Card title="Order Status Distribution">
              <div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
                {statusDoughnutData ? (
                  <Doughnut data={statusDoughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
                ) : (
                  <div style={{ textAlign: 'center', color: '#94a3b8' }}>No order status records found.</div>
                )}
              </div>
            </Card>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            <Card title="Fulfillment Performance Ratios">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Completion Rate</span>
                    <span style={{ fontWeight: 700, color: '#10b981' }}>{orderAnalytics.completion_rate || 0}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, orderAnalytics.completion_rate || 0)}%`, height: '100%', background: '#10b981' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Cancellation Rate</span>
                    <span style={{ fontWeight: 700, color: '#ef4444' }}>{orderAnalytics.cancellation_rate || 0}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, orderAnalytics.cancellation_rate || 0)}%`, height: '100%', background: '#ef4444' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600 }}>Refund Rate</span>
                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>{orderAnalytics.refund_rate || 0}%</span>
                  </div>
                  <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, orderAnalytics.refund_rate || 0)}%`, height: '100%', background: '#f59e0b' }} />
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Daily Orders Volume">
              <div style={{ height: '220px', padding: '0.5rem' }}>
                {ordersChartData ? (
                  <Bar data={ordersChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No daily order volume.</div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 2: Products & Velocity */}
      {activeTab === 'products' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <Card title="Top Selling Products by Revenue">
              <div style={{ height: '280px', padding: '0.5rem' }}>
                {topProductsChartData ? (
                  <Bar data={topProductsChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No product sales recorded.</div>
                )}
              </div>
            </Card>

            <Card title="Category Revenue Performance">
              <div style={{ height: '280px', padding: '0.5rem' }}>
                {categoryChartData ? (
                  <Bar data={categoryChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No category data available.</div>
                )}
              </div>
            </Card>
          </div>

          <Card title="Product Velocity & Stock Cover Matrix">
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.75rem' }}>Product</th>
                    <th style={{ padding: '0.75rem' }}>Category</th>
                    <th style={{ padding: '0.75rem' }}>Units Sold</th>
                    <th style={{ padding: '0.75rem' }}>Revenue</th>
                    <th style={{ padding: '0.75rem' }}>Current Stock</th>
                    <th style={{ padding: '0.75rem' }}>Velocity Status</th>
                    <th style={{ padding: '0.75rem' }}>Days of Cover</th>
                  </tr>
                </thead>
                <tbody>
                  {(productsData?.performance_matrix || []).map((p) => {
                    const badgeVariant =
                      p.velocity_class === 'FAST_MOVING'
                        ? 'success'
                        : p.velocity_class === 'NORMAL'
                        ? 'primary'
                        : p.velocity_class === 'SLOW_MOVING'
                        ? 'warning'
                        : 'danger';

                    return (
                      <tr key={p.product_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600 }}>{p.product_name}</td>
                        <td style={{ padding: '0.75rem', color: '#64748b' }}>{p.category}</td>
                        <td style={{ padding: '0.75rem', fontWeight: 700 }}>{p.units_sold}</td>
                        <td style={{ padding: '0.75rem' }}>₹{p.revenue.toFixed(2)}</td>
                        <td style={{ padding: '0.75rem' }}>{p.current_stock}</td>
                        <td style={{ padding: '0.75rem' }}>
                          <Badge variant={badgeVariant}>{p.velocity_class.replace('_', ' ')}</Badge>
                        </td>
                        <td style={{ padding: '0.75rem' }}>
                          {p.days_of_cover !== null ? `${p.days_of_cover} days` : 'N/A'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 3: Inventory Health */}
      {activeTab === 'inventory' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
          <Card title="Stock Health Distribution">
            <div style={{ height: '280px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {inventoryDoughnutData ? (
                <Doughnut data={inventoryDoughnutData} options={{ responsive: true, maintainAspectRatio: false }} />
              ) : (
                <div style={{ color: '#94a3b8' }}>No inventory records.</div>
              )}
            </div>
            <div style={{ marginTop: '1.5rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Inventory Valuation</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>
                  ₹{(inventoryData?.health?.inventory_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '8px' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Turnover Ratio</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4f46e5' }}>
                  {inventoryData?.health?.turnover_ratio || 0}x / yr
                </div>
              </div>
            </div>
          </Card>

          <Card title="Stock Movement Summary">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', padding: '0.5rem' }}>
              <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <div style={{ fontSize: '0.75rem', color: '#1e40af', fontWeight: 600 }}>Restocked Units</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#1e3a8a', marginTop: '0.25rem' }}>
                  {inventoryData?.movements?.summary?.restocked || 0}
                </div>
              </div>
              <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>Sales Deducted</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#14532d', marginTop: '0.25rem' }}>
                  {inventoryData?.movements?.summary?.sales_deducted || 0}
                </div>
              </div>
              <div style={{ padding: '1rem', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a' }}>
                <div style={{ fontSize: '0.75rem', color: '#a16207', fontWeight: 600 }}>Returns Restocked</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#713f12', marginTop: '0.25rem' }}>
                  {inventoryData?.movements?.summary?.returns_added || 0}
                </div>
              </div>
              <div style={{ padding: '1rem', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <div style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>Damaged Discarded</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#7f1d1d', marginTop: '0.25rem' }}>
                  {inventoryData?.movements?.summary?.damaged_discarded || 0}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1.5rem', padding: '0.5rem', color: '#64748b', fontSize: '0.875rem' }}>
              All inventory transactions are recorded in the immutable audit log with cryptographic delta tracking.
            </div>
          </Card>
        </div>
      )}

      {/* Tab 4: Demand Forecasting */}
      {activeTab === 'demand' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Evaluation Observations</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5' }}>
                {demandData?.demand_predictions?.evaluation_count || 0}
              </div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Mean Absolute Error (MAE)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                {demandData?.demand_predictions?.mae !== null ? demandData.demand_predictions.mae : 'N/A'}
              </div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Root Mean Squared Error</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>
                {demandData?.demand_predictions?.rmse !== null ? demandData.demand_predictions.rmse : 'N/A'}
              </div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Mean Absolute Pct Error</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>
                {demandData?.demand_predictions?.mape !== null ? `${demandData.demand_predictions.mape}%` : 'N/A'}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <Card title="Historical Predicted vs Actual Demand">
              <div style={{ height: '300px', padding: '0.5rem' }}>
                {demandComparisonChartData ? (
                  <Line data={demandComparisonChartData} options={{ responsive: true, maintainAspectRatio: false }} />
                ) : (
                  <div style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>
                    Insufficient historical forecast records to compute evaluation curve.
                  </div>
                )}
              </div>
            </Card>

            <Card title="Demand Spike Warnings">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {(demandData?.demand_predictions?.detected_spikes || []).length > 0 ? (
                  demandData.demand_predictions.detected_spikes.map((s, idx) => (
                    <div key={idx} style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '8px', border: '1px solid #fecaca' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#b91c1c' }}>{s.product_name}</span>
                        <Badge variant="danger">{s.priority}</Badge>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginTop: '0.25rem' }}>
                        {s.reason || 'Anticipated exam demand surge exceeding current stock.'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
                    No active demand spikes detected.
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Tab 5: Printing & Xerox */}
      {activeTab === 'printing' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          <Card title="Xerox Volume & Output">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Total Print Orders</span>
                <span style={{ fontWeight: 700 }}>{printingData?.total_print_orders || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Total Pages Printed</span>
                <span style={{ fontWeight: 700 }}>{printingData?.pages_printed || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Duplicate Copies</span>
                <span style={{ fontWeight: 700 }}>{printingData?.copies_printed || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Average Turnaround</span>
                <span style={{ fontWeight: 700 }}>
                  {printingData?.average_turnaround_mins ? `${printingData.average_turnaround_mins} mins` : 'N/A'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Spiral / Book Binding Jobs</span>
                <span style={{ fontWeight: 700 }}>{printingData?.binding_orders_count || 0}</span>
              </div>
            </div>
          </Card>

          <Card title="Color Mode Breakdown">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Black & White Pages</span>
                <span style={{ fontWeight: 700 }}>{printingData?.color_distribution?.BW || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Full Color Pages</span>
                <span style={{ fontWeight: 700 }}>{printingData?.color_distribution?.COLOR || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Mixed Pages</span>
                <span style={{ fontWeight: 700 }}>{printingData?.color_distribution?.MIXED || 0}</span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 6: Delivery Logistics */}
      {activeTab === 'delivery' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Total Deliveries</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a' }}>{deliveryData?.total_deliveries || 0}</div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Success Rate</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#10b981' }}>{deliveryData?.success_rate || 0}%</div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Average Courier Duration</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#4f46e5' }}>
                {deliveryData?.average_duration_mins ? `${deliveryData.average_duration_mins} mins` : 'N/A'}
              </div>
            </div>
            <div style={{ padding: '1rem', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Failed Attempts</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444' }}>{deliveryData?.failed_count || 0}</div>
            </div>
          </div>

          <Card title="Assigned Courier Performance">
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '0.75rem' }}>Courier Name</th>
                    <th style={{ padding: '0.75rem' }}>Assigned</th>
                    <th style={{ padding: '0.75rem' }}>Delivered</th>
                    <th style={{ padding: '0.75rem' }}>Failed</th>
                    <th style={{ padding: '0.75rem' }}>Success Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {(deliveryData?.couriers || []).map((c) => (
                    <tr key={c.courier_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '0.75rem' }}>{c.total_assigned}</td>
                      <td style={{ padding: '0.75rem', color: '#10b981', fontWeight: 700 }}>{c.delivered}</td>
                      <td style={{ padding: '0.75rem', color: '#ef4444' }}>{c.failed}</td>
                      <td style={{ padding: '0.75rem', fontWeight: 700 }}>{c.success_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Tab 7: Customers & Retention */}
      {activeTab === 'customers' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          <Card title="Customer Cohort Breakdown">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Unique Purchasing Students</span>
                <span style={{ fontWeight: 700 }}>{customersData?.unique_customers || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>New Students (1st Order)</span>
                <span style={{ fontWeight: 700, color: '#10b981' }}>{customersData?.new_customers || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Returning Students</span>
                <span style={{ fontWeight: 700, color: '#4f46e5' }}>{customersData?.returning_customers || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Frequent Buyers (3+ orders)</span>
                <span style={{ fontWeight: 700, color: '#f59e0b' }}>{customersData?.frequent_customers || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Repeat Customer Rate</span>
                <span style={{ fontWeight: 800, color: '#10b981' }}>{customersData?.repeat_customer_percentage || 0}%</span>
              </div>
            </div>
          </Card>

          <Card title="Spending & Frequency">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Average Student Spend</span>
                <span style={{ fontWeight: 700 }}>₹{customersData?.average_customer_spend || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>Orders per Student</span>
                <span style={{ fontWeight: 700 }}>{customersData?.average_orders_per_customer || 0}</span>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerAnalytics;
