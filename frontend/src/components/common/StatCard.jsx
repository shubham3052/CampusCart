import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

const StatCard = ({
  icon: Icon,
  title,
  value,
  trend,
  trendDirection = 'up', // 'up' | 'down' | 'neutral'
  subtitle,
  iconColor = 'var(--primary-600)',
  iconBg = 'var(--primary-50)',
  className = '',
}) => {
  return (
    <div
      className={`card card-interactive ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          {title}
        </span>
        {Icon && (
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: iconBg,
              color: iconColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={20} />
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
        <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {value}
        </span>
        {trend && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.2rem',
              fontSize: '0.75rem',
              fontWeight: 600,
              color: trendDirection === 'up' ? 'var(--success-600)' : trendDirection === 'down' ? 'var(--danger-600)' : 'var(--text-muted)',
              backgroundColor: trendDirection === 'up' ? 'var(--success-50)' : trendDirection === 'down' ? 'var(--danger-50)' : 'var(--bg-surface-secondary)',
              padding: '0.15rem 0.45rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {trendDirection === 'up' && <TrendingUp size={12} />}
            {trendDirection === 'down' && <TrendingDown size={12} />}
            {trend}
          </span>
        )}
      </div>

      {subtitle && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {subtitle}
        </span>
      )}
    </div>
  );
};

export default StatCard;
