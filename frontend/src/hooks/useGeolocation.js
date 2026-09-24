import { useState, useCallback } from 'react';

/**
 * Geolocation Permission & Coordinate Acquisition Hook
 * 
 * Provides robust handling for:
 * - IDLE: User hasn't requested location yet
 * - REQUESTING: Browser prompt active
 * - GRANTED: Successfully acquired coordinates
 * - DENIED: User rejected browser permission prompt
 * - UNAVAILABLE: Device location sensor / WiFi triangulation unavailable
 * - TIMEOUT: Acquisition timed out
 * - NOT_SUPPORTED: Browser doesn't support navigator.geolocation
 * 
 * Non-blocking: application features remain fully usable even if permission is denied.
 */
export const GEOLOCATION_STATUS = {
  IDLE: 'IDLE',
  REQUESTING: 'REQUESTING',
  GRANTED: 'GRANTED',
  DENIED: 'DENIED',
  UNAVAILABLE: 'UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
};

// Default Campus Reference Datum (IIT Delhi / University Campus)
export const DEFAULT_CAMPUS_DATUM = {
  latitude: 28.5450,
  longitude: 77.1926,
  label: 'University Campus Core',
};

export const useGeolocation = (options = {}) => {
  const [coords, setCoords] = useState(null);
  const [status, setStatus] = useState(GEOLOCATION_STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState(null);

  const isSupported = typeof window !== 'undefined' && 'geolocation' in navigator;

  const requestLocation = useCallback((customOptions = {}) => {
    if (!isSupported) {
      setStatus(GEOLOCATION_STATUS.NOT_SUPPORTED);
      setErrorMessage('Geolocation is not supported by your browser or device.');
      return Promise.reject(new Error('Geolocation not supported'));
    }

    setStatus(GEOLOCATION_STATUS.REQUESTING);
    setErrorMessage(null);

    const geoOptions = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
      ...options,
      ...customOptions,
    };

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCoords = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          };
          setCoords(newCoords);
          setStatus(GEOLOCATION_STATUS.GRANTED);
          setErrorMessage(null);
          resolve(newCoords);
        },
        (error) => {
          let state = GEOLOCATION_STATUS.UNAVAILABLE;
          let userFriendlyMsg = 'Unable to determine your device location.';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              state = GEOLOCATION_STATUS.DENIED;
              userFriendlyMsg = 'Location permission was denied. You can still select your location manually on the map.';
              break;
            case error.POSITION_UNAVAILABLE:
              state = GEOLOCATION_STATUS.UNAVAILABLE;
              userFriendlyMsg = 'Location information is currently unavailable from your device.';
              break;
            case error.TIMEOUT:
              state = GEOLOCATION_STATUS.TIMEOUT;
              userFriendlyMsg = 'Location request timed out. Please try again or pick on map.';
              break;
            default:
              state = GEOLOCATION_STATUS.UNAVAILABLE;
              userFriendlyMsg = error.message || 'An error occurred while retrieving location.';
          }

          setStatus(state);
          setErrorMessage(userFriendlyMsg);
          reject({ state, message: userFriendlyMsg, originalError: error });
        },
        geoOptions
      );
    });
  }, [isSupported, options]);

  const clearLocation = useCallback(() => {
    setCoords(null);
    setStatus(GEOLOCATION_STATUS.IDLE);
    setErrorMessage(null);
  }, []);

  return {
    coords,
    status,
    errorMessage,
    isSupported,
    isLoading: status === GEOLOCATION_STATUS.REQUESTING,
    isGranted: status === GEOLOCATION_STATUS.GRANTED,
    isDenied: status === GEOLOCATION_STATUS.DENIED,
    requestLocation,
    clearLocation,
  };
};

export default useGeolocation;
