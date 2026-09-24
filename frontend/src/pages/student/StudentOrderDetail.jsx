import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  Store,
  MapPin,
  Calendar,
  AlertCircle,
  ArrowLeft,
  XCircle,
  Shield,
  CreditCard,
  ShoppingBag,
  Eye,
  EyeOff,
  Copy,
  Check,
  Key,
  KeyRound,
  HelpCircle,
  Phone,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import orderService from '../../services/orderService';
import deliveryGpsService from '../../services/deliveryGpsService';
import productService from '../../services/productService';
import { useCart } from '../../context/CartContext';
import LiveMap from '../../components/common/LiveMap';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import OrderTimeline from '../../components/common/OrderTimeline';

const StudentOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { addToCart } = useCart();

  const [order, setOrder] = useState(location.state?.order || null);
  const [loading, setLoading] = useState(!order);
  const [error, setError] = useState(null);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelMessage, setCancelMessage] = useState(null);

  // Pickup OTP State (Step 13)
  const [pickupOtp, setPickupOtp] = useState(null);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);
  const [otpError, setOtpError] = useState(null);

  // Delivery Reschedule State
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedNewSlotId, setSelectedNewSlotId] = useState(null);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState(null);

  // Copy Order ID State
  const [orderIdCopied, setOrderIdCopied] = useState(false);

  // Reorder State
  const [isReordering, setIsReordering] = useState(false);
  const [reorderFeedback, setReorderFeedback] = useState(null);

  // Live GPS Tracking State (Step 22)
  const [liveTracking, setLiveTracking] = useState(null);
  const [loadingTracking, setLoadingTracking] = useState(false);

  const isNewOrder = location.state?.isNewOrder;

  useEffect(() => {
    if (!order || order.fulfillment_type !== 'DELIVERY') return;
    const isDeliveryActive =
      order.status === 'OUT_FOR_DELIVERY' ||
      order.delivery_details?.delivery_status === 'OUT_FOR_DELIVERY' ||
      order.delivery_details?.delivery_status === 'ARRIVING';

    if (!isDeliveryActive) {
      setLiveTracking(null);
      return;
    }

    const deliveryId = order.delivery_details?.id || order.id;

    const fetchTracking = async () => {
      try {
        const data = await deliveryGpsService.getDeliveryLiveTracking(deliveryId);
        setLiveTracking(data);
      } catch (err) {
        console.error('Failed to fetch live tracking:', err);
      }
    };

    fetchTracking();
    const interval = setInterval(fetchTracking, 12000); // 12-second polling
    return () => clearInterval(interval);
  }, [order]);

  const handleFetchOtp = async () => {
    if (showOtp) {
      setShowOtp(false);
      return;
    }
    if (pickupOtp) {
      setShowOtp(true);
      return;
    }

    try {
      setIsOtpLoading(true);
      setOtpError(null);
      const data = order.fulfillment_type === 'DELIVERY'
        ? await orderService.getDeliveryOtp(order.id || order.order_number)
        : await orderService.getPickupOtp(order.id || order.order_number);
      if (data.success && data.otp) {
        setPickupOtp(data.otp);
        setShowOtp(true);
      } else {
        setOtpError(data.message || 'OTP is not available yet.');
      }
    } catch (err) {
      console.error('Failed to fetch OTP:', err);
      setOtpError(err.response?.data?.message || 'Could not retrieve OTP.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleCopyOtp = () => {
    if (!pickupOtp) return;
    navigator.clipboard.writeText(pickupOtp);
    setOtpCopied(true);
    setTimeout(() => setOtpCopied(false), 2500);
  };

  const handleCopyOrderId = () => {
    const textToCopy = order?.order_number || (order?.id ? String(order.id) : '');
    if (!textToCopy) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setOrderIdCopied(true);
          setTimeout(() => setOrderIdCopied(false), 2500);
        })
        .catch(() => {
          setOrderIdCopied(true);
          setTimeout(() => setOrderIdCopied(false), 2500);
        });
    } else {
      setOrderIdCopied(true);
      setTimeout(() => setOrderIdCopied(false), 2500);
    }
  };

  const handleReorder = async () => {
    if (!order?.items || order.items.length === 0) return;
    setIsReordering(true);
    setReorderFeedback(null);

    let addedCount = 0;
    let skippedCount = 0;
    let conflictOccurred = false;

    for (const item of order.items) {
      try {
        const prodId = item.product || item.product_details?.id;
        if (!prodId) {
          skippedCount++;
          continue;
        }
        const liveProduct = await productService.getProductById(prodId);
        if (liveProduct && liveProduct.is_active && Number(liveProduct.current_stock ?? 0) > 0) {
          const qtyToAdd = Math.min(item.quantity, Number(liveProduct.current_stock));
          const res = addToCart(liveProduct, qtyToAdd);
          if (res?.conflict) {
            conflictOccurred = true;
            break;
          } else if (res?.success !== false) {
            addedCount++;
          } else {
            skippedCount++;
          }
        } else {
          skippedCount++;
        }
      } catch (err) {
        console.warn('Reorder item failed:', err);
        skippedCount++;
      }
    }

    setIsReordering(false);
    if (conflictOccurred) {
      setReorderFeedback({
        type: 'warning',
        message: 'Your cart already contains items from another merchant. Clear your cart first to reorder from this shop.',
      });
    } else if (addedCount > 0) {
      setReorderFeedback({
        type: 'success',
        message: `Added ${addedCount} stationery item${addedCount > 1 ? 's' : ''} to your cart.${skippedCount > 0 ? ` (${skippedCount} out-of-stock item${skippedCount > 1 ? 's were' : ' was'} skipped)` : ''}`,
      });
    } else {
      setReorderFeedback({
        type: 'danger',
        message: 'None of the stationery items from this order are currently available in stock.',
      });
    }
  };

  const openRescheduleModal = async () => {
    setShowRescheduleModal(true);
    setRescheduleError(null);
    setIsLoadingSlots(true);
    try {
      const shopId = order?.shop?.id || order?.shop;
      const slots = await orderService.getDeliverySlots(shopId);
      setRescheduleSlots(slots);
      const available = slots.filter((s) => s.is_available);
      if (available.length > 0) {
        setSelectedNewSlotId(available[0].id);
      }
    } catch (err) {
      console.error('Failed to load reschedule slots:', err);
      setRescheduleError('Could not load available delivery slots for this shop.');
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!selectedNewSlotId) {
      setRescheduleError('Please select a new delivery window.');
      return;
    }
    setIsRescheduling(true);
    setRescheduleError(null);
    try {
      const deliveryId = order.delivery_details?.id || order.id;
      await orderService.rescheduleDelivery(deliveryId, selectedNewSlotId);
      setShowRescheduleModal(false);
      await fetchOrderDetails();
    } catch (err) {
      console.error('Reschedule failed:', err);
      setRescheduleError(err.response?.data?.message || 'Could not reschedule delivery. Please try another slot.');
    } finally {
      setIsRescheduling(false);
    }
  };

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrderById(orderId);
      setOrder(data);
    } catch (err) {
      console.error('Failed to load order:', err);
      const msg = err.response?.data?.detail || 'Unable to load order details. It may not exist or belong to another account.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    setIsCancelling(true);
    setCancelMessage(null);
    try {
      const response = await orderService.cancelOrder(order.id || order.order_number);
      setOrder(response.order || response);
      setShowCancelModal(false);
    } catch (err) {
      console.error('Cancellation failed:', err);
      setCancelMessage(err.response?.data?.message || 'Could not cancel this order. Only PENDING orders can be cancelled.');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Order Placed (Pending)</Badge>;
      case 'CONFIRMED':
        return <Badge variant="primary">Confirmed by Shop</Badge>;
      case 'PREPARING':
        return <Badge variant="primary">Packing Items</Badge>;
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
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ maxWidth: '900px', textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Loading order details...</div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="page-container" style={{ maxWidth: '750px', textAlign: 'center', padding: '3rem 1rem' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <AlertCircle size={32} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Order Not Found
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          {error || 'This order does not exist or you do not have permission to view it.'}
        </p>
        <Link to="/student/orders">
          <Button variant="primary" size="md">
            View My Orders
          </Button>
        </Link>
      </div>
    );
  }

  const shortOrderNum = order.order_number ? String(order.order_number).slice(0, 8).toUpperCase() : `#${order.id}`;
  const formattedDate = new Date(order.created_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="page-container" style={{ maxWidth: '950px' }}>
      {/* Confirmation Banner for new orders */}
      {isNewOrder && (
        <div
          style={{
            padding: '1.25rem 1.5rem',
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46', margin: 0 }}>
                Order Confirmed Successfully!
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#047857', margin: '0.2rem 0 0 0' }}>
                Your order has been sent to the shop owner. Inventory has been safely reserved.
              </p>
            </div>
          </div>
          <Link to="/student/orders">
            <Button variant="outline" size="sm" style={{ backgroundColor: '#fff', borderColor: '#10b981', color: '#065f46' }}>
              View All Orders
            </Button>
          </Link>
        </div>
      )}

      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Order #{shortOrderNum}
            </h1>
            <button
              type="button"
              onClick={handleCopyOrderId}
              title="Copy Order ID"
              aria-label="Copy Order ID"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                backgroundColor: orderIdCopied ? '#ecfdf5' : 'var(--bg-surface-secondary)',
                border: `1px solid ${orderIdCopied ? '#a7f3d0' : 'var(--border-light)'}`,
                color: orderIdCopied ? '#059669' : 'var(--text-secondary)',
                borderRadius: 'var(--radius-md)',
                padding: '0.2rem 0.55rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {orderIdCopied ? <Check size={13} color="#059669" /> : <Copy size={13} />}
              <span>{orderIdCopied ? 'Copied' : 'Copy ID'}</span>
            </button>
            {getStatusBadge(order.status)}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Placed on {formattedDate} • Full UUID: <code style={{ fontSize: '0.75rem' }}>{order.order_number}</code>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Link to="/student/orders">
            <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
              Back to My Orders
            </Button>
          </Link>

          {/* 1-Click Reorder Action */}
          <Button
            variant="outline"
            size="sm"
            leftIcon={RefreshCw}
            onClick={handleReorder}
            isLoading={isReordering}
            disabled={isReordering}
          >
            Reorder Items
          </Button>

          {order.status === 'PENDING' && (
            <Button
              variant="outline"
              size="sm"
              style={{ color: 'var(--danger-600)', borderColor: 'var(--danger-300)' }}
              onClick={() => setShowCancelModal(true)}
            >
              Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* Reorder Success / Warning Banner */}
      {reorderFeedback && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: reorderFeedback.type === 'success' ? '#ecfdf5' : reorderFeedback.type === 'warning' ? '#fffbeb' : '#fef2f2',
            border: `1px solid ${reorderFeedback.type === 'success' ? '#a7f3d0' : reorderFeedback.type === 'warning' ? '#fde68a' : '#fecaca'}`,
            borderRadius: 'var(--radius-md)',
            color: reorderFeedback.type === 'success' ? '#065f46' : reorderFeedback.type === 'warning' ? '#92400e' : '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span>{reorderFeedback.message}</span>
          {reorderFeedback.type === 'success' && (
            <Link to="/student/cart">
              <Button variant="outline" size="sm" style={{ backgroundColor: '#fff', color: '#065f46', borderColor: '#a7f3d0' }}>
                View Cart →
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Visual Status Progression Timeline */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <OrderTimeline status={order.status} fulfillmentType={order.fulfillment_type} />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Items Table & Details */}
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Card title="Ordered Stationery Items">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {(order.items || []).map((item) => {
                const unitPrice = parseFloat(item.unit_price || 0);
                const totalPrice = parseFloat(item.total_price || 0);
                const prodName = item.product_details?.name || `Product #${item.product}`;
                const brand = item.product_details?.brand;

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 0',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        {prodName}
                      </h4>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        {brand ? `${brand} • ` : ''}₹{unitPrice.toFixed(2)} × {item.quantity}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                      ₹{totalPrice.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>

            {order.order_notes && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <strong>Order Instructions:</strong> {order.order_notes}
              </div>
            )}
          </Card>

          {/* Fulfillment & Delivery Details */}
          <Card title="Fulfillment Information">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                <Store size={20} color="var(--primary-600)" style={{ marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <h5 style={{ fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {order.shop_name || 'Campus Stationery Shop'}
                  </h5>
                  <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.825rem' }}>
                    Shop ID: #{order.shop}
                  </p>
                </div>
              </div>

              {order.fulfillment_type === 'PICKUP' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div
                    style={{
                      padding: '0.9rem 1.1rem',
                      backgroundColor: 'var(--primary-50)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--primary-200)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <Calendar size={18} color="var(--primary-700)" />
                      <strong style={{ color: 'var(--primary-900)' }}>Store Counter Pickup Window</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--primary-800)' }}>
                      {order.pickup_slot_details?.formatted || (order.pickup_slot ? `Pickup Slot #${order.pickup_slot}` : 'Counter Reservation')}
                    </p>
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Please visit {order.shop_name || 'the shop'} during this designated time window to avoid waiting in queues.
                    </p>
                  </div>

                  {/* Step 13: OTP Section */}
                  {order.status === 'READY' && (
                    <div
                      style={{
                        padding: '1.25rem',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 'var(--radius-lg)',
                        border: '2px dashed #16a34a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Key size={20} color="#16a34a" />
                          <strong style={{ fontSize: '0.95rem', color: '#166534' }}>
                            Your Secure Pickup OTP
                          </strong>
                        </div>
                        <Badge variant="success">READY FOR COLLECTION</Badge>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#15803d' }}>
                        Your order is packed and ready! Present this 6-digit OTP to the shopkeeper at the counter to verify and collect your package.
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '1rem',
                          padding: '0.75rem 1rem',
                          backgroundColor: '#ffffff',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #bbf7d0',
                          marginTop: '0.25rem',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '1.6rem',
                            fontWeight: 800,
                            letterSpacing: '6px',
                            color: showOtp ? '#15803d' : '#94a3b8',
                            flex: 1,
                          }}
                        >
                          {showOtp && pickupOtp ? pickupOtp : '••••••'}
                        </div>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            leftIcon={showOtp ? EyeOff : Eye}
                            onClick={handleFetchOtp}
                            disabled={isOtpLoading}
                          >
                            {isOtpLoading ? 'Loading...' : showOtp ? 'Hide OTP' : 'Show OTP'}
                          </Button>

                          {showOtp && pickupOtp && (
                            <Button
                              variant="ghost"
                              size="sm"
                              leftIcon={otpCopied ? Check : Copy}
                              onClick={handleCopyOtp}
                            >
                              {otpCopied ? 'Copied' : 'Copy'}
                            </Button>
                          )}
                        </div>
                      </div>

                      {otpError && (
                        <div style={{ fontSize: '0.8rem', color: '#dc2626' }}>
                          {otpError}
                        </div>
                      )}
                    </div>
                  )}

                  {(order.status === 'COMPLETED' || order.status === 'PICKED_UP') && (
                    <div
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: '#15803d',
                      }}
                    >
                      <CheckCircle2 size={22} color="#16a34a" />
                      <div>
                        <strong style={{ fontSize: '0.9rem', display: 'block' }}>Pickup Completed</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          This package was securely verified via OTP and collected from {order.shop_name || 'the shop'}.
                        </span>
                      </div>
                    </div>
                  )}

                  {(order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'PREPARING') && (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-surface-secondary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <Clock size={16} color="var(--primary-600)" />
                      <span>
                        Your 6-digit pickup OTP will appear here once the shop marks your order as <strong>Ready for Pickup</strong>.
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div
                    style={{
                      padding: '0.85rem 1rem',
                      backgroundColor: 'var(--bg-surface-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                      <MapPin size={18} color="var(--primary-600)" />
                      <strong style={{ color: 'var(--text-primary)' }}>Hostel Delivery Destination</strong>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {order.delivery_address || 'Campus Residence Address Provided'}
                    </p>
                    <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Campus courier will deliver to your hostel door or floor entrance.
                    </p>
                  </div>

                  {/* Arriving State Notice */}
                  {order.delivery_details?.delivery_status === 'ARRIVING' && (
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        backgroundColor: '#ecfdf5',
                        border: '1.5px solid #a7f3d0',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: '#065f46',
                      }}
                    >
                      <Truck size={22} color="#059669" />
                      <div>
                        <strong style={{ display: 'block', fontSize: '0.9rem' }}>Courier Arriving at Your Doorstep!</strong>
                        <span style={{ fontSize: '0.8rem' }}>Your courier has reached your block. Please keep your 6-digit delivery OTP ready.</span>
                      </div>
                    </div>
                  )}

                  {/* Failed Delivery Notice & Reschedule Button */}
                  {order.delivery_details?.delivery_status === 'FAILED' && (
                    <div
                      style={{
                        padding: '1rem',
                        backgroundColor: '#fef2f2',
                        border: '1.5px solid #fecaca',
                        borderRadius: 'var(--radius-md)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem' }}>
                        <AlertTriangle size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
                        <div>
                          <strong style={{ color: '#991b1b', fontSize: '0.95rem', display: 'block' }}>
                            Delivery Attempt Unsuccessful
                          </strong>
                          <span style={{ fontSize: '0.825rem', color: '#b91c1c' }}>
                            Reason: {order.delivery_details?.failure_reason_display || order.delivery_details?.failure_reason || 'Customer unavailable'}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        leftIcon={RefreshCw}
                        onClick={openRescheduleModal}
                        style={{ alignSelf: 'flex-start' }}
                      >
                        Reschedule Delivery Slot
                      </Button>
                    </div>
                  )}

                  {/* Step 22: Live GPS Tracking & Interactive Map */}
                  {(order.status === 'OUT_FOR_DELIVERY' ||
                    order.delivery_details?.delivery_status === 'OUT_FOR_DELIVERY' ||
                    order.delivery_details?.delivery_status === 'ARRIVING') && (
                    <div
                      style={{
                        padding: '1.25rem',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1.5px solid var(--primary-200)',
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>🚚</span>
                          <div>
                            <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)', display: 'block' }}>
                              Live Courier Tracking
                            </strong>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              Assigned Courier: <strong>{liveTracking?.courier_name || 'Courier Runner'}</strong>
                            </span>
                          </div>
                        </div>
                        <Badge variant={order.delivery_details?.delivery_status === 'ARRIVING' ? 'success' : 'primary'}>
                          {order.delivery_details?.delivery_status === 'ARRIVING' ? 'ARRIVING SOON' : 'ON THE MOVE'}
                        </Badge>
                      </div>

                      {/* Live Telemetry Bar */}
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '0.75rem',
                          padding: '0.85rem 1rem',
                          backgroundColor: 'var(--bg-surface-secondary)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-light)',
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Estimated Arrival</span>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--primary-700)' }}>
                            {liveTracking?.eta_minutes ? `${liveTracking.eta_minutes} mins` : '15–20 mins'}
                          </strong>
                          {liveTracking?.eta_confidence && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>
                              Confidence: {liveTracking.eta_confidence}
                            </span>
                          )}
                        </div>

                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Road Distance</span>
                          <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                            {liveTracking?.distance?.distance_km ? `${liveTracking.distance.distance_km} km` : 'Campus Route'}
                          </strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block' }}>
                            {liveTracking?.distance?.is_road_distance ? 'Road estimate' : 'Straight line'}
                          </span>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Last Signal</span>
                          <strong style={{ fontSize: '0.95rem', color: liveTracking?.current_location?.is_stale ? '#dc2626' : '#16a34a' }}>
                            {liveTracking?.current_location
                              ? `${liveTracking.current_location.age_seconds}s ago`
                              : 'Connecting...'}
                          </strong>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
                            Live GPS Feed
                          </span>
                        </div>
                      </div>

                      {/* Leaflet Interactive Map */}
                      <LiveMap
                        origin={liveTracking?.current_location}
                        destination={liveTracking?.destination}
                        polyline={liveTracking?.polyline}
                        isStale={liveTracking?.current_location?.is_stale}
                        courierName={liveTracking?.courier_name}
                        accuracy={liveTracking?.current_location?.accuracy}
                        height="320px"
                      />

                      <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        🔒 Location is shown strictly while your delivery is in active transit to protect courier operational privacy.
                      </p>
                    </div>
                  )}

                  {/* Delivery OTP Card when OUT_FOR_DELIVERY or ARRIVING */}
                  {(order.status === 'OUT_FOR_DELIVERY' || order.delivery_details?.delivery_status === 'OUT_FOR_DELIVERY' || order.delivery_details?.delivery_status === 'ARRIVING') && (
                    <div
                      style={{
                        padding: '1.25rem',
                        backgroundColor: '#fffbeb',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid #fde68a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: '#92400e', display: 'block' }}>
                            Delivery Verification OTP
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: '#b45309' }}>
                            Share this code with your courier upon receiving your package
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleFetchOtp}
                          disabled={isOtpLoading}
                          icon={showOtp ? EyeOff : Eye}
                        >
                          {isOtpLoading ? 'Loading...' : showOtp ? 'Hide OTP' : 'Show OTP'}
                        </Button>
                      </div>

                      {/* Display OTP Box */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#ffffff',
                          padding: '0.85rem 1.25rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #fef3c7',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <KeyRound size={22} color="#f59e0b" />
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '1.5rem',
                              fontWeight: 800,
                              letterSpacing: '0.25rem',
                              color: showOtp ? '#b45309' : 'var(--text-muted)',
                            }}
                          >
                            {showOtp && pickupOtp ? pickupOtp : '••••••'}
                          </span>
                        </div>

                        {showOtp && pickupOtp && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyOtp}
                            icon={otpCopied ? Check : Copy}
                            style={{ color: otpCopied ? '#16a34a' : 'var(--text-secondary)' }}
                          >
                            {otpCopied ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </div>

                      {otpError && (
                        <div style={{ fontSize: '0.8rem', color: '#dc2626' }}>
                          {otpError}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delivered State */}
                  {(order.status === 'COMPLETED' || order.status === 'DELIVERED') && (
                    <div
                      style={{
                        padding: '1rem',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #bbf7d0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: '#15803d',
                      }}
                    >
                      <CheckCircle2 size={22} color="#16a34a" />
                      <div>
                        <strong style={{ fontSize: '0.9rem', display: 'block' }}>Delivery Completed & Verified</strong>
                        <span style={{ fontSize: '0.8rem', color: '#166534' }}>
                          This package was securely verified via OTP and handed over at your hostel.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Pending / Preparing State */}
                  {(order.status === 'PENDING' || order.status === 'CONFIRMED' || order.status === 'PREPARING' || order.status === 'READY') && (
                    <div
                      style={{
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--bg-surface-secondary)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                      }}
                    >
                      <Clock size={16} color="var(--primary-600)" />
                      <span>
                        Your 6-digit Delivery OTP will be revealed here once your courier departs for your hostel.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Financial Breakdown Sidebar */}
        <div>
          <Card title="Payment & Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.925rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Items Subtotal</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ₹{parseFloat(order.subtotal || 0).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Delivery Charge</span>
                <span style={{ fontWeight: 600, color: parseFloat(order.delivery_fee) === 0 ? 'var(--success-600)' : 'var(--text-primary)' }}>
                  {parseFloat(order.delivery_fee) === 0 ? 'FREE' : `₹${parseFloat(order.delivery_fee).toFixed(2)}`}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '0.85rem',
                  marginTop: '0.25rem',
                  borderTop: '1px solid var(--border-light)',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Total Amount</span>
                <span style={{ color: 'var(--primary-600)' }}>
                  ₹{parseFloat(order.total_amount || 0).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  marginTop: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Method:</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {order.payment_method || 'COD'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payment Status:</span>
                  <span style={{ fontWeight: 700, color: 'var(--warning-700)' }}>
                    {order.payment_status || 'PENDING'}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link to="/student/shops">
                <Button variant="primary" size="md" fullWidth leftIcon={ShoppingBag}>
                  Continue Shopping
                </Button>
              </Link>
            </div>
          </Card>

          {/* Need Help / Support Card */}
          <Card title="Need Assistance?">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <p style={{ margin: 0, lineHeight: 1.4 }}>
                Encountering an issue with your delivery or print quality? Our campus support team is here to help.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
                <a
                  href={`tel:${order.shop?.contact_phone || '+919876543210'}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-secondary)',
                    color: 'var(--text-primary)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  <Phone size={15} color="var(--primary-600)" />
                  <span>Call Store Counter</span>
                </a>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.6rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-secondary)',
                    color: 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  <HelpCircle size={15} color="var(--primary-600)" />
                  <span>Campus Desk: support@campus.edu</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Cancel Order Confirmation Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Stationery Order"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowCancelModal(false)}>
              Keep Order
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={isCancelling}
              onClick={handleCancelOrder}
            >
              {isCancelling ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <p style={{ margin: 0, fontSize: '0.925rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            Are you sure you want to cancel <strong>Order #{shortOrderNum}</strong>?
          </p>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            All reserved stationery products and your pickup slot will be immediately returned to the shop inventory.
          </p>
          {cancelMessage && (
            <div style={{ padding: '0.65rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem' }}>
              {cancelMessage}
            </div>
          )}
        </div>
      </Modal>

      {/* Reschedule Delivery Slot Modal */}
      <Modal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        title="Reschedule Campus Delivery"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setShowRescheduleModal(false)}>
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isRescheduling || !selectedNewSlotId}
              onClick={handleConfirmReschedule}
            >
              {isRescheduling ? 'Rescheduling...' : 'Confirm New Window'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Choose an available delivery window for the courier to re-attempt delivery:
          </p>

          {isLoadingSlots ? (
            <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading available delivery windows...
            </div>
          ) : rescheduleSlots.length === 0 ? (
            <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              No open delivery slots right now. Please contact the shop directly or check back later.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '240px', overflowY: 'auto' }}>
              {rescheduleSlots.map((slot) => {
                const isSelected = selectedNewSlotId === slot.id;
                const freeSpots = slot.capacity - slot.booked_count;
                const isFull = !slot.is_available || freeSpots <= 0;

                return (
                  <div
                    key={slot.id}
                    onClick={() => !isFull && setSelectedNewSlotId(slot.id)}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      border: `1.5px solid ${isSelected ? 'var(--primary-600)' : isFull ? 'var(--border-light)' : 'var(--border-medium)'}`,
                      backgroundColor: isSelected ? 'var(--primary-50)' : isFull ? 'var(--bg-surface-secondary)' : 'var(--bg-surface)',
                      cursor: isFull ? 'not-allowed' : 'pointer',
                      opacity: isFull ? 0.6 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.875rem', display: 'block' }}>
                        {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{slot.date}</span>
                    </div>
                    <Badge size="sm" variant={isFull ? 'danger' : freeSpots <= 3 ? 'warning' : 'neutral'}>
                      {isFull ? 'Full' : `${freeSpots} slots remaining`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}

          {rescheduleError && (
            <div style={{ padding: '0.65rem', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: 'var(--radius-sm)', fontSize: '0.825rem' }}>
              {rescheduleError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default StudentOrderDetail;
