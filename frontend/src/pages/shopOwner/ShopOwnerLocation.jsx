import React, { useState, useEffect } from 'react';
import { MapPin, Navigation, Save, CheckCircle2, AlertCircle, Store, RefreshCw, Compass } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import GoogleMapView from '../../components/maps/GoogleMapView';
import shopService from '../../services/shopService';
import useGeolocation, { DEFAULT_CAMPUS_DATUM } from '../../hooks/useGeolocation';

const ShopOwnerLocation = () => {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [coords, setCoords] = useState({
    lat: DEFAULT_CAMPUS_DATUM.latitude,
    lng: DEFAULT_CAMPUS_DATUM.longitude,
  });

  const [locationForm, setLocationForm] = useState({
    address: '',
    campus_location: '',
  });

  const { requestLocation, isLoading: detectingLocation, errorMessage: geoError } = useGeolocation();

  const fetchShopDetails = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await shopService.getMyShop();
      setShop(data);

      if (data.latitude && data.longitude) {
        setCoords({
          lat: Number(data.latitude),
          lng: Number(data.longitude),
        });
      }

      setLocationForm({
        address: data.address || '',
        campus_location: data.campus_location || '',
      });
    } catch (err) {
      console.error('Failed to fetch shop:', err);
      setErrorMsg('Could not load your shop details. Please verify your merchant account is active.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopDetails();
  }, []);

  const handleUseCurrentLocation = async () => {
    try {
      const pos = await requestLocation();
      setCoords({
        lat: pos.latitude,
        lng: pos.longitude,
      });
      setSuccessMsg('Coordinates updated from your current GPS position. Remember to click "Save Shop Location".');
    } catch (err) {
      console.warn('Location detection ended:', err);
    }
  };

  const handleMapClick = (evt) => {
    setCoords({
      lat: evt.lat,
      lng: evt.lng,
    });
  };

  const handleMarkerDragEnd = (evt) => {
    setCoords({
      lat: evt.lat,
      lng: evt.lng,
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!shop?.id) return;

    const nLat = Number(coords.lat);
    const nLng = Number(coords.lng);
    if (isNaN(nLat) || nLat < -90 || nLat > 90) {
      setErrorMsg('Please select a valid latitude between -90 and 90.');
      return;
    }
    if (isNaN(nLng) || nLng < -180 || nLng > 180) {
      setErrorMsg('Please select a valid longitude between -180 and 180.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {
        latitude: Number(nLat.toFixed(6)),
        longitude: Number(nLng.toFixed(6)),
        address: locationForm.address.trim(),
        campus_location: locationForm.campus_location.trim(),
      };

      const updated = await shopService.updateShopLocation(shop.id, payload);
      setShop(updated);
      setSuccessMsg('Shop location and coordinates saved successfully! Students will now see accurate proximity.');
    } catch (err) {
      console.error('Error saving shop location:', err);
      const backendErr = err.response?.data?.message || err.response?.data?.latitude?.[0] || err.response?.data?.longitude?.[0] || err.message;
      setErrorMsg(`Failed to save shop location: ${backendErr}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ textAlign: 'center', padding: '4rem 1rem' }}>
        <Spinner size="lg" message="Loading your shop location profile..." />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1050px' }}>
      <PageHeader
        title="Shop Location & Proximity Settings"
        subtitle="Configure your stationery / xerox store GPS coordinates so students can locate you accurately"
      />

      {/* Success Notification */}
      {successMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-lg, 12px)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.25rem',
            color: '#166534',
          }}
        >
          <CheckCircle2 size={20} color="#22c55e" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{successMsg}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-lg, 12px)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '1.25rem',
            color: '#991b1b',
          }}
        >
          <AlertCircle size={20} color="#dc2626" style={{ flexShrink: 0 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Form + Interactive Map */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Form & Coordinates */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card title="Store Identification">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: 'var(--radius-md, 8px)',
                  backgroundColor: 'var(--primary-50, #eff6ff)',
                  color: 'var(--primary-600, #4f46e5)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Store size={22} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {shop?.name}
                </h4>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {shop?.shop_type_display || 'Campus Stationery Shop'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Campus Landmark / Wing *
                </label>
                <input
                  type="text"
                  required
                  value={locationForm.campus_location}
                  onChange={(e) => setLocationForm((p) => ({ ...p, campus_location: e.target.value }))}
                  placeholder="e.g. Student Activity Center Block B, 1st Floor"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-medium, #cbd5e1)',
                    fontSize: '0.875rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Full Physical Address *
                </label>
                <textarea
                  required
                  rows={3}
                  value={locationForm.address}
                  onChange={(e) => setLocationForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Detailed shop directions, room/shop number, and nearest campus gate"
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-medium, #cbd5e1)',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Coordinates Readout */}
              <div
                style={{
                  padding: '0.75rem',
                  backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: '1px solid var(--border-light, #f1f5f9)',
                }}
              >
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                  GPS COORDINATES SNAPSHOT
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span>Latitude:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{coords.lat.toFixed(6)}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  <span>Longitude:</span>
                  <strong style={{ fontFamily: 'monospace' }}>{coords.lng.toFixed(6)}</strong>
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                leftIcon={Save}
                disabled={saving}
                style={{ width: '100%' }}
              >
                {saving ? 'Saving Location...' : 'Save Shop Location'}
              </Button>
            </form>
          </Card>
        </div>

        {/* Right Column: Interactive Google Map */}
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Card title="Pinpoint Location on Map">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                📍 Click anywhere on the map or drag the purple shop pin to set your exact storefront position.
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                leftIcon={detectingLocation ? RefreshCw : Navigation}
                onClick={handleUseCurrentLocation}
                disabled={detectingLocation}
              >
                {detectingLocation ? 'Detecting...' : 'Use Current Device Location'}
              </Button>
            </div>

            {geoError && (
              <div style={{ fontSize: '0.75rem', color: '#b45309', marginBottom: '0.75rem' }}>
                ⚠️ {geoError}
              </div>
            )}

            <GoogleMapView
              center={{ lat: coords.lat, lng: coords.lng }}
              zoom={16}
              height="450px"
              onMapClick={handleMapClick}
              markers={[
                {
                  lat: coords.lat,
                  lng: coords.lng,
                  title: shop?.name || 'Your Shop',
                  draggable: true,
                  onDragEnd: handleMarkerDragEnd,
                  type: 'shop',
                  color: '#4f46e5',
                  infoContent: `<strong>${shop?.name || 'Shop'}</strong><br/>Lat: ${coords.lat.toFixed(6)}, Lng: ${coords.lng.toFixed(6)}`,
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ShopOwnerLocation;
