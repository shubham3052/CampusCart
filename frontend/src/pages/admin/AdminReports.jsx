import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FileSpreadsheet,
  TrendingUp,
  ShoppingBag,
  Package,
  Layers,
  Store,
  Warehouse,
  Sparkles,
  AlertTriangle,
  Calendar,
  Printer,
  Truck,
  Users,
  CreditCard,
  Users2,
  Star,
  Tag,
  Download,
  RefreshCw,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Clock,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

import reportService from '../../services/reportService';
import DateRangeFilter from '../../components/analytics/DateRangeFilter';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import DataTable from '../../components/common/DataTable';
import EmptyState from '../../components/common/EmptyState';
import ErrorMessage from '../../components/common/ErrorMessage';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const REPORT_CATEGORIES = [
  { id: 'sales', label: 'Sales Report', icon: TrendingUp, endpoint: 'sales', description: 'Gross sales, discounts, refunds, and net revenue streams' },
  { id: 'orders', label: 'Orders Report', icon: ShoppingBag, endpoint: 'orders', description: 'Platform order ledger with status breakdown and items' },
  { id: 'products', label: 'Products Report', icon: Package, endpoint: 'products', description: 'Product catalog sales performance, stock, and ML demand' },
  { id: 'categories', label: 'Categories Report', icon: Layers, endpoint: 'categories', description: 'Category volume share and inventory distribution' },
  { id: 'shops', label: 'Shops Performance', icon: Store, endpoint: 'shops', description: 'Multi-shop performance rankings, revenue, and order volume' },
  { id: 'inventory', label: 'Inventory Report', icon: Warehouse, endpoint: 'inventory', description: 'Stock levels, valuation, low-stock alerts, and safety stock' },
  { id: 'stock-movements', label: 'Stock Movements', icon: RotateCcw, endpoint: 'stock-movements', description: 'Immutable transaction movement log (sales, restocks, damages)' },
  { id: 'demand-predictions', label: 'Demand Prediction', icon: Sparkles, endpoint: 'demand-predictions', description: 'Machine learning forecasts from regression models & accuracy' },
  { id: 'demand-spikes', label: 'Demand Spikes', icon: AlertTriangle, endpoint: 'demand-spikes', description: 'Unexpected demand surges, critical stockout warnings' },
  { id: 'academic-demand', label: 'Academic Demand', icon: Calendar, endpoint: 'academic-demand', description: 'Demand correlation with university academic calendar & exams' },
  { id: 'printing', label: 'Printing Report', icon: Printer, endpoint: 'printing', description: 'Document printing queue, xerox volumes, and binding jobs' },
  { id: 'delivery', label: 'Delivery Report', icon: Truck, endpoint: 'delivery', description: 'Campus courier logistics, delivery durations, and ETA accuracy' },
  { id: 'customers', label: 'Customer Cohorts', icon: Users, endpoint: 'customers', description: 'Student acquisition, retention rate, and repeat purchase ratios' },
  { id: 'payments', label: 'Payment & Refunds', icon: CreditCard, endpoint: 'payments', description: 'Payment gateway transactions, collection modes, and refunds' },
  { id: 'bulk-orders', label: 'Bulk Orders', icon: Users2, endpoint: 'bulk-orders', description: 'Class-wide and project team group bulk ordering volume' },
  { id: 'reviews-complaints', label: 'Reviews & Support', icon: Star, endpoint: 'reviews-complaints', description: 'Student ratings distribution and customer support tickets' },
  { id: 'offers', label: 'Offers & Coupons', icon: Tag, endpoint: 'offers', description: 'Promotional merchant deals and coupon redemption frequency' },
  { id: 'recommendations', label: 'Recommendations', icon: Sparkles, endpoint: 'recommendations', description: 'Recommendation impressions, click-through-rates, and conversions' },
  { id: 'users', label: 'User Directory', icon: Users, endpoint: 'users', description: 'Platform user management and account verification audit' },
];

