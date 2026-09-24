import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Copy,
  Check,
  Calendar,
  Clock,
  Package,
  Store,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Percent,
  TrendingDown,
  ShieldCheck,
  ShoppingBag,
  FileText,
  UserCheck,
  ExternalLink,
} from 'lucide-react';
import bulkOrderService from '../../services/bulkOrderService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const StudentBulkOrderDetail = () => {
  const { bulkOrderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copied, setCopied] = useState(false);

  // Participant edit quantities modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editAllocations, setEditAllocations] = useState({});
  const [isUpdating, setIsUpdating] = useState(false);

  const loadOrderDetail = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await bulkOrderService.getBulkOrderById(bulkOrderId);
      setOrder(data);
      // Preload edit allocation state
      const initialAlloc = {};
      if (data?.my_allocations) {
        data.my_allocations.forEach((alloc) => {
          initialAlloc[alloc.bulk_order_item_id] = alloc.quantity;
        });
      }
      setEditAllocations(initialAlloc);
    } catch (err) {
      console.error('Failed to load bulk order:', err);
      setErrorMessage(
        err.response?.status === 404
          ? 'Bulk order not found or you do not have permission to view it.'
          : 'Unable to load bulk order details.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadOrderDetail();
  }, [bulkOrderId]);

  const handleCopyCode = () => {
    if (!order?.share_code) return;
    navigator.clipboard.writeText(order.share_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleConfirmOrder = async () => {
    if (!window.confirm('Are you sure you want to confirm this bulk order? Campus shop inventory will be atomically reserved immediately.')) {
      return;
    }
    setIsUpdating(true);
    try {
      const updated = await bulkOrderService.confirmBulkOrder(order.id);
      setOrder(updated);
      setActionSuccess('Bulk order confirmed! Inventory has been atomically reserved by the campus shop.');
      setTimeout(() => setActionSuccess(''), 5000);
    } catch (err) {
      console.error('Confirmation failed:', err);
      alert(err.response?.data?.error || 'Failed to confirm bulk order.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCancelOrder = async () => {
    const reason = window.prompt('Please enter a cancellation reason:');
    if (reason === null) return;
    setIsUpdating(true);
    try {
      const updated = await bulkOrderService.cancelBulkOrder(order.id, reason);
      setOrder(updated);
      setActionSuccess('Bulk order cancelled. Any reserved inventory was safely released.');
      setTimeout(() => setActionSuccess(''), 5000);
    } catch (err) {
      console.error('Cancellation failed:', err);
      alert(err.response?.data?.error || 'Failed to cancel bulk order.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleSaveAllocations = async (e) => {
    e.preventDefault();
    setIsUpdating(true);
    try {
      const itemsPayload = Object.entries(editAllocations).map(([itemId, qty]) => ({
        bulk_order_item_id: Number(itemId),
        quantity: Number(qty) || 1,
      }));

      await bulkOrderService.joinByCode(order.id, {
        share_code: order.share_code,
        items: itemsPayload,
      });

      setShowEditModal(false);
      loadOrderDetail();
      setActionSuccess('Your requested quantities have been updated!');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err) {
      console.error('Failed to update allocations:', err);
      alert(err.response?.data?.error || 'Failed to update quantities.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page-container" style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }

  if (errorMessage || !order) {
    return (
      <div className="page-container" style={{ maxWidth: '650px', marginTop: '3rem' }}>
        <ErrorMessage title="Order Not Found" message={errorMessage || 'Bulk order details could not be found.'} onRetry={loadOrderDetail} />
        <div style={{ marginTop: '1.25rem' }}>
          <Button variant="outline" onClick={() => navigate('/student/bulk-orders')} leftIcon={ArrowLeft}>
            Back to Bulk Orders
          </Button>
        </div>
      </div>
    );
  }

  const isOwner = order.is_owner;
  const isJoined = order.is_joined;
  const isOpen = order.status === 'OPEN';
  const isConfirmed = order.status === 'CONFIRMED';
  const participantLimit = order.participant_limit || 100;
  const activeCount = order.active_participants_count || 1;
  const participantPct = Math.min(100, Math.round((activeCount / participantLimit) * 100));

  return (
    <div className="page-container" style={{ maxWidth: '1080px', paddingBottom: '3rem' }}>
      {/* Back Button */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/student/bulk-orders')} leftIcon={ArrowLeft}>
          Back to Bulk Orders
        </Button>
      </div>

      {actionSuccess && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
          <CheckCircle2 size={18} /> {actionSuccess}
        </div>
      )}

      {/* Header Card */}
      <Card style={{ padding: '2rem', marginBottom: '1.5rem', borderRadius: 'var(--radius-xl)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <Badge variant={isOpen ? 'success' : isConfirmed ? 'primary' : 'secondary'} size="md">
                {order.status_display || order.status}
              </Badge>
              <Badge variant="outline" size="md">
                {order.order_type_display || order.order_type}
              </Badge>
              {order.stock_reserved && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600, color: '#047857', background: '#ecfdf5', padding: '0.2rem 0.5rem', borderRadius: '999px' }}>
                  <ShieldCheck size={13} /> Stock Atomically Reserved
                </span>
              )}
            </div>
            <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.65rem', fontWeight: 700 }}>
              {order.title}
            </h1>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Created by <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{order.creator_username}</span> • Fulfilled by{' '}
              <span style={{ fontWeight: 600, color: 'var(--primary-700)' }}>{order.shop_name}</span>
            </p>
          </div>

          {/* Share Code Card */}
          <div style={{ background: 'var(--bg-surface-secondary, #f3f4f6)', padding: '0.85rem 1.25rem', borderRadius: 'var(--radius-lg)', textAlign: 'center', border: '1px solid var(--border-medium)' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>
              Share Code to Join
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary-700)' }}>
                {order.share_code}
              </span>
              <button
                onClick={handleCopyCode}
                title="Copy share code"
                style={{ background: '#ffffff', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-sm)', padding: '0.35rem 0.5rem', cursor: 'pointer', display: 'flex', alignItems: 'center', color: copied ? '#059669' : 'var(--text-secondary)' }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        </div>

        {/* Member Progress & Deadlines */}
        <div style={{ background: 'var(--bg-surface-secondary, #f9fafb)', padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              <span>Participants</span>
              <span>{activeCount} / {order.participant_limit || 'No Limit'}</span>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--border-medium)', borderRadius: '999px', overflow: 'hidden' }}>
              <div style={{ width: `${participantPct}%`, height: '100%', background: 'var(--primary-600)', borderRadius: '999px' }} />
            </div>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Joining Deadline</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: order.is_expired ? '#dc2626' : 'var(--text-primary)' }}>
              {order.deadline ? new Date(order.deadline).toLocaleString() : 'No deadline set'}
              {order.is_expired && ' (Closed)'}
            </span>
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Fulfillment Method</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {order.fulfillment_type === 'DELIVERY' ? 'Hostel / Campus Delivery' : 'Store Counter Pickup'}
            </span>
          </div>
        </div>

        {/* Action Buttons for Owner / Members */}
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'flex-end', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
          {isJoined && isOpen && !order.is_expired && (
            <Button variant="outline" onClick={() => setShowEditModal(true)}>
              Update My Quantities
            </Button>
          )}

          {isOwner && isOpen && (
            <>
              <Button variant="danger" onClick={handleCancelOrder} disabled={isUpdating}>
                Cancel Order
              </Button>
              <Button variant="primary" onClick={handleConfirmOrder} disabled={isUpdating || order.items?.length === 0} leftIcon={ShieldCheck}>
                Confirm & Reserve Stock
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Grid: Order Items & Financials + Participants */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.5rem' }}>
        {/* Left Column: Aggregated Items & Volume Discounts */}
        <div>
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={18} style={{ color: 'var(--primary-600)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Aggregated Order Items</h3>
              </div>
              <Badge variant="secondary">{order.items?.length || 0} Products</Badge>
            </div>

            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem 0' }}>Item</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Total Qty</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Unit Price</th>
                    <th style={{ padding: '0.5rem 0', textAlign: 'right' }}>Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items?.map((item) => {
                    const hasDiscount = Number(item.discounted_unit_price) < Number(item.base_unit_price);
                    return (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.75rem 0' }}>
                          <span style={{ fontWeight: 600, display: 'block', color: 'var(--text-primary)' }}>
                            {item.name}
                          </span>
                          {hasDiscount && (
                            <span style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                              <Percent size={11} /> Volume tier applied
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 700 }}>
                          {item.quantity || item.target_quantity}
                        </td>
                        <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                          {hasDiscount ? (
                            <div>
                              <span style={{ textDecoration: 'line-through', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>
                                ₹{Number(item.base_unit_price).toFixed(2)}
                              </span>
                              <span style={{ color: '#047857', fontWeight: 600 }}>
                                ₹{Number(item.discounted_unit_price).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <span>₹{Number(item.base_unit_price).toFixed(2)}</span>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 0', textAlign: 'right', fontWeight: 700 }}>
                          ₹{Number(item.subtotal || 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Price Summary Breakdown */}
            <div style={{ marginTop: '1.5rem', borderTop: '1.5px dashed var(--border-medium)', paddingTop: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                <span>Subtotal ({order.total_quantity || 0} units)</span>
                <span>₹{Number(order.subtotal || 0).toFixed(2)}</span>
              </div>
              {Number(order.discount_amount) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem', color: '#047857', fontWeight: 600 }}>
                  <span>Volume Bulk Discount</span>
                  <span>- ₹{Number(order.discount_amount).toFixed(2)}</span>
                </div>
              )}
              {Number(order.delivery_fee) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', marginBottom: '0.35rem', color: 'var(--text-secondary)' }}>
                  <span>Campus Delivery</span>
                  <span>+ ₹{Number(order.delivery_fee).toFixed(2)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.15rem', fontWeight: 800, marginTop: '0.5rem', borderTop: '1px solid var(--border-light)', paddingTop: '0.5rem', color: 'var(--text-primary)' }}>
                <span>Total Amount</span>
                <span>₹{Number(order.total_amount || 0).toFixed(2)}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Participants List */}
        <div>
          <Card style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={18} style={{ color: 'var(--primary-600)' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Order Members</h3>
              </div>
              <Badge variant="outline">{order.participants?.length || 0} Members</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {order.participants?.map((participant) => {
                const isMemberOwner = participant.role === 'OWNER';
                return (
                  <div
                    key={participant.id}
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-surface-secondary, #f9fafb)',
                      border: '1px solid var(--border-light)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {participant.username} {isMemberOwner && <span style={{ color: 'var(--primary-600)', fontSize: '0.75rem', fontWeight: 700 }}>(Rep / Owner)</span>}
                      </span>
                      <Badge variant={isMemberOwner ? 'primary' : 'secondary'} size="sm">
                        {participant.role}
                      </Badge>
                    </div>

                    {participant.notes && (
                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        "{participant.notes}"
                      </p>
                    )}

                    {participant.item_selections && participant.item_selections.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                        {participant.item_selections.map((sel) => (
                          <span
                            key={sel.id}
                            style={{
                              fontSize: '0.75rem',
                              background: '#ffffff',
                              border: '1px solid var(--border-medium)',
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {sel.quantity} units
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* EDIT ALLOCATIONS MODAL */}
      {showEditModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <Card style={{ maxWidth: '480px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontWeight: 700 }}>Update My Requested Units</h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Specify the number of units you need for this class order. The system will aggregate everyone's items and recalculate volume discounts automatically.
            </p>

            <form onSubmit={handleSaveAllocations}>
              {order.items?.map((item) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: '0.875rem', display: 'block' }}>{item.name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Catalog: ₹{item.base_unit_price}</span>
                  </div>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={editAllocations[item.id] || 1}
                    onChange={(e) => setEditAllocations({ ...editAllocations, [item.id]: e.target.value })}
                    style={{ width: '80px', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)', textAlign: 'center', fontWeight: 600 }}
                  />
                </div>
              ))}

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <Button variant="secondary" onClick={() => setShowEditModal(false)} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isUpdating}>
                  Update Quantities
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudentBulkOrderDetail;
