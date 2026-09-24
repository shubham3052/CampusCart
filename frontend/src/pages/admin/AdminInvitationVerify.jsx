import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ShieldCheck,
  Mail,
  KeyRound,
  CheckCircle2,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import adminManagementService from '../../services/adminManagementService';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminInvitationVerify = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1: OTP verification, 2: Password setup, 3: Completed
  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [otp, setOtp] = useState('');
  const [invitationToken, setInvitationToken] = useState('');

  // Password state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Status state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!email || !otp) {
      setError('Please provide both your registered email and the 6-digit verification code.');
      return;
    }

    if (otp.trim().length !== 6) {
      setError('The verification code must be exactly 6 digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await adminManagementService.verifyInvitationOtp({
        email: email.trim().toLowerCase(),
        otp: otp.trim(),
      });

      setInvitationToken(res.invitation_token);
      setStep(2);
      setInfoMessage('Invitation verified successfully. Please create your administrator application password.');
    } catch (err) {
      console.error('Failed to verify OTP:', err);
      let msg =
        err.response?.data?.message ||
        err.response?.data?.otp?.[0] ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.detail;

      if (!msg) {
        if (err.request && !err.response) {
          msg = 'Unable to connect to the server. Please check your network connection.';
        } else {
          msg = 'Invalid or expired verification code. Please check and try again.';
        }
      }
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || !email) return;
    setError('');
    setInfoMessage('');

    try {
      const res = await adminManagementService.resendInvitationOtp(email.trim().toLowerCase());
      setInfoMessage(res.message || 'A new verification code has been dispatched to your email.');
      setResendCooldown(60);
    } catch (err) {
      console.error('Failed to resend OTP:', err);
      let msg =
        err.response?.data?.message ||
        err.response?.data?.email?.[0] ||
        err.response?.data?.detail;

      if (!msg) {
        if (err.request && !err.response) {
          msg = 'Unable to connect to the server. Please check your network connection.';
        } else {
          msg = 'Failed to resend verification code. Please try again.';
        }
      }
      setError(msg);
    }
  };

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!password || !confirmPassword) {
      setError('Please fill in both password fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/\d/.test(password)) {
      setError('Password must contain at least one numerical digit.');
      return;
    }

    setSubmitting(true);
    try {
      await adminManagementService.setAdminPassword({
        email: email.trim().toLowerCase(),
        invitation_token: invitationToken,
        password,
        confirm_password: confirmPassword,
      });

      setStep(3);
    } catch (err) {
      console.error('Failed to set password:', err);
      const msg =
        err.response?.data?.password?.[0] ||
        err.response?.data?.invitation_token?.[0] ||
        err.response?.data?.message ||
        'Failed to activate account. The invitation session may have expired.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vw, 2rem)',
        background: 'radial-gradient(ellipse at top, #1e1b4b 0%, #090d16 65%, #05070c 100%)',
        color: '#f8fafc',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '480px',
          padding: 'clamp(1.75rem, 5vw, 2.75rem)',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.15)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Header Icon & Title */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '16px',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#818cf8',
              marginBottom: '1rem',
            }}
          >
            <ShieldCheck size={32} />
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, letterSpacing: '-0.025em' }}>
            Admin Invitation Verification
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#94a3b8', marginTop: '0.35rem' }}>
            {step === 1 && 'Enter your invitation email and the 6-digit verification OTP received in your inbox.'}
            {step === 2 && 'Set your private application password to activate your administrator account.'}
            {step === 3 && 'Account activated! You are ready to log in to the Administrator Control Center.'}
          </p>
        </div>

        {/* Notices */}
        {error && <ErrorMessage message={error} style={{ marginBottom: '1.25rem' }} />}
        {infoMessage && (
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              borderRadius: 'var(--radius-md)',
              color: '#c7d2fe',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <CheckCircle2 size={18} color="#818cf8" /> {infoMessage}
          </div>
        )}

        {/* STEP 1: Verify OTP */}
        {step === 1 && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <Input
                type="email"
                placeholder="e.g. admin@campus.edu"
                icon={Mail}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
                style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                6-Digit OTP <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <Input
                type="text"
                maxLength={6}
                placeholder="123456"
                icon={KeyRound}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                disabled={submitting}
                style={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  color: '#f8fafc',
                  fontSize: '1.25rem',
                  letterSpacing: '0.35em',
                  textAlign: 'center',
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              style={{
                width: '100%',
                backgroundColor: '#6366f1',
                borderColor: '#6366f1',
                fontWeight: 700,
                marginTop: '0.5rem',
              }}
            >
              Verify Invitation
            </Button>

            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0 || !email}
                style={{
                  background: 'none',
                  border: 'none',
                  color: resendCooldown > 0 ? '#64748b' : '#818cf8',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <RefreshCw size={14} className={resendCooldown > 0 ? 'animate-spin' : ''} />
                {resendCooldown > 0 ? `Resend OTP in ${resendCooldown}s` : 'Resend OTP'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Set Application Password */}
        {step === 2 && (
          <form onSubmit={handleSetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#94a3b8', marginBottom: '0.35rem' }}>
                Verified Account Email
              </label>
              <Input
                type="email"
                value={email}
                disabled
                icon={Mail}
                style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#94a3b8', opacity: 0.85 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                Application Password <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters with 1 number"
                  icon={Lock}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={submitting}
                  style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
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

            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.35rem' }}>
                Confirm Application Password
              </label>
              <Input
                type="password"
                placeholder="Re-enter password"
                icon={Lock}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={submitting}
                style={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
              />
            </div>

            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid #334155',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                color: '#94a3b8',
                lineHeight: 1.5,
              }}
            >
              🔒 <strong>Security Guarantee:</strong> Passwords are cryptographically salted and hashed using PBKDF2 SHA-256. Plaintext credentials are never saved or transmitted.
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={submitting}
              style={{
                width: '100%',
                backgroundColor: '#10b981',
                borderColor: '#10b981',
                fontWeight: 700,
                marginTop: '0.5rem',
              }}
            >
              Activate Administrator Account
            </Button>
          </form>
        )}

        {/* STEP 3: Complete & Proceed to Login */}
        {step === 3 && (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <CheckCircle2 size={36} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Account Successfully Activated!
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.5rem', lineHeight: 1.5 }}>
                Your administrative privileges have been provisioned on the platform. You may now log in to the Administrator Control Center.
              </p>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={() => navigate('/admin/login', { replace: true })}
              icon={ArrowRight}
              style={{
                backgroundColor: '#6366f1',
                borderColor: '#6366f1',
                fontWeight: 700,
                width: '100%',
              }}
            >
              Proceed to Admin Login
            </Button>
          </div>
        )}

        {/* Back Link */}
        <div style={{ textAlign: 'center', marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid #1e293b' }}>
          <Link
            to="/admin/login"
            style={{ fontSize: '0.8125rem', color: '#818cf8', textDecoration: 'none', fontWeight: 600 }}
          >
            Return to Administrator Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminInvitationVerify;
