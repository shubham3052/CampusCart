import React, { useState, useEffect } from 'react';
import { 
  Crown, 
  ShieldCheck, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  KeyRound, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Lock,
  Layers,
  Sparkles,
  Eye,
  EyeOff,
  Smartphone,
  QrCode,
  Copy,
  Check,
  RotateCw,
  X,
  ShieldAlert,
  ArrowRight,
  RotateCcw
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import authService from '../../services/authService';
import { useAuth } from '../../context/AuthContext';

export default function PlatformOwnerProfile() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Edit profile state
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    phone_number: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(null);
  const [profileError, setProfileError] = useState(null);

  // Step 18A: 4-Stage Secure Password Change State (Password -> Gmail OTP -> TOTP -> New Password)
  const [pwStep, setPwStep] = useState(1);
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailOtp, setEmailOtp] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [stageToken, setStageToken] = useState('');
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(null);
  const [pwError, setPwError] = useState(null);
  const [pwNotice, setPwNotice] = useState(null);

  // Microsoft Authenticator (TOTP) State
  const [totpStatus, setTotpStatus] = useState({
    loading: true,
    enabled: false,
    verified: false,
    verified_at: null,
  });
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [setupSuccess, setSetupSuccess] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  const fetchTotpStatus = async () => {
    try {
      const data = await authService.getOwnerTOTPStatus();
      setTotpStatus({
        loading: false,
        enabled: Boolean(data?.enabled),
        verified: Boolean(data?.verified),
        verified_at: data?.verified_at || null,
      });
    } catch (err) {
      console.error('Failed to fetch TOTP status:', err);
      setTotpStatus((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleStartSetup = async () => {
    setSetupError('');
    setSetupSuccess('');
    setSetupCode('');
    setSetupLoading(true);
    try {
      const data = await authService.setupOwnerTOTP();
      setSetupData(data);
      setShowSetupModal(true);
    } catch (err) {
      console.error('Failed to initiate TOTP setup:', err);
      setProfileError('Failed to initiate Microsoft Authenticator setup.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmSetup = async (e) => {
    e.preventDefault();
    if (setupCode.trim().length !== 6) {
      setSetupError('Please enter the complete 6-digit code.');
      return;
    }
    setSetupLoading(true);
    setSetupError('');
    try {
      const res = await authService.confirmOwnerTOTP(setupCode.trim());
      setSetupSuccess(res?.message || 'Microsoft Authenticator enabled successfully!');
      setTimeout(() => {
        setShowSetupModal(false);
        setSetupData(null);
        setSetupCode('');
        fetchTotpStatus();
      }, 1200);
    } catch (err) {
      console.error('Failed to confirm TOTP:', err);
      setSetupError(
        err.response?.data?.message ||
        err.response?.data?.code?.[0] ||
        'Invalid code. Please verify the code in Microsoft Authenticator and try again.'
      );
    } finally {
      setSetupLoading(false);
    }
  };

  const handleResetTOTP = async (e) => {
    e.preventDefault();
    if (!resetPassword || resetCode.trim().length !== 6) {
      setResetError('Please provide both current password and 6-digit code.');
      return;
    }
    setResetLoading(true);
    setResetError('');
    try {
      const res = await authService.resetOwnerTOTP(resetPassword, resetCode.trim());
      setResetSuccess(res?.message || 'Microsoft Authenticator reset successfully.');
      setTimeout(() => {
        setShowResetModal(false);
        setResetPassword('');
        setResetCode('');
        fetchTotpStatus();
      }, 1200);
    } catch (err) {
      console.error('Failed to reset TOTP:', err);
      setResetError(
        err.response?.data?.message ||
        err.response?.data?.password?.[0] ||
        err.response?.data?.code?.[0] ||
        'Reset failed. Please verify your current password and Authenticator code.'
      );
    } finally {
      setResetLoading(false);
    }
  };

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await platformOwnerService.getProfile();
      const profileData = res?.data || res;
      setProfile(profileData);
      setFormData({
        first_name: profileData?.first_name || '',
        last_name: profileData?.last_name || '',
        phone_number: profileData?.phone_number || '',
      });
      fetchTotpStatus();
    } catch (err) {
      console.error('Failed to load profile:', err);
      setProfileError('Failed to fetch platform owner profile details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setProfileError(null);
      const res = await platformOwnerService.updateProfile(formData);
      const updated = res?.data || res;
      setProfile(updated);
      setProfileSuccess('Profile credentials updated successfully.');
      setTimeout(() => setProfileSuccess(null), 4000);
    } catch (err) {
      console.error('Failed to save profile:', err);
      setProfileError(err.response?.data?.message || 'Error updating profile credentials.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetPwFlow = () => {
    setPwStep(1);
    setCurrentPassword('');
    setEmailOtp('');
    setTotpCode('');
    setNewPassword('');
    setConfirmPassword('');
    setStageToken('');
    setPwError(null);
    setPwSuccess(null);
    setPwNotice(null);
  };

  // Stage 1: Verify Current Password & Send Gmail OTP
  const handleStartPasswordChange = async (e) => {
    e.preventDefault();
    if (!currentPassword) {
      setPwError('Please enter your current password.');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    setPwNotice(null);
    try {
      const data = await platformOwnerService.startPasswordChange(currentPassword);
      setStageToken(data.stage_token);
      setPwStep(2);
      setPwNotice(data.message || 'Current password confirmed. 6-digit verification code sent to your registered Gmail.');
    } catch (err) {
      console.error('Failed to start password change:', err);
      setPwError(
        err.response?.data?.message ||
        err.response?.data?.current_password?.[0] ||
        'Current password verification failed.'
      );
    } finally {
      setPwLoading(false);
    }
  };

  // Stage 2: Verify Gmail OTP
  const handleVerifyEmailOtp = async (e) => {
    e.preventDefault();
    const cleanOtp = emailOtp.trim();
    if (cleanOtp.length !== 6) {
      setPwError('Please enter the complete 6-digit Gmail verification code.');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    setPwNotice(null);
    try {
      const data = await platformOwnerService.verifyEmailPasswordChange(stageToken, cleanOtp);
      setStageToken(data.stage_token);
      setPwStep(3);
      setPwNotice(data.message || 'Gmail OTP verified. Please enter your 6-digit Microsoft Authenticator code.');
    } catch (err) {
      console.error('Failed to verify email OTP:', err);
      setPwError(
        err.response?.data?.message ||
        err.response?.data?.code?.[0] ||
        'Invalid or expired verification code.'
      );
    } finally {
      setPwLoading(false);
    }
  };

  // Stage 3: Verify Microsoft Authenticator TOTP
  const handleVerifyTotp = async (e) => {
    e.preventDefault();
    const cleanTotp = totpCode.trim();
    if (cleanTotp.length !== 6) {
      setPwError('Please enter the complete 6-digit Authenticator code.');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    setPwNotice(null);
    try {
      const data = await platformOwnerService.verifyTOTPPasswordChange(stageToken, cleanTotp);
      setStageToken(data.stage_token);
      setPwStep(4);
      setPwNotice(data.message || 'Microsoft Authenticator verified. You may now enter your new master password.');
    } catch (err) {
      console.error('Failed to verify Authenticator code:', err);
      setPwError(
        err.response?.data?.message ||
        err.response?.data?.code?.[0] ||
        'Invalid or expired Authenticator code.'
      );
    } finally {
      setPwLoading(false);
    }
  };

  // Stage 4: Submit New Password & Invalidate Existing Sessions
  const handleCompletePasswordChange = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPwError('New password must be at least 8 characters long.');
      return;
    }
    setPwLoading(true);
    setPwError(null);
    setPwNotice(null);
    try {
      const data = await platformOwnerService.completePasswordChange(stageToken, newPassword, confirmPassword);
      setPwStep(5);
      setPwSuccess(data.message || 'Password changed successfully. All previous sessions have been invalidated.');
      setTimeout(async () => {
        try {
          await logout();
        } catch (_) {}
        window.location.href = '/login';
      }, 3500);
    } catch (err) {
      console.error('Failed to finalize password change:', err);
      setPwError(
        err.response?.data?.message ||
        err.response?.data?.new_password?.[0] ||
        err.response?.data?.confirm_password?.[0] ||
        'Password update failed.'
      );
    } finally {
      setPwLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Top Banner Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/30 p-6 sm:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 p-0.5 shadow-xl flex items-center justify-center flex-shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Crown className="w-9 h-9 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" /> Highest Level Authority
                </span>
                <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  Active
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                {profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email : 'Platform Owner'}
              </h1>
              <p className="text-xs sm:text-sm text-slate-400 font-mono mt-0.5">
                {profile?.email}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:items-end gap-1.5 border-t sm:border-t-0 border-slate-800 pt-4 sm:pt-0 w-full sm:w-auto">
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Last Session: {profile?.last_login ? new Date(profile.last_login).toLocaleDateString() : 'Active Now'}
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Enrolled: {profile?.date_joined ? new Date(profile.date_joined).toLocaleDateString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Forms Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Account Details Form */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Identity & Contact</h3>
              <p className="text-xs text-slate-400">Account holder name and verified communication channels</p>
            </div>
          </div>

          {profileSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-400 mb-1.5">Primary Email (System Identifier)</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="email"
                  disabled
                  value={profile?.email || ''}
                  className="w-full bg-slate-950 border border-slate-800/80 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-400 cursor-not-allowed"
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Primary identifier cannot be altered to prevent credential orification breaks.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">First Name</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">Last Name</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1.5">Emergency Contact Number</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="tel"
                  placeholder="+91 9876543210"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="pt-3">
              <button
                type="submit"
                disabled={savingProfile}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
              >
                <Save className={`w-4 h-4 ${savingProfile ? 'animate-spin' : ''}`} />
                {savingProfile ? 'Updating Identity...' : 'Save Identity Changes'}
              </button>
            </div>
          </form>
        </div>

        {/* Change Password Card - Full 2FA Staged Rotation (Step 18A) */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  Security & Passwords
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    Full 2FA Protected
                  </span>
                </h3>
                <p className="text-xs text-slate-400">
                  Password rotation requires Current Password + Gmail OTP + Microsoft Authenticator
                </p>
              </div>
            </div>

            {pwStep > 1 && pwStep < 5 && (
              <button
                type="button"
                onClick={handleResetPwFlow}
                disabled={pwLoading}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 self-start sm:self-auto py-1 px-2.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Flow</span>
              </button>
            )}
          </div>

          {/* Stepper Indicator */}
          <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-medium">
            <div className={`p-2 rounded-xl border transition ${
              pwStep === 1 
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-300 font-bold' 
                : pwStep > 1 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
              1. Password
            </div>
            <div className={`p-2 rounded-xl border transition ${
              pwStep === 2 
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-bold' 
                : pwStep > 2 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
              2. Gmail OTP
            </div>
            <div className={`p-2 rounded-xl border transition ${
              pwStep === 3 
                ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-300 font-bold' 
                : pwStep > 3 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                  : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
              3. Authenticator
            </div>
            <div className={`p-2 rounded-xl border transition ${
              pwStep === 4 
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 font-bold' 
                : pwStep === 5 
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 font-bold' 
                  : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}>
              4. New Password
            </div>
          </div>

          {pwNotice && (
            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 flex-shrink-0 text-indigo-400" />
              <span>{pwNotice}</span>
            </div>
          )}

          {pwSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div className="space-y-0.5">
                <span className="font-bold block">{pwSuccess}</span>
                <span className="text-[11px] text-slate-400 block">Signing you out to re-authenticate with your new password...</span>
              </div>
            </div>
          )}

          {pwError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{pwError}</span>
            </div>
          )}

          {/* Step 1: Current Password */}
          {pwStep === 1 && (
            <form onSubmit={handleStartPasswordChange} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">Current Platform Owner Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass((p) => !p)}
                    aria-label={showCurrentPass ? 'Hide password' : 'Show password'}
                    title={showCurrentPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 text-slate-500 hover:text-slate-300 focus:outline-none"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Verifying current password will trigger a 6-digit OTP dispatch to garibhokya@gmail.com.
                </span>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-amber-600/20 transition"
                >
                  <KeyRound className={`w-4 h-4 ${pwLoading ? 'animate-spin' : ''}`} />
                  {pwLoading ? 'Verifying Password...' : 'Continue'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Gmail OTP Verification */}
          {pwStep === 2 && (
            <form onSubmit={handleVerifyEmailOtp} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">
                  Enter the 6-digit code sent to your registered Platform Owner email:
                </label>
                <div className="relative flex items-center">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={emailOtp}
                    onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white tracking-widest font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Valid for 5 minutes. Check inbox or spam folder for Brevo security delivery.
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetPwFlow}
                  disabled={pwLoading}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwLoading || emailOtp.length !== 6}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                >
                  <ShieldCheck className={`w-4 h-4 ${pwLoading ? 'animate-spin' : ''}`} />
                  {pwLoading ? 'Verifying Code...' : 'Verify'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Microsoft Authenticator TOTP */}
          {pwStep === 3 && (
            <form onSubmit={handleVerifyTotp} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">
                  Open Microsoft Authenticator and enter your 6-digit code:
                </label>
                <div className="relative flex items-center">
                  <Smartphone className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white tracking-widest font-mono placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  30-second rotating code from your Microsoft Authenticator mobile application.
                </span>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetPwFlow}
                  disabled={pwLoading}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwLoading || totpCode.length !== 6}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 transition"
                >
                  <Smartphone className={`w-4 h-4 ${pwLoading ? 'animate-spin' : ''}`} />
                  {pwLoading ? 'Verifying TOTP...' : 'Verify'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>
          )}

          {/* Step 4: Set New Password */}
          {pwStep === 4 && (
            <form onSubmit={handleCompletePasswordChange} className="space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-400 mb-1.5">New Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    placeholder="Min. 8 alphanumeric symbols"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass((p) => !p)}
                    aria-label={showNewPass ? 'Hide password' : 'Show password'}
                    title={showNewPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 text-slate-500 hover:text-slate-300 focus:outline-none"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-400 mb-1.5">Confirm New Password</label>
                <div className="relative flex items-center">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type={showConfirmPass ? 'text' : 'password'}
                    required
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPass((p) => !p)}
                    aria-label={showConfirmPass ? 'Hide password' : 'Show password'}
                    title={showConfirmPass ? 'Hide password' : 'Show password'}
                    className="absolute right-3 text-slate-500 hover:text-slate-300 focus:outline-none"
                  >
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleResetPwFlow}
                  disabled={pwLoading}
                  className="py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwLoading || !newPassword || !confirmPassword}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition"
                >
                  <KeyRound className={`w-4 h-4 ${pwLoading ? 'animate-spin' : ''}`} />
                  {pwLoading ? 'Changing Password...' : 'Change Password'}
                </button>
              </div>
            </form>
          )}

          {/* Step 5: Finished */}
          {pwStep === 5 && (
            <div className="p-6 rounded-2xl bg-slate-950 border border-emerald-500/30 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="text-white font-bold text-sm">Password Changed Successfully</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                All existing sessions and tokens have been revoked. Please sign in again with your new credentials.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Microsoft Authenticator (TOTP) Security Section (Step 18) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Microsoft Authenticator 2FA
                {totpStatus.enabled ? (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Active & Enforced
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Pending Configuration
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400">
                RFC 6238 time-based one-time password (TOTP) 2nd factor for apex login
              </p>
            </div>
          </div>

          <div>
            {totpStatus.enabled ? (
              <button
                type="button"
                onClick={() => {
                  setResetError('');
                  setResetSuccess('');
                  setResetPassword('');
                  setResetCode('');
                  setShowResetModal(true);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs rounded-xl transition flex items-center gap-2"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                Reset Authenticator
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartSetup}
                disabled={setupLoading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/20 transition flex items-center gap-2"
              >
                <Smartphone className="w-3.5 h-3.5" />
                {setupLoading ? 'Preparing...' : 'Setup Microsoft Authenticator'}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Protected Account</span>
            <span className="text-white font-mono font-medium">{profile?.email || 'garibhokya@gmail.com'}</span>
            <p className="text-[11px] text-slate-500 mt-1">Platform Owner identity</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Authenticator Status</span>
            <span className={totpStatus.enabled ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
              {totpStatus.enabled ? "Enabled" : "Not Configured"}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">
              {totpStatus.enabled ? "Required on every login after Gmail OTP" : "Initial enrollment pending"}
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Last Verified</span>
            <span className="text-slate-300 font-medium">
              {totpStatus.verified_at ? new Date(totpStatus.verified_at).toLocaleString() : "Never"}
            </span>
            <p className="text-[11px] text-slate-500 mt-1">Replay & drift protected</p>
          </div>
        </div>
      </div>

      {/* Role Authority & Privileges Breakdown Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
          Active Governance Matrix & Security Boundary
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Hierarchy Level</span>
            <span className="text-indigo-400 font-bold text-sm">Role #5 (Highest)</span>
            <p className="text-[11px] text-slate-500 mt-1">Direct system-wide authority above Campus Admins.</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Admin Management</span>
            <span className="text-emerald-400 font-bold text-sm">Full Governance</span>
            <p className="text-[11px] text-slate-500 mt-1">Can provision, audit, and toggle admin accounts.</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Audit Logging</span>
            <span className="text-indigo-400 font-bold text-sm">Immutable Trail</span>
            <p className="text-[11px] text-slate-500 mt-1">All destructive operations recorded with actor IP.</p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800">
            <span className="text-slate-400 block mb-1">Credential Protection</span>
            <span className="text-emerald-400 font-bold text-sm">Strict Zero-Leak</span>
            <p className="text-[11px] text-slate-500 mt-1">Zero password hashes, keys, or OTPs transmitted.</p>
          </div>
        </div>
      </div>

      {/* Microsoft Authenticator Enrollment Modal */}
      {showSetupModal && setupData && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget && !setupLoading) {
              setShowSetupModal(false);
            }
          }}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: '100%',
              maxWidth: '460px',
              padding: '1.75rem',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(99, 102, 241, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.2)',
              borderRadius: 'var(--radius-xl, 16px)',
              color: '#f8fafc',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setShowSetupModal(false)}
              disabled={setupLoading}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
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
                }}
              >
                <QrCode size={24} color="#ffffff" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Configure Microsoft Authenticator
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Scan the QR code in Microsoft Authenticator or enter the key manually.
              </p>
            </div>

            {setupError && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{setupError}</span>
              </div>
            )}

            {setupSuccess && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  color: '#6ee7b7',
                  fontSize: '0.8rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{setupSuccess}</span>
              </div>
            )}

            {/* QR Code display */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                backgroundColor: '#ffffff',
                padding: '1rem',
                borderRadius: '12px',
                marginBottom: '1rem',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              <img
                src={setupData.qr_code_data_uri}
                alt="Authenticator QR Code"
                style={{ width: '180px', height: '180px', display: 'block' }}
              />
            </div>

            {/* Manual entry key fallback */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Manual Setup Key (fallback):</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(setupData.manual_entry_key);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copiedKey ? '#34d399' : '#818cf8',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  {copiedKey ? <Check size={12} /> : <Copy size={12} />}
                  {copiedKey ? 'Copied!' : 'Copy Key'}
                </button>
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  backgroundColor: '#020617',
                  padding: '0.6rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  color: '#e2e8f0',
                  letterSpacing: '0.08em',
                  wordBreak: 'break-all',
                }}
              >
                {setupData.manual_entry_key}
              </div>
            </div>

            {/* Confirmation form */}
            <form onSubmit={handleConfirmSetup}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Enter 6-digit code from Microsoft Authenticator to activate:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={setupCode}
                  onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    letterSpacing: '0.2em',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={setupLoading || setupCode.trim().length !== 6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: setupLoading || setupCode.trim().length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: setupLoading || setupCode.trim().length !== 6 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {setupLoading ? <RotateCw size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
                {setupLoading ? 'Verifying Code...' : 'Confirm & Activate 2FA'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Microsoft Authenticator Reset Modal */}
      {showResetModal && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget && !resetLoading) {
              setShowResetModal(false);
            }
          }}
        >
          <div
            className="card animate-fade-in"
            style={{
              width: '100%',
              maxWidth: '440px',
              padding: '1.75rem',
              backgroundColor: '#0f172a',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(239, 68, 68, 0.15)',
              borderRadius: 'var(--radius-xl, 16px)',
              color: '#f8fafc',
              position: 'relative',
            }}
          >
            <button
              type="button"
              onClick={() => setShowResetModal(false)}
              disabled={resetLoading}
              style={{
                position: 'absolute',
                top: '1.25rem',
                right: '1.25rem',
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              <X size={20} />
            </button>

            <div style={{ textAlign: 'center', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '0.75rem',
                }}
              >
                <ShieldAlert size={24} color="#ffffff" />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Reset Microsoft Authenticator
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                Requires Platform Owner Master Password + Current 6-digit Authenticator code.
              </p>
            </div>

            {resetError && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.8rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <AlertCircle size={16} />
                <span>{resetError}</span>
              </div>
            )}

            {resetSuccess && (
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  borderRadius: '8px',
                  color: '#6ee7b7',
                  fontSize: '0.8rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <CheckCircle2 size={16} />
                <span>{resetSuccess}</span>
              </div>
            )}

            <form onSubmit={handleResetTOTP}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Current Master Password:
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#cbd5e1', marginBottom: '0.35rem', fontWeight: 600 }}>
                  Current Authenticator 6-digit Code:
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    textAlign: 'center',
                    letterSpacing: '0.2em',
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={resetLoading || !resetPassword || resetCode.trim().length !== 6}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none',
                  borderRadius: '8px',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.875rem',
                  cursor: resetLoading || !resetPassword || resetCode.trim().length !== 6 ? 'not-allowed' : 'pointer',
                  opacity: resetLoading || !resetPassword || resetCode.trim().length !== 6 ? 0.6 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                }}
              >
                {resetLoading ? <RotateCw size={16} className="animate-spin" /> : <ShieldAlert size={16} />}
                {resetLoading ? 'Validating Credentials...' : 'Invalidate & Reset Authenticator'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
