import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Truck,
  MapPin,
  Phone,
  Package,
  KeyRound,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Activity,
  Power,
  Check,
  Navigation,
  Compass,
  Zap,
  ExternalLink,
  Store,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import orderService from '../../services/orderService';
import deliveryGpsService from '../../services/deliveryGpsService';
import LiveMap from '../../components/common/LiveMap';
import Modal from '../../components/common/Modal';
import DeliveryRouteMap from '../../components/maps/DeliveryRouteMap';
import { useAuth } from '../../context/AuthContext';

const DeliveryAgentDashboard = () => {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' | 'HISTORY'
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Shift availability
  const [availability, setAvailability] = useState('AVAILABLE');
  const [updatingAvailability, setUpdatingAvailability] = useState(false);

  // Start Delivery Modal
  const [startModalOpen, setStartModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [estimatedMinutes, setEstimatedMinutes] = useState(25);
  const [submittingStart, setSubmittingStart] = useState(false);

  // OTP Verification Modal
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Failure Modal
  const [failureModalOpen, setFailureModalOpen] = useState(false);
  const [failureReason, setFailureReason] = useState('CUSTOMER_UNAVAILABLE');
  const [failureNotes, setFailureNotes] = useState('');
  const [submittingFailure, setSubmittingFailure] = useState(false);

  // Step 22: Live GPS Broadcasting & Multi-Stop Route State
  const [isGpsBroadcasting, setIsGpsBroadcasting] = useState(false);
  const [gpsCoords, setGpsCoords] = useState(null);
  const [gpsError, setGpsError] = useState('');
  const [currentRoute, setCurrentRoute] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const watchIdRef = useRef(null);

  // Static Route Map Modal State (No continuous live tracking)
  const [routeMapModalOpen, setRouteMapModalOpen] = useState(false);
  const [selectedDeliveryForRoute, setSelectedDeliveryForRoute] = useState(null);

  const openRouteMapModal = (deliv) => {
    setSelectedDeliveryForRoute(deliv);
    setRouteMapModalOpen(true);
  };

  // Order Details Modal
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedDeliveryForDetails, setSelectedDeliveryForDetails] = useState(null);

  const openDetailsModal = (deliv) => {
    setSelectedDeliveryForDetails(deliv);
    setDetailsModalOpen(true);
  };

  const handleArrivedAtShop = async (delivery) => {
    try {
      setLoading(true);
      await orderService.markDeliveryArrivedAtShop(delivery.id);
      setSuccessMsg(`✓ Arrived at shop for Order #${String(delivery.order_number || delivery.id).slice(0, 8)}. Shopkeeper notified.`);
      await fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Arrived at shop error:', err);
      setError(err.response?.data?.message || 'Failed to mark arrival at shop.');
    } finally {
      setLoading(false);
    }
  };

  // Geolocation tracking
  useEffect(() => {
    if (!isGpsBroadcasting || availability === 'OFFLINE') {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }

    const handleSuccess = async (pos) => {
      const coords = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed,
        heading: pos.coords.heading,
        timestamp: new Date(pos.timestamp).toISOString(),
      };
      setGpsCoords(coords);
      setGpsError('');

      try {
        await deliveryGpsService.updateLocation({
          ...coords,
          source: 'GPS',
        });
      } catch (err) {
        console.error('Failed to stream live GPS location:', err);
      }
    };

    const handleError = (err) => {
      if (err.code === 1) {
        setGpsError('Location permission denied. Please enable location access in your browser settings.');
        setIsGpsBroadcasting(false);
      } else {
        setGpsError(`GPS signal issue: ${err.message}`);
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isGpsBroadcasting, availability]);

  const fetchCurrentRoute = async () => {
    try {
      setLoadingRoute(true);
      const routes = await deliveryGpsService.getDeliveryRoutes();
      const active = (routes.results || routes || []).find(
        (r) => r.status === 'ACTIVE' || r.status === 'PLANNED'
      );
      setCurrentRoute(active || null);
    } catch (err) {
      console.error('Failed to load courier routes:', err);
    } finally {
      setLoadingRoute(false);
    }
  };

  useEffect(() => {
    fetchCurrentRoute();
  }, []);

  const handleCreateOptimizedRoute = async () => {
    const uncompleted = deliveries.filter(
      (d) => d.delivery_status !== 'DELIVERED' && d.delivery_status !== 'CANCELLED' && d.delivery_status !== 'FAILED'
    );
    if (uncompleted.length === 0) {
      setError('No active deliveries available to optimize.');
      return;
    }

    try {
      setLoadingRoute(true);
      const res = await deliveryGpsService.createDeliveryRoute({
        delivery_ids: uncompleted.map((d) => d.id),
      });
      setCurrentRoute(res.route);
      setSuccessMsg(`Optimized route #${res.route.id} created with ${res.route.total_stops} stop(s)!`);
      setActiveTab('ROUTE');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Route creation failed:', err);
      setError(err.response?.data?.message || 'Failed to create route.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleRecalculateRoute = async (routeId) => {
    try {
      setLoadingRoute(true);
      const res = await deliveryGpsService.recalculateRoute(routeId);
      setCurrentRoute(res.route);
      setSuccessMsg('Route recalculated from your live position!');
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Recalculate failed:', err);
      setError('Failed to recalculate route.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleStartRoute = async (routeId) => {
    try {
      setLoadingRoute(true);
      const res = await deliveryGpsService.startRoute(routeId);
      setCurrentRoute(res.route);
      setSuccessMsg('Route is now ACTIVE. Deliveries marked Out on Campus!');
      fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Start route failed:', err);
      setError('Failed to start route.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const handleCompleteStop = async (routeId, stopId) => {
    try {
      setLoadingRoute(true);
      const res = await deliveryGpsService.completeRouteStop(routeId, stopId);
      setCurrentRoute(res.route);
      setSuccessMsg('Stop marked as completed!');
      fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Complete stop failed:', err);
      setError('Failed to update stop completion.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const fetchDeliveries = async () => {
    try {
      setLoading(true);
      const data = await orderService.getDeliveries();
      setDeliveries(data.results || data || []);
    } catch (err) {
      console.error('Failed to load courier deliveries:', err);
      setError('Could not load assigned deliveries.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, []);

  const handleToggleAvailability = async (newStatus) => {
    if (user?.approval_status === 'PENDING') {
      setError('Your courier account is pending administrative approval. Shift status cannot be changed yet.');
      return;
    }
    if (user?.approval_status === 'REJECTED') {
      setError('Your courier account application was rejected. Please contact an administrator.');
      return;
    }
    setUpdatingAvailability(true);
    try {
      await orderService.toggleCourierAvailability(newStatus);
      setAvailability(newStatus);
      setSuccessMsg(`Your shift status is now ${newStatus}.`);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Toggle availability error:', err);
      setError(err.response?.data?.message || 'Could not update shift availability status.');
    } finally {
      setUpdatingAvailability(false);
    }
  };

  const handlePickup = async (delivery) => {
    try {
      setLoading(true);
      await orderService.markDeliveryPickup(delivery.id);
      setSuccessMsg(`Order #${String(delivery.order_number).slice(0, 8)} picked up from store.`);
      await fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Pickup error:', err);
      setError(err.response?.data?.message || 'Failed to mark delivery as picked up.');
    } finally {
      setLoading(false);
    }
  };

  const openStartModal = (delivery) => {
    setSelectedDelivery(delivery);
    setEstimatedMinutes(25);
    setError('');
    setStartModalOpen(true);
  };

  const handleStartDelivery = async (e) => {
    e.preventDefault();
    setSubmittingStart(true);
    setError('');
    try {
      await orderService.markDeliveryOutForDelivery(
        selectedDelivery.id,
        Number(estimatedMinutes)
      );
      setSuccessMsg(`Order #${String(selectedDelivery.order_number).slice(0, 8)} is now Out for Delivery! Student has received their OTP.`);
      setStartModalOpen(false);
      fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Start delivery error:', err);
      setError(err.response?.data?.message || 'Failed to start delivery.');
    } finally {
      setSubmittingStart(false);
    }
  };

  const handleArriving = async (delivery) => {
    try {
      setLoading(true);
      await orderService.markDeliveryArriving(delivery.id);
      setSuccessMsg(`Notification sent to ${delivery.customer_name}: Courier arriving soon!`);
      await fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Arriving signal error:', err);
      setError(err.response?.data?.message || 'Failed to update arriving status.');
    } finally {
      setLoading(false);
    }
  };

  const openOtpModal = (delivery) => {
    setSelectedDelivery(delivery);
    setOtpCode('');
    setDeliveryNotes('');
    setOtpError('');
    setOtpModalOpen(true);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Please enter the 6-digit delivery OTP.');
      return;
    }

    setVerifyingOtp(true);
    setOtpError('');
    try {
      await orderService.verifyDeliveryOtp(selectedDelivery.id, otpCode.trim(), deliveryNotes);
      setSuccessMsg(`✓ Order #${String(selectedDelivery.order_number).slice(0, 8)} delivered and verified successfully!`);
      setOtpModalOpen(false);
      fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err) {
      console.error('OTP verification error:', err);
      setOtpError(err.response?.data?.message || 'Invalid or expired delivery OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const openFailureModal = (delivery) => {
    setSelectedDelivery(delivery);
    setFailureReason('CUSTOMER_UNAVAILABLE');
    setFailureNotes('');
    setFailureModalOpen(true);
  };

  const handleReportFailure = async (e) => {
    e.preventDefault();
    setSubmittingFailure(true);
    setError('');
    try {
      await orderService.markDeliveryFailed(selectedDelivery.id, failureReason, failureNotes);
      setSuccessMsg(`Delivery marked as FAILED. Shopkeeper and customer have been alerted.`);
      setFailureModalOpen(false);
      fetchDeliveries();
      setTimeout(() => setSuccessMsg(''), 4500);
    } catch (err) {
      console.error('Failure report error:', err);
      setError(err.response?.data?.message || 'Failed to report delivery failure.');
    } finally {
      setSubmittingFailure(false);
    }
  };

  const activeDeliveries = deliveries.filter(
    (d) => ['ASSIGNED', 'ARRIVED_AT_SHOP', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)
  );

  const pickupPendingDeliveries = activeDeliveries.filter(
    (d) => ['ASSIGNED', 'ARRIVED_AT_SHOP'].includes(d.delivery_status)
  );

  const inTransitDeliveries = activeDeliveries.filter(
    (d) => ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)
  );

  const pastDeliveries = deliveries.filter(
    (d) => ['DELIVERED', 'FAILED', 'CANCELLED', 'RESCHEDULED'].includes(d.delivery_status)
  );

  const stats = useMemo(() => {
    return {
      total: deliveries.length,
      assigned: deliveries.filter((d) => ['ASSIGNED', 'ARRIVED_AT_SHOP'].includes(d.delivery_status)).length,
      inTransit: deliveries.filter((d) => ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)).length,
      delivered: deliveries.filter((d) => d.delivery_status === 'DELIVERED').length,
      failed: deliveries.filter((d) => d.delivery_status === 'FAILED').length,
    };
  }, [deliveries]);

  const displayedList = activeTab === 'ACTIVE' ? activeDeliveries : pastDeliveries;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: '0 0 0.25rem 0' }}>Campus Delivery Queue</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Pick up student packages from campus merchants and verify delivery at student hostels
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Shift status pill selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', backgroundColor: 'var(--bg-muted, #f1f5f9)', padding: '0.25rem 0.4rem', borderRadius: 'var(--radius-md)' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginRight: '0.35rem' }}>SHIFT:</span>
            {[
              { status: 'AVAILABLE', label: 'Online', bg: 'var(--success-600, #16a34a)' },
              { status: 'BUSY', label: 'Busy', bg: 'var(--warning-600, #d97706)' },
              { status: 'OFFLINE', label: 'Offline', bg: 'var(--text-muted, #64748b)' },
            ].map((st) => (
              <button
                key={st.status}
                type="button"
                disabled={updatingAvailability}
                onClick={() => handleToggleAvailability(st.status)}
                style={{
                  border: 'none',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  backgroundColor: availability === st.status ? st.bg : 'transparent',
                  color: availability === st.status ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                }}
              >
                {st.label}
              </button>
            ))}
          </div>

          <Button variant="secondary" icon={RefreshCw} onClick={fetchDeliveries}>
            Refresh
          </Button>
        </div>
      </div>

      {user?.approval_status === 'PENDING' && (
        <div style={{
          padding: '1.1rem 1.25rem',
          backgroundColor: '#fffbeb',
          border: '1.5px solid #fcd34d',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
        }}>
          <AlertCircle size={22} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#92400e' }}>
              Courier Registration Pending Verification
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#b45309', lineHeight: 1.45 }}>
              Your delivery partner application is awaiting review by campus administration. Once approved, delivery orders will appear in your queue and you can begin accepting student packages.
            </p>
          </div>
        </div>
      )}

      {user?.approval_status === 'REJECTED' && (
        <div style={{
          padding: '1.1rem 1.25rem',
          backgroundColor: '#fef2f2',
          border: '1.5px solid #fca5a5',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1.25rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
        }}>
          <AlertCircle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <h4 style={{ margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 800, color: '#991b1b' }}>
              Courier Application Not Approved
            </h4>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#b91c1c', lineHeight: 1.45 }}>
              Your delivery partner registration was not approved. Please consult with the campus administrator for verification requirements.
            </p>
          </div>
        </div>
      )}

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

      {/* Step 22: Live GPS Broadcast Controller */}
      <div
        style={{
          padding: '0.9rem 1.25rem',
          backgroundColor: isGpsBroadcasting ? '#f0fdf4' : 'var(--bg-surface-secondary, #f8fafc)',
          border: `1.5px solid ${isGpsBroadcasting ? '#86efac' : 'var(--border-light, #e2e8f0)'}`,
          borderRadius: 'var(--radius-lg, 12px)',
          marginBottom: '1.25rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.05))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: isGpsBroadcasting ? '#dcfce7' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isGpsBroadcasting ? '#16a34a' : '#64748b',
            }}
          >
            <Compass size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <strong style={{ fontSize: '0.92rem', color: isGpsBroadcasting ? '#15803d' : 'var(--text-primary)' }}>
                {isGpsBroadcasting ? 'Live GPS Location Broadcasting Active' : 'GPS Location Broadcast Inactive'}
              </strong>
              {isGpsBroadcasting && (
                <Badge variant="success">ACCURACY: {gpsCoords ? `${Math.round(gpsCoords.accuracy)}m` : '10m'}</Badge>
              )}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {isGpsBroadcasting
                ? `Last reported at ${new Date().toLocaleTimeString()} • Real device coordinates streaming to active students.`
                : 'Turn on location to broadcast your delivery position and provide students with real-time ETA.'}
            </span>
          </div>
        </div>

        <Button
          variant={isGpsBroadcasting ? 'danger' : 'primary'}
          size="sm"
          icon={isGpsBroadcasting ? Power : Navigation}
          onClick={() => setIsGpsBroadcasting(!isGpsBroadcasting)}
        >
          {isGpsBroadcasting ? 'Stop GPS Broadcast' : 'Start Live GPS'}
        </Button>
      </div>

      {gpsError && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.82rem' }}>
          ⚠️ {gpsError}
        </div>
      )}

      {/* Metric Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 140px), 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-50, #eef2ff)', color: 'var(--primary-600, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Assigned</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800 }}>{stats.total}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--warning-50, #fffbeb)', color: 'var(--warning-600, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Need Pickup</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--warning-600)' }}>{stats.assigned}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-50, #eef2ff)', color: 'var(--primary-600, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>In Transit</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--primary-600)' }}>{stats.inTransit}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-50, #f0fdf4)', color: 'var(--success-600, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Delivered</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--success-600)' }}>{stats.delivered}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ width: '38px', height: '38px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-50, #fef2f2)', color: 'var(--danger-600, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Failed Attempts</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--danger-600)' }}>{stats.failed}</div>
          </div>
        </Card>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveTab('ACTIVE')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'ACTIVE' ? 'var(--primary-600, #4f46e5)' : 'transparent',
            color: activeTab === 'ACTIVE' ? 'white' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Active Deliveries ({activeDeliveries.length})
        </button>

        <button
          onClick={() => {
            setActiveTab('ROUTE');
            fetchCurrentRoute();
          }}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'ROUTE' ? 'var(--primary-600, #4f46e5)' : 'transparent',
            color: activeTab === 'ROUTE' ? 'white' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
          }}
        >
          <Navigation size={15} />
          <span>Today's Route ({currentRoute ? currentRoute.total_stops : 0})</span>
        </button>
        
        <button
          onClick={() => setActiveTab('HISTORY')}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'HISTORY' ? 'var(--primary-600, #4f46e5)' : 'transparent',
            color: activeTab === 'HISTORY' ? 'white' : 'var(--text-secondary)',
            fontWeight: 700,
            fontSize: '0.9rem',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          Delivery History ({pastDeliveries.length})
        </button>
      </div>

      {activeTab === 'ROUTE' ? (
        <div>
          {loadingRoute ? (
            <Card style={{ textAlign: 'center', padding: '3rem' }}>
              <RefreshCw className="animate-spin" size={32} style={{ margin: '0 auto 1rem', color: 'var(--primary-600)' }} />
              <p>Calculating route optimization...</p>
            </Card>
          ) : !currentRoute ? (
            <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
              <Navigation size={48} style={{ color: 'var(--primary-500)', margin: '0 auto 1rem' }} />
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                No Active Multi-Stop Route Planned
              </h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: '480px', margin: '0 auto 1.5rem', fontSize: '0.9rem' }}>
                Generate an intelligent multi-stop route connecting your pickup shops and student drop locations.
                The 2-Opt algorithm optimizes sequence according to campus road winding, time windows, and package priority.
              </p>
              <Button
                variant="primary"
                icon={Zap}
                onClick={handleCreateOptimizedRoute}
                disabled={loadingRoute}
              >
                Create Optimized Route
              </Button>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Route Summary Header */}
              <Card style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
                        Route #{currentRoute.id}
                      </h3>
                      <Badge variant={currentRoute.status === 'ACTIVE' ? 'success' : currentRoute.status === 'COMPLETED' ? 'primary' : 'warning'}>
                        {currentRoute.status}
                      </Badge>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {currentRoute.stops?.length || currentRoute.total_stops || 0} stops • Est. Distance: {currentRoute.total_distance ? `${parseFloat(currentRoute.total_distance).toFixed(1)} km` : 'Campus Route'} • Est. Duration: {currentRoute.estimated_duration ? `${Math.round(currentRoute.estimated_duration)} mins` : '--'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={RefreshCw}
                      onClick={() => handleRecalculateRoute(currentRoute.id)}
                      disabled={loadingRoute}
                    >
                      Recalculate Sequence
                    </Button>
                    {currentRoute.status === 'PLANNED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        icon={Navigation}
                        onClick={() => handleStartRoute(currentRoute.id)}
                        disabled={loadingRoute}
                      >
                        Start Route (Out on Campus)
                      </Button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Leaflet Live Map */}
              <LiveMap
                deliveryPersonCoords={gpsCoords}
                routeStops={currentRoute.stops || []}
                height="380px"
              />

              {/* Stops List */}
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                  Delivery Sequence ({currentRoute.stops?.length || 0} Stops)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {(currentRoute.stops || []).map((stop) => (
                    <Card
                      key={stop.id}
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '1rem',
                        opacity: stop.completed ? 0.65 : 1,
                        borderLeft: stop.completed
                          ? '4px solid var(--success-500)'
                          : stop.priority === 'URGENT'
                          ? '4px solid var(--danger-500)'
                          : '4px solid var(--primary-500)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: stop.completed ? '#16a34a' : '#4f46e5',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '0.95rem',
                          }}
                        >
                          {stop.completed ? '✓' : stop.sequence}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <strong style={{ fontSize: '0.95rem' }}>
                              Order #{String(stop.delivery?.order_number || stop.delivery?.id || stop.delivery).slice(0, 8)}
                            </strong>
                            <Badge variant={stop.priority === 'URGENT' ? 'danger' : stop.priority === 'HIGH' ? 'warning' : 'primary'}>
                              {stop.priority}
                            </Badge>
                            {stop.completed && <Badge variant="success">Completed</Badge>}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                            📍 {stop.address || stop.delivery?.delivery_address || 'Campus Drop Point'}
                          </div>
                          {stop.estimated_arrival && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Est. Arrival: {new Date(stop.estimated_arrival).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {stop.latitude && stop.longitude && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.82rem',
                              padding: '0.4rem 0.75rem',
                              borderRadius: 'var(--radius-md)',
                              backgroundColor: 'var(--bg-muted, #f1f5f9)',
                              color: 'var(--text-primary)',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <ExternalLink size={13} />
                            Maps Nav
                          </a>
                        )}

                        {!stop.completed && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Check}
                            onClick={() => handleCompleteStop(currentRoute.id, stop.id)}
                            disabled={loadingRoute}
                          >
                            Mark Stop Done
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'ACTIVE' ? (
        activeDeliveries.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <Truck size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              No Active Deliveries
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
              You currently have no assigned packages. Check back once shopkeepers dispatch new orders.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* PART 5: DEDICATED NEW PICKUP TASKS SECTION */}
            {pickupPendingDeliveries.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Store size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        New Pickup Tasks ({pickupPendingDeliveries.length})
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Collect packages from campus store counters
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: '1.25rem' }}>
                  {pickupPendingDeliveries.map((delivery) => (
                    <Card
                      key={delivery.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderLeft: delivery.delivery_status === 'ARRIVED_AT_SHOP'
                          ? '4px solid #3b82f6'
                          : '4px solid #f59e0b',
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)',
                      }}
                    >
                      <div>
                        {/* Task Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.72rem', backgroundColor: '#fef3c7', color: '#b45309', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 800, letterSpacing: '0.03em' }}>
                                NEW PICKUP
                              </span>
                              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                Order #{String(delivery.order_number || delivery.id).slice(0, 8)}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                              Assigned: {new Date(delivery.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(delivery.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          <Badge variant={delivery.delivery_status === 'ARRIVED_AT_SHOP' ? 'primary' : 'warning'}>
                            {delivery.delivery_status === 'ARRIVED_AT_SHOP' ? 'Arrived at Shop' : 'Ready for Pickup'}
                          </Badge>
                        </div>

                        {/* Pickup Shop Counter Information */}
                        <div style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', border: '1px solid var(--border-light, #e2e8f0)' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            Pickup Shop Counter
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{delivery.shop_name}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{delivery.shop_address}</div>
                          {delivery.shop_phone && (
                            <a href={`tel:${delivery.shop_phone}`} style={{ fontSize: '0.82rem', color: 'var(--primary-600)', display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.35rem', fontWeight: 600 }}>
                              <Phone size={13} /> Call Store: {delivery.shop_phone}
                            </a>
                          )}
                        </div>

                        {/* Drop Area Snapshot (Privacy Protected before collection) */}
                        <div style={{ backgroundColor: 'var(--primary-50, #f0fdf4)', padding: '0.75rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', border: '1px solid var(--primary-100, #bbf7d0)' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--success-700, #15803d)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                            Target Campus Drop Zone
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--success-800, #166534)' }}>
                            📍 {delivery.hostel_block ? `${delivery.hostel_block} (Room details revealed on pickup)` : delivery.delivery_address || 'Campus Drop Location'}
                          </div>
                        </div>

                        {/* Items & Payment Summary */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderTop: '1px solid var(--border-light, #f1f5f9)', fontSize: '0.85rem' }}>
                          <div style={{ color: 'var(--text-muted)' }}>
                            Items: <strong style={{ color: 'var(--text-primary)' }}>{(delivery.items_summary || []).length || 1} item(s)</strong>
                          </div>
                          <div>
                            {delivery.payment_method === 'COD' ? (
                              <span style={{ color: '#b91c1c', backgroundColor: '#fef2f2', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.78rem' }}>
                                COD: ₹{parseFloat(delivery.order_total || 0).toFixed(2)}
                              </span>
                            ) : (
                              <span style={{ color: '#15803d', backgroundColor: '#f0fdf4', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.78rem' }}>
                                PAID ONLINE
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.5rem' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Package}
                          onClick={() => openDetailsModal(delivery)}
                        >
                          View Details
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={MapPin}
                          onClick={() => openRouteMapModal(delivery)}
                        >
                          Open Route Map
                        </Button>
                        {delivery.shop_latitude && delivery.shop_longitude && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${delivery.shop_latitude},${delivery.shop_longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.82rem',
                              padding: '0.4rem 0.65rem',
                              borderRadius: 'var(--radius-md, 6px)',
                              backgroundColor: 'var(--bg-muted, #f1f5f9)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-medium, #cbd5e1)',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <ExternalLink size={13} />
                            Directions to Shop
                          </a>
                        )}
                        {delivery.delivery_status === 'ASSIGNED' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={Store}
                            onClick={() => handleArrivedAtShop(delivery)}
                          >
                            Arrived at Shop
                          </Button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          icon={CheckCircle2}
                          onClick={() => handlePickup(delivery)}
                        >
                          Picked Up
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* IN-TRANSIT DELIVERIES */}
            {inTransitDeliveries.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Truck size={18} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                        In-Transit & Doorstep Deliveries ({inTransitDeliveries.length})
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        Packages collected from shops, ready for or active on campus delivery runs
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: '1.25rem' }}>
                  {inTransitDeliveries.map((delivery) => (
                    <Card
                      key={delivery.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        borderLeft:
                          delivery.delivery_status === 'OUT_FOR_DELIVERY' || delivery.delivery_status === 'ARRIVING'
                            ? '4px solid var(--warning-500, #f59e0b)'
                            : '4px solid var(--primary-500, #6366f1)',
                      }}
                    >
                      <div>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                          <div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              Order #{String(delivery.order_number || delivery.id).slice(0, 8)}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              Picked Up: {delivery.picked_up_at ? new Date(delivery.picked_up_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Collected'}
                            </div>
                          </div>
                          <Badge
                            variant={
                              ['OUT_FOR_DELIVERY', 'ARRIVING'].includes(delivery.delivery_status)
                                ? 'warning'
                                : 'primary'
                            }
                          >
                            {delivery.status_display || delivery.delivery_status}
                          </Badge>
                        </div>

                        {/* Store Pickup summary */}
                        <div style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.65rem', fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--text-muted)' }}>From: </span>
                          <strong style={{ color: 'var(--text-primary)' }}>{delivery.shop_name}</strong>
                        </div>

                        {/* Deliver to Student */}
                        <div style={{ backgroundColor: 'var(--primary-50, #eef2ff)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', border: '1px solid var(--primary-100, #e0e7ff)' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--primary-700, #4338ca)', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
                            Student Drop Location
                          </div>
                          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--primary-900)' }}>
                            {delivery.customer_name}
                          </div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: '0.15rem' }}>
                            {delivery.hostel_block ? `${delivery.hostel_block}, ${delivery.room_number}` : delivery.delivery_address}
                          </div>
                          {delivery.customer_phone && (
                            <a
                              href={`tel:${delivery.customer_phone}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.35rem',
                                marginTop: '0.35rem',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: 'var(--primary-700)',
                                textDecoration: 'underline',
                              }}
                            >
                              <Phone size={14} /> Call Student: {delivery.customer_phone}
                            </a>
                          )}
                        </div>

                        {/* Items & Payment Info */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 0', borderTop: '1px solid var(--border-light, #f1f5f9)', fontSize: '0.85rem' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Items: </span>
                            <span style={{ fontWeight: 600 }}>
                              {(delivery.items_summary || []).length > 0
                                ? delivery.items_summary.map((i) => `${i.name} (${i.quantity})`).join(', ')
                                : 'Stationery Package'}
                            </span>
                          </div>
                          <div>
                            {delivery.payment_method === 'COD' ? (
                              <span style={{ color: 'var(--danger-700, #b91c1c)', backgroundColor: 'var(--danger-50, #fef2f2)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>
                                COLLECT COD: ₹{parseFloat(delivery.order_total || 0).toFixed(2)}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--success-700, #15803d)', backgroundColor: 'var(--success-50, #f0fdf4)', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: 800 }}>
                                PAID ONLINE
                              </span>
                            )}
                          </div>
                        </div>

                        {delivery.estimated_delivery_time && ['OUT_FOR_DELIVERY', 'ARRIVING'].includes(delivery.delivery_status) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--warning-700)', backgroundColor: 'var(--warning-50)', padding: '0.4rem 0.65rem', borderRadius: '4px', marginTop: '0.5rem' }}>
                            <Clock size={14} /> Estimated Arrival: {new Date(delivery.estimated_delivery_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', marginTop: '0.85rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '0.65rem' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={MapPin}
                          onClick={() => openRouteMapModal(delivery)}
                        >
                          Route Map
                        </Button>

                        {((delivery.order?.delivery_latitude || delivery.delivery_latitude || delivery.latitude) && (delivery.order?.delivery_longitude || delivery.delivery_longitude || delivery.longitude)) && (
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${delivery.order?.delivery_latitude || delivery.delivery_latitude || delivery.latitude},${delivery.order?.delivery_longitude || delivery.delivery_longitude || delivery.longitude}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              fontSize: '0.82rem',
                              padding: '0.4rem 0.65rem',
                              borderRadius: 'var(--radius-md, 6px)',
                              backgroundColor: 'var(--bg-muted, #f1f5f9)',
                              color: 'var(--text-primary)',
                              border: '1px solid var(--border-medium, #cbd5e1)',
                              textDecoration: 'none',
                              fontWeight: 600,
                            }}
                          >
                            <ExternalLink size={13} />
                            Directions to Student
                          </a>
                        )}

                        {delivery.delivery_status === 'PICKED_UP' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              style={{ color: 'var(--danger-600)' }}
                              onClick={() => openFailureModal(delivery)}
                            >
                              Report Issue
                            </Button>
                            <Button
                              variant="primary"
                              icon={Truck}
                              onClick={() => openStartModal(delivery)}
                            >
                              Start Delivery Run
                            </Button>
                          </>
                        )}

                        {delivery.delivery_status === 'OUT_FOR_DELIVERY' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              style={{ color: 'var(--danger-600)' }}
                              onClick={() => openFailureModal(delivery)}
                            >
                              Report Issue
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleArriving(delivery)}
                            >
                              Arriving Soon
                            </Button>
                            <Button
                              variant="warning"
                              icon={KeyRound}
                              onClick={() => openOtpModal(delivery)}
                              style={{ fontWeight: 700 }}
                            >
                              Verify OTP
                            </Button>
                          </>
                        )}

                        {delivery.delivery_status === 'ARRIVING' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              style={{ color: 'var(--danger-600)' }}
                              onClick={() => openFailureModal(delivery)}
                            >
                              Report Issue
                            </Button>
                            <Button
                              variant="warning"
                              icon={KeyRound}
                              onClick={() => openOtpModal(delivery)}
                              style={{ fontWeight: 700 }}
                            >
                              Verify OTP & Hand Over
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* HISTORY TAB */
        displayedList.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
            <Truck size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              No Past Delivery History
            </h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto' }}>
              Completed delivery logs will appear here.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 460px), 1fr))', gap: '1.25rem' }}>
            {displayedList.map((delivery) => (
              <Card
                key={delivery.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderLeft: delivery.delivery_status === 'FAILED'
                    ? '4px solid var(--danger-500, #ef4444)'
                    : '4px solid var(--success-500, #10b981)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Order #{String(delivery.order_number || delivery.id).slice(0, 8)}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Assigned: {new Date(delivery.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Badge variant={delivery.delivery_status === 'FAILED' ? 'danger' : 'success'}>
                      {delivery.status_display || delivery.delivery_status}
                    </Badge>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.65rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>From: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{delivery.shop_name}</strong>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '0.65rem', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>To: </span>
                    <strong style={{ color: 'var(--text-primary)' }}>{delivery.customer_name}</strong>
                    <div>{delivery.hostel_block ? `${delivery.hostel_block}, ${delivery.room_number}` : delivery.delivery_address}</div>
                  </div>

                  {delivery.delivery_status === 'FAILED' && (
                    <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--danger-50)', color: 'var(--danger-800)', borderRadius: '4px', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                      <strong>Failed:</strong> {delivery.failure_reason?.replace(/_/g, ' ') || 'Customer Unavailable'}
                      {delivery.delivery_notes && <div>"{delivery.delivery_notes}"</div>}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.85rem', marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Total: ₹{parseFloat(delivery.order_total || 0).toFixed(2)}
                  </div>
                  {delivery.delivery_status === 'DELIVERED' && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--success-600)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}>
                      <CheckCircle2 size={16} /> Delivered at {delivery.delivered_at ? new Date(delivery.delivered_at).toLocaleTimeString() : 'Handed Over'}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Start Delivery Modal */}
      {startModalOpen && selectedDelivery && (
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
          <Card style={{ width: '100%', maxWidth: '440px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Start Delivery
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Confirm package pickup from {selectedDelivery.shop_name}. This will trigger the Delivery OTP on {selectedDelivery.customer_name}'s phone.
            </p>

            <form onSubmit={handleStartDelivery}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Estimated Travel / Arrival Time:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[15, 25, 40].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setEstimatedMinutes(mins)}
                      style={{
                        flex: 1,
                        padding: '0.65rem',
                        borderRadius: 'var(--radius-md)',
                        border: estimatedMinutes === mins ? '2px solid var(--primary-600)' : '1px solid var(--border-color)',
                        backgroundColor: estimatedMinutes === mins ? 'var(--primary-50)' : 'white',
                        color: estimatedMinutes === mins ? 'var(--primary-700)' : 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      ~{mins} Mins
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button variant="secondary" type="button" onClick={() => setStartModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submittingStart}>
                  {submittingStart ? 'Starting...' : 'Confirm & Depart'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* OTP Handover Modal */}
      {otpModalOpen && selectedDelivery && (
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
          <Card style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ width: '52px', height: '52px', borderRadius: '50%', backgroundColor: 'var(--primary-50)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <KeyRound size={28} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '0.25rem' }}>
              Verify Delivery OTP
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Ask student <strong>{selectedDelivery.customer_name}</strong> for the 6-digit delivery OTP shown on their order tracking page.
            </p>

            {otpError && (
              <div style={{ padding: '0.65rem 1rem', backgroundColor: 'var(--danger-50)', color: 'var(--danger-700)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {otpError}
              </div>
            )}

            <form onSubmit={handleVerifyOtp}>
              <input
                type="text"
                maxLength="6"
                placeholder="6-digit OTP"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: '200px',
                  padding: '0.75rem',
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  letterSpacing: '0.35rem',
                  textAlign: 'center',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid var(--primary-500)',
                  marginBottom: '1rem',
                }}
                autoFocus
                required
              />

              <div style={{ textAlign: 'left', marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Handover Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Handed to roommate, paid in exact change"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <Button variant="secondary" type="button" onClick={() => setOtpModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={verifyingOtp || otpCode.length !== 6}>
                  {verifyingOtp ? 'Verifying...' : 'Complete Delivery'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Report Delivery Failure Modal */}
      {failureModalOpen && selectedDelivery && (
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
          <Card style={{ width: '100%', maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '50%', backgroundColor: 'var(--danger-50)', color: 'var(--danger-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <AlertCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>
                  Report Delivery Issue / Failure
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Order #{String(selectedDelivery.order_number || selectedDelivery.id).slice(0, 8)}
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Log an unsuccessful delivery attempt. This alerts the customer so they can reschedule their slot.
            </p>

            <form onSubmit={handleReportFailure} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Failure Reason *
                </label>
                <select
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                  required
                >
                  <option value="CUSTOMER_UNAVAILABLE">Customer Unavailable / Not in Room</option>
                  <option value="WRONG_ADDRESS">Wrong Hostel / Room Number</option>
                  <option value="PHONE_UNREACHABLE">Phone Unreachable / Switched Off</option>
                  <option value="CUSTOMER_REQUESTED_RESCHEDULE">Customer Requested Reschedule</option>
                  <option value="ACCESS_PROBLEM">Hostel Gate Closed / Access Problem</option>
                  <option value="OTHER">Other Operational Issue</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Attempt Notes / Observations (Optional)
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g. Called customer 3 times, room locked from outside."
                  value={failureNotes}
                  onChange={(e) => setFailureNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button variant="secondary" type="button" onClick={() => setFailureModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" type="submit" disabled={submittingFailure}>
                  {submittingFailure ? 'Recording...' : 'Mark as Failed'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Static Route Map View Modal (No live tracking) */}
      {routeMapModalOpen && selectedDeliveryForRoute && (
        <Modal
          isOpen={routeMapModalOpen}
          onClose={() => setRouteMapModalOpen(false)}
          title={`Delivery Route: Order #${(selectedDeliveryForRoute.order_number || selectedDeliveryForRoute.id).toString().slice(0, 8)}`}
          maxWidth="700px"
          footer={
            <Button variant="outline" size="sm" onClick={() => setRouteMapModalOpen(false)}>
              Close Route View
            </Button>
          }
        >
          <DeliveryRouteMap delivery={selectedDeliveryForRoute} height="360px" />
        </Modal>
      )}

      {/* Order & Pickup Task Details Modal */}
      {detailsModalOpen && selectedDeliveryForDetails && (
        <Modal
          isOpen={detailsModalOpen}
          onClose={() => setDetailsModalOpen(false)}
          title={`Order Details: #${(selectedDeliveryForDetails.order_number || selectedDeliveryForDetails.id).toString().slice(0, 8)}`}
          maxWidth="600px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Status: <strong style={{ color: 'var(--text-primary)' }}>{selectedDeliveryForDetails.status_display || selectedDeliveryForDetails.delivery_status}</strong>
              </div>
              <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)}>
                Close
              </Button>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '65vh', overflowY: 'auto', paddingRight: '0.25rem' }}>
            {/* Pickup Counter Details */}
            <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <Store size={18} color="var(--primary-600, #2563eb)" />
                <strong style={{ fontSize: '0.95rem' }}>Pickup Counter: {selectedDeliveryForDetails.shop_name}</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '1.6rem' }}>
                {selectedDeliveryForDetails.shop_address || 'Stationery Building, Main Campus'}
              </div>
              {selectedDeliveryForDetails.shop_phone && (
                <div style={{ marginTop: '0.35rem', marginLeft: '1.6rem', fontSize: '0.82rem' }}>
                  <a href={`tel:${selectedDeliveryForDetails.shop_phone}`} style={{ color: 'var(--primary-600)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Phone size={13} /> {selectedDeliveryForDetails.shop_phone}
                  </a>
                </div>
              )}
            </div>

            {/* Destination / Drop Zone Details */}
            <div style={{ padding: '0.9rem', backgroundColor: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                <MapPin size={18} color="#059669" />
                <strong style={{ fontSize: '0.95rem' }}>Drop-off Destination</strong>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '1.6rem' }}>
                {selectedDeliveryForDetails.delivery_address || selectedDeliveryForDetails.hostel_block || 'Campus Zone'}
                {selectedDeliveryForDetails.room_number && ['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(selectedDeliveryForDetails.delivery_status) && (
                  <span> — Room {selectedDeliveryForDetails.room_number}</span>
                )}
              </div>
              {['ASSIGNED', 'ARRIVED_AT_SHOP'].includes(selectedDeliveryForDetails.delivery_status) ? (
                <div style={{ marginTop: '0.4rem', marginLeft: '1.6rem', fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  🔒 Detailed room and recipient phone will be activated upon order pickup.
                </div>
              ) : selectedDeliveryForDetails.customer_phone ? (
                <div style={{ marginTop: '0.35rem', marginLeft: '1.6rem', fontSize: '0.82rem' }}>
                  <a href={`tel:${selectedDeliveryForDetails.customer_phone}`} style={{ color: '#059669', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Phone size={13} /> Call Customer: {selectedDeliveryForDetails.customer_phone}
                  </a>
                </div>
              ) : null}
            </div>

            {/* Items Summary */}
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Package size={16} /> Package Manifest
              </div>
              {selectedDeliveryForDetails.items_summary && selectedDeliveryForDetails.items_summary.length > 0 ? (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {selectedDeliveryForDetails.items_summary.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.65rem 0.85rem',
                        borderBottom: idx < selectedDeliveryForDetails.items_summary.length - 1 ? '1px solid var(--border-light)' : 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600 }}>{item.name}</span>
                        {item.details && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.details}</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Qty: {item.quantity}</span>
                        <span style={{ fontWeight: 600 }}>₹{item.total_price || item.unit_price}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Standard Stationery Package
                </div>
              )}
            </div>

            {/* Financials & Order Meta */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.82rem' }}>
              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--text-muted)' }}>Payment Mode</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                  {selectedDeliveryForDetails.payment_method === 'COD' ? '💵 Cash on Delivery' : '💳 Online Paid'}
                </div>
              </div>
              <div style={{ padding: '0.65rem 0.85rem', background: 'var(--bg-subtle, #f8fafc)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ color: 'var(--text-muted)' }}>Order Total</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.15rem', fontSize: '0.95rem' }}>
                  ₹{selectedDeliveryForDetails.order_total || '0.00'}
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default DeliveryAgentDashboard;
