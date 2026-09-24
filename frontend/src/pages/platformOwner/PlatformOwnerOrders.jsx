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
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

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

      const data = await platformOwnerService.getOrders(params);
      setOrders(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load orders feed:', err);
      setError('Unable to load global orders stream.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [statusFilter, typeFilter]);

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
    if (!orderToCancel || !cancelReason.trim()) return;

    setCancelling(true);
    try {
      await platformOwnerService.cancelOrder(orderToCancel.id, cancelReason);
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
      alert('Unable to cancel order: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Campus Orders Stream"
        subtitle="Global real-time feed of all stationery, Xerox, and combined campus orders"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
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
            <Button type="submit" variant="outline" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
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
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Types</option>
              <option value="STATIONERY">Stationery</option>
              <option value="PRINTING">Printing / Xerox</option>
              <option value="COMBINED">Combined</option>
            </select>

            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadOrders}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Campus Orders Feed (${orders.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Streaming orders from database..." />
          </div>
        ) : orders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No orders match the selected filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Order Number</th>
                  <th>Customer</th>
                  <th>Shop</th>
                  <th>Type & Fulfillment</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Order Status</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((ord) => (
                  <tr key={ord.id}>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>
                        {String(ord.order_number).slice(0, 8)}...
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{ord.customer_name || 'Student'}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ord.customer_email}</div>
                    </td>
                    <td>{ord.shop_name}</td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span style={{ fontSize: '0.8rem' }}>{ord.order_type}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ord.fulfillment_type}</span>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>₹{ord.total_amount}</span>
                    </td>
                    <td>
                      <Badge variant={ord.payment_status === 'PAID' ? 'success' : 'warning'}>
                        {ord.payment_status}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={
                          ord.status === 'COMPLETED'
                            ? 'success'
                            : ord.status === 'CANCELLED'
                            ? 'danger'
                            : 'primary'
                        }
                      >
                        {ord.status}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(ord.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={Eye}
                          onClick={() => handleViewDetails(ord)}
                        >
                          Details
                        </Button>
                        {ord.status !== 'COMPLETED' && ord.status !== 'CANCELLED' && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => openCancelModal(ord)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
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
          title={`Order #${String(selectedOrder.order_number).slice(0, 8)} Details`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.875rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
                backgroundColor: 'var(--bg-surface-secondary)',
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Customer:</span>
                <div style={{ fontWeight: 600 }}>{selectedOrder.customer_name} ({selectedOrder.customer_email})</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Store:</span>
                <div style={{ fontWeight: 600 }}>{selectedOrder.shop_name}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Payment Method:</span>
                <div style={{ fontWeight: 600 }}>{selectedOrder.payment_method} ({selectedOrder.payment_status})</div>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Current Status:</span>
                <div>
                  <Badge variant={selectedOrder.status === 'COMPLETED' ? 'success' : 'primary'}>
                    {selectedOrder.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Items list */}
            <div>
              <h4 style={{ fontWeight: 700, margin: '0 0 0.5rem 0' }}>Order Line Items</h4>
              {selectedOrder.items && selectedOrder.items.length > 0 ? (
                <div style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%', fontSize: '0.825rem' }}>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedOrder.items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.product_name}</td>
                          <td>{it.product_sku || 'N/A'}</td>
                          <td>{it.quantity}</td>
                          <td>₹{it.unit_price}</td>
                          <td style={{ fontWeight: 600 }}>₹{it.total_price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No individual item details.</div>
              )}
            </div>

            {/* Financial breakdown */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                borderTop: '1px solid var(--border-light)',
                paddingTop: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Subtotal:</span>
                <span>₹{selectedOrder.subtotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Discount:</span>
                <span style={{ color: 'var(--success-700)' }}>-₹{selectedOrder.discount_amount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Delivery Fee:</span>
                <span>₹{selectedOrder.delivery_fee}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: '1rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem' }}>
                <span>Final Total:</span>
                <span style={{ color: 'var(--primary-700)' }}>₹{selectedOrder.total_amount}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Order Modal */}
      {cancelModalOpen && (
        <Modal
          isOpen={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          title="Administrative Order Cancellation"
        >
          <form onSubmit={handleConfirmCancel}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Are you sure you want to cancel order #{String(orderToCancel?.order_number).slice(0, 8)}?
              This will release all allocated product reservations and record an audit log event.
            </p>

            <Input
              label="Mandatory Reason for Cancellation"
              required
              placeholder="e.g. Student requested cancellation / merchant inventory unavailable"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <Button type="button" variant="outline" onClick={() => setCancelModalOpen(false)}>
                Back
              </Button>
              <Button type="submit" variant="danger" isLoading={cancelling}>
                Confirm Cancel Order
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default PlatformOwnerOrders;
