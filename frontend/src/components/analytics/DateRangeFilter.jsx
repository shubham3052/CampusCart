import React, { useState } from 'react';
import { Calendar, RefreshCw, Filter } from 'lucide-react';
import Button from '../common/Button';

const PRESETS = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
  { label: 'This Month', value: 'month' },
  { label: 'This Year', value: 'year' },
  { label: 'Custom', value: 'custom' },
];

const DateRangeFilter = ({ activePreset = '30d', onFilterChange, onRefresh, loading = false }) => {
  const [selectedPreset, setSelectedPreset] = useState(activePreset);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isCustomOpen, setIsCustomOpen] = useState(activePreset === 'custom');

  const handlePresetClick = (preset) => {
    setSelectedPreset(preset);
    if (preset === 'custom') {
      setIsCustomOpen(true);
    } else {
      setIsCustomOpen(false);
      onFilterChange({ preset });
    }
  };

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (!startDate || !endDate) return;
    onFilterChange({
      preset: 'custom',
      start_date: startDate,
      end_date: endDate,
    });
  };

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        padding: '0.85rem 1.25rem',
        background: 'var(--bg-surface, #ffffff)',
        borderRadius: '12px',
        border: '1px solid var(--border-color, #e2e8f0)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        marginBottom: '1.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted, #64748b)', marginRight: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>
          <Calendar size={16} />
          <span>Period:</span>
        </div>
        {PRESETS.map((p) => {
          const isActive = selectedPreset === p.value;
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => handlePresetClick(p.value)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '8px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                border: isActive ? '1px solid var(--primary-600, #4f46e5)' : '1px solid #e2e8f0',
                background: isActive ? 'var(--primary-50, #eef2ff)' : '#ffffff',
                color: isActive ? 'var(--primary-700, #4338ca)' : 'var(--text-secondary, #475569)',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        {isCustomOpen && (
          <form onSubmit={handleApplyCustom} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
              }}
            />
            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              style={{
                padding: '0.35rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '0.8125rem',
              }}
            />
            <Button size="sm" type="submit">
              Apply
            </Button>
          </form>
        )}

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            title="Refresh analytics data"
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#64748b',
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
    </div>
  );
};

export default DateRangeFilter;
