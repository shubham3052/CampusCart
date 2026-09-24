import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Phone, Sparkles, UserPlus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/common/Input';
import Select from '../../components/common/Select';
import Button from '../../components/common/Button';
import ErrorMessage from '../../components/common/ErrorMessage';
import EmailOtpModal from '../../components/auth/EmailOtpModal';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    password: '',
    confirm_password: '',
    role: 'STUDENT',
  });

  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [registeredUser, setRegisteredUser] = useState(null);

  const { register, markEmailVerified } = useAuth();
  const navigate = useNavigate();

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    // 1. Email format validation
    const emailClean = formData.email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailClean || !emailRegex.test(emailClean)) {
      setFormError('Please enter a valid email address (e.g. student@college.edu).');
      return;
    }

    // 2. Name validation
    if (!formData.first_name.trim()) {
      setFormError('First name is required.');
      return;
    }

    // 3. Password matching and criteria
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
            Create Account
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

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="First Name"
              placeholder="e.g. Rahul"
              value={formData.first_name}
              onChange={(e) => handleChange('first_name', e.target.value)}
              required
            />
            <Input
              label="Last Name"
              placeholder="e.g. Sharma"
              value={formData.last_name}
              onChange={(e) => handleChange('last_name', e.target.value)}
              required
            />
          </div>

          <Input
            label="Username"
            placeholder="e.g. rahul_sharma"
            value={formData.username}
            onChange={(e) => handleChange('username', e.target.value)}
            leftIcon={User}
            required
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="student@college.edu"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            leftIcon={Mail}
            required
          />

          <Input
            label="Phone Number"
            type="tel"
            placeholder="+91 9876543210"
            value={formData.phone_number}
            onChange={(e) => handleChange('phone_number', e.target.value)}
            leftIcon={Phone}
            required
          />

          <Select
            label="I am registering as"
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
            options={[
              { value: 'STUDENT', label: 'Student / Customer (Stationery & Xerox Delivery)' },
              { value: 'SHOP_OWNER', label: 'Shop Owner (Stationery & Printing Merchant)' },
              { value: 'DELIVERY_AGENT', label: 'Courier / Delivery Partner (Campus Logistics)' },
            ]}
            placeholder=""
            required
          />

          {formData.role === 'DELIVERY_AGENT' && (
            <div style={{
              backgroundColor: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              borderRadius: 'var(--radius-md)',
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              fontSize: '0.82rem',
              color: 'var(--primary-700)',
              lineHeight: 1.4
            }}>
              <strong>Campus Courier Notice:</strong> Delivery partner accounts require administrator review and approval before live delivery tasks and shift toggling can be activated.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              leftIcon={Lock}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              placeholder="••••••••"
              value={formData.confirm_password}
              onChange={(e) => handleChange('confirm_password', e.target.value)}
              leftIcon={Lock}
              required
            />
          </div>

          <div style={{ marginTop: '1rem', marginBottom: '1.5rem' }}>
            <Button
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
            const role = registeredUser?.role || formData.role;
            if (role === 'STUDENT') {
              navigate('/student/home', { replace: true });
            } else if (role === 'SHOP_OWNER') {
              navigate('/shop-owner/dashboard', { replace: true });
            } else {
              navigate('/login', { replace: true });
            }
          }}
        />
      )}
    </div>
  );
};

export default Register;
