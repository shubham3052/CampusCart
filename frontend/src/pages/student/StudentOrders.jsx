import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Package,
  Clock,
  CheckCircle2,
  Truck,
  ChevronRight,
  ShoppingBag,
  Store,
  Calendar,
  XCircle,
  Filter,
  RefreshCw,
} from 'lucide-react';
import orderService from '../../services/orderService';
import productService from '../../services/productService';
import { useCart } from '../../context/CartContext';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';

const StudentOrders = () => {
  const { addToCart } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [reorderingOrderId, setReorderingOrderId] = useState(null);
  const [reorderStatusMsg, setReorderStatusMsg] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await orderService.getOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load orders:', err);
      setError('Unable to load orders from the server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="warning">Order Placed</Badge>;
      case 'CONFIRMED':
        return <Badge variant="primary">Confirmed</Badge>;
      case 'PREPARING':
        return <Badge variant="primary">Packing Items</Badge>;
      case 'READY_FOR_PICKUP':
        return <Badge variant="success">Ready for Pickup</Badge>;
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

  const filterOptions = [
    { label: 'All Orders', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'Cancelled', value: 'CANCELLED' },
  ];

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'ACTIVE') {
      return ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'].includes(ord.status);
    }
    if (statusFilter === 'COMPLETED') {
      return ['PICKED_UP', 'DELIVERED', 'COMPLETED'].includes(ord.status);
    }
    if (statusFilter === 'CANCELLED') {
      return ord.status === 'CANCELLED';
    }
    return true;
  });

  const handleReorderOrder = async (e, ord) => {
    e.stopPropagation();
    if (!ord.items || ord.items.length === 0) return;
    setReorderingOrderId(ord.id);
    setReorderStatusMsg(null);

    let addedCount = 0;
    let skippedCount = 0;
    let conflictOccurred = false;

    for (const item of ord.items) {
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
        console.warn('Reorder failed for item:', err);
        skippedCount++;
      }
    }

    setReorderingOrderId(null);
    if (conflictOccurred) {
      setReorderStatusMsg({
        type: 'warning',
        text: 'Your cart contains items from another merchant. Clear your cart first to reorder from this shop.',
      });
    } else if (addedCount > 0) {
      setReorderStatusMsg({
        type: 'success',
        text: `Added ${addedCount} stationery item${addedCount > 1 ? 's' : ''} to your cart.${skippedCount > 0 ? ` (${skippedCount} unavailable items skipped)` : ''}`,
      });
    } else {
      setReorderStatusMsg({
        type: 'danger',
        text: 'None of the items from this order are currently available in stock.',
      });
    }
  };

  if (loading) {
    return (
      <div className="page-container" style={{ maxWidth: '950px' }}>
        <PageHeader
          title="My Stationery Orders"
          subtitle="Real-time order tracking, counter pickups, and delivery status"
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: '110px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface-secondary)',
                animation: 'pulse 1.5s infinite ease-in-out',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '950px' }}>
      <PageHeader
        title="My Stationery Orders"
        subtitle="Track live order fulfillment, view pickup slots, and view receipts"
        actions={
          <Link to="/student/shops">
            <Button variant="primary" size="sm" leftIcon={ShoppingBag}>
              Shop Stationery
            </Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '0.75rem',
          overflowX: 'auto',
        }}
      >
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              backgroundColor: statusFilter === opt.value ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
              color: statusFilter === opt.value ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {/* Reorder Feedback Banner */}
      {reorderStatusMsg && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: reorderStatusMsg.type === 'success' ? '#ecfdf5' : reorderStatusMsg.type === 'warning' ? '#fffbeb' : '#fef2f2',
            border: `1px solid ${reorderStatusMsg.type === 'success' ? '#a7f3d0' : reorderStatusMsg.type === 'warning' ? '#fde68a' : '#fecaca'}`,
            borderRadius: 'var(--radius-md)',
            color: reorderStatusMsg.type === 'success' ? '#065f46' : reorderStatusMsg.type === 'warning' ? '#92400e' : '#dc2626',
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
          <span>{reorderStatusMsg.text}</span>
          {reorderStatusMsg.type === 'success' && (
            <Link to="/student/cart">
              <Button variant="outline" size="sm" style={{ backgroundColor: '#fff', color: '#065f46', borderColor: '#a7f3d0' }}>
                View Cart →
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Orders List or Empty State */}
      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={Package}
          title={statusFilter === 'ALL' ? 'No orders placed yet' : `No ${statusFilter.toLowerCase()} orders`}
          description={
            statusFilter === 'ALL'
              ? 'When you purchase pens, registers, or stationery, your orders will appear here for tracking.'
              : 'Try selecting a different filter above or browse available campus stationery.'
          }
          actionLabel="Explore Campus Shops"
          onAction={() => navigate('/student/shops')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredOrders.map((ord) => {
            const shortId = ord.order_number ? String(ord.order_number).slice(0, 8).toUpperCase() : `#${ord.id}`;
            const formattedDate = new Date(ord.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });
            const itemCount = ord.items?.length || 0;
            const itemsSummary = (ord.items || [])
              .slice(0, 2)
              .map((i) => `${i.product_details?.name || 'Product'} × ${i.quantity}`)
              .join(', ');
            const extraItems = itemCount > 2 ? ` + ${itemCount - 2} more` : '';

            return (
              <div
                key={ord.id}
                className="card card-interactive"
                onClick={() => navigate(`/student/orders/${ord.id || ord.order_number}`)}
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                  cursor: 'pointer',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Order #{shortId}
                    </h3>
                    {getStatusBadge(ord.status)}
                    <Badge variant={ord.fulfillment_type === 'DELIVERY' ? 'primary' : 'neutral'}>
                      {ord.fulfillment_type === 'DELIVERY' ? 'Doorstep Delivery' : 'Counter Pickup'}
                    </Badge>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.85rem', color: 'var(--primary-700)', fontWeight: 600, marginTop: '0.25rem' }}>
                    <Store size={15} />
                    <span>{ord.shop_name || 'Stationery Shop'}</span>
                  </div>

                  {itemsSummary && (
                    <div style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
                      {itemsSummary}
                      {extraItems}
                    </div>
                  )}

                  <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Placed on {formattedDate}
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1.25rem',
                    textAlign: 'right',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                      Total
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      ₹{parseFloat(ord.total_amount || 0).toFixed(2)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Button
                      variant="outline"
                      size="sm"
                      leftIcon={RefreshCw}
                      isLoading={reorderingOrderId === ord.id}
                      disabled={reorderingOrderId === ord.id}
                      onClick={(e) => handleReorderOrder(e, ord)}
                    >
                      Reorder
                    </Button>

                    <Button variant="outline" size="sm" rightIcon={ChevronRight}>
                      Details
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentOrders;
