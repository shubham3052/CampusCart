import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, UserPlus, GraduationCap, Store, Bike } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';
import EmailOtpModal from '../../components/auth/EmailOtpModal';

const ALLOWED_PUBLIC_ROLES = ['STUDENT', 'SHOP_OWNER', 'DELIVERY_AGENT'];

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    role: 'STUDENT', // Default to Student, fully selectable between Student, Shop Owner, Courier
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);
  const [otpWarning, setOtpWarning] = useState('');

  const { register, markEmailVerified } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setOtpWarning('');

    // 1. Role selection validation
    if (!formData.role || !ALLOWED_PUBLIC_ROLES.includes(formData.role)) {
      setFormError('Please choose an account type (Student, Shop Owner, or Courier).');
      return;
    }

    // 2. Email format validation
    const emailClean = formData.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailClean || !emailRegex.test(emailClean)) {
      setFormError('Please enter a valid email address (e.g. student@college.edu).');
      return;
    }

    // 3. Name validation
    if (!formData.first_name.trim()) {
      setFormError('First name is required.');
      return;
    }

    // 4. Password matching and criteria
    if (formData.password !== formData.confirm_password) {
      setFormError('Passwords do not match.');
      return;
    }

    if (formData.password.length < 8) {
      setFormError('Password must be at least 8 characters long.');
      return;
    }

    if (!/\d/.test(formData.password)) {
      setFormError('Password must contain at least one numerical digit.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim(),
        email: emailClean,
        username: formData.username.trim() || emailClean,
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        phone_number: formData.phone_number.trim(),
        password: formData.password,
        role: formData.role,
      };

      const result = await register(payload);
      setRegisteredUser(result.user || payload);
      if (result.email_sent === false) {
        setOtpWarning('Account registered, but verification email could not be delivered immediately. Please click "Resend Code" below to dispatch a new code.');
      } else {
        setOtpWarning('');
      }
      setShowOtpModal(true);
    } catch (err) {
      console.error('Registration error:', err);
      let errorMsg = 'Failed to create account. Please try again.';
      if (err.response?.data) {
        const data = err.response.data;
        if (typeof data === 'string') {
          errorMsg = data;
        } else if (data.message && typeof data.message === 'string') {
          errorMsg = data.message;
        } else if (data.detail && typeof data.detail === 'string') {
          errorMsg = data.detail;
        } else if (data.errors && typeof data.errors === 'object') {
          const firstKey = Object.keys(data.errors)[0];
          const val = data.errors[firstKey];
          errorMsg = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
        } else {
          const candidateKeys = Object.keys(data).filter((k) => k !== 'success' && k !== 'status');
          if (candidateKeys.length > 0) {
            const firstField = candidateKeys[0];
            const msg = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
            errorMsg = `${firstField}: ${msg}`;
          }
        }
      } else if (err.message) {
        errorMsg = err.message;
      }
      setFormError(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const roleOptions = [
    {
      id: 'role-student',
      value: 'STUDENT',
      label: 'Student',
      description: 'Stationery & Printing',
      icon: GraduationCap,
    },
    {
      id: 'role-shop-owner',
      value: 'SHOP_OWNER',
      label: 'Shop Owner',
      description: 'Merchant Partner',
      icon: Store,
    },
    {
      id: 'role-courier',
      value: 'DELIVERY_AGENT',
      label: 'Courier',
      description: 'Campus Delivery',
      icon: Bike,
    },
  ];

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(1rem, 3vw, 2rem) clamp(0.75rem, 2.5vw, 1.5rem)',
        background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)',
      }}
    >
      <div
        className="card animate-fade-in"
        style={{
          width: '100%',
          maxWidth: '520px',
          padding: 'clamp(1.5rem, 5vw, 2.5rem)',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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
            Create your CampusCart account
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Join the CampusCart Student Stationery & Printing Platform
          </p>
        </div>

        {formError && (
          <ErrorMessage
            message={formError}
            onDismiss={() => setFormError('')}
          />
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Public Role Selection */}
          <div style={{ marginBottom: '1.35rem' }}>
            <label
              className="form-label"
              style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginBottom: '0.5rem',
              }}
            >
              Choose account type: <span style={{ color: 'var(--danger-500)' }}>*</span>
            </label>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.6rem',
              }}
            >
              {roleOptions.map((opt) => {
                const isSelected = formData.role === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    id={opt.id}
                    type="button"
                    onClick={() => handleChange('role', opt.value)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.85rem 0.5rem',
                      borderRadius: 'var(--radius-lg, 10px)',
                      border: isSelected
                        ? '2px solid var(--primary-600, #4f46e5)'
                        : '1px solid var(--border-medium, #cbd5e1)',
                      backgroundColor: isSelected
                        ? 'var(--primary-50, #eef2ff)'
                        : 'var(--bg-surface, #ffffff)',
                      color: isSelected
                        ? 'var(--primary-700, #4338ca)'
                        : 'var(--text-primary, #1e293b)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      textAlign: 'center',
                      boxShadow: isSelected ? '0 1px 3px rgba(79, 70, 229, 0.15)' : 'none',
                    }}
                  >
                    <Icon
                      size={22}
                      style={{
                        marginBottom: '0.35rem',
                        color: isSelected ? 'var(--primary-600, #4f46e5)' : 'var(--text-muted, #64748b)',
                      }}
                    />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {opt.label}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        color: isSelected ? 'var(--primary-600, #4f46e5)' : 'var(--text-muted, #64748b)',
                        marginTop: '0.2rem',
                        lineHeight: 1.2,
                      }}
                    >
                      {opt.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {formData.role === 'DELIVERY_AGENT' && (
            <div
              style={{
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 'var(--radius-md)',
                padding: '0.75rem 1rem',
                marginBottom: '1.25rem',
                fontSize: '0.82rem',
                color: 'var(--primary-700)',
                lineHeight: 1.4,
              }}
            >
              <strong>Campus Courier Notice:</strong> Delivery partner accounts require administrator review and approval after email verification before receiving live delivery orders.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="register-first-name"
              label="First Name"
              placeholder="e.g. Rahul"
              value={formData.first_name}
              onChange={(e) => handleChange('first_name', e.target.value)}
              required
            />
            <Input
              id="register-last-name"
              label="Last Name"
              placeholder="e.g. Sharma"
              value={formData.last_name}
              onChange={(e) => handleChange('last_name', e.target.value)}
              required
            />
          </div>

          <Input
            id="register-username"
            label="Username"
            placeholder="e.g. rahul_sharma"
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            leftIcon={User}
            required
          />

          <Input
            id="register-email"
            label="Email Address"
            type="email"
            placeholder="student@college.edu"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            leftIcon={Mail}
            required
          />

          <Input
            id="register-phone"
            label="Phone Number"
            type="tel"
            placeholder="+91 9876543210"
            value={formData.phone_number}
            onChange={(e) => handleChange('phone_number', e.target.value)}
            leftIcon={Phone}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              id="register-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              leftIcon={Lock}
              required
            />
            <Input
              id="register-confirm-password"
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={formData.confirm_password}
              onChange={(e) => handleChange('confirm_password', e.target.value)}
              leftIcon={Lock}
              required
            />
          </div>

          <div style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
            <Button
              id="register-submit-button"
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isSubmitting}
              leftIcon={UserPlus}
            >
              Complete Registration
            </Button>
          </div>
        </form>

        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link
              to="/login"
              id="register-signin-link"
              style={{ fontWeight: 600, color: 'var(--primary-600)' }}
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* 6-digit Email Verification OTP Modal */}
      {showOtpModal && (
        <EmailOtpModal
          isOpen={showOtpModal}
          email={registeredUser?.email || formData.email}
          purpose="EMAIL_VERIFICATION"
          canDismiss={false}
          initialError={otpWarning}
          onSuccess={() => {
            markEmailVerified();
            const role = registeredUser?.role || formData.role;
            if (role === 'STUDENT') {
              navigate('/student/home', { replace: true });
            } else if (role === 'SHOP_OWNER') {
              navigate('/shop-owner/dashboard', { replace: true });
            } else {
              navigate('/login', { replace: true });
            }
          }}
          onClose={() => {
            setShowOtpModal(false);
            navigate('/login', { replace: true });
          }}
        />
      )}
    </div>
  );
};

export default Register;
