import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Check, X, AlertCircle, Search, Compass, RefreshCw } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import GoogleMapView from './GoogleMapView';
import useGeolocation, { GEOLOCATION_STATUS, DEFAULT_CAMPUS_DATUM } from '../../hooks/useGeolocation';

/**
 * LocationPickerModal Component
 * 
 * Interactive location selection dialog:
 * - Request browser geolocation with complete permission states
 * - Click or drag pin to select exact coordinates
 * - Displays live Latitude / Longitude readout
 * - Input for campus building / landmark / room notes
 * - Confirms location back to caller
 * - Responsive layout for mobile (320px+), tablet, and desktop
 */
const LocationPickerModal = ({
  isOpen,
  onClose,
  onConfirm,
  initialCoords = null,
  initialAddress = '',
  title = 'Pick Location on Map',
  subtitle = 'Choose a location on campus or use your device GPS position',
}) => {
  const defaultLat = initialCoords?.lat || initialCoords?.latitude || DEFAULT_CAMPUS_DATUM.latitude;
  const defaultLng = initialCoords?.lng || initialCoords?.longitude || DEFAULT_CAMPUS_DATUM.longitude;

  const [selectedLocation, setSelectedLocation] = useState({
    lat: Number(defaultLat),
    lng: Number(defaultLng),
  });

  const [landmarkText, setLandmarkText] = useState(initialAddress || '');
  const { coords: geoCoords, status: geoStatus, errorMessage: geoError, requestLocation, isLoading: geoLoading } = useGeolocation();

  // Sync initial coordinates when opened
  useEffect(() => {
    if (isOpen) {
      if (initialCoords && initialCoords.latitude && initialCoords.longitude) {
        setSelectedLocation({
          lat: Number(initialCoords.latitude),
          lng: Number(initialCoords.longitude),
        });
      } else if (initialCoords && initialCoords.lat && initialCoords.lng) {
        setSelectedLocation({
          lat: Number(initialCoords.lat),
          lng: Number(initialCoords.lng),
        });
      }
      if (initialAddress) {
        setLandmarkText(initialAddress);
      }
    }
  }, [isOpen, initialCoords, initialAddress]);

  // Handle current location request
  const handleUseCurrentLocation = async () => {
    try {
      const pos = await requestLocation();
      setSelectedLocation({
        lat: pos.latitude,
        lng: pos.longitude,
      });
    } catch (err) {
      console.warn('Geolocation request ended with state:', err);
    }
  };

  const handleMapClick = (evt) => {
    setSelectedLocation({
      lat: evt.lat,
      lng: evt.lng,
    });
  };

  const handleMarkerDragEnd = (evt) => {
    setSelectedLocation({
      lat: evt.lat,
      lng: evt.lng,
    });
  };

  const handleConfirm = () => {
    onConfirm({
      latitude: Number(selectedLocation.lat.toFixed(6)),
      longitude: Number(selectedLocation.lng.toFixed(6)),
      address: landmarkText.trim(),
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', width: '100%', flexWrap: 'wrap' }}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={Check}
            onClick={handleConfirm}
          >
            Confirm Location
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>

        {/* GPS Permission / Status Feedback */}
        {geoError && (
          <div
            style={{
              padding: '0.65rem 0.85rem',
              backgroundColor: '#fffbeb',
              border: '1px solid #fef3c7',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: '#b45309',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{geoError}</span>
          </div>
        )}

        {/* Toolbar: Current Location & Pin Hint */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            leftIcon={geoLoading ? RefreshCw : Navigation}
            onClick={handleUseCurrentLocation}
            disabled={geoLoading}
          >
            {geoLoading ? 'Detecting Location...' : 'Use Current Location'}
          </Button>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            💡 Click anywhere or drag the pin to adjust
          </div>
        </div>

        {/* Google Map Canvas */}
        <GoogleMapView
          center={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
          zoom={16}
          height="320px"
          onMapClick={handleMapClick}
          markers={[
            {
              lat: selectedLocation.lat,
              lng: selectedLocation.lng,
              title: 'Selected Point',
              draggable: true,
              onDragEnd: handleMarkerDragEnd,
              type: 'delivery',
              color: '#10b981',
              infoContent: `Lat: ${selectedLocation.lat.toFixed(6)}, Lng: ${selectedLocation.lng.toFixed(6)}`,
            },
          ]}
        />

        {/* Selected Coordinates Readout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.75rem',
            padding: '0.75rem',
            backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-light, #f1f5f9)',
          }}
        >
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Latitude
            </span>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {selectedLocation.lat.toFixed(6)}
            </div>
          </div>
          <div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
              Longitude
            </span>
            <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {selectedLocation.lng.toFixed(6)}
            </div>
          </div>
        </div>

        {/* Optional Building / Room / Landmark Input */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
            Campus Landmark / Location Description (Optional)
          </label>
          <input
            type="text"
            value={landmarkText}
            onChange={(e) => setLandmarkText(e.target.value)}
            placeholder="e.g. Near Ganga Hostel Gate 2 / SAC Block B"
            style={{
              width: '100%',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>
    </Modal>
  );
};

export default LocationPickerModal;
