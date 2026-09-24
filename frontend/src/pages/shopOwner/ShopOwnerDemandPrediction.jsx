import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  BarChart2,
  AlertTriangle,
  Calendar,
  Boxes,
  CheckCircle,
  Info,
  Layers,
  Search,
  RefreshCw,
  Sparkles,
  BrainCircuit,
  ArrowUpRight,
  Activity,
  CalendarDays,
  ShieldCheck,
  X
} from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

import StatCard from '../../components/common/StatCard';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import demandService from '../../services/demandService';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ShopOwnerDemandPrediction = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [spikes, setSpikes] = useState([]);
  const [modelMeta, setModelMeta] = useState(null);
  
  // UI State
  const [horizon, setHorizon] = useState(7); // 7 or 30 days
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, AVAILABLE, INSUFFICIENT
  
  // Modal State
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [forecastDetail, setForecastDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, trendRes, spikeRes, metaRes] = await Promise.all([
        demandService.getDemandSummary().catch(() => ({ summary: null })),
        demandService.getDemandTrends().catch(() => ({ trends: [] })),
        demandService.getDemandSpikes().catch(() => ({ spikes: [] })),
        demandService.getModelMetrics().catch(() => ({ model: null })),
      ]);

      setSummary(sumRes.summary || null);
      setTrends(trendRes.trends || []);
      setSpikes(spikeRes.spikes || []);
      setModelMeta(metaRes.model || (sumRes.summary?.model || null));
    } catch (err) {
      console.error('Failed to load demand prediction data:', err);
      setError('Unable to load demand forecasts. Please ensure the backend and ML pipeline are active.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Filtered Trends
  const filteredTrends = useMemo(() => {
    return trends.filter((item) => {
      const matchesSearch = item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (statusFilter === 'AVAILABLE') {
        return matchesSearch && item.prediction_status === 'Available';
      }
      if (statusFilter === 'INSUFFICIENT') {
        return matchesSearch && item.prediction_status !== 'Available';
      }
      return matchesSearch;
    });
  }, [trends, searchTerm, statusFilter]);

  // Open Product Detail Modal
  const handleOpenDetail = async (product) => {
    setSelectedProduct(product);
    setLoadingDetail(true);
    setForecastDetail(null);
    try {
      const detail = await demandService.getProductForecast(product.product_id, horizon);
      setForecastDetail(detail);
    } catch (err) {
      console.error('Failed to load product forecast detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Re-fetch detail when horizon toggle changes while modal is open
  useEffect(() => {
    if (selectedProduct) {
      handleOpenDetail(selectedProduct);
    }
  }, [horizon]);

  // Helper for trend badge
  const renderTrendBadge = (trend) => {
    switch (trend) {
      case 'INCREASING':
        return <Badge variant="success" icon={TrendingUp}>Increasing Demand</Badge>;
      case 'DECREASING':
        return <Badge variant="warning" icon={TrendingDown}>Decreasing Demand</Badge>;
      case 'STABLE':
        return <Badge variant="info" icon={Minus}>Stable Demand</Badge>;
      case 'VOLATILE':
        return <Badge variant="purple" icon={Zap}>Volatile Surge</Badge>;
      default:
        return <Badge variant="neutral" icon={AlertTriangle}>Insufficient Data</Badge>;
    }
  };

  // Build Dual-Series Chart Data
  const chartData = useMemo(() => {
    if (!forecastDetail) return null;

    const hist = forecastDetail.historical_series || [];
    const fc = forecastDetail.forecast_series || [];

    const allDates = [
      ...hist.map((h) => h.date.slice(5)), // MM-DD
      ...fc.map((f) => f.date.slice(5)),
    ];

    const historicalValues = [
      ...hist.map((h) => h.units_sold),
      ...fc.map(() => null), // null for future dates
    ];

    // Bridge historical last point to first forecast point
    const forecastValues = [
      ...hist.slice(0, -1).map(() => null),
      hist.length > 0 ? hist[hist.length - 1].units_sold : null,
      ...fc.map((f) => f.predicted_units),
    ];

    return {
      labels: allDates,
      datasets: [
        {
          label: 'Historical Sales (Actual)',
          data: historicalValues,
          borderColor: '#4f46e5',
          backgroundColor: 'rgba(79, 70, 229, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointBackgroundColor: '#4f46e5',
        },
        {
          label: `Forecast Horizon (${horizon} Days Predicted)`,
          data: forecastValues,
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.12)',
          borderDash: [6, 4],
          fill: true,
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#8b5cf6',
        },
      ],
    };
  }, [forecastDetail, horizon]);

  return (
    <div style={{ paddingBottom: '3rem' }}>
      <PageHeader
        title="ML Demand Prediction Engine"
        subtitle="Explainable Scikit-learn regression forecasts predicting student stationery demand"
        badge={
          <Badge variant="primary" icon={BrainCircuit}>
            {modelMeta ? `${modelMeta.model_name} ${modelMeta.model_version}` : 'ML Active'}
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={fetchDashboardData}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {/* Demand Spikes Alert Banner */}
      {spikes.length > 0 && (
        <div
          style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            backgroundColor: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '1rem',
          }}
        >
          <div
            style={{
              padding: '0.5rem',
              backgroundColor: '#fef3c7',
              borderRadius: 'var(--radius-md)',
              color: '#d97706',
            }}
          >
            <Zap size={22} />
          </div>
          <div style={{ flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#92400e' }}>
              ⚡ {spikes.length} Statistical Demand Spike{spikes.length > 1 ? 's' : ''} Detected
            </h4>
            <p style={{ margin: '0.25rem 0 0.5rem 0', fontSize: '0.85rem', color: '#b45309' }}>
              Unusual demand surges detected compared to 14-day rolling averages. Consider replenishing stock early to prevent stockouts.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {spikes.map((s) => (
                <span
                  key={s.product_id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.25rem 0.6rem',
                    backgroundColor: '#ffffff',
                    border: '1px solid #fcd34d',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#78350f',
                  }}
                >
                  <strong>{s.product_name}</strong>: +{s.spike_percentage}% surge ({s.expected_demand_units} units)
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top 5 KPI Cards */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4"
        style={{ marginBottom: '1.75rem' }}
      >
        <StatCard
          icon={Layers}
          title="Products Forecasted"
          value={summary?.total_products_predicted ?? 0}
          trend={modelMeta ? `${modelMeta.model_version}` : 'Active'}
          trendDirection="neutral"
          iconBg="#eef2ff"
          iconColor="#4f46e5"
        />
        <StatCard
          icon={TrendingUp}
          title="High Demand SKUs"
          value={summary?.high_demand_products ?? 0}
          trend="> 25 units in 7 days"
          trendDirection="up"
          iconBg="#f0fdf4"
          iconColor="#16a34a"
        />
        <StatCard
          icon={Zap}
          title="Demand Spikes"
          value={summary?.demand_spikes_count ?? spikes.length}
          trend="Surge alerts"
          trendDirection={spikes.length > 0 ? 'up' : 'neutral'}
          iconBg="#fffbeb"
          iconColor="#d97706"
        />
        <StatCard
          icon={CalendarDays}
          title="7-Day Expected Volume"
          value={`${summary?.total_7d_forecast_units ?? 0} units`}
          trend="Total next 7 days"
          trendDirection="up"
          iconBg="#faf5ff"
          iconColor="#9333ea"
        />
        <StatCard
          icon={Boxes}
          title="30-Day Expected Volume"
          value={`${summary?.total_30d_forecast_units ?? 0} units`}
          trend="Total next 30 days"
          trendDirection="up"
          iconBg="#eff6ff"
          iconColor="#2563eb"
        />
      </div>

      {/* Forecast Horizon Toggle & Filter Bar */}
      <Card style={{ marginBottom: '1.75rem' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Search & Status Filter */}
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '280px' }}>
            <div style={{ position: 'relative', width: '100%', maxWidth: '320px' }}>
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
                placeholder="Search products or categories..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                fontSize: '0.85rem',
                background: 'var(--bg-surface)',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Forecast Available</option>
              <option value="INSUFFICIENT">Insufficient Data</option>
            </select>
          </div>

          {/* 7-Day vs 30-Day Horizon Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Forecast Horizon:
            </span>
            <div
              style={{
                display: 'inline-flex',
                backgroundColor: 'var(--bg-surface-secondary, #f1f5f9)',
                padding: '0.25rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light, #e2e8f0)',
              }}
            >
              <button
                type="button"
                onClick={() => setHorizon(7)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: horizon === 7 ? 'var(--primary-600, #4f46e5)' : 'transparent',
                  color: horizon === 7 ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setHorizon(30)}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: horizon === 30 ? 'var(--primary-600, #4f46e5)' : 'transparent',
                  color: horizon === 30 ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                30 Days
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Forecast Table */}
      <Card
        title="Product Demand Forecast Table"
        subtitle={`Displaying demand trajectories and expected sales volumes for the next ${horizon} days`}
      >
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 1rem' }} />
            <p>Loading demand predictions and historical models...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#ef4444' }}>
            <AlertTriangle size={28} style={{ margin: '0 auto 0.5rem' }} />
            <p>{error}</p>
          </div>
        ) : filteredTrends.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Info size={32} style={{ margin: '0 auto 0.75rem', color: 'var(--text-muted)' }} />
            <h4 style={{ margin: 0, fontWeight: 700 }}>No Demand Forecasts Found</h4>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
              Historical sales are required to generate regression predictions. Run the training command to populate forecasts.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Product & Category</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Stock On Hand</th>
                  <th style={{ padding: '0.75rem 1rem' }}>7-Day Forecast</th>
                  <th style={{ padding: '0.75rem 1rem' }}>30-Day Forecast</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Trend Classification</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Model Status</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrends.map((row) => (
                  <tr
                    key={row.product_id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.product_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{row.category}</div>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      <span style={{ fontWeight: 600, color: row.current_stock <= 10 ? '#ef4444' : 'var(--text-primary)' }}>
                        {row.current_stock} units
                      </span>
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {row.forecast_7d !== null ? (
                        <span style={{ fontWeight: 700, color: '#4f46e5' }}>
                          {row.forecast_7d} units
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {row.forecast_30d !== null ? (
                        <span style={{ fontWeight: 700, color: '#2563eb' }}>
                          {row.forecast_30d} units
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>--</span>
                      )}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {renderTrendBadge(row.trend)}
                    </td>
                    <td style={{ padding: '1rem' }}>
                      {row.prediction_status === 'Available' ? (
                        <Badge variant="success" icon={CheckCircle}>Available</Badge>
                      ) : (
                        <Badge variant="neutral" icon={AlertTriangle}>Insufficient Data</Badge>
                      )}
                    </td>
                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={ArrowUpRight}
                        onClick={() => handleOpenDetail(row)}
                      >
                        Forecast Details
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Model Transparency Scorecard Card */}
      {modelMeta && (
        <Card
          title="Active Model Architecture & Evaluation Scorecard"
          subtitle="Real evaluation metrics calculated on unseen chronological test split (No data leakage)"
          style={{ marginTop: '1.75rem' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ALGORITHM & VERSION</span>
              <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700 }}>{modelMeta.model_name}</h4>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tag: {modelMeta.model_version}</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>TEST MEAN ABSOLUTE ERROR (MAE)</span>
              <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>±{modelMeta.mae} units</h4>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Baseline MAE: ±{modelMeta.baseline_mae} ({(modelMeta.baseline_mae - modelMeta.mae).toFixed(2)} unit uplift)
              </p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>ROOT MEAN SQUARED ERROR (RMSE)</span>
              <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700 }}>±{modelMeta.rmse} units</h4>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Penalizes outlier prediction gaps</p>
            </div>
            <div style={{ padding: '1rem', backgroundColor: 'var(--bg-surface-secondary, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>COEFFICIENT OF DETERMINATION (R²)</span>
              <h4 style={{ margin: '0.25rem 0 0', fontSize: '1.1rem', fontWeight: 700, color: '#6366f1' }}>{modelMeta.r2_score}</h4>
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Trained on {modelMeta.training_samples} observations
              </p>
            </div>
          </div>
          <div style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <strong>Engineered Features:</strong> {Array.isArray(modelMeta.features_used) ? modelMeta.features_used.join(', ') : 'Lags 1..14, Calendar, Rolling Means'}
          </div>
        </Card>
      )}

      {/* PRODUCT FORECAST DETAIL MODAL */}
      {selectedProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface, #ffffff)',
              borderRadius: 'var(--radius-xl, 1rem)',
              maxWidth: '900px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid var(--border-light, #e2e8f0)',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  {selectedProduct.product_name}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selectedProduct.category} • Current Stock: <strong>{selectedProduct.current_stock} units</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '0.25rem',
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.5rem' }}>
              {loadingDetail ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 0.75rem' }} />
                  <p>Calculating recursive {horizon}-day forecast time series...</p>
                </div>
              ) : forecastDetail?.status === 'INSUFFICIENT_DATA' ? (
                <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: 'var(--radius-lg)' }}>
                  <AlertTriangle size={36} color="#d97706" style={{ margin: '0 auto 0.75rem' }} />
                  <h4 style={{ margin: 0, fontWeight: 700, color: '#92400e' }}>Insufficient Historical Sales Data</h4>
                  <p style={{ margin: '0.5rem auto 1.5rem', maxWidth: '500px', fontSize: '0.875rem', color: '#b45309' }}>
                    {forecastDetail.message}
                  </p>
                  <Button variant="outline" onClick={() => setSelectedProduct(null)}>Close</Button>
                </div>
              ) : forecastDetail ? (
                <div>
                  {/* Summary Metric Strip */}
                  <div
                    className="grid grid-cols-2 md:grid-cols-4 gap-3"
                    style={{ marginBottom: '1.5rem' }}
                  >
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: '#eef2ff', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#4338ca', fontWeight: 600 }}>7-DAY EXPECTED</span>
                      <h4 style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#3730a3' }}>
                        {forecastDetail.forecast_7d} units
                      </h4>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: '#faf5ff', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#6b21a8', fontWeight: 600 }}>30-DAY EXPECTED</span>
                      <h4 style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#581c87' }}>
                        {forecastDetail.forecast_30d} units
                      </h4>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: 600 }}>TREND TRAJECTORY</span>
                      <div style={{ marginTop: '0.25rem' }}>{renderTrendBadge(forecastDetail.trend)}</div>
                    </div>
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fffbeb', borderRadius: 'var(--radius-md)' }}>
                      <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>SPIKE RISK</span>
                      <div style={{ marginTop: '0.25rem' }}>
                        {forecastDetail.spike_info?.detected ? (
                          <Badge variant="danger" icon={Zap}>Surge +{forecastDetail.spike_info.spike_percentage}%</Badge>
                        ) : (
                          <Badge variant="success" icon={CheckCircle}>Normal Velocity</Badge>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dual-Series Chart */}
                  <div style={{ marginBottom: '1.75rem' }}>
                    <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700 }}>
                      Historical Demand vs {horizon}-Day Forecast
                    </h4>
                    <div style={{ height: '280px', backgroundColor: '#ffffff', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                      {chartData && (
                        <Line
                          data={chartData}
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
                                title: { display: true, text: 'Units Sold / Demanded' },
                              },
                              x: {
                                title: { display: true, text: 'Date (Month-Day)' },
                              },
                            },
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Daily Forecast Breakdown */}
                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700 }}>
                      Daily Forecast Breakdown
                    </h4>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: '#f8fafc', borderBottom: '1px solid var(--border-light)' }}>
                          <tr>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left' }}>Day</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Predicted Demand</th>
                            <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Confidence Range</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(forecastDetail.forecast_series || []).map((pt, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)' }}>
                              <td style={{ padding: '0.4rem 0.75rem' }}>{pt.date}</td>
                              <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>Day +{idx + 1}</td>
                              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', fontWeight: 700, color: '#4f46e5' }}>
                                {pt.predicted_units} units
                              </td>
                              <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                                {pt.confidence_low} - {pt.confidence_high} units
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '1rem 1.5rem',
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}
            >
              <Button variant="outline" onClick={() => setSelectedProduct(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerDemandPrediction;
