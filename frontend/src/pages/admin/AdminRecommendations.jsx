import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Sliders,
  TrendingUp,
  MousePointerClick,
  ShoppingBag,
  Eye,
  CheckCircle2,
  AlertCircle,
  Save,
  RotateCcw,
  BarChart3,
} from 'lucide-react';
import recommendationService from '../../services/recommendationService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminRecommendations = () => {
  const [analytics, setAnalytics] = useState(null);
  const [config, setConfig] = useState(null);
  const [formConfig, setFormConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const loadData = async () => {
    setIsLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
      const [analyticsRes, configRes] = await Promise.all([
        recommendationService.getAdminAnalytics(),
        recommendationService.getConfig(),
      ]);

      if (analyticsRes?.success) setAnalytics(analyticsRes);
      if (configRes?.success) {
        setConfig(configRes.config);
        setFormConfig({ ...configRes.config });
      }
    } catch (err) {
      console.error('Failed to load recommendation admin data:', err);
      setStatusMessage({
        type: 'error',
        text: 'Unable to connect to the recommendation engine. Please verify server status.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfigChange = (field, val) => {
    setFormConfig((prev) => ({
      ...prev,
      [field]: val,
    }));
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage({ type: '', text: '' });

    try {
      const res = await recommendationService.updateConfig(formConfig);
      if (res?.success) {
        setConfig(res.config);
        setFormConfig({ ...res.config });
        setStatusMessage({
          type: 'success',
          text: 'Recommendation hybrid scoring weights updated successfully.',
        });
      }
    } catch (err) {
      console.error('Failed to save configuration:', err);
      setStatusMessage({
        type: 'error',
        text: 'Failed to update configuration. Please ensure all values are valid.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setFormConfig({
      ...formConfig,
      personal_history_weight: '0.30',
      academic_context_weight: '0.35',
      product_similarity_weight: '0.15',
      trending_velocity_weight: '0.10',
      popularity_weight: '0.10',
      recency_decay_halflife_days: 30,
      min_inventory_required: 1,
      co_occurrence_min_orders: 2,
    });
  };

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1150px' }}>
      <PageHeader
        title="Recommendation Engine Control Center"
        subtitle="Platform-wide student engagement metrics, CTR analytics, and hybrid scoring weight configuration."
        badgeText="Step 20 Engine"
        action={
          <Button variant="outline" size="sm" onClick={loadData} leftIcon={RotateCcw}>
            Refresh Analytics
          </Button>
        }
      />

      {statusMessage.text && (
        <div
          className="animate-fade-in"
          style={{
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            backgroundColor: statusMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${statusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            color: statusMessage.type === 'success' ? '#166534' : '#991b1b',
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          {statusMessage.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Analytics KPI Row */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ marginBottom: '2rem' }}>
          <StatCard
            title="Recommendation Impressions"
            value={analytics.total_impressions.toLocaleString()}
            subtitle="Shown across marketplace (30d)"
            icon={Eye}
            color="primary"
          />
          <StatCard
            title="Student Clicks"
            value={analytics.total_clicks.toLocaleString()}
            subtitle="Engaged product cards"
            icon={MousePointerClick}
            color="info"
          />
          <StatCard
            title="Click-Through Rate (CTR)"
            value={`${analytics.click_through_rate_pct}%`}
            subtitle="Engagement conversion"
            icon={TrendingUp}
            color="success"
          />
          <StatCard
            title="Completed Purchases"
            value={analytics.total_conversions.toLocaleString()}
            subtitle={`Conversion: ${analytics.conversion_rate_pct}%`}
            icon={ShoppingBag}
            color="warning"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Scoring Weights Configuration Form */}
        <div className="lg:col-span-2">
          <Card
            title="Hybrid Blended Scoring Weights"
            subtitle="Fine-tune how user signals are mathematically weighted in real-time"
            headerAction={<Badge variant="primary">Normalized Blend</Badge>}
          >
            {formConfig && (
              <form onSubmit={handleSaveConfig}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Personal Purchase History (w₁)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.00"
                      max="1.00"
                      value={formConfig.personal_history_weight}
                      onChange={(e) => handleConfigChange('personal_history_weight', e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Repeat purchase recency weight</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Academic Event Context (w₂)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.00"
                      max="1.00"
                      value={formConfig.academic_context_weight}
                      onChange={(e) => handleConfigChange('academic_context_weight', e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Exam & project proximity intensity</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Product Similarity (w₃)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.00"
                      max="1.00"
                      value={formConfig.product_similarity_weight}
                      onChange={(e) => handleConfigChange('product_similarity_weight', e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>TF-IDF token & category cosine match</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Trending Velocity (w₄)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.00"
                      max="1.00"
                      value={formConfig.trending_velocity_weight}
                      onChange={(e) => handleConfigChange('trending_velocity_weight', e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>7-day sales acceleration ratio</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Overall Popularity (w₅)
                    </label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.00"
                      max="1.00"
                      value={formConfig.popularity_weight}
                      onChange={(e) => handleConfigChange('popularity_weight', e.target.value)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ratings + 30-day completed volume</span>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.35rem' }}>
                      Decay Half-Life (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={formConfig.recency_decay_halflife_days}
                      onChange={(e) => handleConfigChange('recency_decay_halflife_days', parseInt(e.target.value) || 30)}
                      style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)' }}
                    />
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Exponential half-life (default: 30)</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '1.25rem' }}>
                  <Button variant="ghost" size="sm" type="button" onClick={handleResetDefaults}>
                    Reset Default Preset
                  </Button>
                  <Button variant="primary" size="md" type="submit" leftIcon={Save} disabled={isSaving}>
                    {isSaving ? 'Updating...' : 'Save Configuration'}
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>

        {/* Right Col: Recommendation Type Breakdown */}
        <div>
          <Card
            title="Type Breakdown"
            subtitle="Student interactions by module"
          >
            {analytics?.recommendation_type_breakdown?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {analytics.recommendation_type_breakdown.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface-secondary)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.recommendation_type}
                    </span>
                    <Badge variant="secondary" size="sm">
                      {item.interactions_count} events
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Interactions will aggregate as students browse recommendations.
              </p>
            )}

            <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: 'var(--radius-md)', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 800, color: '#166534', margin: '0 0 0.35rem 0' }}>
                Zero Cold-Start Crash Guarantee
              </h5>
              <p style={{ fontSize: '0.75rem', color: '#166534', margin: 0, lineHeight: 1.4 }}>
                When student accounts lack purchase history or collegiate profiles, missing sub-signals are automatically reallocated without zero division.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AdminRecommendations;
