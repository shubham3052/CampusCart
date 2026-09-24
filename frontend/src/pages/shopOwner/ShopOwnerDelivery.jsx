import React, { useState, useEffect, useMemo } from 'react';
import { Truck, UserCheck, Clock, CheckCircle2, AlertCircle, Phone, Search, KeyRound, Calendar, Plus, RefreshCw, XCircle, RotateCcw, Zap, Navigation, MapPin } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import orderService from '../../services/orderService';
import deliveryGpsService from '../../services/deliveryGpsService';
import LiveMap from '../../components/common/LiveMap';

const ShopOwnerDelivery = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [agents, setAgents] = useState([]);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL' | 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED_RESCHEDULED' | 'SLOTS'
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Assign / Reassign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [submittingAssign, setSubmittingAssign] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // Live GPS Map Modal
  const [mapModalOpen, setMapModalOpen] = useState(false);
  const [liveTrackingData, setLiveTrackingData] = useState(null);
  const [loadingLiveTracking, setLoadingLiveTracking] = useState(false);

  // OTP Verification Modal
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  // Delivery Slot Creation Modal
  const [slotModalOpen, setSlotModalOpen] = useState(false);
  const [submittingSlot, setSubmittingSlot] = useState(false);
  const [slotFormData, setSlotFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    start_time: '10:00',
    end_time: '11:00',
    capacity: 5,
    is_active: true,
  });

  const fetchDeliveriesAndAgents = async () => {
    try {
      setLoading(true);
      const [deliveriesData, agentsData, slotsData] = await Promise.all([
        orderService.getDeliveries(),
        orderService.getAvailableDeliveryAgents(),
        orderService.getAllDeliverySlots().catch(() => []),
      ]);
      setDeliveries(deliveriesData.results || deliveriesData || []);
      setAgents(agentsData.results || agentsData || []);
      setSlots(slotsData.results || slotsData || []);
    } catch (err) {
      console.error('Failed to load delivery data:', err);
      setError('Could not load delivery records or available couriers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveriesAndAgents();
  }, []);

  const openAssignModal = async (delivery) => {
    setSelectedDelivery(delivery);
    setSelectedAgentId(delivery.delivery_agent || (agents[0]?.id || ''));
    setDispatchNotes(delivery.delivery_notes || '');
    setError('');
    setCandidates([]);
    setAssignModalOpen(true);

    try {
      setLoadingCandidates(true);
      const res = await deliveryGpsService.getCandidateAgents(delivery.id);
      const list = res.candidates || [];
      setCandidates(list);
      if (list.length > 0 && !delivery.delivery_agent) {
        setSelectedAgentId(list[0].agent_id);
      }
    } catch (err) {
      console.error('Failed to load candidate couriers:', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const handleSmartAssign = async (deliveryId) => {
    try {
      setLoading(true);
      const res = await deliveryGpsService.smartAssignAgent(deliveryId);
      setSuccessMsg(`Smart Assigned to ${res.delivery?.delivery_agent_name || 'best courier'} (${res.assigned_score?.reason || 'Optimal match'})`);
      fetchDeliveriesAndAgents();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Smart auto-assign error:', err);
      setError(err.response?.data?.message || 'Smart auto-assignment failed.');
    } finally {
      setLoading(false);
    }
  };

  const openLiveMapModal = async (delivery) => {
    setSelectedDelivery(delivery);
    setMapModalOpen(true);
    setLoadingLiveTracking(true);
    try {
      const data = await deliveryGpsService.getDeliveryLiveTracking(delivery.id);
      setLiveTrackingData(data);
    } catch (err) {
      console.error('Failed to load live tracking:', err);
      setLiveTrackingData(null);
    } finally {
      setLoadingLiveTracking(false);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setError('Please select a delivery courier.');
      return;
    }

    setSubmittingAssign(true);
    setError('');
    try {
      await orderService.assignDeliveryAgent(selectedDelivery.id, selectedAgentId, dispatchNotes);
      setSuccessMsg(`Order #${String(selectedDelivery.order_number).slice(0, 8)} assigned to courier.`);
      setAssignModalOpen(false);
      fetchDeliveriesAndAgents();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Assignment error:', err);
      setError(err.response?.data?.message || 'Failed to assign courier.');
    } finally {
      setSubmittingAssign(false);
    }
  };

  const openOtpModal = (delivery) => {
    setSelectedDelivery(delivery);
    setOtpCode('');
    setOtpError('');
    setOtpModalOpen(true);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Please enter a valid 6-digit delivery OTP.');
      return;
    }

    setVerifyingOtp(true);
    setOtpError('');
    try {
      await orderService.verifyDeliveryOtp(selectedDelivery.id, otpCode.trim());
      setSuccessMsg(`Delivery for Order #${String(selectedDelivery.order_number).slice(0, 8)} verified and completed!`);
      setOtpModalOpen(false);
      fetchDeliveriesAndAgents();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Verification error:', err);
      setOtpError(err.response?.data?.message || 'Invalid or expired OTP.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleCreateSlot = async (e) => {
    e.preventDefault();
    setSubmittingSlot(true);
    setError('');
    try {
      await orderService.createDeliverySlot(slotFormData);
      setSuccessMsg('Delivery time window created successfully.');
      setSlotModalOpen(false);
      const updatedSlots = await orderService.getAllDeliverySlots();
      setSlots(updatedSlots.results || updatedSlots || []);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Slot creation error:', err);
      setError(err.response?.data?.message || 'Failed to create delivery slot.');
    } finally {
      setSubmittingSlot(false);
    }
  };

  const handleDeleteSlot = async (id) => {
    if (!window.confirm('Are you sure you want to delete this delivery slot?')) return;
    try {
      await orderService.deleteDeliverySlot(id);
      setSuccessMsg('Delivery slot deleted.');
      const updatedSlots = await orderService.getAllDeliverySlots();
      setSlots(updatedSlots.results || updatedSlots || []);
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Delete slot error:', err);
      setError('Could not delete delivery slot.');
    }
  };

  const filteredDeliveries = useMemo(() => {
    return deliveries.filter((d) => {
      // Tab filter
      if (activeTab === 'PENDING' && d.delivery_status !== 'PENDING') return false;
      if (activeTab === 'ASSIGNED' && !['ASSIGNED', 'ARRIVED_AT_SHOP'].includes(d.delivery_status)) return false;
      if (activeTab === 'IN_TRANSIT' && !['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)) return false;
      if (activeTab === 'DELIVERED' && d.delivery_status !== 'DELIVERED') return false;
      if (activeTab === 'FAILED_RESCHEDULED' && !['FAILED', 'RESCHEDULED'].includes(d.delivery_status)) return false;

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const orderNum = String(d.order_number || '').toLowerCase();
        const customer = String(d.customer_name || '').toLowerCase();
        const hostel = String(d.hostel_block || '').toLowerCase();
        const agent = String(d.agent_details?.name || d.agent_details?.username || '').toLowerCase();
        return orderNum.includes(query) || customer.includes(query) || hostel.includes(query) || agent.includes(query);
      }

      return true;
    });
  }, [deliveries, activeTab, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: deliveries.length,
      pending: deliveries.filter((d) => d.delivery_status === 'PENDING').length,
      assigned: deliveries.filter((d) => ['ASSIGNED', 'ARRIVED_AT_SHOP'].includes(d.delivery_status)).length,
      inTransit: deliveries.filter((d) => ['PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)).length,
      delivered: deliveries.filter((d) => d.delivery_status === 'DELIVERED').length,
      failedRescheduled: deliveries.filter((d) => ['FAILED', 'RESCHEDULED'].includes(d.delivery_status)).length,
    };
  }, [deliveries]);

  const renderStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Needs Courier</Badge>;
      case 'ASSIGNED':
        return <Badge variant="primary">Courier Assigned</Badge>;
      case 'ARRIVED_AT_SHOP':
        return <Badge variant="info">Courier at Shop</Badge>;
      case 'PICKED_UP':
        return <Badge variant="primary">Picked Up</Badge>;
      case 'OUT_FOR_DELIVERY':
        return <Badge variant="warning">Out for Delivery</Badge>;
      case 'ARRIVING':
        return <Badge variant="warning">Arriving Soon</Badge>;
      case 'DELIVERED':
        return <Badge variant="success">Delivered & Verified</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Delivery Failed</Badge>;
      case 'RESCHEDULED':
        return <Badge variant="info">Rescheduled</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Campus Delivery Dispatch & Slots"
          subtitle="Manage hostel deliveries, courier assignments, failure resolutions, and delivery time windows"
        />
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Button variant="secondary" icon={RefreshCw} onClick={fetchDeliveriesAndAgents}>
            Refresh
          </Button>
          <Button variant="primary" icon={Plus} onClick={() => setSlotModalOpen(true)}>
            Add Delivery Slot
          </Button>
        </div>
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

      {/* Metric Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-50, #eef2ff)', color: 'var(--primary-600, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Truck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Deliveries</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{stats.total}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--warning-50, #fffbeb)', color: 'var(--warning-600, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Needs Courier</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--warning-600)' }}>{stats.pending}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--primary-50, #eef2ff)', color: 'var(--primary-600, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>In Transit</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--primary-600)' }}>{stats.inTransit}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--success-50, #f0fdf4)', color: 'var(--success-600, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Delivered</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--success-600)' }}>{stats.delivered}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--danger-50, #fef2f2)', color: 'var(--danger-600, #dc2626)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RotateCcw size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Failed / Resched</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--danger-600)' }}>{stats.failedRescheduled}</div>
          </div>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'ALL', label: `All (${stats.total})` },
              { key: 'PENDING', label: `Needs Courier (${stats.pending})` },
              { key: 'ASSIGNED', label: `Assigned (${stats.assigned})` },
              { key: 'IN_TRANSIT', label: `In Transit (${stats.inTransit})` },
              { key: 'DELIVERED', label: `Delivered (${stats.delivered})` },
              { key: 'FAILED_RESCHEDULED', label: `Failed / Rescheduled (${stats.failedRescheduled})` },
              { key: 'SLOTS', label: `Delivery Slots (${slots.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  backgroundColor: activeTab === tab.key ? 'var(--primary-600, #4f46e5)' : 'var(--bg-muted, #f1f5f9)',
                  color: activeTab === tab.key ? 'white' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'SLOTS' && (
            <div style={{ position: 'relative', minWidth: '240px' }}>
              <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search by order #, customer, hostel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem 0.5rem 2.25rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                  fontSize: '0.85rem',
                }}
              />
            </div>
          )}
        </div>
      </Card>

      {/* View Content based on Tab */}
      {activeTab === 'SLOTS' ? (
        /* Delivery Slots Management View */
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Campus Delivery Time Windows</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                Configured hourly delivery slots and concurrency capacities for student orders.
              </p>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setSlotModalOpen(true)}>
              New Window
            </Button>
          </div>

          {slots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
              <Calendar size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.6 }} />
              <div style={{ fontWeight: 600 }}>No delivery slots configured yet.</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>Create delivery windows so students can schedule doorstep deliveries during checkout.</div>
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Date</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Time Window</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Total Capacity</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Booked Count</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Available Spots</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Status</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => {
                    const isFull = slot.booked_count >= slot.capacity;
                    return (
                      <tr key={slot.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                        <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{slot.date}</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>
                            {String(slot.start_time).slice(0, 5)} - {String(slot.end_time).slice(0, 5)}
                          </span>
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>{slot.capacity} orders</td>
                        <td style={{ padding: '0.85rem 1rem' }}>{slot.booked_count} booked</td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {isFull ? (
                            <span style={{ color: 'var(--danger-600)', fontWeight: 700, fontSize: '0.85rem' }}>FULL (0 left)</span>
                          ) : (
                            <span style={{ color: 'var(--success-600)', fontWeight: 700, fontSize: '0.85rem' }}>
                              {slot.available_capacity ?? (slot.capacity - slot.booked_count)} left
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem' }}>
                          {slot.is_active ? (
                            <Badge variant="success" size="sm">Active</Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">Inactive</Badge>
                          )}
                        </td>
                        <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            style={{ color: 'var(--danger-600)' }}
                            onClick={() => handleDeleteSlot(slot.id)}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        /* Deliveries Queue Table */
        loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
            Loading campus delivery queues...
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <Card style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
            <Truck size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem' }}>No Deliveries Found</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
              {activeTab === 'ALL'
                ? 'No campus delivery orders have been placed for your store yet.'
                : `No orders currently match the status filter '${activeTab}'.`}
            </p>
          </Card>
        ) : (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-muted, #f8fafc)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Order #</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Customer & Drop Point</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Items</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Status & Attempts</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700 }}>Courier</th>
                    <th style={{ padding: '0.85rem 1rem', fontWeight: 700, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDeliveries.map((delivery) => (
                    <tr key={delivery.id} style={{ borderBottom: '1px solid var(--border-light, #f1f5f9)' }}>
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 700 }}>#{String(delivery.order_number || delivery.id).slice(0, 8)}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          ₹{parseFloat(delivery.order_total || 0).toFixed(2)} ({delivery.payment_method})
                        </div>
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 600 }}>{delivery.customer_name}</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          {delivery.hostel_block ? `${delivery.hostel_block}, ${delivery.room_number}` : delivery.delivery_address}
                        </div>
                        {delivery.customer_phone && (
                          <a
                            href={`tel:${delivery.customer_phone}`}
                            style={{ fontSize: '0.8rem', color: 'var(--primary-600)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.2rem' }}
                          >
                            <Phone size={12} /> {delivery.customer_phone}
                          </a>
                        )}
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontSize: '0.85rem' }}>
                          {(delivery.items_summary || []).length > 0
                            ? delivery.items_summary.map((i, idx) => (
                                <div key={idx} style={{ whiteSpace: 'nowrap' }}>
                                  • {i.name} × {i.quantity}
                                </div>
                              ))
                            : 'Order items'}
                        </div>
                      </td>

                      <td style={{ padding: '1rem' }}>
                        <div>{renderStatusBadge(delivery.delivery_status)}</div>
                        {delivery.delivery_status === 'FAILED' && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--danger-700)', backgroundColor: 'var(--danger-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                            <strong>Reason:</strong> {delivery.failure_reason?.replace(/_/g, ' ') || 'Customer Unavailable'}
                            {delivery.attempt_count > 0 && ` (Attempt ${delivery.attempt_count})`}
                          </div>
                        )}
                        {delivery.delivery_status === 'RESCHEDULED' && (
                          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: 'var(--primary-700)', backgroundColor: 'var(--primary-50)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>
                            Rescheduled for new time window
                          </div>
                        )}
                        {delivery.estimated_delivery_time && delivery.delivery_status === 'OUT_FOR_DELIVERY' && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--warning-700)', marginTop: '0.25rem' }}>
                            Est: {new Date(delivery.estimated_delivery_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '1rem' }}>
                        {delivery.agent_details ? (
                          <div>
                            <div style={{ fontWeight: 600 }}>{delivery.agent_details.name || delivery.agent_details.username}</div>
                            {delivery.agent_details.phone_number && (
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {delivery.agent_details.phone_number}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', flexWrap: 'nowrap' }}>
                          {delivery.delivery_status === 'PENDING' && (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                icon={Zap}
                                onClick={() => handleSmartAssign(delivery.id)}
                              >
                                Smart Assign
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={UserCheck}
                                onClick={() => openAssignModal(delivery)}
                              >
                                Assign
                              </Button>
                            </>
                          )}

                          {['ASSIGNED', 'FAILED', 'RESCHEDULED'].includes(delivery.delivery_status) && (
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={UserCheck}
                              onClick={() => openAssignModal(delivery)}
                            >
                              {delivery.delivery_status === 'FAILED' ? 'Reassign & Retry' : 'Reassign'}
                            </Button>
                          )}

                          {['OUT_FOR_DELIVERY', 'ARRIVING'].includes(delivery.delivery_status) && (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={Navigation}
                                onClick={() => openLiveMapModal(delivery)}
                              >
                                Live GPS
                              </Button>
                              <Button
                                variant="warning"
                                size="sm"
                                icon={KeyRound}
                                onClick={() => openOtpModal(delivery)}
                              >
                                Verify OTP
                              </Button>
                            </>
                          )}

                          {delivery.delivery_status === 'DELIVERED' && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--success-600)', fontWeight: 600 }}>
                              ✓ Complete
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )
      )}

      {/* Assign Courier Modal */}
      {assignModalOpen && selectedDelivery && (
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
          <Card style={{ width: '100%', maxWidth: '480px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Assign Campus Courier
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Select an active delivery agent to deliver Order #{String(selectedDelivery.order_number).slice(0, 8)} to {selectedDelivery.hostel_block} {selectedDelivery.room_number}.
            </p>

            {loadingCandidates ? (
              <div style={{ padding: '0.5rem 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Evaluating candidate couriers via multi-factor scoring...
              </div>
            ) : candidates.length > 0 ? (
              <div style={{ marginBottom: '1rem', backgroundColor: 'var(--bg-muted, #f8fafc)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light, #e2e8f0)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary-700)', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Zap size={13} /> Recommended Couriers (Algorithmic Ranking)
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {candidates.slice(0, 3).map((c) => (
                    <div
                      key={c.agent_id}
                      onClick={() => setSelectedAgentId(c.agent_id)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: 'var(--radius-sm, 6px)',
                        cursor: 'pointer',
                        backgroundColor: String(selectedAgentId) === String(c.agent_id) ? 'var(--primary-50, #eef2ff)' : 'white',
                        border: String(selectedAgentId) === String(c.agent_id) ? '1px solid var(--primary-500)' : '1px solid #e2e8f0',
                        fontSize: '0.82rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{c.agent_name}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {c.score_details?.reason || `${c.score_details?.active_deliveries} active jobs`}
                        </div>
                      </div>
                      <Badge variant={c.composite_score >= 80 ? 'success' : 'primary'}>
                        {c.composite_score}% Match
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <form onSubmit={handleAssignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Select Delivery Courier *
                </label>
                {agents.length === 0 ? (
                  <div style={{ padding: '0.75rem', backgroundColor: 'var(--warning-50)', color: 'var(--warning-800)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                    No active delivery couriers found. Please ensure courier accounts are registered.
                  </div>
                ) : (
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    required
                  >
                    <option value="">-- Choose Courier --</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name || agent.username} ({agent.phone_number || 'No phone'}) - {agent.active_deliveries_count || 0} active jobs
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Dispatch Notes (Optional)
                </label>
                <textarea
                  rows="2"
                  placeholder="e.g. Fragile stationery ream, handle with care."
                  value={dispatchNotes}
                  onChange={(e) => setDispatchNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <Button variant="secondary" type="button" onClick={() => setAssignModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submittingAssign || agents.length === 0}>
                  {submittingAssign ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Shop Owner Live GPS Tracking Modal */}
      {mapModalOpen && selectedDelivery && (
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
          <Card style={{ width: '100%', maxWidth: '640px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>
                  Live Delivery Map • Order #{String(selectedDelivery.order_number).slice(0, 8)}
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Courier: {selectedDelivery.delivery_agent_name || 'Assigned Agent'} → Drop: {selectedDelivery.hostel_block} {selectedDelivery.room_number}
                </div>
              </div>
              <Badge variant={selectedDelivery.delivery_status === 'ARRIVING' ? 'success' : 'warning'}>
                {selectedDelivery.delivery_status}
              </Badge>
            </div>

            {loadingLiveTracking ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <RefreshCw className="animate-spin" size={28} style={{ margin: '0 auto 0.5rem', color: 'var(--primary-600)' }} />
                <p style={{ fontSize: '0.85rem' }}>Loading live courier telemetry...</p>
              </div>
            ) : (
              <div>
                <LiveMap
                  deliveryPersonCoords={liveTrackingData?.current_location}
                  destinationCoords={liveTrackingData?.destination}
                  height="320px"
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginTop: '1rem', textAlign: 'center' }}>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-muted, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>EST. ARRIVAL</div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--primary-600)' }}>
                      {liveTrackingData?.eta?.display || 'In Transit'}
                    </div>
                  </div>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-muted, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ROAD DISTANCE</div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                      {liveTrackingData?.distance?.display || '--'}
                    </div>
                  </div>
                  <div style={{ padding: '0.5rem', backgroundColor: 'var(--bg-muted, #f8fafc)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SIGNAL STATUS</div>
                    <div style={{ fontWeight: 800, fontSize: '0.95rem', color: liveTrackingData?.current_location?.is_stale ? '#dc2626' : '#16a34a' }}>
                      {liveTrackingData?.current_location?.is_stale ? 'Stale GPS' : 'Live GPS'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <Button variant="secondary" onClick={() => setMapModalOpen(false)}>
                Close Map
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Emergency / Counter OTP Verification Modal */}
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
            <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--warning-50)', color: 'var(--warning-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
              <KeyRound size={26} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Verify Delivery OTP
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Enter the 6-digit delivery OTP shown on customer {selectedDelivery.customer_name}'s phone.
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
                  border: '2px solid var(--primary-400)',
                  marginBottom: '1.5rem',
                }}
                autoFocus
                required
              />

              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                <Button variant="secondary" type="button" onClick={() => setOtpModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={verifyingOtp || otpCode.length !== 6}>
                  {verifyingOtp ? 'Verifying...' : 'Verify & Complete'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Add Delivery Slot Modal */}
      {slotModalOpen && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Calendar size={22} color="var(--primary-600)" />
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                Create Delivery Time Slot
              </h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Set up a delivery time window and concurrent order capacity for student checkout.
            </p>

            <form onSubmit={handleCreateSlot} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Delivery Date *
                </label>
                <input
                  type="date"
                  value={slotFormData.date}
                  onChange={(e) => setSlotFormData({ ...slotFormData, date: e.target.value })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Start Time *
                  </label>
                  <input
                    type="time"
                    value={slotFormData.start_time}
                    onChange={(e) => setSlotFormData({ ...slotFormData, start_time: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    End Time *
                  </label>
                  <input
                    type="time"
                    value={slotFormData.end_time}
                    onChange={(e) => setSlotFormData({ ...slotFormData, end_time: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                    required
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Slot Capacity (Max concurrent orders) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={slotFormData.capacity}
                  onChange={(e) => setSlotFormData({ ...slotFormData, capacity: parseInt(e.target.value, 10) || 5 })}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}
                  required
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Once this capacity is booked, the slot automatically closes to prevent overbooking.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <Button variant="secondary" type="button" onClick={() => setSlotModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submittingSlot}>
                  {submittingSlot ? 'Creating...' : 'Create Time Window'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerDelivery;