const AdminReports = () => {
  const [activeCategory, setActiveCategory] = useState('sales');
  const [filterParams, setFilterParams] = useState({ preset: '30d', page: 1, page_size: 25 });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [reportData, setReportData] = useState(null);

  const currentCategory = useMemo(() => {
    return REPORT_CATEGORIES.find((c) => c.id === activeCategory) || REPORT_CATEGORIES[0];
  }, [activeCategory]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...filterParams,
        search: searchQuery || undefined,
      };
      const res = await reportService.getReportData(currentCategory.endpoint, params);
      setReportData(res);
    } catch (err) {
      console.error('Failed to load report:', err);
      setError(err.response?.data?.message || err.message || 'Failed to fetch administrative report data.');
    } finally {
      setLoading(false);
    }
  }, [currentCategory, filterParams, searchQuery]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Handle Export CSV
  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const params = {
        ...filterParams,
        search: searchQuery || undefined,
      };
      await reportService.downloadReportCsv(currentCategory.endpoint, params);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Switch Category
  const handleSelectCategory = (catId) => {
    setActiveCategory(catId);
    setFilterParams((prev) => ({ ...prev, page: 1 }));
    setSearchQuery('');
  };

  const kpis = reportData?.kpis || {};
  const rows = reportData?.data || [];
  const pagination = reportData?.pagination || {};

  // Construct dynamic table columns based on active category
  const tableColumns = useMemo(() => {
    switch (activeCategory) {
      case 'sales':
        return [
          { header: 'Date', accessor: 'date' },
          { header: 'Orders', accessor: 'orders_count' },
          { header: 'Gross Sales', accessor: 'gross_sales', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Discounts', accessor: 'discounts', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Refunds', accessor: 'refunds', render: (v) => `₹${Number(v).toFixed(2)}` },
          {
            header: 'Net Sales',
            accessor: 'net_sales',
            render: (v) => <span style={{ fontWeight: 700, color: 'var(--success-600)' }}>₹{Number(v).toFixed(2)}</span>,
          },
        ];

      case 'orders':
        return [
          { header: 'Order #', accessor: 'order_number' },
          { header: 'Date', accessor: 'created_at' },
          { header: 'Customer', accessor: 'customer' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Type', accessor: 'order_type' },
          { header: 'Total', accessor: 'total_amount', render: (v) => `₹${Number(v).toFixed(2)}` },
          {
            header: 'Order Status',
            accessor: 'order_status',
            render: (v) => {
              const variant = v.toUpperCase().includes('COMPLETED') || v.toUpperCase().includes('DELIVERED') ? 'success' : v.toUpperCase().includes('CANCEL') ? 'danger' : 'warning';
              return <Badge variant={variant}>{v}</Badge>;
            },
          },
          { header: 'Payment', accessor: 'payment_status' },
          { header: 'Fulfillment', accessor: 'fulfillment_type' },
        ];

      case 'products':
        return [
          { header: 'Product Name', accessor: 'name' },
          { header: 'SKU', accessor: 'sku' },
          { header: 'Category', accessor: 'category' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Price', accessor: 'price', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Units Sold', accessor: 'units_sold' },
          { header: 'Revenue', accessor: 'revenue', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Current Stock', accessor: 'current_stock' },
          {
            header: 'Stock Status',
            accessor: 'stock_status',
            render: (v) => {
              const variant = v === 'IN_STOCK' ? 'success' : v === 'LOW_STOCK' ? 'warning' : 'danger';
              return <Badge variant={variant}>{v.replace(/_/g, ' ')}</Badge>;
            },
          },
        ];

      case 'categories':
        return [
          { header: 'Category', accessor: 'name' },
          { header: 'Units Sold', accessor: 'units_sold' },
          { header: 'Orders Count', accessor: 'orders_count' },
          { header: 'Revenue', accessor: 'revenue', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Revenue Share', accessor: 'revenue_share_percentage', render: (v) => `${v}%` },
          { header: 'Current Stock', accessor: 'current_inventory' },
        ];

      case 'shops':
        return [
          { header: 'Rank', accessor: 'rank', render: (v) => <span style={{ fontWeight: 800 }}>#{v}</span> },
          { header: 'Shop Name', accessor: 'name' },
          { header: 'Type', accessor: 'shop_type' },
          { header: 'Orders', accessor: 'orders_count' },
          { header: 'Gross Rev', accessor: 'gross_revenue', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Net Rev', accessor: 'net_revenue', render: (v) => <span style={{ fontWeight: 700, color: 'var(--success-600)' }}>₹${Number(v).toFixed(2)}</span> },
          { header: 'AOV', accessor: 'average_order_value', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Customers', accessor: 'customers_count' },
          { header: 'Rating', accessor: 'rating', render: (v) => `★ ${v}` },
        ];

      case 'inventory':
        return [
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Product', accessor: 'product_name' },
          { header: 'Category', accessor: 'category' },
          { header: 'Stock', accessor: 'current_stock' },
          { header: 'Available', accessor: 'available_stock' },
          { header: 'Min / ROP', accessor: 'minimum_stock', render: (v, r) => `${v} / ${r.reorder_level}` },
          { header: 'Valuation', accessor: 'inventory_value', render: (v) => `₹${Number(v).toFixed(2)}` },
          {
            header: 'Status',
            accessor: 'stock_status',
            render: (v) => {
              const variant = v === 'IN_STOCK' ? 'success' : v === 'LOW_STOCK' ? 'warning' : 'danger';
              return <Badge variant={variant}>{v.replace(/_/g, ' ')}</Badge>;
            },
          },
        ];

      case 'stock-movements':
        return [
          { header: 'Timestamp', accessor: 'date' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Product', accessor: 'product_name' },
          { header: 'Type', accessor: 'transaction_type' },
          {
            header: 'Delta',
            accessor: 'quantity_change',
            render: (v) => (
              <span style={{ fontWeight: 700, color: v > 0 ? 'var(--success-600)' : 'var(--danger-600)' }}>
                {v > 0 ? `+${v}` : v}
              </span>
            ),
          },
          { header: 'Before -> After', accessor: 'stock_before', render: (v, r) => `${v} -> ${r.stock_after}` },
          { header: 'Reference', accessor: 'reference_id' },
          { header: 'Operator', accessor: 'performed_by' },
        ];

      case 'demand-predictions':
        return [
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Product', accessor: 'product_name' },
          { header: 'Target Date', accessor: 'target_date' },
          { header: 'Horizon', accessor: 'forecast_horizon' },
          { header: 'Predicted Demand', accessor: 'predicted_demand', render: (v) => <span style={{ fontWeight: 700, color: 'var(--primary-600)' }}>{v} units</span> },
          { header: 'Actual Demand', accessor: 'actual_demand' },
          { header: 'Confidence', accessor: 'confidence_score' },
          { header: 'Model', accessor: 'model_name' },
        ];

      case 'demand-spikes':
        return [
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Product', accessor: 'product_name' },
          { header: 'Date', accessor: 'date' },
          { header: 'Baseline (7D)', accessor: 'baseline_demand' },
          { header: 'Surge Forecast', accessor: 'predicted_surge' },
          { header: 'Magnitude', accessor: 'spike_magnitude', render: (v) => <span style={{ fontWeight: 700, color: 'var(--danger-600)' }}>{v}</span> },
          { header: 'Urgency', accessor: 'urgency', render: (v) => <Badge variant="danger">{v}</Badge> },
          { header: 'Recommended Reorder', accessor: 'recommended_quantity' },
        ];

      case 'academic-demand':
        return [
          { header: 'Event Title', accessor: 'title' },
          { header: 'Type', accessor: 'event_type' },
          { header: 'Timeline', accessor: 'start_date', render: (v, r) => `${v} to ${r.end_date}` },
          { header: 'Pre-Event Orders (7D)', accessor: 'pre_event_orders' },
          { header: 'During Event Orders', accessor: 'during_event_orders' },
          {
            header: 'Change %',
            accessor: 'observed_change_percentage',
            render: (v) => (
              <span style={{ fontWeight: 700, color: v > 0 ? 'var(--success-600)' : 'var(--text-muted)' }}>
                {v > 0 ? `+${v}%` : `${v}%`}
              </span>
            ),
          },
        ];

      case 'printing':
        return [
          { header: 'Order #', accessor: 'order_number' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Date', accessor: 'date' },
          { header: 'Customer', accessor: 'customer' },
          { header: 'Pages x Copies', accessor: 'pages', render: (v, r) => `${v} pgs × ${r.copies}` },
          { header: 'Mode', accessor: 'color_mode' },
          { header: 'Size', accessor: 'paper_size' },
          { header: 'Binding', accessor: 'binding_type' },
          { header: 'Price', accessor: 'price', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Status', accessor: 'status', render: (v) => <Badge variant="info">{v}</Badge> },
        ];

      case 'delivery':
        return [
          { header: 'Order #', accessor: 'order_number' },
          { header: 'Courier', accessor: 'courier_name' },
          { header: 'Date', accessor: 'date' },
          { header: 'Priority', accessor: 'priority' },
          { header: 'Status', accessor: 'status', render: (v) => <Badge variant="primary">{v}</Badge> },
          { header: 'Est. Delivery', accessor: 'estimated_time' },
          { header: 'Duration', accessor: 'duration_mins', render: (v) => (v !== '—' ? `${v} mins` : '—') },
          { header: 'Attempts', accessor: 'attempt_count' },
        ];

      case 'customers':
        return [
          { header: 'Username', accessor: 'username' },
          { header: 'College ID', accessor: 'college_id' },
          { header: 'Department', accessor: 'department' },
          { header: 'Verified', accessor: 'email_verified', render: (v) => (v ? <Badge variant="success">Yes</Badge> : <Badge variant="warning">No</Badge>) },
          { header: 'Orders in Period', accessor: 'orders_in_period' },
          { header: 'Spend in Period', accessor: 'spend_in_period', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Joined Date', accessor: 'joined_at' },
        ];

      case 'payments':
        return [
          { header: 'Payment ID', accessor: 'id' },
          { header: 'Order #', accessor: 'order_number' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Customer', accessor: 'customer' },
          { header: 'Method', accessor: 'payment_method' },
          { header: 'Amount', accessor: 'amount', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Status', accessor: 'status', render: (v) => <Badge variant={v === 'Paid' || v === 'Captured / Paid' ? 'success' : 'warning'}>{v}</Badge> },
          { header: 'Gateway', accessor: 'gateway' },
          { header: 'Paid At', accessor: 'paid_at' },
        ];

      case 'bulk-orders':
        return [
          { header: 'Title', accessor: 'title' },
          { header: 'Share Code', accessor: 'share_code', render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v}</span> },
          { header: 'Type', accessor: 'order_type' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Coordinator', accessor: 'coordinator' },
          { header: 'Quantity', accessor: 'current_quantity', render: (v, r) => `${v} / ${r.target_quantity}` },
          { header: 'Total', accessor: 'total_amount', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Status', accessor: 'status', render: (v) => <Badge variant="info">{v}</Badge> },
        ];

      case 'reviews-complaints':
        return [
          { header: 'Ticket #', accessor: 'ticket_number' },
          { header: 'Customer', accessor: 'user' },
          { header: 'Shop', accessor: 'shop_name' },
          { header: 'Category', accessor: 'category' },
          { header: 'Subject', accessor: 'subject' },
          { header: 'Priority', accessor: 'priority', render: (v) => <Badge variant={v === 'High' || v === 'Urgent' ? 'danger' : 'warning'}>{v}</Badge> },
          { header: 'Status', accessor: 'status', render: (v) => <Badge variant={v === 'Resolved' ? 'success' : 'info'}>{v}</Badge> },
          { header: 'Created', accessor: 'created_at' },
        ];

      case 'offers':
        return [
          { header: 'Coupon Code', accessor: 'coupon_code', render: (v) => <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{v}</span> },
          { header: 'Student', accessor: 'user' },
          { header: 'Order #', accessor: 'order_number' },
          { header: 'Discount Applied', accessor: 'discount_applied', render: (v) => `₹${Number(v).toFixed(2)}` },
          { header: 'Redemption Date', accessor: 'used_at' },
        ];

      case 'recommendations':
        return [
          { header: 'ID', accessor: 'id' },
          { header: 'Student', accessor: 'user' },
          { header: 'Product', accessor: 'product' },
          { header: 'Recommendation Type', accessor: 'recommendation_type' },
          { header: 'Action', accessor: 'action', render: (v) => <Badge variant="primary">{v}</Badge> },
          { header: 'Timestamp', accessor: 'timestamp' },
        ];

      case 'users':
        return [
          { header: 'ID', accessor: 'id' },
          { header: 'Username', accessor: 'username' },
          { header: 'Email', accessor: 'email' },
          { header: 'Role', accessor: 'role', render: (v) => <Badge variant="primary">{v}</Badge> },
          { header: 'Active', accessor: 'is_active', render: (v) => (v ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>) },
          { header: 'Email Verified', accessor: 'email_verified', render: (v) => (v ? <Badge variant="success">Verified</Badge> : <Badge variant="warning">Unverified</Badge>) },
          { header: 'Joined', accessor: 'date_joined' },
        ];

      default:
        return [];
    }
  }, [activeCategory]);

  // Dynamic Sales Trend Chart
  const salesChartData = useMemo(() => {
    if (activeCategory !== 'sales' || !rows || rows.length === 0) return null;
    const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));
    return {
      labels: sorted.map((r) => r.date),
      datasets: [
        {
          label: 'Net Sales (₹)',
          data: sorted.map((r) => r.net_sales),
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Gross Sales (₹)',
          data: sorted.map((r) => r.gross_sales),
          borderColor: '#94a3b8',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          tension: 0.3,
        },
      ],
    };
  }, [activeCategory, rows]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <PageHeader
        title="Admin Reporting & Export System"
        subtitle="Authoritative multi-stream operational reports, audit logs, and verified database exports"
        badge={
          <Badge variant="primary" icon={FileSpreadsheet}>
            Step 28 Live
          </Badge>
        }
      />

      {/* Category Pills Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          overflowX: 'auto',
          paddingBottom: '0.5rem',
          scrollbarWidth: 'thin',
        }}
      >
        {REPORT_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => handleSelectCategory(cat.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                fontWeight: isActive ? 600 : 500,
                whiteSpace: 'nowrap',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: isActive ? 'var(--primary-600)' : 'var(--bg-surface)',
                color: isActive ? '#ffffff' : 'var(--text-secondary)',
                boxShadow: isActive ? '0 2px 8px rgba(79, 70, 229, 0.3)' : 'var(--shadow-xs)',
              }}
            >
              <Icon size={16} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Unified Filter Bar & Export Actions */}
      <Card style={{ padding: '1rem 1.25rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          {/* Date Filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <DateRangeFilter
              currentPreset={filterParams.preset}
              onChange={(newFilters) => {
                setFilterParams((prev) => ({
                  ...prev,
                  ...newFilters,
                  page: 1,
                }));
              }}
            />

            {/* Search */}
            <div style={{ position: 'relative', minWidth: '220px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Search report records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadReport()}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <Button variant="outline" size="sm" icon={RefreshCw} onClick={loadReport} disabled={loading}>
              Refresh
            </Button>
          </div>

          {/* Export CSV Button */}
          <div>
            <Button
              variant="primary"
              size="md"
              icon={Download}
              onClick={handleExportCsv}
              disabled={exporting || loading}
            >
              {exporting ? 'Generating CSV...' : 'Export CSV'}
            </Button>
          </div>
        </div>
      </Card>

      {/* Error Message */}
      {error && <ErrorMessage message={error} onRetry={loadReport} />}

      {/* Dynamic KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        {activeCategory === 'sales' && (
          <>
            <StatCard title="Gross Sales" value={`₹${(kpis.gross_sales || 0).toLocaleString()}`} icon={TrendingUp} variant="primary" />
            <StatCard title="Total Discounts" value={`₹${(kpis.discounts || 0).toLocaleString()}`} icon={Tag} variant="warning" />
            <StatCard title="Refunds Settled" value={`₹${(kpis.refunds || 0).toLocaleString()}`} icon={RotateCcw} variant="danger" />
            <StatCard title="Net Retained Revenue" value={`₹${(kpis.net_sales || 0).toLocaleString()}`} icon={TrendingUp} variant="success" />
            <StatCard title="Total Orders" value={kpis.total_orders || 0} icon={ShoppingBag} variant="neutral" />
            <StatCard title="Average Order Value" value={`₹${(kpis.average_order_value || 0).toFixed(2)}`} icon={CreditCard} variant="primary" />
          </>
        )}

        {activeCategory === 'orders' && (
          <>
            <StatCard title="Total In Filter" value={kpis.total_orders || 0} icon={ShoppingBag} variant="primary" />
            <StatCard title="Completed Orders" value={kpis.completed_orders || 0} icon={ShoppingBag} variant="success" />
            <StatCard title="Pending Fulfillment" value={kpis.pending_orders || 0} icon={ShoppingBag} variant="warning" />
            <StatCard title="Cancelled Orders" value={kpis.cancelled_orders || 0} icon={ShoppingBag} variant="danger" />
          </>
        )}

        {activeCategory === 'products' && (
          <>
            <StatCard title="Products Listed" value={kpis.total_products_listed || 0} icon={Package} variant="primary" />
            <StatCard title="Units Sold (Period)" value={kpis.total_units_sold || 0} icon={ShoppingBag} variant="neutral" />
            <StatCard title="Catalog Revenue" value={`₹${(kpis.total_product_revenue || 0).toLocaleString()}`} icon={TrendingUp} variant="success" />
          </>
        )}

        {activeCategory === 'inventory' && (
          <>
            <StatCard title="Total Stock Value" value={`₹${(kpis.total_inventory_value || 0).toLocaleString()}`} icon={Warehouse} variant="success" />
            <StatCard title="Total Inventory SKUs" value={kpis.total_items || 0} icon={Package} variant="primary" />
            <StatCard title="Low Stock Alerts" value={kpis.low_stock_count || 0} icon={AlertTriangle} variant="warning" />
            <StatCard title="Out of Stock SKUs" value={kpis.out_of_stock_count || 0} icon={AlertTriangle} variant="danger" />
          </>
        )}

        {activeCategory === 'printing' && (
          <>
            <StatCard title="Print Jobs Completed" value={kpis.total_print_orders || 0} icon={Printer} variant="primary" />
            <StatCard title="Total Pages Printed" value={kpis.total_pages_printed || 0} icon={FileSpreadsheet} variant="neutral" />
            <StatCard title="B/W Pages" value={kpis.bw_pages || 0} icon={FileSpreadsheet} variant="neutral" />
            <StatCard title="Color Pages" value={kpis.color_pages || 0} icon={FileSpreadsheet} variant="warning" />
            <StatCard title="Printing Revenue" value={`₹${(kpis.printing_revenue || 0).toLocaleString()}`} icon={TrendingUp} variant="success" />
          </>
        )}

        {activeCategory === 'delivery' && (
          <>
            <StatCard title="Total Deliveries" value={kpis.total_deliveries || 0} icon={Truck} variant="primary" />
            <StatCard title="Success Rate" value={`${kpis.success_rate_percentage || 0}%`} icon={Truck} variant="success" />
            <StatCard title="Failed Attempts" value={kpis.failed_count || 0} icon={AlertTriangle} variant="danger" />
            <StatCard title="Avg Delivery Duration" value={typeof kpis.average_duration_mins === 'number' ? `${kpis.average_duration_mins}m` : kpis.average_duration_mins || '—'} icon={Clock} variant="neutral" />
          </>
        )}

        {activeCategory === 'customers' && (
          <>
            <StatCard title="Total Students" value={kpis.total_students || 0} icon={Users} variant="primary" />
            <StatCard title="Active In Period" value={kpis.active_in_period || 0} icon={Users} variant="neutral" />
            <StatCard title="New Customers" value={kpis.new_customers || 0} icon={Users} variant="success" />
            <StatCard title="Repeat Customer Rate" value={`${kpis.repeat_purchase_rate || 0}%`} icon={RotateCcw} variant="primary" />
          </>
        )}

        {activeCategory === 'reviews-complaints' && (
          <>
            <StatCard title="Total Reviews" value={kpis.total_reviews || 0} icon={Star} variant="primary" />
            <StatCard title="Average Rating" value={`★ ${kpis.average_rating || 0}`} icon={Star} variant="warning" />
            <StatCard title="Total Support Tickets" value={kpis.total_complaints || 0} icon={AlertTriangle} variant="neutral" />
            <StatCard title="Open Grievances" value={kpis.open_complaints || 0} icon={AlertTriangle} variant="danger" />
          </>
        )}

        {activeCategory === 'users' && (
          <>
            <StatCard title="Total Registered Users" value={kpis.total_users || 0} icon={Users} variant="primary" />
            <StatCard title="Active Accounts" value={kpis.active_users || 0} icon={Users} variant="success" />
            <StatCard title="Email Verified" value={kpis.email_verified_users || 0} icon={Users} variant="neutral" />
            <StatCard title="Shop Owners" value={kpis.shop_owners_count || 0} icon={Store} variant="primary" />
          </>
        )}
      </div>

      {/* Trend Chart (For Sales) */}
      {activeCategory === 'sales' && salesChartData && (
        <Card title="Sales & Retained Revenue Trend">
          <div style={{ height: '300px', width: '100%' }}>
            <Line
              data={salesChartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: 'top' },
                  tooltip: { mode: 'index', intersect: false },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: { callback: (v) => `₹${v}` },
                  },
                },
              }}
            />
          </div>
        </Card>
      )}

      {/* Main Data Table */}
      <Card
        title={currentCategory.label}
        subtitle={currentCategory.description}
      >
        <DataTable
          columns={tableColumns}
          data={rows}
          keyField="id"
          isLoading={loading}
          emptyMessage="No records found for the selected filters."
        />

        {/* Server-Side Pagination Bar */}
        {pagination && pagination.total_pages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '1.25rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--border-light)',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
            }}
          >
            <div>
              Showing page <strong>{pagination.page}</strong> of <strong>{pagination.total_pages}</strong> ({pagination.total_records} total records)
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeft}
                disabled={!pagination.has_previous || loading}
                onClick={() => setFilterParams((prev) => ({ ...prev, page: prev.page - 1 }))}
              >
                Previous
              </Button>

              <Button
                variant="outline"
                size="sm"
                icon={ChevronRight}
                disabled={!pagination.has_next || loading}
                onClick={() => setFilterParams((prev) => ({ ...prev, page: prev.page + 1 }))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminReports;
