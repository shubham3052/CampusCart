/**
 * Centralized Google Maps JavaScript API Loader
 * 
 * Features:
 * - Singleton script loader: loads the Google Maps SDK once and caches the promise.
 * - Requested libraries: places (for autocomplete/search) and geometry (for geodesic calculations).
 * - Safe environment variable access via import.meta.env.VITE_GOOGLE_MAPS_API_KEY.
 * - Graceful fallback / diagnostics when no API key is set or offline.
 */

let loadPromise = null;

export const isGoogleMapsLoaded = () => {
  return typeof window !== 'undefined' && !!(window.google && window.google.maps);
};

export const getGoogleMapsApiKey = () => {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
};

export const loadGoogleMapsApi = () => {
  // If already loaded in window, resolve immediately
  if (isGoogleMapsLoaded()) {
    return Promise.resolve(window.google.maps);
  }

  // If already in progress, return the existing promise
  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = getGoogleMapsApiKey().trim();

  // If API key is missing or default placeholder
  if (!apiKey || apiKey === 'your_google_maps_api_key_here' || apiKey === 'your_key_here') {
    return Promise.reject({
      code: 'MISSING_API_KEY',
      message: 'Google Maps API key is not configured in frontend/.env. Set VITE_GOOGLE_MAPS_API_KEY to enable live Google Maps.',
    });
  }

  loadPromise = new Promise((resolve, reject) => {
    // Check if script tag already exists
    const existingScript = document.getElementById('google-maps-sdk');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.google.maps));
      existingScript.addEventListener('error', (e) => reject({ code: 'LOAD_ERROR', originalError: e }));
      return;
    }

    const callbackName = `__googleMapsInitCallback_${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve(window.google.maps);
    };

    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.type = 'text/javascript';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry&callback=${callbackName}&loading=async`;
    script.async = true;
    script.defer = true;

    script.onerror = (error) => {
      delete window[callbackName];
      loadPromise = null;
      reject({
        code: 'SCRIPT_ERROR',
        message: 'Failed to load Google Maps Platform JavaScript SDK. Check your internet connection or Google Cloud API credentials.',
        originalError: error,
      });
    };

    document.head.appendChild(script);
  });

  return loadPromise;
};

export default {
  loadGoogleMapsApi,
  isGoogleMapsLoaded,
  getGoogleMapsApiKey,
};
