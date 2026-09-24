import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const Input = forwardRef(({
  label,
  error,
  helperText,
  id,
  type = 'text',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className = '',
  required = false,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label} {required && <span style={{ color: 'var(--danger-500)' }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {LeftIcon && (
          <span style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none', zIndex: 1 }}>
            <LeftIcon size={18} />
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={effectiveType}
          required={required}
          className={`form-input ${error ? 'is-invalid' : ''}`}
          style={{
            paddingLeft: LeftIcon ? '2.5rem' : '0.9rem',
            paddingRight: (isPassword || RightIcon) ? '2.6rem' : '0.9rem',
          }}
          {...props}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword(prev => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            title={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: '0.75rem',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '4px',
              borderRadius: 'var(--radius-sm, 4px)',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        ) : (
          RightIcon && (
            <span style={{ position: 'absolute', right: '0.85rem', color: 'var(--text-muted)', display: 'flex', pointerEvents: 'none' }}>
              <RightIcon size={18} />
            </span>
          )
        )}
      </div>
      {error && <span className="form-error">{error}</span>}
      {!error && helperText && <span className="form-help">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';

export default Input;
