import React from 'react';
import { Clock, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Button from './Button';
import Card from './Card';

const ComingSoon = ({
  title = 'Feature In Development',
  description = 'This module will be connected to backend models and APIs in the upcoming step.',
  moduleName,
}) => {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: '600px', margin: '3rem auto', padding: '1rem' }}>
      <Card
        style={{
          textAlign: 'center',
          padding: '3rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.25rem',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--primary-50)',
            color: 'var(--primary-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Clock size={32} />
        </div>

        <div>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--primary-600)',
              backgroundColor: 'var(--primary-50)',
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {moduleName || 'Foundation Stage'}
          </span>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.75rem', color: 'var(--text-primary)' }}>
            {title}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', marginTop: '0.5rem', lineHeight: 1.6 }}>
            {description}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={() => navigate(-1)} leftIcon={ArrowLeft}>
            Go Back
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ComingSoon;
