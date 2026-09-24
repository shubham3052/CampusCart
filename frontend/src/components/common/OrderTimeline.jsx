import React from 'react';
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  ShoppingBag,
} from 'lucide-react';

/**
 * Visual Order Lifecycle Timeline Component
 * Maps backend Order.Status to human-readable milestone progression.
 */
const OrderTimeline = ({ status, fulfillmentType = 'PICKUP' }) => {
  const isCancelled = status === 'CANCELLED';

  const pickupSteps = [
    { key: 'PENDING', label: 'Order Placed', icon: Clock },
    { key: 'CONFIRMED', label: 'Shop Accepted', icon: CheckCircle2 },
    { key: 'PREPARING', label: 'Preparing', icon: Package },
    { key: 'READY', label: 'Ready for Pickup', icon: ShoppingBag },
    { key: 'COMPLETED', label: 'Pickup Completed', icon: CheckCircle },
  ];

  const deliverySteps = [
    { key: 'PENDING', label: 'Order Placed', icon: Clock },
    { key: 'CONFIRMED', label: 'Shop Accepted', icon: CheckCircle2 },
    { key: 'PREPARING', label: 'Preparing', icon: Package },
    { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: Truck },
    { key: 'DELIVERED', label: 'Delivered', icon: CheckCircle },
  ];

  const steps = fulfillmentType === 'DELIVERY' ? deliverySteps : pickupSteps;

  const getStepIndex = (currentStatus) => {
    switch (currentStatus) {
      case 'PENDING':
        return 0;
      case 'CONFIRMED':
        return 1;
      case 'PREPARING':
        return 2;
      case 'READY':
      case 'READY_FOR_PICKUP':
      case 'OUT_FOR_DELIVERY':
        return 3;
      case 'PICKED_UP':
      case 'DELIVERED':
      case 'COMPLETED':
        return 4;
      default:
        return 0;
    }
  };

  const currentIndex = isCancelled ? -1 : getStepIndex(status);

  if (isCancelled) {
    return (
      <div
        style={{
          padding: '1rem 1.25rem',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          color: '#991b1b',
        }}
      >
        <XCircle size={24} color="#dc2626" />
        <div>
          <h4 style={{ fontWeight: 700, margin: 0, fontSize: '0.95rem' }}>Order Cancelled</h4>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#b91c1c' }}>
            This order was cancelled. Reserved stationery inventory and pickup slots have been restored.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '1.25rem 0' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        {/* Background Connecting Bar */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '32px',
            right: '32px',
            height: '3px',
            backgroundColor: 'var(--border-light)',
            zIndex: 1,
          }}
        />

        {/* Active Progress Bar */}
        <div
          style={{
            position: 'absolute',
            top: '20px',
            left: '32px',
            width: `${Math.max(0, (currentIndex / (steps.length - 1)) * 100)}%`,
            maxWidth: 'calc(100% - 64px)',
            height: '3px',
            backgroundColor: 'var(--primary-600)',
            transition: 'width 0.4s ease',
            zIndex: 2,
          }}
        />

        {/* Steps */}
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isDone = idx < currentIndex;
          const isCurrent = idx === currentIndex;

          let circleBg = 'var(--bg-surface)';
          let circleBorder = 'var(--border-medium)';
          let iconColor = 'var(--text-muted)';
          let textColor = 'var(--text-muted)';
          let fontWeight = 500;

          if (isDone) {
            circleBg = 'var(--primary-600)';
            circleBorder = 'var(--primary-600)';
            iconColor = '#ffffff';
            textColor = 'var(--text-primary)';
            fontWeight = 600;
          } else if (isCurrent) {
            circleBg = 'var(--primary-50)';
            circleBorder = 'var(--primary-600)';
            iconColor = 'var(--primary-600)';
            textColor = 'var(--primary-700)';
            fontWeight = 700;
          }

          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 3,
                textAlign: 'center',
                flex: 1,
              }}
            >
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: circleBg,
                  border: `2px solid ${circleBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: iconColor,
                  boxShadow: isCurrent ? '0 0 0 4px var(--primary-100)' : 'none',
                  transition: 'all 0.25s ease',
                }}
              >
                {isDone ? <CheckCircle2 size={20} /> : <StepIcon size={18} />}
              </div>
              <span
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: textColor,
                  fontWeight: fontWeight,
                  lineHeight: 1.2,
                  maxWidth: '85px',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderTimeline;
