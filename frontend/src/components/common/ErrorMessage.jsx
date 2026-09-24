import React from 'react';
import { AlertCircle, RefreshCw, X } from 'lucide-react';
import Button from './Button';

const ErrorMessage = ({
  title = 'Something went wrong',
  message,
  onRetry,
  onDismiss,
  className = '',
}) => {
  if (!message) return null;

  return (
    <div
      className={`animate-fade-in ${className}`.trim()}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.85rem',
        padding: '1rem',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--danger-50)',
        border: '1px solid var(--danger-100)',
        color: 'var(--danger-700)',
        marginBottom: '1rem',
      }}
    >
      <AlertCircle size={20} style={{ color: 'var(--danger-600)', flexShrink: 0, marginTop: '2px' }} />
      <div style={{ flex: 1 }}>
        <h5 style={{ color: 'var(--danger-700)', fontWeight: 600, fontSize: '0.925rem' }}>{title}</h5>
        <p style={{ color: 'var(--danger-600)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
          {typeof message === 'string' ? message : JSON.stringify(message)}
        </p>
        {onRetry && (
          <div style={{ marginTop: '0.6rem' }}>
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              leftIcon={RefreshCw}
              style={{ borderColor: 'var(--danger-200)', color: 'var(--danger-700)', background: 'white' }}
            >
              Try Again
            </Button>
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--danger-500)',
            padding: '2px',
          }}
          aria-label="Dismiss error"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};

export default ErrorMessage;
