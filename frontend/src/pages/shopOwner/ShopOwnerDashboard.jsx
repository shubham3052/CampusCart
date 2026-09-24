import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag,
  IndianRupee,
  Clock,
  Printer,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  Flame,
  TrendingUp,
  PackageCheck,
  CheckCircle2,
  Calendar,
  BrainCircuit,
  ChevronRight,
  Building2,
  Layers,
} from 'lucide-react';
import academicService from '../../services/academicService';
import recommendationService from '../../services/recommendationService';
import { useAuth } from '../../context/AuthContext';
import EmailOtpModal from '../../components/auth/EmailOtpModal';
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
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import StatCard from '../../components/common/StatCard';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
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

import analyticsService from '../../services/analyticsService';

const ShopOwnerDashboard = () => {
  const navigate = useNavigate();
  const { user, markEmailVerified } = useAuth();
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [academicInsights, setAcademicInsights] = useState(null);
  const [recommendationInsights, setRecommendationInsights] = useState(null);
  const [analyticsOverview, setAnalyticsOverview] = useState(null);
  const [categoryData, setCategoryData] = useState([]);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const [acadRes, recRes, ovRes, prodRes] = await Promise.allSettled([
          academicService.getDemandInsights(30),
          recommendationService.getShopInsights(),
          analyticsService.getShopOverview({ preset: '7d' }),
          analyticsService.getShopProducts({ preset: '30d' }),
        ]);
        if (acadRes.status === 'fulfilled' && acadRes.value?.success) {
          setAcademicInsights(acadRes.value);
        }
        if (recRes.status === 'fulfilled' && recRes.value?.success) {
          setRecommendationInsights(recRes.value);
        }
        if (ovRes.status === 'fulfilled') {
          setAnalyticsOverview(ovRes.value);
        }
        if (prodRes.status === 'fulfilled' && prodRes.value?.categories) {
          setCategoryData(prodRes.value.categories);
        }
      } catch (err) {
        console.error('Failed to load demand/analytics insights:', err);
      }
    };
    fetchInsights();
  }, []);

  const kpis = analyticsOverview?.kpis || {};
  const series = analyticsOverview?.sales_series || [];

  // Chart 1: 7-day Sales Overview from real analytics
  const salesChartData = useMemo(() => {
    if (!series.length) {
      return {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'Revenue (₹)',
            data: [0, 0, 0, 0, 0, 0, 0],
            borderColor: '#6366f1',
            backgroundColor: 'rgba(99, 102, 241, 0.12)',
            tension: 0.35,
            fill: true,
          },
        ],
      };
    }
    return {
      labels: series.map((s) => s.date.slice(5)),
      datasets: [
        {
          label: 'Revenue (₹)',
          data: series.map((s) => s.net_sales),
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.12)',
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#6366f1',
        },
      ],
    };
  }, [series]);

  const salesChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => ` ₹${Number(context.raw).toFixed(2)}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#f1f5f9' },
      },
      x: {
        grid: { display: false },
      },
    },
  };

  // Chart 2: Orders by Category from real analytics
  const categoryChartData = useMemo(() => {
    if (!categoryData.length) {
      return {
        labels: ['No categories yet'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['#cbd5e1'],
            borderWidth: 2,
            borderColor: '#ffffff',
          },
        ],
      };
    }
    return {
      labels: categoryData.map((c) => c.category),
      datasets: [
        {
          data: categoryData.map((c) => c.quantity_sold),
          backgroundColor: ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [categoryData]);

  // Pending Orders Table Data
  const pendingOrders = [
    {
      id: 'ORD-1092',
      customer: 'Aarav Patel (Hostel B)',
      items: 'Classmate A4 Long (x3), Pilot Pen (x2)',
      amount: '₹345.00',
      time: '5 mins ago',
      status: 'PENDING',
    },
    {
      id: 'ORD-1093',
      customer: 'Priya Verma (Hostel C)',
      items: 'Computer Science Lab Report (42 pgs, Spiral)',
      amount: '₹126.00',
      time: '12 mins ago',
      status: 'PRINT_QUEUE',
    },
    {
      id: 'ORD-1094',
      customer: 'Karan Mehra (Library)',
      items: 'Casio FX-991CW Calculator',
      amount: '₹1,350.00',
      time: '24 mins ago',
      status: 'PACKED',
    },
  ];

  const orderColumns = [
    { header: 'Order ID', accessor: 'id', render: (val) => <strong>{val}</strong> },
    { header: 'Customer', accessor: 'customer' },
    { header: 'Items Ordered', accessor: 'items' },
    { header: 'Amount', accessor: 'amount', cellStyle: { fontWeight: 600, color: 'var(--text-primary)' } },
    {
      header: 'Status',
      accessor: 'status',
      render: (status) => {
        if (status === 'PENDING') return <Badge variant="warning">New Order</Badge>;
        if (status === 'PRINT_QUEUE') return <Badge variant="info">In Printing</Badge>;
        return <Badge variant="success">Packed</Badge>;
      },
    },
    {
      header: 'Action',
      accessor: 'id',
      render: () => (
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Button size="sm" variant="primary">Accept</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Campus Merchant Overview"
        subtitle="Live sales metrics, queue monitoring, and AI demand alerts"
        actions={
          <Button variant="primary" leftIcon={Printer}>
            Direct Print Job
          </Button>
        }
      />

      {/* Email Verification Requirement Banner */}
      {user && !user.email_verified && (
        <div
          style={{
            backgroundColor: '#fffbeb',
            border: '1px solid #fcd34d',
            borderRadius: 'var(--radius-lg)',
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: '#fef3c7',
                color: '#d97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <AlertTriangle size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>
                Email Verification Required
              </div>
              <div style={{ color: '#b45309', fontSize: '0.85rem' }}>
                Please verify your merchant account email (<strong>{user.email}</strong>) to guarantee uninterrupted store operations.
                <span style={{ display: 'block', fontSize: '0.8rem', color: '#92400e', marginTop: '0.15rem' }}>
                  * Official shop approval workflow remains administered separately.
                </span>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setShowVerifyModal(true)}
          >
            Verify Email Now
          </Button>
        </div>
      )}

      {/* 5 Required Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', marginBottom: '1.75rem' }}>
        <StatCard
          icon={ShoppingBag}
          title="Today's Orders"
          value={kpis.today_orders ?? 0}
          subtitle="Orders placed today"
          iconBg="#eef2ff"
          iconColor="#4f46e5"
        />
        <StatCard
          icon={IndianRupee}
          title="Today's Sales"
          value={`₹${parseFloat(kpis.today_sales || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`}
          subtitle={`Week: ₹${parseFloat(kpis.this_week_sales || 0).toFixed(0)}`}
          iconBg="#ecfdf5"
          iconColor="#10b981"
        />
        <StatCard
          icon={Clock}
          title="Pending Orders"
          value={kpis.pending_orders ?? 0}
          subtitle="Awaiting fulfillment"
          iconBg="#fffbeb"
          iconColor="#f59e0b"
        />
        <StatCard
          icon={Printer}
          title="Printing Revenue"
          value={`₹${parseFloat(kpis.printing_revenue || 0).toFixed(2)}`}
          subtitle="Print & Xerox jobs"
          iconBg="#f0f9ff"
          iconColor="#0284c7"
        />
        <StatCard
          icon={AlertTriangle}
          title="Low Stock Items"
          value={`${analyticsOverview?.inventory_health?.low_stock_count ?? 0} Items`}
          subtitle="Below safety threshold"
          iconBg="#fef2f2"
          iconColor="#ef4444"
        />
      </div>

      {/* Academic Event Demand Insights Section (Step 19) */}
      {academicInsights && academicInsights.events && academicInsights.events.length > 0 && (
        <Card style={{ marginBottom: '1.75rem', backgroundColor: '#f0f9ff', borderColor: '#bae6fd' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', backgroundColor: '#0284c7', color: 'white' }}>
                <Calendar size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0369a1' }}>
                  Upcoming Academic Demand Signals ({academicInsights.upcoming_events_count} Milestones in Next 30 Days)
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#0284c7' }}>
                  Surging stationery categories and print volumes identified from affiliated university calendars.
                </p>
              </div>
            </div>

            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate('/shop-owner/purchase-advisor')}
              rightIcon={ChevronRight}
            >
              Smart Restock Advisor
            </Button>
          </div>

          {/* Events Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem', marginBottom: '1rem' }}>
            {academicInsights.events.slice(0, 3).map((ev) => (
              <div
                key={ev.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.85rem 1rem',
                  border: '1px solid #e0f2fe',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>{ev.title}</div>
                  <Badge
                    variant={ev.importance === 'CRITICAL' ? 'danger' : ev.importance === 'HIGH' ? 'warning' : 'primary'}
                    size="sm"
                  >
                    {ev.days_until > 0 ? `${ev.days_until}d away` : 'Active Now'}
                  </Badge>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {ev.event_type_display} • {ev.institution_name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 600, marginTop: '0.3rem' }}>
                  Starts: {ev.start_date} | Intensity: {ev.intensity_score}
                </div>
              </div>
            ))}
          </div>

          {/* Anticipated Affected Stationery & Printing Services */}
          {academicInsights.affected_stationery && (
            <div style={{ backgroundColor: '#ffffff', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid #e0f2fe' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', marginBottom: '0.4rem' }}>
                Anticipated Surge in Categories & Print Services:
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {academicInsights.affected_stationery.categories?.map((cat) => (
                  <Badge key={cat.category_id} variant="secondary" size="sm">
                    {cat.category_name} ({cat.impact_type})
                  </Badge>
                ))}
                {academicInsights.affected_stationery.services?.map((srv) => (
                  <Badge key={srv.service_type} variant="info" size="sm" icon={Printer}>
                    {srv.service_name} ({srv.impact_strength})
                  </Badge>
                ))}
                {(!academicInsights.affected_stationery.categories?.length && !academicInsights.affected_stationery.services?.length) && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Standard exam supplies (Pens, Notebooks, Project Files) anticipated.
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Customer Demand & Fast Moving Stationery Opportunities */}
      {recommendationInsights && (
        <Card
          className="animate-fade-in"
          style={{
            marginBottom: '1.75rem',
            border: '1px solid #c7d2fe',
            background: 'linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{ padding: '0.5rem', borderRadius: 'var(--radius-md)', backgroundColor: '#4f46e5', color: 'white' }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#3730a3' }}>
                  Customer Stationery Demand & Popular Products
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#4f46e5' }}>
                  Real-time recommendations and trending supplies customers are looking for in your store.
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              style={{ borderColor: '#6366f1', color: '#4f46e5' }}
              onClick={() => navigate('/shop-owner/purchase-advisor')}
              rightIcon={ChevronRight}
            >
              Restock Reorder Suggestions
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.85rem' }}>
            {/* Fast Moving */}
            <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #e0e7ff' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#312e81', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <TrendingUp size={16} color="#4f46e5" /> Top Customer Favorites in Your Shop:
              </div>
              {recommendationInsights.shop_fast_moving_stationery?.length > 0 ? (
                <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  {recommendationInsights.shop_fast_moving_stationery.slice(0, 4).map((p) => (
                    <li key={p.id} style={{ marginBottom: '0.3rem' }}>
                      <strong>{p.name}</strong> • ₹{p.price} ({p.available_stock} in stock)
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Sales data will populate as orders complete.</p>
              )}
            </div>

            {/* Trending Items */}
            <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid #e0e7ff' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#312e81', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Flame size={16} color="#ea580c" /> Surging Sales Velocity Items:
              </div>
              {recommendationInsights.shop_trending_items?.length > 0 ? (
                <ul style={{ paddingLeft: '1.2rem', margin: 0, fontSize: '0.8rem', color: 'var(--text-main)' }}>
                  {recommendationInsights.shop_trending_items.slice(0, 4).map((p) => (
                    <li key={p.id} style={{ marginBottom: '0.3rem' }}>
                      <strong>{p.name}</strong> • ₹{p.price} (Surge: {p.metrics?.surge_ratio || 1.5}x)
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>Trending items will update weekly.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Charts Section: Sales Overview & Orders Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" style={{ marginBottom: '1.75rem' }}>
        <div className="lg:col-span-2">
          <Card
            title="Sales & Revenue Overview"
            subtitle="Daily earnings over the past 7 days"
            headerAction={<Badge variant="primary">Weekly View</Badge>}
          >
            <div style={{ height: '280px', position: 'relative' }}>
              <Line data={salesChartData} options={salesChartOptions} />
            </div>
          </Card>
        </div>

        <div>
          <Card
            title="Category Share"
            subtitle="Order breakdown by type"
          >
            <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Doughnut
                data={categoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { position: 'bottom' } },
                }}
              />
            </div>
          </Card>
        </div>
      </div>

      {/* Live Orders Queue Table */}
      <Card
        title="Active Order & Print Queue"
        subtitle="Real-time campus requests awaiting merchant confirmation"
        headerAction={
          <Button variant="ghost" size="sm">
            View All Orders
          </Button>
        }
      >
        <DataTable columns={orderColumns} data={pendingOrders} />
      </Card>

      {/* Email Verification Modal */}
      {showVerifyModal && user && (
        <EmailOtpModal
          isOpen={showVerifyModal}
          email={user.email}
          purpose="EMAIL_VERIFICATION"
          onSuccess={() => {
            markEmailVerified();
            setShowVerifyModal(false);
          }}
          onClose={() => setShowVerifyModal(false)}
        />
      )}
    </div>
  );
};

export default ShopOwnerDashboard;
