import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  Clock,
  X,
  ArrowRight,
  Smartphone,
} from 'lucide-react';
import Button from '../common/Button';

const TotpModal = ({
  isOpen,
  preAuthToken,
  onVerify,
  onSuccess,
  onClose,
  canDismiss = true,
  title = 'Microsoft Authenticator',
  subtitle = 'Enter the 6-digit code from your Microsoft Authenticator app.',
  initialError = '',
}) => {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(initialError || '');
  const [successMsg, setSuccessMsg] = useState('');
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const inputRefs = useRef([]);

  // Focus first input on open
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', '']);
      setErrorMsg(initialError || '');
      setSuccessMsg('');
      setVerifiedSuccess(false);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [isOpen, initialError]);

  if (!isOpen) return null;

  const handleDigitChange = (index, value) => {
    setErrorMsg('');
    const cleanVal = value.replace(/\D/g, '');

    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    // Handle single character typed
    const char = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

    // Auto-advance to next box
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    setErrorMsg('');
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    const targetIdx = Math.min(pasted.length, 5);
    inputRefs.current[targetIdx]?.focus();
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    const code = digits.join('');

    if (code.length !== 6) {
      setErrorMsg('Please enter all 6 digits from Microsoft Authenticator.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      if (onVerify) {
        await onVerify(code);
      }
      setVerifiedSuccess(true);
      setSuccessMsg('Microsoft Authenticator code verified successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 700);
    } catch (err) {
      console.error('TOTP verification error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.response?.data?.code?.[0] ||
        err.message ||
        'Invalid Authenticator code. Please check your app and try again.';
      setErrorMsg(msg);
      // Clear digits on error and refocus first
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 7, 12, 0.85)',
        backdropFilter: 'blur(8px)',
        padding: '1rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && canDismiss && onClose) {
          onClose();
        }
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: 'clamp(1.75rem, 5vw, 2.5rem)',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.2)',
          borderRadius: 'var(--radius-xl)',
          color: '#f8fafc',
          position: 'relative',
        }}
      >
        {/* Dismiss Button */}
        {canDismiss && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to login"
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        )}

        {/* Modal Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-xl)',
              background: verifiedSuccess
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: verifiedSuccess
                ? '0 0 25px rgba(16, 185, 129, 0.4)'
                : '0 0 25px rgba(99, 102, 241, 0.4)',
              transition: 'all 0.3s ease',
            }}
          >
            {verifiedSuccess ? (
              <ShieldCheck size={28} color="#ffffff" />
            ) : (
              <Smartphone size={28} color="#ffffff" />
            )}
          </div>

          <h2
            style={{
              fontSize: '1.45rem',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              margin: '0 0 0.5rem 0',
            }}
          >
            {title}
          </h2>

          <p
            style={{
              fontSize: '0.875rem',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {subtitle}
          </p>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              color: '#fca5a5',
              fontSize: '0.85rem',
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.85rem 1rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: 'var(--radius-md)',
              marginBottom: '1.25rem',
              color: '#6ee7b7',
              fontSize: '0.85rem',
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 6-digit Code Input Grid */}
        <form onSubmit={handleVerify}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 'clamp(6px, 2vw, 12px)',
              marginBottom: '1.5rem',
            }}
            onPaste={handlePaste}
          >
            {digits.map((digit, idx) => (
              <input
                key={idx}
                ref={(el) => (inputRefs.current[idx] = el)}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                disabled={isSubmitting || verifiedSuccess}
                onChange={(e) => handleDigitChange(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
                style={{
                  width: 'clamp(42px, 12vw, 52px)',
                  height: 'clamp(50px, 14vw, 58px)',
                  textAlign: 'center',
                  fontSize: '1.5rem',
                  fontWeight: 700,
                  backgroundColor: '#1e293b',
                  color: '#ffffff',
                  border: digit
                    ? '2px solid #6366f1'
                    : '1px solid rgba(148, 163, 184, 0.3)',
                  borderRadius: 'var(--radius-lg, 8px)',
                  outline: 'none',
                  boxShadow: digit ? '0 0 12px rgba(99, 102, 241, 0.35)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              />
            ))}
          </div>

          {/* Micro-note explaining 30-second cycle */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              color: '#94a3b8',
              fontSize: '0.8rem',
              marginBottom: '1.75rem',
            }}
          >
            <Clock size={14} color="#6366f1" />
            <span>The code changes every 30 seconds.</span>
          </div>

          {/* Action Buttons */}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            disabled={isSubmitting || verifiedSuccess || digits.join('').length !== 6}
            rightIcon={ArrowRight}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              fontWeight: 700,
              padding: '0.85rem 1.5rem',
            }}
          >
            Verify
          </Button>

          {canDismiss && onClose && (
            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  textDecoration: 'underline',
                }}
              >
                Back to login
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default TotpModal;
