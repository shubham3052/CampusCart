import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  Package,
  Key,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  Calendar,
  Store,
  Check,
  XCircle,
  ArrowRight,
  ShieldCheck,
  Users,
  Layers,
  Percent,
} from 'lucide-react';
import orderService from '../../services/orderService';
import bulkOrderService from '../../services/bulkOrderService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';

const ShopOwnerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [bulkOrders, setBulkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filter state
  const [statusTab, setStatusTab] = useState('ALL'); // ALL, PENDING, PREPARING, READY, COMPLETED, BULK
  const [searchQuery, setSearchQuery] = useState('');

  // OTP Verification Modal State
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [targetOrderForOtp, setTargetOrderForOtp] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpVerificationError, setOtpVerificationError] = useState(null);
  const [verificationSuccess, setVerificationSuccess] = useState(null);

  // Status update loading state per order
  const [updatingOrderId, setUpdatingOrderId] = useState(null);

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, bulkData] = await Promise.all([
        orderService.getOrders(),
        bulkOrderService.getBulkOrders().catch(() => []),
      ]);
      setOrders(Array.isArray(data) ? data : []);
      setBulkOrders(Array.isArray(bulkData) ? bulkData : []);
    } catch (err) {
      console.error('Failed to load merchant orders:', err);
      setError(err.response?.data?.detail || 'Unable to load orders.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdvanceBulkStatus = async (bulkOrderId, newStatus) => {
    try {
      setUpdatingOrderId(bulkOrderId);
      const updated = await bulkOrderService.advanceStatus(bulkOrderId, newStatus);
      setBulkOrders((prev) => prev.map((b) => (b.id === bulkOrderId ? updated : b)));
      setSuccessMessage(`Bulk order #${bulkOrderId} updated to '${newStatus}'.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Failed to advance bulk order status:', err);
      alert(err.response?.data?.message || err.response?.data?.detail || 'Failed to update bulk order status.');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleStatusTransition = async (orderId, nextStatus) => {
    try {
      setUpdatingOrderId(orderId);
      const updated = await orderService.updateOrderStatus(orderId, nextStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? (updated.order || updated) : o)));
      setSuccessMessage(`Order #${orderId} moved to '${nextStatus}'.`);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Failed to update status:', err);
      const msg = err.response?.data?.message || 'Could not advance order status.';
      alert(msg);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleOpenOtpModal = (order) => {
    setTargetOrderForOtp(order);
    setOtpInput('');
    setOtpVerificationError(null);
    setVerificationSuccess(null);
    setIsOtpModalOpen(true);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!targetOrderForOtp || !otpInput.trim()) return;

    setIsVerifyingOtp(true);
    setOtpVerificationError(null);

    try {
      const response = await orderService.verifyPickupOtp(targetOrderForOtp.id, otpInput.trim());
      setVerificationSuccess(response.message || 'Pickup verified successfully!');
      // Update order in state to COMPLETED
      setOrders((prev) =>
        prev.map((o) => (o.id === targetOrderForOtp.id ? { ...o, status: 'COMPLETED', status_display: 'Completed' } : o))
      );
      setTimeout(() => {
        setIsOtpModalOpen(false);
        setVerificationSuccess(null);
        setSuccessMessage(`Order #${targetOrderForOtp.id} successfully completed via OTP verification!`);
        setTimeout(() => setSuccessMessage(null), 4000);
      }, 1200);
    } catch (err) {
      console.error('OTP verification failed:', err);
      const data = err.response?.data;
      setOtpVerificationError(data?.message || 'Invalid or expired OTP code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const getStatusBadge = (st) => {
    switch (st) {
      case 'PENDING':
        return <Badge variant="warning">Order Placed (Pending)</Badge>;
      case 'CONFIRMED':
        return <Badge variant="primary">Confirmed</Badge>;
      case 'PREPARING':
        return <Badge variant="primary">Packing Items</Badge>;
      case 'READY':
      case 'READY_FOR_PICKUP':
        return <Badge variant="success">Ready at Counter</Badge>;
      case 'OUT_FOR_DELIVERY':
        return <Badge variant="warning">Out for Delivery</Badge>;
      case 'PICKED_UP':
      case 'DELIVERED':
      case 'COMPLETED':
        return <Badge variant="success">Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const filteredOrders = orders.filter((order) => {
    // Status Tab Filter
    if (statusTab === 'PENDING') {
      if (order.status !== 'PENDING' && order.status !== 'CONFIRMED') return false;
    } else if (statusTab === 'PREPARING') {
      if (order.status !== 'PREPARING') return false;
    } else if (statusTab === 'READY') {
      if (order.status !== 'READY' && order.status !== 'READY_FOR_PICKUP') return false;
    } else if (statusTab === 'COMPLETED') {
      if (order.status !== 'COMPLETED' && order.status !== 'PICKED_UP' && order.status !== 'DELIVERED') return false;
    }

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const numMatch = String(order.order_number || '').toLowerCase().includes(q) || String(order.id).includes(q);
      const custMatch = String(order.customer_username || '').toLowerCase().includes(q);
      return numMatch || custMatch;
    }

    return true;
  });

  const readyPickupCount = orders.filter(
    (o) => (o.status === 'READY' || o.status === 'READY_FOR_PICKUP') && o.fulfillment_type === 'PICKUP'
  ).length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <PageHeader
        title="Merchant Orders & Counter Dispatch"
        subtitle="Manage incoming student stationery orders, pack items, mark ready, and securely verify 6-digit pickup OTPs at the counter."
        badge={<Badge variant="primary">Step 13: Secure Counter Pickup</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={fetchOrders} disabled={loading}>
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={Key}
              onClick={() => {
                const firstReady = orders.find((o) => o.status === 'READY' && o.fulfillment_type === 'PICKUP');
                handleOpenOtpModal(firstReady || orders[0]);
              }}
            >
              Verify Pickup OTP ({readyPickupCount} Ready)
            </Button>
          </div>
        }
      />

      {successMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-md)',
            color: '#166534',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={20} color="#16a34a" />
          <strong style={{ fontSize: '0.9rem' }}>{successMessage}</strong>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            color: '#991b1b',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <strong style={{ fontSize: '0.9rem' }}>{error}</strong>
        </div>
      )}

      {/* Tabs & Search */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          {/* Status Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { key: 'ALL', label: `All Orders (${orders.length})` },
              { key: 'PENDING', label: 'Action Required' },
              { key: 'PREPARING', label: 'Preparing / Packing' },
              { key: 'READY', label: `Ready for Pickup (${readyPickupCount})` },
              { key: 'COMPLETED', label: 'Completed' },
              { key: 'BULK', label: `Bulk / Class Orders (${bulkOrders.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusTab(tab.key)}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: statusTab === tab.key ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                  color: statusTab === tab.key ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '240px' }}>
            <Search
              size={16}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              placeholder="Search order # or student..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem 0.45rem 2rem',
                fontSize: '0.85rem',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface)',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Orders List */}
      {loading ? (
        <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading merchant orders...
        </div>
      ) : statusTab === 'BULK' ? (
        /* BULK / CLASS ORDERS LIST */
        bulkOrders.length === 0 ? (
          <Card style={{ padding: '3rem', textAlign: 'center' }}>
            <Users size={42} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              No Bulk / Class Orders Yet
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              When class representatives or student project teams create bulk orders for your shop, they will appear here with automated stock reservation tracking.
            </p>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {bulkOrders.map((bOrder) => {
              const isUpdating = updatingOrderId === bOrder.id;
              const isConfirmed = bOrder.status === 'CONFIRMED';
              const isProcessing = bOrder.status === 'PROCESSING';
              const isReady = bOrder.status === 'READY';
              const isDone = bOrder.status === 'COMPLETED';
              const isCancelled = bOrder.status === 'CANCELLED';
              const isOpen = bOrder.status === 'OPEN';

              return (
                <Card key={bOrder.id} style={{ borderLeft: isConfirmed ? '4px solid #3b82f6' : isReady ? '4px solid #16a34a' : '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                          {bOrder.title}
                        </h3>
                        <Badge variant="primary">{bOrder.share_code}</Badge>
                        <Badge variant="neutral">{bOrder.order_type_display || bOrder.order_type}</Badge>
                        {bOrder.stock_reserved ? (
                          <Badge variant="success">Stock Locked & Reserved</Badge>
                        ) : (
                          <Badge variant="warning">Stock Not Reserved</Badge>
                        )}
                        <Badge
                          variant={
                            isDone ? 'success' : isReady ? 'success' : isProcessing ? 'primary' : isConfirmed ? 'warning' : isCancelled ? 'danger' : 'neutral'
                          }
                        >
                          {bOrder.status_display || bOrder.status}
                        </Badge>
                      </div>

                      <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.825rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                        <span>Organizer: <strong>{bOrder.creator_name || bOrder.creator?.name || 'Class Rep'}</strong></span>
                        <span>Participants: <strong>{bOrder.active_participants_count || bOrder.participant_count || 1}</strong></span>
                        <span>Total Units: <strong>{bOrder.total_quantity || 0} units</strong></span>
                        {bOrder.discount_percentage > 0 && (
                          <span style={{ color: 'var(--success-600)', fontWeight: 700 }}>
                            {bOrder.discount_percentage}% Volume Discount Applied
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{parseFloat(bOrder.final_amount || bOrder.total_amount || 0).toFixed(2)}
                      </div>
                      {bOrder.discount_amount > 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--success-600)', fontWeight: 600 }}>
                          (Discount: -₹{parseFloat(bOrder.discount_amount).toFixed(2)})
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Items List */}
                  {bOrder.items && bOrder.items.length > 0 && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--bg-surface-secondary)' }}>
                      <div style={{ fontSize: '0.775rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                        Stationery Items to Pack:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                        {bOrder.items.map((itm) => (
                          <div key={itm.id} style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>• {itm.product_name}</span>
                            <strong>x {itm.quantity}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Workflow Action Buttons */}
                  <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {isOpen && 'Order is still accepting student participants.'}
                      {isConfirmed && 'Order confirmed by Class Rep. Stock reserved. Ready to pack.'}
                      {isProcessing && 'Items being gathered and packed for bulk handover.'}
                      {isReady && 'Packed bulk order is waiting at counter for Class Rep pickup.'}
                      {isDone && 'Order completed and dispatched to class representative.'}
                      {isCancelled && 'Order was cancelled; reserved stock has been safely released.'}
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {isConfirmed && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={isUpdating}
                          onClick={() => handleAdvanceBulkStatus(bOrder.id, 'PROCESSING')}
                        >
                          {isUpdating ? 'Updating...' : 'Start Packing Items'}
                        </Button>
                      )}
                      {isProcessing && (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={isUpdating}
                          onClick={() => handleAdvanceBulkStatus(bOrder.id, 'READY')}
                        >
                          {isUpdating ? 'Updating...' : 'Mark Ready at Counter'}
                        </Button>
                      )}
                      {isReady && (
                        <Button
                          size="sm"
                          variant="primary"
                          style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                          disabled={isUpdating}
                          onClick={() => handleAdvanceBulkStatus(bOrder.id, 'COMPLETED')}
                        >
                          {isUpdating ? 'Updating...' : 'Hand Over to Class Rep (Complete)'}
                        </Button>
                      )}
                      {!isDone && !isCancelled && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={isUpdating}
                          onClick={() => {
                            if (window.confirm('Cancel this bulk order and release all reserved stock?')) {
                              handleAdvanceBulkStatus(bOrder.id, 'CANCELLED');
                            }
                          }}
                        >
                          Cancel Order
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : filteredOrders.length === 0 ? (
        <Card style={{ padding: '3rem', textAlign: 'center' }}>
          <ShoppingBag size={42} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            No Orders Found
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            No stationery orders match the selected filter.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredOrders.map((order) => {
            const shortId = String(order.order_number || order.id).slice(0, 8);
            const isPickup = order.fulfillment_type === 'PICKUP';
            const isReady = order.status === 'READY' || order.status === 'READY_FOR_PICKUP';
            const isCompleted = order.status === 'COMPLETED' || order.status === 'PICKED_UP';
            const isUpdating = updatingOrderId === order.id;

            return (
              <Card key={order.id}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                        Order #{shortId}
                      </h3>
                      {getStatusBadge(order.status)}
                      <Badge variant={isPickup ? 'primary' : 'neutral'}>
                        {isPickup ? 'STORE PICKUP' : 'CAMPUS DELIVERY'}
                      </Badge>
                    </div>

                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                      <span>Student: <strong>{order.customer_username}</strong></span>
                      <span>Total: <strong>₹{parseFloat(order.total_amount || 0).toFixed(2)}</strong></span>
                      <span>Date: {new Date(order.created_at).toLocaleDateString()}</span>
                    </div>

                    {isPickup && (
                      <div
                        style={{
                          marginTop: '0.5rem',
                          padding: '0.45rem 0.75rem',
                          backgroundColor: 'var(--primary-50)',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '0.8rem',
                          color: 'var(--primary-800)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <Calendar size={15} color="var(--primary-700)" />
                        <strong>Counter Pickup Window:</strong>
                        <span>{order.pickup_slot_details?.formatted || (order.pickup_slot ? `Slot #${order.pickup_slot}` : 'Counter Reservation')}</span>
                      </div>
                    )}

                    {order.order_notes && (
                      <div style={{ marginTop: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        <strong>Note:</strong> {order.order_notes}
                      </div>
                    )}
                  </div>

                  {/* Actions according to lifecycle */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    {order.status === 'PENDING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(order.id, 'CONFIRMED')}
                      >
                        {isUpdating ? 'Accepting...' : 'Accept Order'}
                      </Button>
                    )}

                    {order.status === 'CONFIRMED' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(order.id, 'PREPARING')}
                      >
                        {isUpdating ? 'Updating...' : 'Start Preparing'}
                      </Button>
                    )}

                    {order.status === 'PREPARING' && (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isUpdating}
                        onClick={() => handleStatusTransition(order.id, 'READY')}
                      >
                        {isUpdating ? 'Updating...' : 'Mark Ready for Pickup'}
                      </Button>
                    )}

                    {isReady && isPickup && (
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={Key}
                        style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                        onClick={() => handleOpenOtpModal(order)}
                      >
                        Verify Pickup OTP
                      </Button>
                    )}

                    {isCompleted && (
                      <Badge variant="success">
                        <Check size={14} style={{ marginRight: '4px' }} />
                        Verified & Collected
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Counter OTP Verification Modal */}
      {isOtpModalOpen && targetOrderForOtp && (
        <Modal
          isOpen={isOtpModalOpen}
          onClose={() => setIsOtpModalOpen(false)}
          title="Counter Pickup OTP Verification"
        >
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div
              style={{
                padding: '0.85rem 1rem',
                backgroundColor: 'var(--bg-surface-secondary)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Order:</span>
                <strong>#{String(targetOrderForOtp.order_number || targetOrderForOtp.id).slice(0, 8)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                <strong>{targetOrderForOtp.customer_username}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Amount Due:</span>
                <strong>₹{parseFloat(targetOrderForOtp.total_amount || 0).toFixed(2)}</strong>
              </div>
            </div>

            {verificationSuccess && (
              <div
                style={{
                  padding: '1rem',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 'var(--radius-md)',
                  color: '#166534',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <ShieldCheck size={20} color="#16a34a" />
                <span>{verificationSuccess}</span>
              </div>
            )}

            {otpVerificationError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                {otpVerificationError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Enter Student 6-Digit Pickup OTP:
              </label>
              <input
                type="text"
                autoFocus
                required
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="6-digit code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  fontSize: '1.75rem',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '8px',
                  fontWeight: 800,
                  border: '2px solid var(--primary-500)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.35rem', textAlign: 'center' }}>
                Ask the student for the 6-digit code displayed on their phone screen.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="ghost" type="button" onClick={() => setIsOtpModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isVerifyingOtp || otpInput.length < 6}
                style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
              >
                {isVerifyingOtp ? 'Verifying...' : 'Verify OTP & Complete Order'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ShopOwnerOrders;
