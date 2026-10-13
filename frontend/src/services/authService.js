import api from './api';

const authService = {
  /**
   * Log in user with email & password
   */
  async login(email, password) {
    const response = await api.post('/auth/login/', { email, password });
    const data = response.data;

    // Platform Owner 2FA Challenge: Return pre-auth challenge without storing tokens
    if (data.requires_2fa) {
      return {
        requires_2fa: true,
        email: data.email,
        pre_auth_token: data.pre_auth_token,
        role: data.role || 'PLATFORM_OWNER',
        active_role: data.active_role || 'PLATFORM_OWNER',
        roles: data.roles || ['PLATFORM_OWNER'],
        message: data.message,
      };
    }

    const accessToken = data.tokens?.access || data.access;
    const refreshToken = data.tokens?.refresh || data.refresh;
    const user = data.user;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, accessToken, refreshToken };
  },

  /**
   * Verify Platform Owner 2FA OTP code (Step 17 & 18)
   */
  async verifyOwner2FA(email, otp, preAuthToken) {
    const response = await api.post('/auth/owner/verify-2fa/', {
      email,
      otp,
      pre_auth_token: preAuthToken,
    });
    const data = response.data;

    // Platform Owner TOTP Challenge: Return pre-auth challenge without storing tokens
    if (data.requires_totp) {
      return {
        requires_totp: true,
        email: data.email,
        pre_auth_token: data.pre_auth_token,
        role: data.active_role || 'PLATFORM_OWNER',
        active_role: data.active_role || 'PLATFORM_OWNER',
        roles: data.roles || ['PLATFORM_OWNER'],
        message: data.message,
      };
    }

    const accessToken = data.tokens?.access || data.access;
    const refreshToken = data.tokens?.refresh || data.refresh;
    const user = data.user;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, accessToken, refreshToken, message: data.message };
  },

  /**
   * Verify Platform Owner Microsoft Authenticator (TOTP) code (Step 18)
   */
  async verifyOwnerTOTP(preAuthToken, code) {
    const response = await api.post('/auth/owner/verify-totp/', {
      pre_auth_token: preAuthToken,
      code,
    });
    const data = response.data;

    const accessToken = data.tokens?.access || data.access;
    const refreshToken = data.tokens?.refresh || data.refresh;
    const user = data.user;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, accessToken, refreshToken, message: data.message };
  },

  /**
   * Platform Owner TOTP Security Settings APIs (Step 18)
   */
  async getOwnerTOTPStatus() {
    const response = await api.get('/platform-owner/security/totp/status/');
    return response.data;
  },

  async setupOwnerTOTP() {
    const response = await api.post('/platform-owner/security/totp/setup/');
    return response.data;
  },

  async confirmOwnerTOTP(code) {
    const response = await api.post('/platform-owner/security/totp/confirm/', { code });
    return response.data;
  },

  async resetOwnerTOTP(password, code) {
    const response = await api.post('/platform-owner/security/totp/reset/', { password, code });
    return response.data;
  },

  /**
   * Resend Platform Owner 2FA OTP code
   */
  async resendOwner2FA(email, preAuthToken) {
    const response = await api.post('/auth/owner/resend-2fa/', {
      email,
      pre_auth_token: preAuthToken,
    });
    return response.data;
  },

  /**
   * Switch the user's active session role
   */
  async switchRole(role) {
    const response = await api.post('/auth/switch-role/', { role });
    const data = response.data;

    const accessToken = data.access;
    const refreshToken = data.refresh;
    const user = data.user;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, accessToken, refreshToken };
  },

  /**
   * Register a new user
   */
  async register(userData) {
    // Clear any previous session from localStorage before registering a new user
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');

    // Normalise name and phone fields to match Django RegisterSerializer
    const payload = {
      name: userData.name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
      email: userData.email,
      password: userData.password,
      role: userData.role || 'STUDENT',
      phone: userData.phone || userData.phone_number || '',
      college_id: userData.college_id || '',
      department: userData.department || '',
      hostel_block: userData.hostel_block || '',
      room_number: userData.room_number || '',
    };

    const response = await api.post('/auth/register/', payload);
    const data = response.data;

    const accessToken = data.tokens?.access || data.access;
    const refreshToken = data.tokens?.refresh || data.refresh;
    const user = data.user;

    if (accessToken) {
      localStorage.setItem('access_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }

    return { user, accessToken, refreshToken, message: data.message, email_sent: data.email_sent };
  },

  /**
   * Fetch current authenticated user profile
   */
  async getCurrentUser() {
    const response = await api.get('/auth/me/');
    const user = response.data;
    localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  /**
   * Fetch full user profile with role-specific data (e.g. shop details for Shop Owner)
   */
  async getUserProfile() {
    const response = await api.get('/users/profile/');
    return response.data;
  },

  /**
   * Update current user profile fields (e.g. first_name, last_name, phone_number)
   */
  async updateUserProfile(payload) {
    const response = await api.patch('/users/profile/', payload);
    return response.data;
  },

  /**
   * Securely change account password
   */
  async changePassword(payload) {
    const response = await api.post('/users/change-password/', payload);
    return response.data;
  },

  /**
   * Log out user and blacklist refresh token on backend
   */
  async logout() {
    const refreshToken = localStorage.getItem('refresh_token');
    try {
      if (refreshToken) {
        await api.post('/auth/logout/', { refresh: refreshToken });
      }
    } catch {
      // Even if network fails or token already expired, clear local credentials
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
    }
  },

  /**
   * Check health status of the backend API
   */
  async checkHealth() {
    const response = await api.get('/health/');
    return response.data;
  },

  /**
   * Request a new 6-digit email verification OTP
   */
  async sendEmailOtp(email, purpose = 'EMAIL_VERIFICATION') {
    const response = await api.post('/auth/email/send-otp/', { email, purpose });
    return response.data;
  },

  /**
   * Verify 6-digit OTP code against PBKDF2 hash
   */
  async verifyEmailOtp(email, otp, purpose = 'EMAIL_VERIFICATION') {
    const response = await api.post('/auth/email/verify-otp/', { email, otp, purpose });
    // If successfully verified, update local user storage
    const storedUser = this.getStoredUser();
    if (storedUser && purpose === 'EMAIL_VERIFICATION') {
      storedUser.email_verified = true;
      localStorage.setItem('user', JSON.stringify(storedUser));
    }
    return response.data;
  },

  /**
   * Resend verification OTP code (enforces 60s cooldown)
   */
  async resendEmailOtp(email, purpose = 'EMAIL_VERIFICATION') {
    const response = await api.post('/auth/email/resend-otp/', { email, purpose });
    return response.data;
  },

  /**
   * Initiate password reset via email OTP
   */
  async requestPasswordReset(email) {
    const response = await api.post('/auth/password-reset/request/', { email });
    return response.data;
  },

  /**
   * Verify password reset OTP to receive signed reset token
   */
  async verifyPasswordResetOtp(email, otp) {
    const response = await api.post('/auth/password-reset/verify/', { email, otp });
    return response.data;
  },

  /**
   * Confirm password reset with new password and reset token
   */
  async confirmPasswordReset(email, resetToken, newPassword) {
    const response = await api.post('/auth/password-reset/confirm/', {
      email,
      reset_token: resetToken,
      new_password: newPassword,
    });
    return response.data;
  },

  /**
   * Request email change for authenticated user
   */
  async requestEmailChange(newEmail) {
    const response = await api.post('/auth/email/change/request/', { new_email: newEmail });
    return response.data;
  },

  /**
   * Confirm email change using OTP sent to new address
   */
  async confirmEmailChange(newEmail, otp) {
    const response = await api.post('/auth/email/change/confirm/', {
      new_email: newEmail,
      otp,
    });
    const storedUser = this.getStoredUser();
    if (storedUser) {
      storedUser.email = newEmail;
      storedUser.email_verified = true;
      localStorage.setItem('user', JSON.stringify(storedUser));
    }
    return response.data;
  },

  /**
   * Request account deletion OTP for authenticated user
   */
  async requestAccountDeletionOtp() {
    const response = await api.post('/account/delete/request/');
    return response.data;
  },

  /**
   * Confirm account deletion with OTP for authenticated user
   */
  async confirmAccountDeletion(otp) {
    const response = await api.post('/account/delete/verify/', { otp });
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    return response.data;
  },

  /**
   * Platform Owner Secure Initial Password Setup (Step 19)
   */
  async requestOwnerPasswordSetup(email) {
    const response = await api.post('/auth/owner/password-setup/request/', { email });
    return response.data;
  },

  async resendOwnerPasswordSetupOTP(stageToken) {
    const response = await api.post('/auth/owner/password-setup/resend-email/', { stage_token: stageToken });
    return response.data;
  },

  async verifyOwnerPasswordSetupEmail(stageToken, code) {
    const response = await api.post('/auth/owner/password-setup/verify-email/', { stage_token: stageToken, code });
    return response.data;
  },

  async verifyOwnerPasswordSetupTOTP(stageToken, code) {
    const response = await api.post('/auth/owner/password-setup/verify-totp/', { stage_token: stageToken, code });
    return response.data;
  },

  async completeOwnerPasswordSetup(stageToken, newPassword, confirmPassword) {
    const response = await api.post('/auth/owner/password-setup/complete/', {
      stage_token: stageToken,
      new_password: newPassword,
      confirm_password: confirmPassword,
    });
    return response.data;
  },

  /**
   * Read stored token from localStorage
   */
  getStoredToken() {
    return localStorage.getItem('access_token');
  },

  /**
   * Read stored user from localStorage
   */
  getStoredUser() {
    try {
      const user = localStorage.getItem('user');
      return user ? JSON.parse(user) : null;
    } catch {
      return null;
    }
  },
};

export default authService;
