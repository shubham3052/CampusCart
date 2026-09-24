import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  X,
  ShieldAlert,
} from 'lucide-react';
import authService from '../../services/authService';
import Button from '../common/Button';

const DeleteAccountModal = ({
  isOpen,
  userEmail,
  onSuccess,
  onClose,
}) => {
  const [step, setStep] = useState('confirm'); // 'confirm' | 'otp' | 'deleted'
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cooldown, setCooldown] = useState(60);

  const inputRefs = useRef([]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setStep('confirm');
      setDigits(['', '', '', '', '', '']);
      setErrorMsg('');
      setSuccessMsg('');
      setIsRequesting(false);
      setIsDeleting(false);
      setIsResending(false);
      setCooldown(60);
    }
  }, [isOpen]);

  // Focus first input box when transitioning to OTP step
  useEffect(() => {
    if (step === 'otp') {
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 150);
    }
  }, [step]);

  // Live countdown timer
  useEffect(() => {
    let timer = null;
    if (isOpen && step === 'otp' && cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isOpen, step, cooldown]);

  if (!isOpen) return null;

  // Step 1: Request Account Deletion OTP
  const handleRequestOtp = async () => {
    setIsRequesting(true);
    setErrorMsg('');
    try {
      const res = await authService.requestAccountDeletionOtp();
      setSuccessMsg(res.message || 'Verification code dispatched to your registered email.');
      setCooldown(60);
      setStep('otp');
    } catch (err) {
      console.error('Account deletion OTP request error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        'Unable to send deletion verification code. Please try again.';
      setErrorMsg(msg);
    } finally {
      setIsRequesting(false);
    }
  };

  // Step 2: Handle 6-digit OTP inputs
  const handleDigitChange = (index, value) => {
    setErrorMsg('');
    const cleanVal = value.replace(/\D/g, '');

    if (!cleanVal) {
      const newDigits = [...digits];
      newDigits[index] = '';
      setDigits(newDigits);
      return;
    }

    const char = cleanVal.slice(-1);
    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);

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

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (cooldown > 0 || isResending) return;
    setIsResending(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await authService.requestAccountDeletionOtp();
      setSuccessMsg(res.message || 'A new verification code has been dispatched.');
      setCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      console.error('Account deletion OTP resend error:', err);
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

  // Step 3: Confirm Deletion with OTP
  const handleConfirmDeletion = async (e) => {
    if (e) e.preventDefault();
    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      setErrorMsg('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsDeleting(true);
    setErrorMsg('');
    try {
      const res = await authService.confirmAccountDeletion(otpCode);
      setStep('deleted');
      setSuccessMsg(res.message || 'Your account has been permanently deleted.');
      setTimeout(() => {
        if (onSuccess) onSuccess();
      }, 1500);
    } catch (err) {
      console.error('Confirm account deletion error:', err);
      const msg =
        err.response?.data?.message ||
        err.response?.data?.detail ||
        err.message ||
        'Verification failed. Please check the code and try again.';
      setErrorMsg(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        zIndex: 9999,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose && step !== 'deleted') onClose();
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: 'clamp(1.5rem, 5vw, 2.5rem)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-2xl)',
          backgroundColor: '#ffffff',
          position: 'relative',
        }}
      >
        {/* Dismiss Button */}
        {onClose && step !== 'deleted' && (
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
              width: '60px',
              height: '60px',
              borderRadius: 'var(--radius-full)',
              background:
                step === 'deleted'
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
              color: '#ffffff',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
              boxShadow:
                step === 'deleted'
                  ? '0 6px 20px rgba(16, 185, 129, 0.35)'
                  : '0 6px 20px rgba(239, 68, 68, 0.35)',
            }}
          >
            {step === 'deleted' ? (
              <CheckCircle2 size={32} />
            ) : step === 'otp' ? (
              <ShieldAlert size={30} />
            ) : (
              <AlertTriangle size={30} />
            )}
          </div>
          <h2
            style={{
              fontSize: '1.35rem',
              fontWeight: 800,
              color: step === 'deleted' ? 'var(--text-primary)' : '#b91c1c',
              margin: 0,
            }}
          >
            {step === 'deleted'
              ? 'Account Deleted'
              : step === 'otp'
              ? 'Verify account deletion'
              : 'Delete your account?'}
          </h2>
          <p
            style={{
              color: 'var(--text-muted)',
              fontSize: '0.875rem',
              marginTop: '0.4rem',
              marginBottom: 0,
            }}
          >
            {step === 'deleted'
              ? 'Your account and personal credentials have been removed.'
              : step === 'otp'
              ? 'Enter the 6-digit code sent to your registered email.'
              : 'This action will permanently delete your account and associated personal data. This action cannot be undone.'}
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
        {successMsg && step !== 'deleted' && (
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

        {/* STEP 1: INITIAL CONFIRMATION */}
        {step === 'confirm' && (
          <div>
            <div
              style={{
                backgroundColor: '#fff1f2',
                border: '1px solid #ffe4e6',
                borderRadius: 'var(--radius-md)',
                padding: '0.85rem 1rem',
                marginBottom: '1.5rem',
                fontSize: '0.82rem',
                color: '#9f1239',
                lineHeight: 1.5,
              }}
            >
              <strong>Security Protocol:</strong> To protect your account from unauthorized deletion, Django will dispatch a secure 6-digit verification code to your registered email address <strong>{userEmail}</strong>.
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={onClose} disabled={isRequesting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleRequestOtp}
                isLoading={isRequesting}
                leftIcon={Trash2}
              >
                Continue
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: OTP VERIFICATION */}
        {step === 'otp' && (
          <form onSubmit={handleConfirmDeletion}>
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
                  disabled={isDeleting}
                  style={{
                    width: 'clamp(36px, 11vw, 48px)',
                    height: 'clamp(44px, 13vw, 56px)',
                    fontSize: 'clamp(1.15rem, 3.5vw, 1.5rem)',
                    fontWeight: 700,
                    textAlign: 'center',
                    borderRadius: 'var(--radius-lg)',
                    border: digit
                      ? '2px solid #ef4444'
                      : '2px solid var(--border-medium)',
                    backgroundColor: digit ? '#fef2f2' : '#f8fafc',
                    color: '#991b1b',
                    outline: 'none',
                    transition: 'all 0.15s ease-in-out',
                    boxShadow: digit ? '0 0 0 3px rgba(239, 68, 68, 0.15)' : 'none',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={onClose}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                fullWidth
                isLoading={isDeleting}
                leftIcon={Trash2}
                disabled={digits.some((d) => !d) || isDeleting}
              >
                Verify and Delete Account
              </Button>
            </div>

            {/* Resend & Cooldown Footer */}
            <div
              style={{
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              Didn't receive the code?{' '}
              {cooldown > 0 ? (
                <span
                  style={{
                    color: '#b91c1c',
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
                  onClick={handleResendOtp}
                  disabled={isResending}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#b91c1c',
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
          </form>
        )}

        {/* STEP 3: DELETED */}
        {step === 'deleted' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Logging out and returning to home screen...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeleteAccountModal;
