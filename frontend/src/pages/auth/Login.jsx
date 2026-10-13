import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, LogIn, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';
import EmailOtpModal from '../../components/auth/EmailOtpModal';
import TotpModal from '../../components/auth/TotpModal';

const Login = () => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState('');
  const [unverifiedRole, setUnverifiedRole] = useState('');
  const [availableRoles, setAvailableRoles] = useState(null);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [showOwner2faModal, setShowOwner2faModal] = useState(false);
  const [owner2faData, setOwner2faData] = useState(null);
  const [showTotpModal, setShowTotpModal] = useState(false);
  const [ownerTotpData, setOwnerTotpData] = useState(null);

  const { login, markEmailVerified, switchRole, verifyOwner2FA, verifyOwnerTOTP, resendOwner2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getRoleLabel = (role) => {
    switch (role) {
      case 'STUDENT': return 'Student / Customer';
      case 'SHOP_OWNER': return 'Shop Owner';
      case 'DELIVERY_AGENT': return 'Campus Courier';
      case 'ADMIN': return 'System Administrator';
      case 'PLATFORM_OWNER': return 'Platform Owner';
      default: return role;
    }
  };

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

    const cleanIdentifier = identifier.trim();
    if (!cleanIdentifier || !password) {
      setFormError('Please enter your email, mobile number, or username, and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login(cleanIdentifier, password);

      // Platform Owner 2FA Verification intercept
      if (result.requires_2fa) {
        setOwner2faData({
          email: result.email,
          preAuthToken: result.pre_auth_token,
        });
        setShowOwner2faModal(true);
        return;
      }

      const userRole = result.user?.active_role || result.user?.role;
      const userRoles = result.user?.roles || (userRole ? [userRole] : []);
      const from = location.state?.from?.pathname;

      if (result.user?.email_verified === false) {
        setUnverifiedEmail(result.user.email);
        setUnverifiedRole(userRole);
        setShowOtpModal(true);
        return;
      }

      // If user has multiple authorized roles, prompt for role selection
      if (userRoles.length > 1) {
        setLoggedInUser(result.user);
        setAvailableRoles(userRoles);
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
        'Invalid credentials. Please check your email, mobile number, or username, and password.';
      setFormError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (availableRoles && availableRoles.length > 1) {
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
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
              Choose how you want to continue
            </h1>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Your account has multiple authorized roles. Select a portal:
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {availableRoles.map((role) => (
              <button
                key={role}
                type="button"
                className="btn btn-outline"
                onClick={async () => {
                  if (role !== loggedInUser?.active_role) {
                    await switchRole(role);
                  }
                  redirectByRole(role);
                }}
                style={{
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--card-bg, #ffffff)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{getRoleLabel(role)}</span>
                <span style={{ color: 'var(--primary-color)', fontSize: '1.1rem' }}>→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

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

        <form onSubmit={handleSubmit} noValidate>
          <Input
            id="login-identifier"
            label="Email / Mobile Number"
            type="text"
            placeholder="Email, 10-digit mobile, or username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            leftIcon={Mail}
            required
            autoComplete="username"
          />

          <Input
            id="login-password"
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
              id="login-forgot-password-link"
              style={{ fontSize: '0.85rem', color: 'var(--primary-600)', fontWeight: 500 }}
            >
              Forgot password?
            </Link>
          </div>

          <Button
            id="login-submit-button"
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

        {/* Register Link */}
        <div style={{ textAlign: 'center', marginTop: '1.75rem' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              id="login-create-account-link"
              style={{ fontWeight: 600, color: 'var(--primary-600)' }}
            >
              Create Account
            </Link>
          </p>
        </div>

        {/* Back to Home Link */}
        <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
          <Link
            to="/"
            id="login-back-home-link"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            <ArrowLeft size={14} /> Back to Home
          </Link>
        </div>
      </div>

      {/* 6-digit Email Verification OTP Modal */}
      {showOtpModal && (
        <EmailOtpModal
          isOpen={showOtpModal}
          email={unverifiedEmail || identifier}
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

      {/* Platform Owner Mandatory 2FA Verification Modal */}
      {owner2faData && (
        <EmailOtpModal
          isOpen={showOwner2faModal}
          email={owner2faData.email}
          title="Platform Owner Verification"
          subtitle="Enter the 6-digit verification code sent to your registered email."
          onVerify={async (otp) => {
            const res = await verifyOwner2FA(owner2faData.email, otp, owner2faData.preAuthToken);
            if (res?.requires_totp) {
              setOwnerTotpData({
                preAuthToken: res.pre_auth_token,
              });
              setShowOwner2faModal(false);
              setShowTotpModal(true);
              return { success: true };
            }
            return res;
          }}
          onResend={() => resendOwner2FA(owner2faData.email, owner2faData.preAuthToken)}
          onSuccess={() => {
            if (!ownerTotpData) {
              navigate('/platform-owner/dashboard', { replace: true });
            }
          }}
          onClose={() => setShowOwner2faModal(false)}
          canDismiss={true}
        />
      )}

      {/* Platform Owner Microsoft Authenticator (TOTP) Modal */}
      {ownerTotpData && (
        <TotpModal
          isOpen={showTotpModal}
          preAuthToken={ownerTotpData.preAuthToken}
          onVerify={(code) => verifyOwnerTOTP(ownerTotpData.preAuthToken, code)}
          onSuccess={() => navigate('/platform-owner/dashboard', { replace: true })}
          onClose={() => {
            setShowTotpModal(false);
            setOwnerTotpData(null);
          }}
          canDismiss={true}
        />
      )}
    </div>
  );
};

export default Login;
