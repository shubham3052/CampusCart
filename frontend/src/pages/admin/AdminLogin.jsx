import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  Mail,
  LogIn,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Eye,
  EyeOff,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, logout } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!email || !password) {
      setFormError('Please provide both administrator email and application password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      const role = result.user?.role;

      if (role !== 'ADMIN' && role !== 'PLATFORM_OWNER') {
        await logout();
        setFormError(
          `Access Denied: The account has role '${role}'. Only Administrator and System Owner accounts are permitted to access this portal.`
        );
        return;
      }

      if (role === 'PLATFORM_OWNER') {
        navigate('/platform-owner/dashboard', { replace: true });
      } else {
        navigate('/admin/dashboard', { replace: true });
      }
    } catch (err) {
      console.error('Administrator login error:', err);
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.message ||
        err.message ||
        'Authentication failed. Please verify administrator credentials.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
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
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: 'clamp(1.75rem, 5vw, 2.75rem)',
          backgroundColor: '#0f172a',
          border: '1px solid rgba(99, 102, 241, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.15)',
          borderRadius: 'var(--radius-xl)',
          color: '#f8fafc',
        }}
      >
        {/* Branding & Apex Badge */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <img
              src="/assets/campuscart-logo.png"
              alt="CampusCart Logo"
              style={{
                height: '46px',
                width: 'auto',
                maxWidth: '160px',
                objectFit: 'contain',
              }}
            />
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                border: '1px solid rgba(99, 102, 241, 0.45)',
                color: '#818cf8',
                padding: '0.25rem 0.65rem',
                borderRadius: '9999px',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              <ShieldCheck size={13} />
              Admin Portal
            </div>
          </div>
          <h2
            style={{
              fontSize: '1.45rem',
              fontWeight: 800,
              color: '#f8fafc',
              margin: '0 0 0.4rem 0',
              letterSpacing: '-0.025em',
            }}
          >
            Administrator Control Center
          </h2>
          <p
            style={{
              fontSize: '0.8125rem',
              color: '#94a3b8',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Authorized access only. System activity and authentication events are cryptographically audited.
          </p>
        </div>

        {/* Form Error Notice */}
        {formError && (
          <ErrorMessage
            message={formError}
            style={{
              marginBottom: '1.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              borderColor: 'rgba(239, 68, 68, 0.35)',
              color: '#fca5a5',
            }}
          />
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '0.4rem',
              }}
            >
              Administrator Email
            </label>
            <Input
              type="email"
              placeholder="admin@campus.edu"
              icon={Mail}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isSubmitting}
              autoComplete="username"
              style={{
                backgroundColor: '#1e293b',
                borderColor: '#334155',
                color: '#f8fafc',
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: '#cbd5e1',
                marginBottom: '0.4rem',
              }}
            >
              Application Password
            </label>
            <div style={{ position: 'relative' }}>
              <Input
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter your administrative password"
                icon={Lock}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
                style={{
                  backgroundColor: '#1e293b',
                  borderColor: '#334155',
                  color: '#f8fafc',
                }}
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
                  padding: '4px',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            icon={LogIn}
            style={{
              width: '100%',
              backgroundColor: '#6366f1',
              borderColor: '#6366f1',
              fontWeight: 700,
              letterSpacing: '0.01em',
              boxShadow: '0 4px 14px 0 rgba(99, 102, 241, 0.45)',
              marginTop: '0.5rem',
            }}
          >
            Authenticate Admin
          </Button>
        </form>

        {/* Verification Link for Invited Admins */}
        <div
          style={{
            marginTop: '1.75rem',
            padding: '1rem',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '0.8125rem', color: '#cbd5e1', marginBottom: '0.35rem' }}>
            Received an administrator invitation?
          </div>
          <Link
            to="/admin/invitation/verify"
            style={{
              color: '#818cf8',
              fontSize: '0.8125rem',
              fontWeight: 700,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <UserPlus size={14} /> Enter 6-Digit OTP & Set Password
          </Link>
        </div>

        {/* Regular portal link */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid #1e293b' }}>
          <Link
            to="/login"
            style={{
              fontSize: '0.8125rem',
              color: '#94a3b8',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            Student or Merchant Portal <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
