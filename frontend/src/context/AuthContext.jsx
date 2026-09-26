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
          setUser(null);
          setAccessToken(null);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
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
      setUser(result.user);
      setAccessToken(result.accessToken);
      return result;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (userData) => {
    setLoading(true);
    try {
      const result = await authService.register(userData);
      if (result.user?.email_verified) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
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

  const value = {
    user,
    accessToken,
    isAuthenticated: Boolean(accessToken && user),
    loading,
    login,
    register,
    logout,
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
