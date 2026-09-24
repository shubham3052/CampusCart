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
  EyeOff
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
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

  // Password state
  const [passData, setPassData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [changingPass, setChangingPass] = useState(false);
  const [passSuccess, setPassSuccess] = useState(null);
  const [passError, setPassError] = useState(null);

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

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passData.new_password !== passData.confirm_password) {
      setPassError('New passwords do not match.');
      return;
    }
    if (passData.new_password.length < 8) {
      setPassError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setChangingPass(true);
      setPassError(null);
      await platformOwnerService.changePassword({
        current_password: passData.old_password,
        new_password: passData.new_password,
      });
      setPassSuccess('Security credentials updated. Next session will require new credentials.');
      setPassData({ old_password: '', new_password: '', confirm_password: '' });
      setTimeout(() => setPassSuccess(null), 5000);
    } catch (err) {
      console.error('Failed to change password:', err);
      setPassError(
        err.response?.data?.current_password?.[0] ||
        err.response?.data?.new_password?.[0] ||
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Password change failed.'
      );
    } finally {
      setChangingPass(false);
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

        {/* Change Password Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Security & Passwords</h3>
              <p className="text-xs text-slate-400">Cryptographically secure password rotation</p>
            </div>
          </div>

          {passSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{passSuccess}</span>
            </div>
          )}

          {passError && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{passError}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-slate-400 mb-1.5">Current Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type={showOldPass ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={passData.old_password}
                  onChange={(e) => setPassData({ ...passData, old_password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPass((p) => !p)}
                  aria-label={showOldPass ? 'Hide password' : 'Show password'}
                  title={showOldPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 text-slate-500 hover:text-slate-300 focus:outline-none"
                >
                  {showOldPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block font-medium text-slate-400 mb-1.5">New Master Password</label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type={showNewPass ? 'text' : 'password'}
                  required
                  placeholder="Min. 8 alphanumeric symbols"
                  value={passData.new_password}
                  onChange={(e) => setPassData({ ...passData, new_password: e.target.value })}
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
                  value={passData.confirm_password}
                  onChange={(e) => setPassData({ ...passData, confirm_password: e.target.value })}
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

            <div className="pt-3">
              <button
                type="submit"
                disabled={changingPass}
                className="flex items-center justify-center gap-2 w-full py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold rounded-xl shadow-lg shadow-amber-600/20 transition"
              >
                <KeyRound className={`w-4 h-4 ${changingPass ? 'animate-spin' : ''}`} />
                {changingPass ? 'Rotating Keys...' : 'Update Password'}
              </button>
            </div>
          </form>
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
    </div>
  );
}
