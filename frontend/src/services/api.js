import axios from 'axios';

const PRODUCTION_API_URL = 'https://campuscart-backend-u8k0.onrender.com/api';
const LOCAL_API_URL = 'http://127.0.0.1:8000/api';

/**
 * Normalizes an API base URL so that it always includes the /api prefix
 * without creating duplicate trailing slashes or duplicate /api/api segments.
 */
export const normalizeApiUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (!trimmed.endsWith('/api')) {
    trimmed = `${trimmed}/api`;
  }
  return trimmed;
};

/**
 * Resolves the appropriate API base URL based on environment variables,
 * dev server proxy configuration, and runtime hostname.
 */
const resolveApiBaseUrl = () => {
  const envUrl = import.meta.env?.VITE_API_BASE_URL
    ? normalizeApiUrl(import.meta.env.VITE_API_BASE_URL)
    : '';

  // In browser runtime:
  if (typeof window !== 'undefined' && window.location) {
    const { hostname, port, protocol } = window.location;

    // When running inside Vite dev server (e.g., port 5174 or 5173):
    // Use relative '/api' which Vite proxies directly to http://127.0.0.1:8000.
    // This allows mobile devices connected to http://<LAN_IP>:5174/ to communicate
    // through the Vite proxy (Node.js) without encountering Windows Firewall blocks
    // on port 8000, CORS origin issues, or outdated IP mismatches.
    if (port === '5174' || port === '5173') {
      if (envUrl && envUrl.startsWith('https://')) {
        return envUrl;
      }
      return '/api';
    }

    // When accessed from LAN IP in standalone mode or preview:
    const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && !hostname.startsWith('127.');
    if (isLanIp) {
      return `${protocol}//${hostname}:8000/api`;
    }

    const isLoopback = hostname === 'localhost' || hostname === '127.0.0.1';

    // If running on a public domain (e.g., campus-cart-steel.vercel.app):
    // Prioritize explicit non-localhost envUrl, or fallback to the live Render backend.
    if (!isLoopback) {
      if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return envUrl;
      }
      return PRODUCTION_API_URL;
    }
  }

  // Local development / build fallback:
  return envUrl || LOCAL_API_URL;
};

export const API_BASE_URL = resolveApiBaseUrl();

/**
 * Centralized Axios instance for the Smart Stationery application.
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Variable to prevent multiple simultaneous refresh requests
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Request Interceptor: Attach JWT Bearer token
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response Interceptor: Handle 401 & auto refresh token
 */
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle Network Error or no response from server
    if (!error.response) {
      let message = 'Network Error: Cannot connect to CampusCart backend. Please ensure the server is running.';

      if (typeof window !== 'undefined' && window.location?.hostname) {
        const { hostname } = window.location;
        const isLanIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) && !hostname.startsWith('127.');
        const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';

        if (isLanIp) {
          message = 'Network Error: Cannot connect to CampusCart backend. Please ensure Django is running on 0.0.0.0:8000 and your mobile is on the same Wi-Fi network.';
        } else if (isLocal) {
          message = 'Network Error: Please ensure the Django backend server is running on port 8000.';
        } else {
          message = 'Network Error: Unable to connect to the CampusCart production backend. Please check your internet connection or verify the server status.';
        }
      }

      return Promise.reject({
        message,
        isNetworkError: true,
        status: 0,
        originalError: error,
      });
    }

    const status = error.response.status;

    // Avoid retry on login or refresh endpoints
    const isAuthEndpoint =
      originalRequest.url?.includes('/auth/login/') ||
      originalRequest.url?.includes('/auth/token/refresh/') ||
      originalRequest.url?.includes('/auth/register/');

    if (status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(error);
      }

      try {
        const response = await axios.post(`${API_BASE_URL}/auth/token/refresh/`, {
          refresh: refreshToken,
        });

        const newAccessToken = response.data.access;
        localStorage.setItem('access_token', newAccessToken);
        if (response.data.refresh) {
          localStorage.setItem('refresh_token', response.data.refresh);
        }

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;

        processQueue(null, newAccessToken);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Health check helper for verifying Django backend connectivity.
 */
export const checkHealth = async () => {
  try {
    const response = await api.get('/health/');
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      message: error?.message || 'Failed to connect to backend health check',
      error,
    };
  }
};

export default api;
