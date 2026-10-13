import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import authService from '../services/authService';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => authService.getStoredUser());
  const [accessToken, setAccessToken] = useState(() => authService.getStoredToken());
  const [loading, setLoading] = useState(true);

  // Initialize and verify authentication on app load
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      const token = authService.getStoredToken();
      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const currentUser = await authService.getCurrentUser();
        if (isMounted) {
          setUser(currentUser);
          setAccessToken(token);
        }
      } catch (error) {
        console.warn('Auth token validation failed:', error?.message || error);
        if (isMounted) {
          const status = error?.response?.status;
          if (status === 401 || status === 403) {
            setUser(null);
            setAccessToken(null);
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('user');
          } else {
            // Server offline or network error: retain stored credentials to preserve session persistence
            const stored = authService.getStoredUser();
            setUser(stored);
            setAccessToken(token);
          }
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    initAuth();

    // Listen for interceptor-triggered logout events
    const handleLogoutEvent = () => {
      setUser(null);
      setAccessToken(null);
    };

    window.addEventListener('auth:logout', handleLogoutEvent);
    return () => {
      isMounted = false;
      window.removeEventListener('auth:logout', handleLogoutEvent);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const result = await authService.login(email, password);
      if (result.requires_2fa) {
        return result;
      }
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOwner2FA = useCallback(async (email, otp, preAuthToken) => {
    setLoading(true);
    try {
      const result = await authService.verifyOwner2FA(email, otp, preAuthToken);
      if (result.requires_totp) {
        return result;
      }
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOwnerTOTP = useCallback(async (preAuthToken, code) => {
    setLoading(true);
    try {
      const result = await authService.verifyOwnerTOTP(preAuthToken, code);
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const resendOwner2FA = useCallback(async (email, preAuthToken) => {
    return await authService.resendOwner2FA(email, preAuthToken);
  }, []);

  const register = useCallback(async (userData) => {
    setLoading(true);
    try {
      const result = await authService.register(userData);
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setAccessToken(null);
      setLoading(false);
    }
  }, []);

  const markEmailVerified = useCallback(() => {
    setUser((prev) => (prev ? { ...prev, email_verified: true } : prev));
    const stored = authService.getStoredUser();
    if (stored) {
      stored.email_verified = true;
      localStorage.setItem('user', JSON.stringify(stored));
    }
  }, []);

  const switchRole = useCallback(async (targetRole) => {
    setLoading(true);
    try {
      const result = await authService.switchRole(targetRole);
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    user,
    accessToken,
    activeRole: user?.active_role || user?.role,
    roles: user?.roles || (user?.role ? [user.role] : []),
    isAuthenticated: Boolean(accessToken && user),
    loading,
    login,
    verifyOwner2FA,
    verifyOwnerTOTP,
    resendOwner2FA,
    register,
    logout,
    switchRole,
    setUser,
    markEmailVerified,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
