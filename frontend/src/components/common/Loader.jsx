import React from 'react';
import { Loader2 } from 'lucide-react';

const SIZE_MAP = {
  xs: 14,
  sm: 18,
  small: 18,
  md: 24,
  medium: 24,
  lg: 32,
  large: 36,
  xl: 40,
  '2xl': 48,
};

const resolveSize = (size) => {
  if (typeof size === 'number') {
    return size;
  }
  if (typeof size === 'string') {
    const trimmed = size.trim().toLowerCase();
    if (SIZE_MAP[trimmed]) {
      return SIZE_MAP[trimmed];
    }
    const parsed = parseInt(trimmed, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 28;
};

export const Spinner = ({ size = 28, color = 'var(--primary-600)', className = '' }) => {
  const numericSize = resolveSize(size);
  return (
    <Loader2
      size={numericSize}
      className={`animate-spin ${className}`.trim()}
      style={{ color }}
    />
  );
};

export const FullPageLoader = ({ message = 'Loading Smart Stationery...' }) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        gap: '1rem',
        padding: '2rem',
      }}
    >
      <Spinner size={36} />
      <p style={{ color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.95rem' }}>
        {message}
      </p>
    </div>
  );
};

export const Skeleton = ({ height = '1.5rem', width = '100%', borderRadius = 'var(--radius-md)', className = '' }) => {
  return (
    <div
      className={className}
      style={{
        height,
        width,
        borderRadius,
        backgroundColor: 'var(--bg-surface-secondary)',
        backgroundImage: 'linear-gradient(90deg, var(--bg-surface-secondary) 0%, var(--bg-surface-tertiary) 50%, var(--bg-surface-secondary) 100%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s infinite',
      }}
    />
  );
};

export default Spinner;
