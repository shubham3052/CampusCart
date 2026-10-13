import React, { useState, useEffect } from 'react';
import {
  Shield,
  Lock,
  Mail,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowRight,
  Eye,
  EyeOff,
  QrCode,
  Sparkles,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import authService from '../../services/authService';
import Button from '../common/Button';
import ErrorMessage from '../common/ErrorMessage';

const OwnerPasswordSetupModal = ({ isOpen, onClose, initialEmail = 'garibhokya@gmail.com', onSuccess }) => {
  const [step, setStep] = useState(1); // 1: Email, 2: Gmail OTP, 3: TOTP (Enroll/Verify), 4: New Password, 5: Success
  const [email, setEmail] = useState(initialEmail);
  const [otpCode, setOtpCode] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [stageToken, setStageToken] = useState('');
  const [totpEnrolled, setTotpEnrolled] = useState(false);
  const [enrollmentData, setEnrollmentData] = useState(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setEmail(initialEmail || 'garibhokya@gmail.com');
      setOtpCode('');
      setTotpCode('');
      setStageToken('');
      setTotpEnrolled(false);
      setEnrollmentData(null);
      setNewPassword('');
      setConfirmPassword('');
      setError('');
    }
  }, [isOpen, initialEmail]);

  useEffect(() => {
    let timer;
    if (cooldown > 0) {
      timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!isOpen) return null;

  // Step 1: Request Setup
  const handleRequestSetup = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await authService.requestOwnerPasswordSetup(email);
      setStageToken(res.stage_token);
      setStep(2);
      setCooldown(60);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Unable to initiate setup. Verify this is the authorized Platform Owner account.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend Gmail OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || resending || !stageToken) return;
    setError('');
    setResending(true);
    try {
      const res = await authService.resendOwnerPasswordSetupOTP(stageToken);
      setStageToken(res.stage_token);
      setCooldown(60);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Failed to resend verification code. Please wait before retrying.'
      );
    } finally {
      setResending(false);
    }
  };

  // Step 2: Verify Gmail OTP
  const handleVerifyEmail = async (e) => {
    e?.preventDefault();
    if (otpCode.length !== 6) {
      setError('Please enter the full 6-digit code received via Gmail.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authService.verifyOwnerPasswordSetupEmail(stageToken, otpCode);
      setStageToken(res.stage_token);
      setTotpEnrolled(res.totp_enrolled);
      if (!res.totp_enrolled && res.enrollment) {
        setEnrollmentData(res.enrollment);
      }
      setStep(3);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Invalid or expired verification code.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Verify TOTP Code
  const handleVerifyTotp = async (e) => {
    e?.preventDefault();
    if (totpCode.length !== 6) {
      setError('Please enter the 6-digit code displayed in Microsoft Authenticator.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authService.verifyOwnerPasswordSetupTOTP(stageToken, totpCode);
      setStageToken(res.stage_token);
      setStep(4);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Invalid authenticator code. Check that your device time is synchronized.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Complete Password Setup
  const handleCompleteSetup = async (e) => {
    e?.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setError('Password must contain at least one numerical digit.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const res = await authService.completeOwnerPasswordSetup(
        stageToken,
        newPassword,
        confirmPassword
      );
      setStep(5);
      if (onSuccess) {
        onSuccess(email);
      }
    } catch (err) {
      setError(
        err.response?.data?.new_password?.[0] ||
        err.response?.data?.confirm_password?.[0] ||
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Failed to set new password. Ensure it satisfies complexity requirements.'
      );
    } finally {
      setLoading(false);
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
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: '16px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.85), 0 0 35px rgba(99, 102, 241, 0.2)',
          padding: '2rem',
          color: '#f8fafc',
          position: 'relative',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1.25rem',
            right: '1.25rem',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
          }}
          title="Close"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.75rem',
              boxShadow: '0 0 20px rgba(99, 102, 241, 0.4)',
            }}
          >
            <Shield size={24} color="#ffffff" />
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
            {step === 5
              ? 'Password Setup Complete'
              : 'Initial Platform Owner Password Setup'}
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
            {step === 1 && 'Establish your personal master password with mandatory multi-factor authentication.'}
            {step === 2 && `Enter the 6-digit OTP code dispatched to ${email}`}
            {step === 3 && (totpEnrolled
              ? 'Verify your identity with Microsoft Authenticator'
              : 'Enroll Microsoft Authenticator before establishing your password')}
            {step === 4 && 'Choose your new personal Platform Owner password'}
            {step === 5 && 'Your account credentials have been securely updated.'}
          </p>
        </div>

        {/* Stage Progress Pills */}
        {step < 5 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: '0.5rem',
              marginBottom: '1.5rem',
            }}
          >
            {[
              { num: 1, label: 'Email' },
              { num: 2, label: 'Gmail OTP' },
              { num: 3, label: 'TOTP' },
              { num: 4, label: 'Password' },
            ].map((s) => (
              <div
                key={s.num}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  backgroundColor: step === s.num
                    ? 'rgba(99, 102, 241, 0.3)'
                    : step > s.num
                    ? 'rgba(16, 185, 129, 0.2)'
                    : 'rgba(30, 41, 59, 0.8)',
                  color: step === s.num
                    ? '#a5b4fc'
                    : step > s.num
                    ? '#34d399'
                    : '#64748b',
                  border: step === s.num
                    ? '1px solid rgba(99, 102, 241, 0.5)'
                    : '1px solid transparent',
                }}
              >
                {step > s.num ? `✓ ${s.label}` : `${s.num}. ${s.label}`}
              </div>
            ))}
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div style={{ marginBottom: '1.25rem' }}>
            <ErrorMessage message={error} onDismiss={() => setError('')} />
          </div>
        )}

        {/* STEP 1: Request Setup */}
        {step === 1 && (
          <form onSubmit={handleRequestSetup}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.4rem',
                }}
              >
                Platform Owner Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="garibhokya@gmail.com"
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem 0.75rem 2.5rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
                <Mail
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '0.85rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#64748b',
                  }}
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.4rem' }}>
                Only the registered Platform Owner (garibhokya@gmail.com) can initialize account credentials.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={loading}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                fontWeight: 600,
              }}
            >
              Send Gmail Verification Code
            </Button>
          </form>
        )}

        {/* STEP 2: Gmail OTP */}
        {step === 2 && (
          <form onSubmit={handleVerifyEmail}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.4rem',
                }}
              >
                6-Digit Gmail OTP Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  letterSpacing: '0.5em',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '1.5rem',
              }}
            >
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={cooldown > 0 || resending}
                style={{
                  background: 'none',
                  border: 'none',
                  color: cooldown > 0 ? '#64748b' : '#a5b4fc',
                  fontSize: '0.82rem',
                  cursor: cooldown > 0 ? 'default' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: 0,
                }}
              >
                <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend verification code'}
              </button>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={loading}
              disabled={otpCode.length !== 6}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                fontWeight: 600,
              }}
            >
              Verify Gmail Code & Continue
            </Button>
          </form>
        )}

        {/* STEP 3: TOTP Verification / Enrollment */}
        {step === 3 && (
          <form onSubmit={handleVerifyTotp}>
            {!totpEnrolled && enrollmentData ? (
              <div
                style={{
                  backgroundColor: '#1e293b',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.25rem',
                  border: '1px solid #334155',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', color: '#a5b4fc', fontSize: '0.85rem', fontWeight: 600 }}>
                  <Smartphone size={16} /> Scan with Microsoft Authenticator
                </div>

                {enrollmentData.qr_code_data_uri && (
                  <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
                    <img
                      src={enrollmentData.qr_code_data_uri}
                      alt="Authenticator QR Code"
                      style={{
                        width: '180px',
                        height: '180px',
                        borderRadius: '8px',
                        border: '4px solid #ffffff',
                      }}
                    />
                  </div>
                )}

                <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
                  Manual Entry Key:
                </div>
                <code
                  style={{
                    backgroundColor: '#0f172a',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    color: '#f8fafc',
                    letterSpacing: '0.1em',
                    fontWeight: 700,
                    userSelect: 'all',
                    display: 'inline-block',
                  }}
                >
                  {enrollmentData.manual_entry_key}
                </code>
              </div>
            ) : null}

            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.4rem',
                }}
              >
                6-Digit Authenticator Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                autoFocus
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  letterSpacing: '0.5em',
                  fontWeight: 700,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={loading}
              disabled={totpCode.length !== 6}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                fontWeight: 600,
              }}
            >
              Verify Authenticator Code
            </Button>
          </form>
        )}

        {/* STEP 4: Choose New Password */}
        {step === 4 && (
          <form onSubmit={handleCompleteSetup}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.4rem',
                }}
              >
                New Master Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 8 chars, 1+ number"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '0.75rem 2.5rem 0.75rem 1rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: '#cbd5e1',
                  marginBottom: '0.4rem',
                }}
              >
                Confirm New Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  style={{
                    width: '100%',
                    padding: '0.75rem 2.5rem 0.75rem 1rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={loading}
              disabled={!newPassword || !confirmPassword}
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                fontWeight: 700,
              }}
            >
              Establish Platform Owner Password
            </Button>
          </form>
        )}

        {/* STEP 5: Success Confirmation */}
        {step === 5 && (
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#10b981',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1rem',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <p style={{ fontSize: '0.95rem', color: '#e2e8f0', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Your Platform Owner master password has been successfully established and all previous sessions have been revoked.
              <br /><br />
              You may now proceed to log in with your new password, Gmail OTP, and Microsoft Authenticator code.
            </p>

            <Button
              type="button"
              variant="primary"
              size="lg"
              fullWidth
              onClick={onClose}
              style={{
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                fontWeight: 700,
              }}
            >
              Proceed to Platform Owner Login
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerPasswordSetupModal;
