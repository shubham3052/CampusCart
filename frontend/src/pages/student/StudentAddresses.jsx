import React, { useState, useEffect } from 'react';
import { MapPin, Plus, Trash2, CheckCircle, Edit3, Phone, Building, Navigation, Compass, ExternalLink, RefreshCw } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import orderService from '../../services/orderService';
import LocationPickerModal from '../../components/maps/LocationPickerModal';
import useGeolocation from '../../hooks/useGeolocation';

const StudentAddresses = () => {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    hostel_block: '',
    room_number: '',
    landmark: '',
    phone_number: '',
    is_default: false,
    latitude: null,
    longitude: null,
  });
  const [submitting, setSubmitting] = useState(false);

  const { requestLocation, isLoading: detectingLocation, errorMessage: geoError } = useGeolocation();

  const fetchAddresses = async () => {
    try {
      setLoading(true);
      const data = await orderService.getStudentAddresses();
      setAddresses(data.results || data || []);
    } catch (err) {
      console.error('Failed to load addresses:', err);
      setError('Could not load saved delivery addresses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  const openCreateModal = () => {
    setEditingAddress(null);
    setFormData({
      label: 'Hostel Room',
      hostel_block: '',
      room_number: '',
      landmark: '',
      phone_number: '',
      is_default: addresses.length === 0,
      latitude: null,
      longitude: null,
    });
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (addr) => {
    setEditingAddress(addr);
    setFormData({
      label: addr.label,
      hostel_block: addr.hostel_block,
      room_number: addr.room_number,
      landmark: addr.landmark || '',
      phone_number: addr.phone_number,
      is_default: addr.is_default,
      latitude: addr.latitude != null ? Number(addr.latitude) : null,
      longitude: addr.longitude != null ? Number(addr.longitude) : null,
    });
    setError('');
    setIsModalOpen(true);
  };

  const handleUseCurrentLocation = async () => {
    try {
      const pos = await requestLocation();
      setFormData((prev) => ({
        ...prev,
        latitude: Number(pos.latitude.toFixed(6)),
        longitude: Number(pos.longitude.toFixed(6)),
      }));
    } catch (err) {
      console.warn('Geolocation detection ended:', err);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.hostel_block || !formData.room_number || !formData.phone_number) {
      setError('Please fill in Hostel Block, Room Number, and Contact Phone.');
      return;
    }

    if (formData.latitude != null || formData.longitude != null) {
      const nLat = Number(formData.latitude);
      const nLng = Number(formData.longitude);
      if (isNaN(nLat) || nLat < -90 || nLat > 90) {
        setError('Valid latitude between -90 and 90 is required.');
        return;
      }
      if (isNaN(nLng) || nLng < -180 || nLng > 180) {
        setError('Valid longitude between -180 and 180 is required.');
        return;
      }
    }

    setSubmitting(true);
    setError('');
    try {
      const payload = {
        label: formData.label.trim(),
        hostel_block: formData.hostel_block.trim(),
        room_number: formData.room_number.trim(),
        landmark: formData.landmark ? formData.landmark.trim() : '',
        phone_number: formData.phone_number.trim(),
        is_default: !!formData.is_default,
      };

      if (formData.latitude != null && formData.longitude != null) {
        payload.latitude = Number(Number(formData.latitude).toFixed(6));
        payload.longitude = Number(Number(formData.longitude).toFixed(6));
      } else {
        payload.latitude = null;
        payload.longitude = null;
      }

      if (editingAddress) {
        await orderService.updateStudentAddress(editingAddress.id, payload);
        setSuccessMsg('Address updated successfully.');
      } else {
        await orderService.createStudentAddress(payload);
        setSuccessMsg('New delivery address added.');
      }
      setIsModalOpen(false);
      fetchAddresses();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Failed to save address:', err);
      setError(err.response?.data?.message || 'Failed to save address. Please check input values.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return;
    try {
      await orderService.deleteStudentAddress(id);
      setSuccessMsg('Address deleted.');
      fetchAddresses();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to delete address:', err);
      setError('Could not delete address.');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await orderService.setDefaultStudentAddress(id);
      setSuccessMsg('Default address updated.');
      fetchAddresses();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to set default address:', err);
      setError('Could not set as default address.');
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '850px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Campus Delivery Addresses"
          subtitle="Manage your dorms, labs, and campus delivery drop points"
        />
        <Button variant="primary" icon={Plus} onClick={openCreateModal}>
          Add New Address
        </Button>
      </div>

      {successMsg && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: 'var(--success-50, #f0fdf4)', border: '1px solid var(--success-200, #bbf7d0)', color: 'var(--success-700, #15803d)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontWeight: 600 }}>
          ✓ {successMsg}
        </div>
      )}

      {error && (
        <div style={{ padding: '0.85rem 1.25rem', backgroundColor: 'var(--danger-50, #fef2f2)', border: '1px solid var(--danger-200, #fecaca)', color: 'var(--danger-700, #b91c1c)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontWeight: 600 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          Loading your delivery locations...
        </div>
      ) : addresses.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <MapPin size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>No Saved Addresses</h3>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Add your campus hostel room or department building to enjoy fast, doorstep delivery for stationery and Xerox printouts.
          </p>
          <Button variant="primary" icon={Plus} onClick={openCreateModal}>
            Add First Address
          </Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
          {addresses.map((addr) => (
            <Card
              key={addr.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                border: addr.is_default ? '2px solid var(--primary-500, #6366f1)' : '1px solid var(--border-color)',
                position: 'relative',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-50, #eef2ff)', color: 'var(--primary-600, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building size={20} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{addr.label}</h4>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Saved Drop Location</div>
                    </div>
                  </div>
                  {addr.is_default && (
                    <Badge variant="success" size="sm">
                      Default
                    </Badge>
                  )}
                </div>

                <div style={{ margin: '1rem 0', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600 }}>{addr.hostel_block}, {addr.room_number}</div>
                  {addr.landmark && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Landmark: {addr.landmark}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    <Phone size={14} /> {addr.phone_number}
                  </div>

                  {addr.latitude && addr.longitude && (
                    <div style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      marginTop: '0.65rem',
                      padding: '0.25rem 0.55rem',
                      backgroundColor: 'var(--success-50, #f0fdf4)',
                      border: '1px solid var(--success-200, #bbf7d0)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      fontSize: '0.78rem',
                      color: 'var(--success-700, #15803d)',
                      fontWeight: 600,
                    }}>
                      <MapPin size={13} />
                      <span>GPS: {Number(addr.latitude).toFixed(4)}, {Number(addr.longitude).toFixed(4)}</span>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${addr.latitude},${addr.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: 'var(--primary-600, #4f46e5)', marginLeft: '0.25rem', display: 'inline-flex', alignItems: 'center' }}
                        title="View pin on Google Maps"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-light, #f1f5f9)', paddingTop: '0.85rem', marginTop: '0.5rem' }}>
                {!addr.is_default ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault(addr.id)}
                    style={{ fontSize: '0.8rem' }}
                  >
                    Set as Default
                  </Button>
                ) : (
                  <span style={{ fontSize: '0.8rem', color: 'var(--success-600, #16a34a)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontWeight: 600 }}>
                    <CheckCircle size={14} /> Primary Delivery Point
                  </span>
                )}

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Edit3}
                    onClick={() => openEditModal(addr)}
                    aria-label="Edit address"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => handleDelete(addr.id)}
                    style={{ color: 'var(--danger-600, #dc2626)' }}
                    aria-label="Delete address"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Address Form Modal */}
      {isModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem',
        }}>
          <Card style={{ width: '100%', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              {editingAddress ? 'Edit Delivery Address' : 'Add Campus Delivery Address'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Specify your campus dorm or building drop location.
            </p>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Address Label *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hostel Room, Department Lab"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Hostel / Building *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Mandakini Hostel"
                    value={formData.hostel_block}
                    onChange={(e) => setFormData({ ...formData, hostel_block: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Room / Desk # *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Room 304"
                    value={formData.room_number}
                    onChange={(e) => setFormData({ ...formData, room_number: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Campus Landmark (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Near Dining Hall Gate 2"
                  value={formData.landmark}
                  onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Contact Phone Number *
                </label>
                <input
                  type="tel"
                  placeholder="e.g. +91 9876543210"
                  value={formData.phone_number}
                  onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                  required
                />
              </div>

              {/* GPS Coordinates Section */}
              <div style={{
                padding: '0.85rem',
                backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
                borderRadius: 'var(--radius-md, 8px)',
                border: '1px solid var(--border-light, #e2e8f0)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <MapPin size={15} color="var(--primary-600, #4f46e5)" />
                    GPS Pinpoint (Optional)
                  </label>
                  {formData.latitude != null && formData.longitude != null && (
                    <button
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, latitude: null, longitude: null }))}
                      style={{ background: 'none', border: 'none', color: 'var(--danger-600, #dc2626)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Clear Coordinates
                    </button>
                  )}
                </div>

                {geoError && (
                  <div style={{ fontSize: '0.75rem', color: '#b45309' }}>
                    ⚠️ {geoError}
                  </div>
                )}

                {formData.latitude != null && formData.longitude != null ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', fontSize: '0.82rem', color: '#166534' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      Lat: {Number(formData.latitude).toFixed(6)}, Lng: {Number(formData.longitude).toFixed(6)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={Compass}
                      onClick={() => setIsPickerOpen(true)}
                      style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
                    >
                      Adjust Pin
                    </Button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={detectingLocation ? RefreshCw : Navigation}
                      onClick={handleUseCurrentLocation}
                      disabled={detectingLocation}
                    >
                      {detectingLocation ? 'Detecting...' : 'Use Current Location'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      icon={Compass}
                      onClick={() => setIsPickerOpen(true)}
                    >
                      Pinpoint on Map
                    </Button>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="is_default_check"
                  checked={formData.is_default}
                  onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="is_default_check" style={{ fontSize: '0.85rem', fontWeight: 500, cursor: 'pointer' }}>
                  Set as default campus delivery address
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <Button variant="secondary" type="button" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : editingAddress ? 'Save Changes' : 'Add Address'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Interactive Location Picker Modal */}
      {isPickerOpen && (
        <LocationPickerModal
          isOpen={isPickerOpen}
          onClose={() => setIsPickerOpen(false)}
          title="Pinpoint Delivery Address"
          subtitle="Choose your hostel building or campus drop location on the map"
          initialCoords={
            formData.latitude && formData.longitude
              ? { lat: Number(formData.latitude), lng: Number(formData.longitude) }
              : null
          }
          initialAddress={formData.landmark || formData.hostel_block}
          onConfirm={({ latitude, longitude, address }) => {
            setFormData((prev) => ({
              ...prev,
              latitude,
              longitude,
              landmark: prev.landmark || address,
            }));
          }}
        />
      )}
    </div>
  );
};

export default StudentAddresses;
