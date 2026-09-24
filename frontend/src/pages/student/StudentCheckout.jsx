import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ShoppingBag,
  Store,
  MapPin,
  Clock,
  Calendar,
  CreditCard,
  Truck,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  User,
  FileText,
  AlertTriangle,
  Tag,
  X,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import orderService from '../../services/orderService';
import engagementService from '../../services/engagementService';
import paymentService from '../../services/paymentService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';
import LocationPickerModal from '../../components/maps/LocationPickerModal';

const DELIVERY_FEE_AMOUNT = 15.0;

const StudentCheckout = () => {
  const { cartItems, cartShop, cartTotal, itemCount, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Fulfillment State ('PICKUP' | 'DELIVERY')
  const [fulfillmentType, setFulfillmentType] = useState('PICKUP');

  // Pickup Slots
  const [pickupSlots, setPickupSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState(null);

  // Delivery Address Form
  const [addressForm, setAddressForm] = useState({
    fullName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : '',
    phoneNumber: user?.phone_number || '',
    hostelName: '',
    roomNumber: '',
    landmark: '',
  });

  // Saved Addresses State
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [selectedCoords, setSelectedCoords] = useState(null);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);

  // Delivery Slots State & Charge Calculation
  const [deliverySlots, setDeliverySlots] = useState([]);
  const [selectedDeliverySlotId, setSelectedDeliverySlotId] = useState(null);
  const [loadingDeliverySlots, setLoadingDeliverySlots] = useState(false);
  const [deliveryChargeInfo, setDeliveryChargeInfo] = useState({
    delivery_charge: 15,
    is_free: false,
    free_delivery_threshold: 250,
  });

  // Order Options & Payment Gateway State (Step 25)
  const [paymentMethod, setPaymentMethod] = useState('ONLINE');
  const [showSandboxModal, setShowSandboxModal] = useState(false);
  const [activePaymentSession, setActivePaymentSession] = useState(null);
  const [createdOrderObj, setCreatedOrderObj] = useState(null);
  const [verifyingPayment, setVerifyingPayment] = useState(false);
  const [sandboxError, setSandboxError] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Step 24: Authoritative Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [couponSuccess, setCouponSuccess] = useState('');

  const handleApplyCoupon = async (e) => {
    if (e) e.preventDefault();
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    setCouponError('');
    setCouponSuccess('');
    try {
      const itemsPayload = cartItems.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      }));
      const res = await engagementService.validateCoupon(
        couponCode.trim().toUpperCase(),
        cartShop?.id,
        itemsPayload
      );
      if (res && res.valid) {
        const discountVal = Number(res.discount_amount) || 0;
        setAppliedCoupon({
          code: couponCode.trim().toUpperCase(),
          discount_amount: discountVal,
        });
        setCouponDiscount(discountVal);
        setCouponSuccess(res.message || `Coupon ${couponCode.toUpperCase()} applied! Saved ₹${discountVal.toFixed(2)}`);
        setCouponError('');
      } else {
        setCouponError(res?.message || 'Invalid coupon code for this order.');
      }
    } catch (err) {
      setCouponError(err.response?.data?.message || err.response?.data?.detail || 'Failed to validate coupon.');
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    setCouponCode('');
    setCouponSuccess('');
    setCouponError('');
  };

  // Fetch pickup slots when shop is known and pickup is selected
  useEffect(() => {
    if (cartShop?.id && fulfillmentType === 'PICKUP') {
      fetchSlots(cartShop.id);
    }
  }, [cartShop?.id, fulfillmentType]);

  // Fetch saved addresses, delivery slots, and dynamic charges when delivery is selected
  useEffect(() => {
    if (fulfillmentType === 'DELIVERY') {
      loadSavedAddresses();
      if (cartShop?.id) {
        fetchDeliverySlots(cartShop.id);
      }
      fetchDeliveryCharge();
    }
  }, [fulfillmentType, cartShop?.id, cartTotal]);

  const fetchDeliverySlots = async (shopId) => {
    setLoadingDeliverySlots(true);
    try {
      const slots = await orderService.getDeliverySlots(shopId);
      setDeliverySlots(slots);
      const available = slots.filter((s) => s.is_available);
      if (available.length > 0 && !selectedDeliverySlotId) {
        setSelectedDeliverySlotId(available[0].id);
      }
    } catch (err) {
      console.error('Failed to load delivery slots:', err);
    } finally {
      setLoadingDeliverySlots(false);
    }
  };

  const fetchDeliveryCharge = async () => {
    try {
      const data = await orderService.calculateDeliveryCharge(cartTotal);
      setDeliveryChargeInfo(data);
    } catch (err) {
      console.error('Failed to calculate delivery charge:', err);
    }
  };

  const loadSavedAddresses = async () => {
    setLoadingAddresses(true);
    try {
      const addresses = await orderService.getStudentAddresses();
      setSavedAddresses(addresses || []);
      const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
      if (defaultAddr && !selectedAddressId) {
        selectSavedAddress(defaultAddr);
      }
    } catch (err) {
      console.error('Failed to load saved addresses:', err);
    } finally {
      setLoadingAddresses(false);
    }
  };

  const selectSavedAddress = (addr) => {
    setSelectedAddressId(addr.id);
    if (addr.latitude && addr.longitude) {
      setSelectedCoords({
        latitude: Number(addr.latitude),
        longitude: Number(addr.longitude),
      });
    } else {
      setSelectedCoords(null);
    }
    setAddressForm({
      fullName: user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : '',
      phoneNumber: addr.phone_number || user?.phone_number || '',
      hostelName: addr.hostel_block || '',
      roomNumber: addr.room_number || '',
      landmark: addr.landmark || '',
    });
    setFormErrors({});
  };

  const handleConfirmLocation = (loc) => {
    setSelectedCoords({
      latitude: loc.latitude,
      longitude: loc.longitude,
    });
    if (loc.address && !addressForm.landmark) {
      setAddressForm((prev) => ({ ...prev, landmark: loc.address }));
    }
  };

  const fetchSlots = async (shopId) => {
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const slots = await orderService.getPickupSlots(shopId);
      setPickupSlots(slots);
      // Auto select first available slot if not selected
      const available = slots.filter((s) => s.is_available);
      if (available.length > 0 && !selectedSlotId) {
        setSelectedSlotId(available[0].id);
      }
    } catch (err) {
      console.error('Failed to load pickup slots:', err);
      setSlotsError('Could not load pickup slots for this shop. Please try again.');
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setAddressForm((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};

    if (cartItems.length === 0) {
      errors.cart = 'Your cart is empty. Please add stationery items before checking out.';
    }

    if (fulfillmentType === 'PICKUP') {
      if (!selectedSlotId) {
        errors.pickup_slot = 'Please select an available counter pickup time slot.';
      }
    } else if (fulfillmentType === 'DELIVERY') {
      if (!addressForm.fullName.trim()) {
        errors.fullName = 'Recipient name is required.';
      }
      if (!addressForm.phoneNumber.trim()) {
        errors.phoneNumber = 'Active contact number is required for campus delivery.';
      }
      if (!addressForm.hostelName.trim()) {
        errors.hostelName = 'Hostel or campus building name is required.';
      }
      if (!addressForm.roomNumber.trim()) {
        errors.roomNumber = 'Room or department door number is required.';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlaceOrder = async () => {
    if (isSubmitting) return; // Prevent duplicate clicks
    setErrorMessage(null);

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    // Format delivery address text if delivery selected
    let formattedDeliveryAddress = '';
    if (fulfillmentType === 'DELIVERY') {
      formattedDeliveryAddress = [
        `Name: ${addressForm.fullName.trim()}`,
        `Phone: ${addressForm.phoneNumber.trim()}`,
        `Hostel/Building: ${addressForm.hostelName.trim()}`,
        `Room/Door: ${addressForm.roomNumber.trim()}`,
        addressForm.landmark.trim() ? `Landmark: ${addressForm.landmark.trim()}` : null,
      ]
        .filter(Boolean)
        .join(', ');
    }

    // Build payload according to backend API specifications
    const payload = {
      shop: cartShop.id,
      order_type: 'STATIONERY',
      fulfillment_type: fulfillmentType,
      pickup_slot: fulfillmentType === 'PICKUP' ? selectedSlotId : null,
      delivery_slot: fulfillmentType === 'DELIVERY' ? selectedDeliverySlotId : null,
      delivery_address: fulfillmentType === 'DELIVERY' ? formattedDeliveryAddress : '',
      delivery_latitude: fulfillmentType === 'DELIVERY' && selectedCoords ? selectedCoords.latitude : undefined,
      delivery_longitude: fulfillmentType === 'DELIVERY' && selectedCoords ? selectedCoords.longitude : undefined,
      hostel_block: fulfillmentType === 'DELIVERY' ? addressForm.hostelName.trim() : '',
      room_number: fulfillmentType === 'DELIVERY' ? addressForm.roomNumber.trim() : '',
      payment_method: paymentMethod,
      order_notes: orderNotes.trim(),
      coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
      items: cartItems.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
      })),
    };

    try {
      const response = await orderService.createOrder(payload);
      const createdOrder = response.order || response;

      // If Online payment chosen, launch the sandbox gateway modal
      if (paymentMethod === 'ONLINE') {
        const paymentData = createdOrder.latest_payment;
        if (paymentData) {
          setCreatedOrderObj(createdOrder);
          setActivePaymentSession(paymentData);
          setShowSandboxModal(true);
          return;
        }
      }

      // Safe stock & order succeeded: clear cart
      clearCart();

      // Navigate to order confirmation / detail page
      navigate(`/student/orders/${createdOrder.id || createdOrder.order_number}`, {
        state: { isNewOrder: true, order: createdOrder },
        replace: true,
      });
    } catch (err) {
      console.error('Order placement failed:', err);
      let errorMsg = 'Failed to place order. Please try again.';

      if (err.response?.data) {
        const data = err.response.data;
        if (typeof data === 'string') {
          errorMsg = data;
        } else if (data.items) {
          errorMsg = Array.isArray(data.items) ? data.items.join(' ') : data.items;
        } else if (data.pickup_slot) {
          errorMsg = Array.isArray(data.pickup_slot) ? data.pickup_slot.join(' ') : data.pickup_slot;
        } else if (data.delivery_address) {
          errorMsg = Array.isArray(data.delivery_address) ? data.delivery_address.join(' ') : data.delivery_address;
        } else if (data.message) {
          errorMsg = data.message;
        } else if (data.detail) {
          errorMsg = data.detail;
        } else {
          errorMsg = Object.values(data).flat().join(' ');
        }
      } else if (err.message) {
        errorMsg = err.message;
      }

      setErrorMessage(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // If cart is completely empty, prompt to return
  if (cartItems.length === 0) {
    return (
      <div className="page-container" style={{ maxWidth: '750px', textAlign: 'center', padding: '3rem 1rem' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: 'var(--primary-50)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
            color: 'var(--primary-600)',
          }}
        >
          <ShoppingBag size={32} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          No items ready for checkout
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.95rem' }}>
          Your shopping cart is currently empty. Please select stationery or study essentials first.
        </p>
        <Link to="/student/shops">
          <Button variant="primary" size="md">
            Browse Campus Stationery Shops
          </Button>
        </Link>
      </div>
    );
  }

  const estimatedDeliveryFee = fulfillmentType === 'DELIVERY' ? DELIVERY_FEE_AMOUNT : 0.0;
  const estimatedFinalTotal = Math.max(0, cartTotal - (couponDiscount || 0) + estimatedDeliveryFee);

  return (
    <div className="page-container" style={{ maxWidth: '1050px' }}>
      <PageHeader
        title="Checkout"
        subtitle="Review stationery items, select fulfillment method, and place your order"
        actions={
          <Link to="/student/cart">
            <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
              Back to Cart
            </Button>
          </Link>
        }
      />

      {/* Global Error Banner */}
      {errorMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '1.5rem',
            color: '#991b1b',
          }}
        >
          <AlertCircle size={20} color="#dc2626" style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontWeight: 700, margin: '0 0 0.25rem 0', fontSize: '0.95rem' }}>
              Order Placement Notice
            </h4>
            <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.4 }}>{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Shop Info Card */}
      {cartShop && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--primary-50)',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Store size={20} color="var(--primary-700)" />
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-600)', textTransform: 'uppercase' }}>
                Fulfilling Merchant
              </span>
              <h4 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary-900)' }}>
                {cartShop.name}
              </h4>
            </div>
          </div>
          <span style={{ fontSize: '0.85rem', color: 'var(--primary-700)', fontWeight: 500 }}>
            {cartShop.campus_location || cartShop.address}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Steps Column */}
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Step 1: Items in Order */}
          <Card title="1. Review Order Items">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {cartItems.map((item) => {
                const price = parseFloat(item.price || 0);
                const subtotal = price * item.quantity;
                return (
                  <div
                    key={item.productId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0',
                      borderBottom: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ flex: 1, paddingRight: '1rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {item.productName}
                      </span>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                        ₹{price.toFixed(2)} × {item.quantity} {item.unit || 'piece'}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      ₹{subtotal.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Step 2: Fulfillment Method */}
          <Card title="2. Choose Fulfillment Method">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                gap: '1rem',
                marginBottom: '1rem',
              }}
            >
              {/* Pickup Option */}
              <div
                onClick={() => setFulfillmentType('PICKUP')}
                style={{
                  border: `2px solid ${fulfillmentType === 'PICKUP' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                  backgroundColor: fulfillmentType === 'PICKUP' ? 'var(--primary-50)' : 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: fulfillmentType === 'PICKUP' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                      color: fulfillmentType === 'PICKUP' ? '#fff' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Store size={18} />
                  </div>
                  <Badge variant="success">FREE (₹0)</Badge>
                </div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Store Counter Pickup
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Reserve your items and skip the shop counter rush. Pick up using a designated time slot.
                </p>
              </div>

              {/* Delivery Option */}
              <div
                onClick={() => setFulfillmentType('DELIVERY')}
                style={{
                  border: `2px solid ${fulfillmentType === 'DELIVERY' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                  backgroundColor: fulfillmentType === 'DELIVERY' ? 'var(--primary-50)' : 'var(--bg-surface)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '1.25rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      backgroundColor: fulfillmentType === 'DELIVERY' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                      color: fulfillmentType === 'DELIVERY' ? '#fff' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Truck size={18} />
                  </div>
                  <Badge variant="primary">₹15 Delivery</Badge>
                </div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                  Campus Hostel Delivery
                </h4>
                <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  Delivered right to your hostel room or department building gate by campus delivery partners.
                </p>
              </div>
            </div>

            {/* Step 2A: Pickup Slot Selection */}
            {fulfillmentType === 'PICKUP' && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Clock size={18} color="var(--primary-600)" />
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Select Counter Pickup Time Window
                  </h4>
                </div>

                {loadingSlots ? (
                  <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Loading available store pickup windows...
                  </div>
                ) : slotsError ? (
                  <div style={{ color: 'var(--danger-600)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
                    {slotsError}
                  </div>
                ) : pickupSlots.length === 0 ? (
                  <div
                    style={{
                      padding: '1rem',
                      backgroundColor: 'var(--bg-surface-secondary)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.875rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    No designated pickup slots currently available for this shop. Please choose delivery or contact the shop.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    {pickupSlots.map((slot) => {
                      const isSelected = selectedSlotId === slot.id;
                      const freeSpots = slot.capacity - slot.booked_count;
                      const isFull = !slot.is_available || freeSpots <= 0;

                      return (
                        <div
                          key={slot.id}
                          onClick={() => {
                            if (!isFull) setSelectedSlotId(slot.id);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.75rem 1rem',
                            borderRadius: 'var(--radius-md)',
                            border: `1.5px solid ${isSelected ? 'var(--primary-600)' : 'var(--border-light)'}`,
                            backgroundColor: isSelected
                              ? 'var(--primary-50)'
                              : isFull
                              ? 'var(--bg-surface-secondary)'
                              : 'var(--bg-surface)',
                            cursor: isFull ? 'not-allowed' : 'pointer',
                            opacity: isFull ? 0.6 : 1,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <input
                              type="radio"
                              name="pickupSlot"
                              checked={isSelected}
                              disabled={isFull}
                              onChange={() => setSelectedSlotId(slot.id)}
                              style={{ cursor: isFull ? 'not-allowed' : 'pointer' }}
                            />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                                {slot.date} • {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {slot.shop_name || cartShop.name} Counter
                              </div>
                            </div>
                          </div>

                          <div>
                            {isFull ? (
                              <Badge variant="danger">Full Capacity</Badge>
                            ) : (
                              <Badge variant={freeSpots <= 3 ? 'warning' : 'neutral'}>
                                {freeSpots} slots remaining
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {formErrors.pickup_slot && (
                  <p style={{ color: 'var(--danger-500)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
                    {formErrors.pickup_slot}
                  </p>
                )}
              </div>
            )}

            {/* Step 2B: Delivery Address Details */}
            {fulfillmentType === 'DELIVERY' && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <MapPin size={18} color="var(--primary-600)" />
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Campus / Hostel Delivery Address
                    </h4>
                  </div>
                  <Link
                    to="/student/addresses"
                    target="_blank"
                    style={{ fontSize: '0.8rem', color: 'var(--primary-600)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    + Manage Addresses
                  </Link>
                </div>

                {/* Map Location Pinpoint Action */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 1rem',
                    backgroundColor: selectedCoords ? '#f0fdf4' : 'var(--bg-surface-secondary, #f8fafc)',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: `1px solid ${selectedCoords ? '#bbf7d0' : 'var(--border-light, #e2e8f0)'}`,
                    marginBottom: '1.25rem',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <MapPin size={18} color={selectedCoords ? '#16a34a' : 'var(--primary-600)'} />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: selectedCoords ? '#15803d' : 'var(--text-primary)' }}>
                        {selectedCoords ? 'Exact Delivery GPS Pin Confirmed' : 'Pinpoint on Campus Map (Optional)'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: selectedCoords ? '#166534' : 'var(--text-secondary)' }}>
                        {selectedCoords
                          ? `Lat: ${selectedCoords.latitude.toFixed(5)}, Lng: ${selectedCoords.longitude.toFixed(5)}`
                          : 'Helps the delivery courier navigate directly to your hostel wing or gate'}
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant={selectedCoords ? 'secondary' : 'outline'}
                    size="sm"
                    leftIcon={MapPin}
                    onClick={() => setLocationPickerOpen(true)}
                  >
                    {selectedCoords ? 'Change Pin on Map' : 'Select on Map'}
                  </Button>
                </div>

                {savedAddresses.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                      Choose from Saved Campus Locations:
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
                      {savedAddresses.map((addr) => {
                        const isSelected = selectedAddressId === addr.id;
                        return (
                          <div
                            key={addr.id}
                            onClick={() => selectSavedAddress(addr)}
                            style={{
                              padding: '0.75rem',
                              borderRadius: 'var(--radius-md)',
                              border: `1.5px solid ${isSelected ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                              backgroundColor: isSelected ? 'var(--primary-50)' : 'var(--bg-surface)',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: isSelected ? 'var(--primary-700)' : 'var(--text-primary)' }}>
                                {addr.label}
                              </span>
                              {addr.is_default && (
                                <Badge variant="primary" size="sm">Default</Badge>
                              )}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              {addr.hostel_block}, Rm {addr.room_number}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Student / Recipient Name *
                      </label>
                      <input
                        type="text"
                        name="fullName"
                        value={addressForm.fullName}
                        onChange={handleAddressChange}
                        placeholder="e.g. Alex Kumar"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${formErrors.fullName ? 'var(--danger-500)' : 'var(--border-medium)'}`,
                          fontSize: '0.9rem',
                        }}
                      />
                      {formErrors.fullName && (
                        <span style={{ color: 'var(--danger-500)', fontSize: '0.75rem' }}>{formErrors.fullName}</span>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Contact Phone *
                      </label>
                      <input
                        type="text"
                        name="phoneNumber"
                        value={addressForm.phoneNumber}
                        onChange={handleAddressChange}
                        placeholder="e.g. +91 98765 43210"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${formErrors.phoneNumber ? 'var(--danger-500)' : 'var(--border-medium)'}`,
                          fontSize: '0.9rem',
                        }}
                      />
                      {formErrors.phoneNumber && (
                        <span style={{ color: 'var(--danger-500)', fontSize: '0.75rem' }}>{formErrors.phoneNumber}</span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Hostel / Academic Block *
                      </label>
                      <input
                        type="text"
                        name="hostelName"
                        value={addressForm.hostelName}
                        onChange={handleAddressChange}
                        placeholder="e.g. Ganga Hostel / Aryabhatta Block"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${formErrors.hostelName ? 'var(--danger-500)' : 'var(--border-medium)'}`,
                          fontSize: '0.9rem',
                        }}
                      />
                      {formErrors.hostelName && (
                        <span style={{ color: 'var(--danger-500)', fontSize: '0.75rem' }}>{formErrors.hostelName}</span>
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                        Room / Door No *
                      </label>
                      <input
                        type="text"
                        name="roomNumber"
                        value={addressForm.roomNumber}
                        onChange={handleAddressChange}
                        placeholder="e.g. Room 204"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.85rem',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${formErrors.roomNumber ? 'var(--danger-500)' : 'var(--border-medium)'}`,
                          fontSize: '0.9rem',
                        }}
                      />
                      {formErrors.roomNumber && (
                        <span style={{ color: 'var(--danger-500)', fontSize: '0.75rem' }}>{formErrors.roomNumber}</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.825rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                      Campus Landmark / Directions (Optional)
                    </label>
                    <input
                      type="text"
                      name="landmark"
                      value={addressForm.landmark}
                      onChange={handleAddressChange}
                      placeholder="e.g. Near West Gate, Beside Dining Hall"
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border-medium)',
                        fontSize: '0.9rem',
                      }}
                    />
                  </div>
                </div>

                {/* Delivery Time Slot Selection */}
                <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Clock size={18} color="var(--primary-600)" />
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Select Campus Delivery Window
                      </h4>
                    </div>
                    {deliveryChargeInfo.is_free ? (
                      <Badge variant="success">🎉 Free Delivery Unlocked</Badge>
                    ) : (
                      <Badge variant="primary">₹{deliveryChargeInfo.delivery_charge} Delivery</Badge>
                    )}
                  </div>

                  {loadingDeliverySlots ? (
                    <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      Loading available delivery windows...
                    </div>
                  ) : deliverySlots.length === 0 ? (
                    <div style={{ padding: '0.75rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Standard Campus Doorstep Delivery (Estimated: ~25-45 minutes after merchant preparation)
                    </div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                      {deliverySlots.map((slot) => {
                        const isSelected = selectedDeliverySlotId === slot.id;
                        const freeSpots = slot.capacity - slot.booked_count;
                        const isFull = !slot.is_available || freeSpots <= 0;
                        return (
                          <div
                            key={slot.id}
                            onClick={() => !isFull && setSelectedDeliverySlotId(slot.id)}
                            style={{
                              padding: '0.75rem',
                              borderRadius: 'var(--radius-md)',
                              border: `1.5px solid ${isSelected ? 'var(--primary-600)' : isFull ? 'var(--border-light)' : 'var(--border-medium)'}`,
                              backgroundColor: isSelected ? 'var(--primary-50)' : isFull ? 'var(--bg-surface-secondary)' : 'var(--bg-surface)',
                              cursor: isFull ? 'not-allowed' : 'pointer',
                              opacity: isFull ? 0.6 : 1,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: isSelected ? 'var(--primary-700)' : 'var(--text-primary)' }}>
                              {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.35rem' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{slot.date}</span>
                              <Badge size="sm" variant={isFull ? 'danger' : freeSpots <= 3 ? 'warning' : 'neutral'}>
                                {isFull ? 'Full' : `${freeSpots} slots`}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Step 3: Payment Method & Notes */}
          <Card title="3. Payment Method & Instructions">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Select Payment Method
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {/* Option 1: Online Payment */}
                  <div
                    onClick={() => setPaymentMethod('ONLINE')}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      padding: '0.85rem 1rem',
                      border: `1.5px solid ${paymentMethod === 'ONLINE' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                      backgroundColor: paymentMethod === 'ONLINE' ? 'var(--primary-50)' : 'var(--bg-surface)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      id="payment_online"
                      name="payment_method"
                      value="ONLINE"
                      checked={paymentMethod === 'ONLINE'}
                      onChange={() => setPaymentMethod('ONLINE')}
                    />
                    <label htmlFor="payment_online" style={{ flex: 1, cursor: 'pointer' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                          Online Payment (UPI, Cards, Net Banking)
                        </span>
                        <Badge size="sm" variant="primary">Instant</Badge>
                      </div>
                      <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Pay securely online via campus test/sandbox gateway with simulated authorization.
                      </p>
                    </label>
                  </div>

                  {/* Option 2: Cash on Delivery (Delivery only) */}
                  {fulfillmentType === 'DELIVERY' && (
                    <div
                      onClick={() => setPaymentMethod('COD')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.85rem 1rem',
                        border: `1.5px solid ${paymentMethod === 'COD' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                        backgroundColor: paymentMethod === 'COD' ? 'var(--primary-50)' : 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        id="payment_cod"
                        name="payment_method"
                        value="COD"
                        checked={paymentMethod === 'COD'}
                        onChange={() => setPaymentMethod('COD')}
                      />
                      <label htmlFor="payment_cod" style={{ flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                          Cash on Delivery (COD)
                        </span>
                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Pay cash or scan courier UPI QR code upon doorstep package handover.
                        </p>
                      </label>
                    </div>
                  )}

                  {/* Option 3: Cash on Pickup (Pickup only) */}
                  {fulfillmentType === 'PICKUP' && (
                    <div
                      onClick={() => setPaymentMethod('PICKUP_CASH')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.85rem 1rem',
                        border: `1.5px solid ${paymentMethod === 'PICKUP_CASH' ? 'var(--primary-600)' : 'var(--border-medium)'}`,
                        backgroundColor: paymentMethod === 'PICKUP_CASH' ? 'var(--primary-50)' : 'var(--bg-surface)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        id="payment_pickup_cash"
                        name="payment_method"
                        value="PICKUP_CASH"
                        checked={paymentMethod === 'PICKUP_CASH'}
                        onChange={() => setPaymentMethod('PICKUP_CASH')}
                      />
                      <label htmlFor="payment_pickup_cash" style={{ flex: 1, cursor: 'pointer' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.925rem', color: 'var(--text-primary)' }}>
                          Pay at Counter (Cash on Pickup)
                        </span>
                        <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          Pay with cash or store UPI QR code when collecting items at the merchant desk.
                        </p>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Order Notes / Delivery Instructions (Optional)
                </label>
                <textarea
                  rows="2"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="e.g. Please call when outside the hostel gate; leave with security if unavailable."
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>
            </div>
          </Card>
        </div>

        {/* Order Summary & Placement Sidebar */}
        <div>
          <Card title="Order Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.925rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Items Subtotal ({itemCount} items)</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ₹{cartTotal.toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Fulfillment ({fulfillmentType === 'PICKUP' ? 'Counter Pickup' : 'Campus Delivery'})</span>
                <span style={{ fontWeight: 600, color: estimatedDeliveryFee === 0 ? 'var(--success-600)' : 'var(--text-primary)' }}>
                  {estimatedDeliveryFee === 0 ? 'FREE' : `₹${estimatedDeliveryFee.toFixed(2)}`}
                </span>
              </div>

              {/* Coupon Code Input & Applied State */}
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <Tag size={16} color="var(--primary-600)" />
                  <span>Promo Code & Coupons</span>
                </div>
                
                {appliedCoupon ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#ecfdf5', padding: '6px 10px', borderRadius: '6px', border: '1px solid #a7f3d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={16} color="#059669" />
                      <span style={{ fontWeight: 700, fontFamily: 'monospace', color: '#065f46' }}>
                        {appliedCoupon.code}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#047857' }}>
                        (-₹{couponDiscount.toFixed(2)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveCoupon}
                      style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                      title="Remove coupon"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleApplyCoupon} style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text"
                      placeholder="e.g. CAMPUS20"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      style={{
                        flex: 1,
                        padding: '6px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-medium)',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        textTransform: 'uppercase'
                      }}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={validatingCoupon || !couponCode.trim()}
                    >
                      {validatingCoupon ? 'Checking...' : 'Apply'}
                    </Button>
                  </form>
                )}

                {couponError && (
                  <div style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '6px' }}>
                    {couponError}
                  </div>
                )}
                {couponSuccess && !couponError && (
                  <div style={{ color: '#059669', fontSize: '0.75rem', marginTop: '6px' }}>
                    {couponSuccess}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: couponDiscount > 0 ? '#059669' : 'var(--text-secondary)' }}>
                <span>Coupon Discount</span>
                <span style={{ fontWeight: 600 }}>
                  {couponDiscount > 0 ? `-₹${couponDiscount.toFixed(2)}` : '₹0.00'}
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
                <span>Final Total</span>
                <span style={{ color: 'var(--primary-600)' }}>
                  ₹{estimatedFinalTotal.toFixed(2)}
                </span>
              </div>

              {/* Security & Price Rule Note */}
              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  fontSize: '0.785rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.45rem',
                  lineHeight: 1.4,
                  marginTop: '0.5rem',
                }}
              >
                <ShieldCheck size={16} color="var(--primary-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>
                  <strong>Authoritative Server Pricing:</strong> All line item prices, stock availability, and delivery charges are re-validated atomically by the backend upon placing your order.
                </span>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={isSubmitting}
                onClick={handlePlaceOrder}
              >
                {isSubmitting ? 'Placing Order...' : `Place Order • ₹${estimatedFinalTotal.toFixed(2)}`}
              </Button>

              <Link to="/student/cart">
                <Button variant="outline" size="sm" fullWidth>
                  Return to Cart
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>

      {/* Step 25: Test/Sandbox Online Payment Modal */}
      {showSandboxModal && activePaymentSession && createdOrderObj && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1050,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--border-medium)',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CreditCard size={22} color="var(--primary-600)" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Online Payment Gateway
                </h3>
              </div>
              <Badge variant="warning">SANDBOX / TEST MODE</Badge>
            </div>

            {/* Sandbox Notice Banner */}
            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: '#eff6ff',
                borderRadius: 'var(--radius-md)',
                border: '1px solid #bfdbfe',
                fontSize: '0.825rem',
                color: '#1e40af',
                marginBottom: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <ShieldCheck size={18} color="#2563eb" style={{ flexShrink: 0 }} />
              <span>
                <strong>Test Environment:</strong> No real money is charged. You can simulate instant authorization or payment failure.
              </span>
            </div>

            {/* Payment Summary */}
            <div
              style={{
                padding: '1rem',
                backgroundColor: 'var(--bg-surface-secondary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '1.25rem',
                fontSize: '0.875rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Order Reference:</span>
                <span style={{ fontWeight: 700 }}>#{createdOrderObj.order_number ? createdOrderObj.order_number.slice(0, 8) : createdOrderObj.id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Merchant:</span>
                <span style={{ fontWeight: 600 }}>{cartShop?.name || 'Campus Stationery'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Gateway Session:</span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                  {activePaymentSession.gateway_order_id ? activePaymentSession.gateway_order_id.slice(0, 18) + '...' : 'SESSION_MOCK'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '0.5rem', borderTop: '1px solid var(--border-light)', marginTop: '0.5rem' }}>
                <span style={{ fontWeight: 700 }}>Authoritative Amount:</span>
                <span style={{ fontWeight: 800, fontSize: '1.2rem', color: 'var(--primary-600)' }}>
                  ₹{parseFloat(activePaymentSession.amount || createdOrderObj.total_amount).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Simulation Error */}
            {sandboxError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {sandboxError}
              </div>
            )}

            {/* Sandbox Simulation Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={verifyingPayment}
                onClick={async () => {
                  setVerifyingPayment(true);
                  setSandboxError('');
                  try {
                    const res = await paymentService.verifyPayment(activePaymentSession.id, {
                      gateway_order_id: activePaymentSession.gateway_order_id,
                      gateway_payment_id: `mock_pay_${Date.now()}`,
                      gateway_signature: `mock_sig_${Date.now()}`,
                    });
                    if (res.success) {
                      clearCart();
                      setShowSandboxModal(false);
                      navigate(`/student/orders/${createdOrderObj.id || createdOrderObj.order_number}`, {
                        state: { isNewOrder: true, order: res.order || createdOrderObj, paymentSuccess: true },
                        replace: true,
                      });
                    }
                  } catch (err) {
                    setSandboxError(err.response?.data?.error || 'Payment verification failed.');
                  } finally {
                    setVerifyingPayment(false);
                  }
                }}
              >
                {verifyingPayment ? 'Verifying with Gateway...' : '💳 Pay Now (Simulate Successful Payment)'}
              </Button>

              <Button
                variant="outline"
                size="md"
                fullWidth
                disabled={verifyingPayment}
                onClick={async () => {
                  setVerifyingPayment(true);
                  setSandboxError('');
                  try {
                    await paymentService.verifyPayment(activePaymentSession.id, {
                      simulate_failure: true,
                      gateway_signature: 'invalid_signature',
                    });
                  } catch (err) {
                    // Handled as intentional failure
                  } finally {
                    setVerifyingPayment(false);
                    clearCart();
                    setShowSandboxModal(false);
                    navigate(`/student/orders/${createdOrderObj.id || createdOrderObj.order_number}`, {
                      state: { isNewOrder: true, order: createdOrderObj, paymentFailed: true },
                      replace: true,
                    });
                  }
                }}
              >
                ⚠️ Simulate Payment Decline / Failure
              </Button>

              <Button
                variant="ghost"
                size="sm"
                fullWidth
                disabled={verifyingPayment}
                onClick={() => {
                  clearCart();
                  setShowSandboxModal(false);
                  navigate(`/student/orders/${createdOrderObj.id || createdOrderObj.order_number}`, {
                    state: { isNewOrder: true, order: createdOrderObj },
                    replace: true,
                  });
                }}
              >
                Cancel & Pay Later
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery Location Picker Modal */}
      <LocationPickerModal
        isOpen={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        onConfirm={handleConfirmLocation}
        initialCoords={selectedCoords}
        initialAddress={addressForm.landmark}
        title="Select Campus Delivery Drop-Off Location"
        subtitle="Click or drag pin to your hostel entrance, room block, or department building"
      />
    </div>
  );
};

export default StudentCheckout;

