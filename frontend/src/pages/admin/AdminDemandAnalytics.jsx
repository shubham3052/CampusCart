import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Layers,
  Zap,
  Building2,
  RefreshCw,
  BrainCircuit,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowUpRight,
  Sparkles,
  BarChart3,
  CalendarDays
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import demandService from '../../services/demandService';
import api from '../../services/api';

const AdminDemandAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [modelMeta, setModelMeta] = useState(null);
  const [shops, setShops] = useState([]);

  // Filters
  const [selectedShop, setSelectedShop] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [trendFilter, setTrendFilter] = useState('ALL');

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, trendRes, spikeRes, metaRes, shopRes] = await Promise.all([
        demandService.getDemandSummary().catch(() => ({ summary: null })),
        demandService.getDemandTrends().catch(() => ({ trends: [] })),
        demandService.getDemandSpikes().catch(() => ({ spikes: [] })),
        demandService.getModelMetrics().catch(() => ({ model: null })),
        api.get('/shops/').catch(() => ({ data: [] })),
      ]);

      setSummary(sumRes.summary || null);
      setTrends(trendRes.trends || []);
      setSpikes(spikeRes.spikes || []);
      setModelMeta(metaRes.model || null);
      setShops(Array.isArray(shopRes.data) ? shopRes.data : shopRes.data?.results || []);
    } catch (err) {
      console.error('Failed to load admin demand analytics:', err);
      setError('Unable to load platform demand analytics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredTrends = useMemo(() => {
    return trends.filter((item) => {
      const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTrend = trendFilter === 'ALL' || item.trend === trendFilter;
      return matchesSearch && matchesTrend;
    });
  }, [trends, searchTerm, trendFilter]);

  const topGrowing = useMemo(() => {
    return trends.filter((t) => t.trend === 'INCREASING').slice(0, 5);
  }, [trends]);

  const topDeclining = useMemo(() => {
    return trends.filter((t) => t.trend === 'DECREASING').slice(0, 5);
  }, [trends]);

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <PageHeader
        title="Campus Demand Analytics & ML Oversight"
        subtitle="Platform-wide stationery demand forecasting, model performance, and trend intelligence"
        badge={
          <Badge variant="primary" icon={BrainCircuit}>
            SuperAdmin AI Console
          </Badge>
        }
        actions={
          <Button variant="outline" size="sm" icon={RefreshCw} onClick={fetchData} disabled={loading}>
            Refresh Platform Data
          </Button>
        }
      />

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4" style={{ marginBottom: '1.75rem' }}>
        <StatCard
          icon={Layers}
          title="Total SKUs Predicted"
          value={summary?.total_products_predicted ?? 0}
          trend={modelMeta ? modelMeta.model_version : 'Active'}
          trendDirection="neutral"
          iconBg="#eef2ff"
          iconColor="#4f46e5"
        />
        <StatCard
          icon={TrendingUp}
          title="High Demand Products"
          value={summary?.high_demand_products ?? 0}
          trend="> 25 units expected"
          trendDirection="up"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
        />
        <StatCard
          icon={Zap}
          title="Demand Spikes"
          value={summary?.demand_spikes_count ?? spikes.length}
          trend="Active surge alerts"
          trendDirection="up"
          iconBg="#fffbeb"
          iconColor="#d97706"
        />
        <StatCard
          icon={CalendarDays}
          title="Campus 7-Day Demand"
          value={`${summary?.total_7d_forecast_units ?? 0} units`}
          trend="All shops combined"
          trendDirection="up"
          iconBg="#faf5ff"
          iconColor="#9333ea"
        />
        <StatCard
          icon={BarChart3}
          title="Campus 30-Day Demand"
          value={`${summary?.total_30d_forecast_units ?? 0} units`}
          trend="All shops combined"
          trendDirection="up"
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
      </div>

      {/* Model Scorecard */}
      {modelMeta && (
        <Card
          title="Global Machine Learning Model Registry"
          subtitle={`Active Model: ${modelMeta.model_name} (${modelMeta.model_version})`}
          style={{ marginBottom: '1.75rem' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ALGORITHM</span>
              <h4 style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{modelMeta.model_name}</h4>
              <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>Version {modelMeta.model_version}</span>
            </div>
            <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>EVALUATION MAE</span>
              <h4 style={{ margin: '0.2rem 0 0', fontWeight: 700, color: '#10b981' }}>±{modelMeta.mae} units</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Baseline: ±{modelMeta.baseline_mae}</span>
            </div>
            <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>R² ACCURACY SCORE</span>
              <h4 style={{ margin: '0.2rem 0 0', fontWeight: 700, color: '#6366f1' }}>{modelMeta.r2_score}</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>RMSE: ±{modelMeta.rmse}</span>
            </div>
            <div style={{ padding: '0.85rem', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TRAINING DATASET</span>
              <h4 style={{ margin: '0.2rem 0 0', fontWeight: 700 }}>{modelMeta.training_samples} samples</h4>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Chronological 80/20 split</span>
            </div>
          </div>
        </Card>
      )}

      {/* Growing vs Declining Products */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" style={{ marginBottom: '1.75rem' }}>
        <Card title="Top Growing Stationery Products" subtitle="Products displaying positive upward demand momentum">
          {topGrowing.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No products currently classified as increasing.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topGrowing.map((p) => (
                <div key={p.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#166534' }}>{p.product_name}</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#15803d' }}>{p.category}</span>
                  </div>
                  <Badge variant="success" icon={TrendingUp}>+ {p.forecast_7d} units (7d)</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Declining Demand Products" subtitle="Products experiencing demand contraction">
          {topDeclining.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No products currently classified as decreasing.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {topDeclining.map((p) => (
                <div key={p.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', backgroundColor: '#fffbeb', borderRadius: 'var(--radius-md)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#92400e' }}>{p.product_name}</span>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: '#b45309' }}>{p.category}</span>
                  </div>
                  <Badge variant="warning" icon={TrendingDown}>{p.forecast_7d} units (7d)</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Catalog Demand Overview Table */}
      <Card title="Campus Products Demand Coverage" subtitle="Comprehensive demand coverage across all registered stationery products">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search product name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ padding: '0.45rem 0.75rem 0.45rem 2.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
            />
          </div>

          <select
            value={trendFilter}
            onChange={(e) => setTrendFilter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
          >
            <option value="ALL">All Trends</option>
            <option value="INCREASING">Increasing</option>
            <option value="STABLE">Stable</option>
            <option value="DECREASING">Decreasing</option>
            <option value="VOLATILE">Volatile</option>
            <option value="INSUFFICIENT_DATA">Insufficient Data</option>
          </select>
        </div>

        <div className="table-responsive">
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                <th style={{ padding: '0.6rem 0.75rem' }}>Product Name</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Category</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Stock on Hand</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>7-Day Forecast</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>30-Day Forecast</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Trend</th>
                <th style={{ padding: '0.6rem 0.75rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredTrends.map((row) => (
                <tr key={row.product_id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '0.75rem', fontWeight: 600 }}>{row.product_name}</td>
                  <td style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>{row.category}</td>
                  <td style={{ padding: '0.75rem' }}>{row.current_stock} units</td>
                  <td style={{ padding: '0.75rem', fontWeight: 700, color: '#4f46e5' }}>
                    {row.forecast_7d !== null ? `${row.forecast_7d} units` : '--'}
                  </td>
                  <td style={{ padding: '0.75rem', fontWeight: 700, color: '#2563eb' }}>
                    {row.forecast_30d !== null ? `${row.forecast_30d} units` : '--'}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    {row.trend === 'INCREASING' && <Badge variant="success" icon={TrendingUp}>Increasing</Badge>}
                    {row.trend === 'DECREASING' && <Badge variant="warning" icon={TrendingDown}>Decreasing</Badge>}
                    {row.trend === 'STABLE' && <Badge variant="info" icon={Minus}>Stable</Badge>}
                    {row.trend === 'VOLATILE' && <Badge variant="purple" icon={Zap}>Volatile</Badge>}
                    {row.trend === 'INSUFFICIENT_DATA' && <Badge variant="neutral" icon={AlertTriangle}>Insufficient Data</Badge>}
                  </td>
                  <td style={{ padding: '0.75rem' }}>
                    {row.prediction_status === 'Available' ? (
                      <Badge variant="success" icon={CheckCircle}>Available</Badge>
                    ) : (
                      <Badge variant="neutral" icon={AlertTriangle}>Pending Data</Badge>
                    )}
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

export default AdminDemandAnalytics;
