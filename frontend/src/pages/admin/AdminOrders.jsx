import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Search,
  Filter,
  Eye,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  X,
  Truck,
  Store,
  User,
  CreditCard,
  MapPin,
  Calendar,
} from 'lucide-react';
import orderService from '../../services/orderService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [fulfillmentFilter, setFulfillmentFilter] = useState('ALL');

  // Selected Order Detail Modal
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  // Cancellation Modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (typeFilter !== 'ALL') params.order_type = typeFilter;
      if (fulfillmentFilter !== 'ALL') params.fulfillment_type = fulfillmentFilter;

      const data = await orderService.getOrders(params);
      setOrders(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load orders feed:', err);
      setError('Unable to load campus orders feed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter, typeFilter, fulfillmentFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadOrders();
  };

  const handleViewDetails = (ord) => {
    setSelectedOrder(ord);
    setDetailModalOpen(true);
  };

  const openCancelModal = (ord) => {
    setOrderToCancel(ord);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async (e) => {
    e.preventDefault();
    if (!orderToCancel) return;

    setCancelling(true);
    try {
      // First try cancelOrder (for PENDING), fallback to updateOrderStatus('CANCELLED')
      try {
        await orderService.cancelOrder(orderToCancel.id);
      } catch (cancelErr) {
        await orderService.updateOrderStatus(orderToCancel.id, 'CANCELLED');
      }

      setOrders((prev) =>
        prev.map((o) => (o.id === orderToCancel.id ? { ...o, status: 'CANCELLED' } : o))
      );
      setCancelModalOpen(false);
      setOrderToCancel(null);
      if (selectedOrder && selectedOrder.id === orderToCancel.id) {
        setSelectedOrder((prev) => ({ ...prev, status: 'CANCELLED' }));
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      alert('Unable to cancel order: ' + (err.response?.data?.message || err.response?.data?.detail || err.message));
    } finally {
      setCancelling(false);
    }
  };

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'PENDING': return 'warning';
      case 'CONFIRMED': return 'info';
      case 'PREPARING': return 'info';
      case 'READY': return 'primary';
      case 'OUT_FOR_DELIVERY': return 'info';
      case 'DELIVERED':
      case 'PICKED_UP':
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  };

  // Filter in memory for search query
  const filteredOrders = orders.filter((ord) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const num = String(ord.order_number || '').toLowerCase();
    const custName = (ord.customer_name || ord.customer?.name || ord.customer?.username || '').toLowerCase();
    const custEmail = (ord.customer_email || ord.customer?.email || '').toLowerCase();
    const shopName = (ord.shop_name || ord.shop?.name || '').toLowerCase();
    return num.includes(q) || custName.includes(q) || custEmail.includes(q) || shopName.includes(q);
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Campus Orders Feed"
          subtitle="Real-time global order stream across all campus stationery shops and printing queues"
        />
        <Button variant="outline" size="sm" onClick={loadOrders} icon={RefreshCw}>
          Refresh
        </Button>
      </div>

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Search and Filters */}
      <Card padding="1rem">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <Input
                type="text"
                placeholder="Search orders by Order #, student name, email, shop..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="primary">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PREPARING">Preparing</option>
              <option value="READY">Ready</option>
              <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
              <option value="DELIVERED">Delivered</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Order Types</option>
              <option value="STATIONERY">Stationery</option>
              <option value="PRINTING">Printing / Xerox</option>
              <option value="COMBINED">Combined</option>
            </select>

            <select
              value={fulfillmentFilter}
              onChange={(e) => setFulfillmentFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Fulfillment</option>
              <option value="PICKUP">Counter Pickup</option>
              <option value="DELIVERY">Campus Delivery</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Orders Table */}
      <Card padding="0">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Streaming orders from database..." />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #6b7280)' }}>
            <ShoppingBag size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>No orders found</h4>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>No orders match the selected filters or query.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Order #</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Customer</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Shop</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Fulfillment</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Amount</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Payment</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((ord) => {
                  const customerName = ord.customer_name || ord.customer?.name || ord.customer?.username || 'Student';
                  const shopName = ord.shop_name || ord.shop?.name || `Shop #${ord.shop}`;

                  return (
                    <tr
                      key={ord.id}
                      style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary-600, #2563eb)', fontFamily: 'monospace' }}>
                          #{String(ord.order_number).slice(0, 8)}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{customerName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          {ord.customer_email || ord.customer?.email}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                          <Store size={14} color="var(--primary-600, #2563eb)" />
                          <span style={{ fontWeight: 500 }}>{shopName}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary, #f3f4f6)', fontSize: '0.75rem', fontWeight: 500 }}>
                          {ord.fulfillment_type === 'DELIVERY' ? 'Doorstep Delivery' : 'Store Pickup'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                        ₹{Number(ord.total_amount || ord.final_amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant={ord.payment_status === 'PAID' ? 'success' : 'warning'}>
                          {ord.payment_status || 'PENDING'}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <Badge variant={getStatusBadgeVariant(ord.status)}>
                          {ord.status}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(ord)}
                            title="View Order Details"
                          >
                            <Eye size={16} />
                          </Button>
                          {ord.status !== 'CANCELLED' && ord.status !== 'COMPLETED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openCancelModal(ord)}
                              style={{ color: '#dc2626' }}
                              title="Cancel Order"
                            >
                              <XCircle size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Order Details Modal */}
      {detailModalOpen && selectedOrder && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Order #${selectedOrder.order_number}`}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)' }}>Order Date: </span>
                <strong style={{ fontSize: '0.875rem' }}>{new Date(selectedOrder.created_at).toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Badge variant={getStatusBadgeVariant(selectedOrder.status)}>
                  {selectedOrder.status}
                </Badge>
                <Badge variant={selectedOrder.payment_status === 'PAID' ? 'success' : 'warning'}>
                  {selectedOrder.payment_status}
                </Badge>
              </div>
            </div>

            {/* Grid of info: Customer, Shop, Fulfillment */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '0.875rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
                  <User size={16} color="var(--primary-600, #2563eb)" />
                  Customer Information
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #4b5563)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Name:</strong> {selectedOrder.customer_name || selectedOrder.customer?.name || 'Student'}</div>
                  <div><strong>Email:</strong> {selectedOrder.customer_email || selectedOrder.customer?.email || 'N/A'}</div>
                  <div><strong>Phone:</strong> {selectedOrder.customer_phone || selectedOrder.customer?.phone_number || 'N/A'}</div>
                </div>
              </div>

              <div style={{ padding: '0.875rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
                  <Store size={16} color="var(--primary-600, #2563eb)" />
                  Merchant / Shop
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #4b5563)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Shop:</strong> {selectedOrder.shop_name || selectedOrder.shop?.name || `Shop #${selectedOrder.shop}`}</div>
                  <div><strong>Location:</strong> {selectedOrder.shop?.campus_location || 'Campus Store'}</div>
                </div>
              </div>

              <div style={{ padding: '0.875rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
                  <Truck size={16} color="var(--primary-600, #2563eb)" />
                  Fulfillment & Delivery
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #4b5563)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Type:</strong> {selectedOrder.fulfillment_type}</div>
                  {selectedOrder.delivery_address && (
                    <div><strong>Address:</strong> {selectedOrder.delivery_address}</div>
                  )}
                  {selectedOrder.pickup_slot_time && (
                    <div><strong>Slot:</strong> {selectedOrder.pickup_slot_time}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Items Table */}
            <div>
              <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
                Order Items ({selectedOrder.items?.length || 0})
              </h4>
              <div style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '8px', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary, #f9fafb)', borderBottom: '1px solid var(--border-color, #e5e7eb)', textAlign: 'left' }}>
                      <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600 }}>Item</th>
                      <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600 }}>Quantity</th>
                      <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600 }}>Unit Price</th>
                      <th style={{ padding: '0.625rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedOrder.items && selectedOrder.items.length > 0 ? (
                      selectedOrder.items.map((it, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)' }}>
                          <td style={{ padding: '0.625rem 0.75rem', fontWeight: 500 }}>
                            {it.product_name || it.product?.name || `Product #${it.product}`}
                          </td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>{it.quantity}</td>
                          <td style={{ padding: '0.625rem 0.75rem' }}>₹{Number(it.unit_price || it.price || 0).toFixed(2)}</td>
                          <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                            ₹{(Number(it.quantity) * Number(it.unit_price || it.price || 0)).toFixed(2)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted, #6b7280)' }}>
                          Document printing or service order items
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--bg-secondary, #f9fafb)', fontWeight: 700 }}>
                      <td colSpan={3} style={{ padding: '0.75rem', textAlign: 'right' }}>Grand Total:</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: 'var(--primary-600, #2563eb)', fontSize: '1rem' }}>
                        ₹{Number(selectedOrder.total_amount || selectedOrder.final_amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              {selectedOrder.status !== 'CANCELLED' && selectedOrder.status !== 'COMPLETED' && (
                <Button variant="danger" onClick={() => openCancelModal(selectedOrder)}>
                  Cancel Order
                </Button>
              )}
              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelModalOpen && orderToCancel && (
        <Modal
          isOpen={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title="Cancel Order"
          size="sm"
        >
          <form onSubmit={handleConfirmCancel} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#dc2626' }}>
              <AlertTriangle size={24} />
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Confirm Cancellation</div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #4b5563)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to cancel Order <strong>#{String(orderToCancel.order_number).slice(0, 8)}</strong>?
              Reserved inventory stock will be returned to the merchant's store.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setCancelModalOpen(false)} disabled={cancelling}>
                Close
              </Button>
              <Button variant="danger" type="submit" disabled={cancelling}>
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default AdminOrders;
