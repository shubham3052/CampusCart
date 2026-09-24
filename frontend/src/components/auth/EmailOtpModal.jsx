import React, { useState, useEffect, useRef } from 'react';
import {
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock,
  RotateCw,
  X,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import authService from '../../services/authService';
import Button from '../common/Button';

const EmailOtpModal = ({
  isOpen,
  email,
  purpose = 'EMAIL_VERIFICATION',
  onSuccess,
  onClose,
  canDismiss = true,
  title = 'Verify Your Email Address',
  subtitle = 'We sent a 6-digit verification code to',
}) => {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(60);
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);

  const inputRefs = useRef([]);

  // Reset & focus first input on open
  useEffect(() => {
    if (isOpen) {
      setDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      setVerifiedSuccess(false);
      setCooldown(60);
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [isOpen]);

  // Live countdown timer
  useEffect(() => {
    let timer = null;
    if (isOpen && cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, cooldown]);

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
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pastedData) return;

    const newDigits = [...digits];
    for (let i = 0; i < pastedData.length; i++) {
      newDigits[i] = pastedData[i];
    }
    setDigits(newDigits);

    const nextIndex = Math.min(pastedData.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      setErrorMsg('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    try {
      const response = await authService.verifyEmailOtp(email, otpCode, purpose);
      setVerifiedSuccess(true);
      setSuccessMsg(response.message || 'Email verified successfully!');
      setTimeout(() => {
        if (onSuccess) onSuccess(response);
        if (onClose) onClose();
      }, 1200);
    } catch (err) {
      console.error('OTP Verification Error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        'Verification failed. Please check the code and try again.';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const response = await authService.resendEmailOtp(email, purpose);
      setSuccessMsg(response.message || 'A new verification code has been dispatched.');
      setCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      console.error('OTP Resend Error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        'Failed to resend verification code. Please try again.';
      setErrorMsg(msg);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && canDismiss && onClose) onClose();
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: 'clamp(1.5rem, 5vw, 2.5rem) clamp(1rem, 4vw, 2rem)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-2xl)',
          backgroundColor: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Dismiss Button */}
        {canDismiss && onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.25rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        )}

        {/* Header Icon */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: 'var(--radius-full)',
              background: verifiedSuccess
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow: verifiedSuccess
                ? '0 6px 20px rgba(16, 185, 129, 0.35)'
                : '0 6px 20px rgba(99, 102, 241, 0.35)',
              transition: 'all 0.3s ease',
            }}
          >
            {verifiedSuccess ? <CheckCircle2 size={28} /> : <ShieldCheck size={28} />}
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {verifiedSuccess ? 'Email Verified!' : title}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.4rem', marginBottom: 0 }}>
            {subtitle}{' '}
            <strong style={{ color: 'var(--primary-700)', fontWeight: 600 }}>{email}</strong>
          </p>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#b91c1c',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              lineHeight: 1.4,
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Success Alert */}
        {successMsg && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              color: '#15803d',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
              lineHeight: 1.4,
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{successMsg}</span>
          </div>
        )}

        {!verifiedSuccess ? (
          <form onSubmit={handleVerify}>
            {/* 6 Digit Input Boxes */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 'clamp(0.25rem, 1.5vw, 0.5rem)',
                marginBottom: '1.75rem',
              }}
              onPaste={handlePaste}
            >
              {digits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => (inputRefs.current[idx] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  disabled={isSubmitting}
                  style={{
                    width: 'clamp(36px, 11vw, 48px)',
                    height: 'clamp(44px, 13vw, 56px)',
                    fontSize: 'clamp(1.15rem, 3.5vw, 1.5rem)',
                    fontWeight: 700,
                    textAlign: 'center',
                    borderRadius: 'var(--radius-lg)',
                    border: digit
                      ? '2px solid var(--primary-600)'
                      : '2px solid var(--border-medium)',
                    backgroundColor: digit ? 'var(--primary-50)' : '#f8fafc',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    transition: 'all 0.15s ease-in-out',
                    boxShadow: digit ? '0 0 0 3px rgba(99, 102, 241, 0.15)' : 'none',
                  }}
                />
              ))}
            </div>

            {/* Verify Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              leftIcon={ShieldCheck}
              disabled={digits.some((d) => !d) || isSubmitting}
            >
              Verify Code
            </Button>

            {/* Resend & Cooldown Footer */}
            <div
              style={{
                marginTop: '1.5rem',
                textAlign: 'center',
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
              }}
            >
              Didn't receive the code?{' '}
              {cooldown > 0 ? (
                <span
                  style={{
                    color: 'var(--primary-700)',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                  }}
                >
                  <Clock size={14} /> Resend in {cooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--primary-600)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  {isResending ? 'Sending...' : 'Resend Code'}
                </button>
              )}
            </div>

            {/* Local Development Mode Helper */}
            {typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
              <div
                style={{
                  marginTop: '1.25rem',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(99, 102, 241, 0.08)',
                  border: '1px dashed rgba(99, 102, 241, 0.3)',
                  fontSize: '0.78rem',
                  color: 'var(--primary-700)',
                  lineHeight: 1.4,
                  textAlign: 'center',
                }}
              >
                <strong>Email Delivery:</strong> Please check your email inbox and spam folder for your 6-digit code. (If testing locally without Gmail SMTP credentials, the code is output to your Django terminal).
              </div>
            )}
          </form>
        ) : (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Redirecting to your dashboard...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmailOtpModal;
