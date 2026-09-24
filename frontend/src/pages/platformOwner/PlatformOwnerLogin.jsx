import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, Crown, LogIn, ArrowRight, ShieldAlert, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerLogin = () => {
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
      setFormError('Please provide both administrative email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      const role = result.user?.role;

      if (role !== 'PLATFORM_OWNER') {
        await logout();
        setFormError(
          `Access Denied: The authenticated account has role '${role}'. Only Platform Owner accounts are permitted to access this portal.`
        );
        return;
      }

      navigate('/platform-owner/dashboard', { replace: true });
    } catch (err) {
      console.error('Platform Owner login error:', err);
      const msg =
        err.response?.data?.detail ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.message ||
        err.message ||
        'Authentication failed. Please verify credentials.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickFill = () => {
    setEmail('garibhokya@gmail.com');
    setPassword('SystemOwner2026!');
    setFormError('');
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
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
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
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-lg)',
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 50%, #312e81 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.45)',
              }}
            >
              <Crown size={22} color="#fbbf24" />
            </div>
          </div>
          <div
            style={{
              display: 'inline-block',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#a5b4fc',
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              padding: '0.2rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              marginBottom: '0.65rem',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            Apex System Authority
          </div>
          <h1
            style={{
              fontSize: '1.75rem',
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.02em',
              margin: '0.25rem 0',
            }}
          >
            Platform Owner Portal
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
            Highest-level system governance & operational oversight
          </p>
        </div>

        {formError && (
          <div style={{ marginBottom: '1.25rem' }}>
            <ErrorMessage message={formError} onDismiss={() => setFormError('')} />
          </div>
        )}

        <form onSubmit={handleSubmit}>
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
                placeholder="owner@platform.edu"
                style={{
                  width: '100%',
                  padding: '0.75rem 1rem 0.75rem 2.6rem',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 'var(--radius-md)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
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
              Master Password
            </label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{
                  width: '100%',
                  padding: '0.75rem 2.6rem 0.75rem 2.6rem',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: 'var(--radius-md)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              <Lock
                size={18}
                style={{
                  position: 'absolute',
                  left: '0.85rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#64748b',
                  pointerEvents: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '4px',
                  borderRadius: 'var(--radius-sm, 4px)',
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
            fullWidth
            isLoading={isSubmitting}
            leftIcon={LogIn}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              fontWeight: 700,
            }}
          >
            Authenticate Platform Owner
          </Button>
        </form>

        {/* Quick Fill Credentials Helper */}
        <div
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#a5b4fc' }}>
              Evaluation Credentials
            </div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              owner@platform.edu / PlatformOwner2026!
            </div>
          </div>
          <button
            type="button"
            onClick={quickFill}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid #4f46e5',
              background: '#312e81',
              color: '#ffffff',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <Sparkles size={14} /> Quick Fill
          </button>
        </div>

        {/* Return to standard login */}
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <Link
            to="/login"
            style={{
              fontSize: '0.85rem',
              color: '#94a3b8',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            ← Return to standard campus login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PlatformOwnerLogin;
