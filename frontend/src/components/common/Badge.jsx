import React from 'react';

const Badge = ({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
}) => {
  const sizeStyle = size === 'sm' ? { fontSize: '0.68rem', padding: '0.15rem 0.45rem' } : {};

  return (
    <span
      className={`badge badge-${variant} ${className}`.trim()}
      style={sizeStyle}
    >
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
};

export default Badge;
