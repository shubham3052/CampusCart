import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Mail,
  Lock,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Clock,
  KeyRound,
  AlertCircle,
} from 'lucide-react';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import authService from '../../services/authService';

const ForgotPassword = () => {
  const navigate = useNavigate();

  // Steps: 1 = Request, 2 = Verify OTP, 3 = New Password, 4 = Success
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [infoMsg, setInfoMsg] = useState('');
  const [cooldown, setCooldown] = useState(60);

  const inputRefs = useRef([]);

  // Live cooldown timer for Step 2
  useEffect(() => {
    let timer = null;
    if (step === 2 && cooldown > 0) {
      timer = setInterval(() => {
        setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [step, cooldown]);

  // Step 1: Request Password Reset Code
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    if (!email) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const response = await authService.requestPasswordReset(email);
      setInfoMsg(response.message || 'Verification code sent to your email.');
      setStep(2);
      setCooldown(60);
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    } catch (err) {
      console.error('Password reset request error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to send reset code.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Digit Input Handlers
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
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    inputRefs.current[Math.min(pasted.length, 5)]?.focus();
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpCode = digits.join('');
    if (otpCode.length !== 6) {
      setErrorMsg('Please enter all 6 digits of the reset code.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const response = await authService.verifyPasswordResetOtp(email, otpCode);
      setResetToken(response.reset_token);
      setInfoMsg('Code verified! Please create your new password.');
      setStep(3);
    } catch (err) {
      console.error('Password reset verify error:', err);
      const msg = err.response?.data?.message || err.message || 'Invalid or expired reset code.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || isLoading) return;
    setIsLoading(true);
    setErrorMsg('');
    try {
      await authService.requestPasswordReset(email);
      setInfoMsg('A new 6-digit code has been dispatched to your email.');
      setCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setErrorMsg(err.response?.data?.message || 'Failed to resend code.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Confirm New Password
  const handleConfirmPassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (!/\d/.test(newPassword)) {
      setErrorMsg('Password must contain at least one numerical digit.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      const response = await authService.confirmPasswordReset(email, resetToken, newPassword);
      setInfoMsg(response.message || 'Password updated successfully!');
      setStep(4);
    } catch (err) {
      console.error('Password confirm error:', err);
      const msg = err.response?.data?.message || err.message || 'Failed to update password.';
      setErrorMsg(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '2.5rem',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)',
          backgroundColor: '#ffffff',
        }}
      >
        {/* CampusCart Brand Logo */}
        <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
          <img
            src="/assets/campuscart-logo.png"
            alt="CampusCart Logo"
            style={{
              height: '44px',
              width: 'auto',
              maxWidth: '150px',
              objectFit: 'contain',
              display: 'inline-block',
            }}
          />
        </div>

        {/* Header Icon */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: 'var(--radius-lg)',
              background:
                step === 4
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              marginBottom: '1rem',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.3)',
            }}
          >
            {step === 1 && <KeyRound size={26} />}
            {step === 2 && <ShieldCheck size={26} />}
            {step === 3 && <Lock size={26} />}
            {step === 4 && <CheckCircle2 size={28} />}
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            {step === 1 && 'Reset Password'}
            {step === 2 && 'Enter Verification Code'}
            {step === 3 && 'Set New Password'}
            {step === 4 && 'Password Reset Complete!'}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.4rem', marginBottom: 0 }}>
            {step === 1 && 'Enter your campus email to receive a 6-digit OTP'}
            {step === 2 && `We sent a code to ${email}`}
            {step === 3 && 'Choose a strong password for your account'}
            {step === 4 && 'Your password has been securely updated.'}
          </p>
        </div>

        {/* Alerts */}
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
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        {infoMsg && step !== 4 && (
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
            }}
          >
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* STEP 1: Request Code */}
        {step === 1 && (
          <form onSubmit={handleRequestOtp}>
            <Input
              label="Email Address"
              type="email"
              placeholder="student@college.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              leftIcon={Mail}
              required
              autoFocus
            />

            <div style={{ marginTop: '1.5rem' }}>
              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading}>
                Send Reset Code
              </Button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <Link
                to="/login"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                  fontWeight: 500,
                }}
              >
                <ArrowLeft size={16} /> Back to Sign In
              </Link>
            </div>
          </form>
        )}

        {/* STEP 2: Enter 6-digit Code */}
        {step === 2 && (
          <form onSubmit={handleVerifyOtp}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.5rem',
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
                  disabled={isLoading}
                  style={{
                    width: '46px',
                    height: '54px',
                    fontSize: '1.5rem',
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
                  }}
                />
              ))}
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isLoading}
              disabled={digits.some((d) => !d) || isLoading}
            >
              Verify Code
            </Button>

            <div
              style={{
                marginTop: '1.25rem',
                textAlign: 'center',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
              }}
            >
              Didn't receive code?{' '}
              {cooldown > 0 ? (
                <span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>
                  <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> Resend in {cooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendOtp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--primary-600)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Resend Code
                </button>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                ← Change Email Address
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: Set New Password */}
        {step === 3 && (
          <form onSubmit={handleConfirmPassword}>
            <Input
              label="New Password"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftIcon={Lock}
              helperText="At least 8 characters with at least one number"
              required
              autoFocus
            />

            <div style={{ marginTop: '1rem' }}>
              <Input
                label="Confirm New Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                leftIcon={Lock}
                required
              />
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <Button type="submit" variant="primary" size="lg" fullWidth isLoading={isLoading}>
                Update Password
              </Button>
            </div>
          </form>
        )}

        {/* STEP 4: Reset Success */}
        {step === 4 && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '1.5rem' }}>
              You can now sign in to your Smart Student Stationery account with your new password.
            </p>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={() => navigate('/login')}
            >
              Sign In Now
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
