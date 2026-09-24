import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Sparkles, LogIn, ArrowRight, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';
import EmailOtpModal from '../../components/auth/EmailOtpModal';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [unverifiedRole, setUnverifiedRole] = useState('');

  const { login, markEmailVerified } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const redirectByRole = (role) => {
    if (role === 'PLATFORM_OWNER') navigate('/platform-owner/dashboard', { replace: true });
    else if (role === 'STUDENT') navigate('/student/home', { replace: true });
    else if (role === 'SHOP_OWNER') navigate('/shop-owner/dashboard', { replace: true });
    else if (role === 'DELIVERY_AGENT') navigate('/delivery-agent/deliveries', { replace: true });
    else if (role === 'ADMIN') navigate('/admin/dashboard', { replace: true });
    else navigate('/student/home', { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!email || !password) {
      setFormError('Please enter your email or mobile number, and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      const userRole = result.user?.role;
      const from = location.state?.from?.pathname;

      if (result.user?.email_verified === false) {
        setUnverifiedEmail(result.user.email);
        setUnverifiedRole(userRole);
        setShowOtpModal(true);
        return;
      }

      if (from) {
        navigate(from, { replace: true });
      } else {
        redirectByRole(userRole);
      }
    } catch (err) {
      console.error('Login error:', err);
      const errorMsg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.message ||
        err.message ||
        'Invalid credentials. Please check your email or mobile number, and password.';
      setFormError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickFill = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setFormError('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(0.75rem, 3vw, 1.5rem)',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          padding: 'clamp(1.5rem, 5vw, 2.5rem)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img
            src="/assets/campuscart-logo.png"
            alt="CampusCart Logo"
            style={{
              height: '52px',
              width: 'auto',
              maxWidth: '180px',
              objectFit: 'contain',
              marginBottom: '0.85rem',
              display: 'inline-block',
            }}
          />
          <h1 style={{ fontSize: '1.55rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Welcome Back
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Sign in to CampusCart Stationery & Xerox Platform
          </p>
        </div>

        {formError && (
          <ErrorMessage
            message={formError}
            onDismiss={() => setFormError('')}
          />
        )}

        <form onSubmit={handleSubmit}>
          <Input
            label="Email Address or Mobile Number"
            type="text"
            placeholder="student@college.edu or 10-digit mobile"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={Mail}
            required
            autoComplete="username"
          />

          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={Lock}
            required
            autoComplete="current-password"
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginBottom: '1.5rem',
            }}
          >
            <Link
              to="/forgot-password"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 500 }}
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            leftIcon={LogIn}
          >
            Sign In
          </Button>
        </form>

        {/* Quick Fill Demo Helpers for easy role testing */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-secondary)',
            border: '1px solid var(--border-light)',
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Quick Demo Credentials:
          </span>
          <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => quickFill('student@campus.edu', 'StudentPass123!')}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--primary-700)',
              }}
            >
              Student
            </button>
            <button
              type="button"
              onClick={() => quickFill('owner@campus.edu', 'OwnerPass123!')}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--secondary-700)',
              }}
            >
              Shop Owner
            </button>
            <button
              type="button"
              onClick={() => quickFill('admin@campus.edu', 'AdminPass123!')}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--accent-purple)',
              }}
            >
              Admin
            </button>
            <button
              type="button"
              onClick={() => quickFill('delivery@campus.edu', 'DeliveryPass123!')}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                background: 'white',
                cursor: 'pointer',
                fontWeight: 600,
                color: '#d97706',
              }}
            >
              Courier
            </button>
            <button
              type="button"
              onClick={() => quickFill('owner@platform.edu', 'PlatformOwner2026!')}
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.6rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid #6366f1',
                background: '#0f172a',
                cursor: 'pointer',
                fontWeight: 700,
                color: '#a5b4fc',
              }}
            >
              👑 Platform Owner
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <Link
              to="/platform-owner/login"
              style={{ fontSize: '0.78rem', color: '#4f46e5', fontWeight: 600, textDecoration: 'none' }}
            >
              Go to Dedicated Platform Owner Login →
            </Link>
          </div>
        </div>

        {/* Register Link */}
        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{ fontWeight: 600, color: 'var(--primary-600)' }}
            >
              Create an account
            </Link>
          </p>
        </div>
      </div>

      {/* 6-digit Email Verification OTP Modal */}
      {showOtpModal && (
        <EmailOtpModal
          isOpen={showOtpModal}
          email={unverifiedEmail || email}
          purpose="EMAIL_VERIFICATION"
          onSuccess={() => {
            markEmailVerified();
            redirectByRole(unverifiedRole);
          }}
          onClose={() => {
            setShowOtpModal(false);
            redirectByRole(unverifiedRole);
          }}
        />
      )}
    </div>
  );
};

export default Login;
