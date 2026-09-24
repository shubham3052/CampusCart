import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Search,
  Sparkles,
  Calendar,
  Layers,
  RefreshCw,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerPredictions = () => {
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [horizonFilter, setHorizonFilter] = useState('ALL');

  const loadPredictions = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (horizonFilter !== 'ALL') params.horizon = horizonFilter;

      const data = await platformOwnerService.getDemandPredictions(params);
      setPredictions(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load predictions:', err);
      setError('Unable to load ML demand prediction forecasts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPredictions();
  }, [horizonFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadPredictions();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Demand Prediction & AI Forecasting Oversight"
        subtitle="System-level monitoring of machine learning stationery demand projections and academic cycle patterns"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <Input
                type="text"
                placeholder="Search predictions by product, store, category..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="outline" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>Forecast Horizon:</span>
            <select
              value={horizonFilter}
              onChange={(e) => setHorizonFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Horizons</option>
              <option value="DAILY">Daily Forecast</option>
              <option value="7_DAYS">7-Day Aggregated</option>
              <option value="30_DAYS">30-Day Aggregated</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadPredictions}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Active Demand Predictions (${predictions.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading machine learning forecasts..." />
          </div>
        ) : predictions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No demand predictions generated yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Product & Category</th>
                  <th>Store</th>
                  <th>Target Date</th>
                  <th>Horizon</th>
                  <th>Predicted Volume</th>
                  <th>Confidence Interval</th>
                  <th>Model Confidence</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred) => (
                  <tr key={pred.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{pred.product_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{pred.category_name}</div>
                    </td>
                    <td>{pred.shop_name}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{pred.target_date}</span>
                    </td>
                    <td>
                      <Badge variant="secondary">{pred.forecast_horizon}</Badge>
                    </td>
                    <td>
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-700)' }}>
                        {pred.predicted_units} units
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      [{pred.confidence_interval_low} - {pred.confidence_interval_high}]
                    </td>
                    <td>
                      <Badge variant="success" icon={Sparkles}>
                        {(parseFloat(pred.confidence_score || 0.9) * 100).toFixed(0)}% Accuracy
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PlatformOwnerPredictions;
