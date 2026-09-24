import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Users,
  Plus,
  Key,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  ArrowRight,
  TrendingDown,
  Layers,
  Sparkles,
  Search,
  Filter,
  PackageCheck,
  Percent,
} from 'lucide-react';
import bulkOrderService from '../../services/bulkOrderService';
import shopService from '../../services/shopService';
import productService from '../../services/productService';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const StudentBulkOrders = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [bulkOrders, setBulkOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // ALL, CREATED, JOINED

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Join modal state
  const [shareCodeInput, setShareCodeInput] = useState('');
  const [joinNotes, setJoinNotes] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Create modal state
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState('');
  const [shopProducts, setShopProducts] = useState([]);
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    order_type: 'CLASS',
    participant_limit: 50,
    deadline_date: '',
    deadline_time: '18:00',
    delivery_method: 'PICKUP',
    delivery_address: '',
    items: [{ product_id: '', quantity: 10, item_type: 'STATIONERY' }],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState('');

  const loadBulkOrders = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const data = await bulkOrderService.getBulkOrders();
      setBulkOrders(data || []);
    } catch (err) {
      console.error('Failed to load bulk orders:', err);
      setErrorMessage('Unable to load bulk orders. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBulkOrders();
    shopService.getShops({ is_active: true }).then((data) => {
      setShops(data || []);
      if (data?.length > 0) setSelectedShopId(String(data[0].id));
    }).catch(() => {});
  }, []);

  // When shop changes in create form, load products
  useEffect(() => {
    if (!selectedShopId) return;
    productService.getProducts({ shop: selectedShopId, is_active: true })
      .then((data) => setShopProducts(data || []))
      .catch(() => setShopProducts([]));
  }, [selectedShopId]);

  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!shareCodeInput.trim()) {
      setJoinError('Please enter a share code.');
      return;
    }
    setJoinLoading(true);
    setJoinError('');
    try {
      const res = await bulkOrderService.joinByCode(null, {
        share_code: shareCodeInput.trim().toUpperCase(),
        notes: joinNotes,
        items: [],
      });
      setShowJoinModal(false);
      setShareCodeInput('');
      setJoinNotes('');
      if (res?.id) {
        navigate(`/student/bulk-orders/${res.id}`);
      } else {
        loadBulkOrders();
      }
    } catch (err) {
      console.error('Failed to join bulk order:', err);
      setJoinError(err.response?.data?.error || 'Invalid or expired share code.');
    } finally {
      setJoinLoading(false);
    }
  };

  const handleAddItemRow = () => {
    setCreateForm((prev) => ({
      ...prev,
      items: [...prev.items, { product_id: '', quantity: 10, item_type: 'STATIONERY' }],
    }));
  };

  const handleRemoveItemRow = (idx) => {
    setCreateForm((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== idx),
    }));
  };

  const handleItemChange = (idx, field, value) => {
    setCreateForm((prev) => {
      const updated = [...prev.items];
      updated[idx] = { ...updated[idx], [field]: value };
      return { ...prev, items: updated };
    });
  };

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!selectedShopId) {
      setCreateError('Please select a campus merchant shop.');
      return;
    }
    const validItems = createForm.items.filter((it) => it.product_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setCreateError('Please add at least one product with a valid quantity.');
      return;
    }

    let deadlineIso = null;
    if (createForm.deadline_date) {
      deadlineIso = new Date(`${createForm.deadline_date}T${createForm.deadline_time || '23:59'}:00`).toISOString();
    }

    setIsSubmitting(true);
    setCreateError('');

    try {
      const payload = {
        shop_id: Number(selectedShopId),
        title: createForm.title.trim() || 'Class Batch Order',
        description: createForm.description.trim(),
        order_type: createForm.order_type,
        participant_limit: createForm.participant_limit ? Number(createForm.participant_limit) : null,
        deadline: deadlineIso,
        delivery_method: createForm.delivery_method,
        delivery_address: createForm.delivery_address,
        items: validItems.map((it) => ({
          product_id: Number(it.product_id),
          quantity: Number(it.quantity),
          item_type: it.item_type || 'STATIONERY',
        })),
      };

      const res = await bulkOrderService.createBulkOrder(payload);
      setShowCreateModal(false);
      if (res?.id) {
        navigate(`/student/bulk-orders/${res.id}`);
      } else {
        loadBulkOrders();
      }
    } catch (err) {
      console.error('Failed to create bulk order:', err);
      setCreateError(err.response?.data?.error || 'Failed to create bulk order. Please verify input.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredOrders = bulkOrders.filter((bo) => {
    if (activeTab === 'CREATED') return bo.is_owner;
    if (activeTab === 'JOINED') return !bo.is_owner && bo.is_joined;
    return true;
  });

  const getStatusBadgeVariant = (status) => {
    switch (status) {
      case 'OPEN': return 'success';
      case 'CONFIRMED': return 'primary';
      case 'PROCESSING': return 'warning';
      case 'READY': return 'info';
      case 'COMPLETED': return 'success';
      case 'CANCELLED': return 'danger';
      default: return 'secondary';
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1140px', paddingBottom: '3rem' }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--primary-700, #1d4ed8) 0%, var(--indigo-800, #3730a3) 100%)',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem 2.5rem',
          color: '#ffffff',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
          boxShadow: '0 10px 25px -5px rgba(29, 78, 216, 0.3)',
        }}
      >
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255, 255, 255, 0.15)', padding: '0.35rem 0.85rem', borderRadius: '999px', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem', backdropFilter: 'blur(4px)' }}>
            <Users size={14} /> Class Rep & Group Purchase Hub
          </div>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.85rem', fontWeight: 700, color: '#ffffff' }}>
            Bulk & Class Ordering
          </h1>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '0.95rem', maxWidth: '600px' }}>
            Combine requirements with classmates and team members. Unlock tier discounts, reserve campus stock atomically, and coordinate single-point pickups or doorstep delivery.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button
            variant="outline"
            onClick={() => setShowJoinModal(true)}
            style={{ borderColor: 'rgba(255,255,255,0.6)', color: '#ffffff', background: 'rgba(255,255,255,0.1)' }}
            leftIcon={Key}
          >
            Join with Code
          </Button>
          <Button
            variant="primary"
            onClick={() => setShowCreateModal(true)}
            style={{ background: '#ffffff', color: 'var(--primary-700, #1d4ed8)', fontWeight: 600 }}
            leftIcon={Plus}
          >
            Start Class Order
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', background: 'var(--bg-surface-secondary, #f3f4f6)', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
          <button
            onClick={() => setActiveTab('ALL')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'ALL' ? '#ffffff' : 'transparent',
              color: activeTab === 'ALL' ? 'var(--primary-700)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'ALL' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            All Orders ({bulkOrders.length})
          </button>
          <button
            onClick={() => setActiveTab('CREATED')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'CREATED' ? '#ffffff' : 'transparent',
              color: activeTab === 'CREATED' ? 'var(--primary-700)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'CREATED' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Created by Me ({bulkOrders.filter((b) => b.is_owner).length})
          </button>
          <button
            onClick={() => setActiveTab('JOINED')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'JOINED' ? '#ffffff' : 'transparent',
              color: activeTab === 'JOINED' ? 'var(--primary-700)' : 'var(--text-secondary)',
              boxShadow: activeTab === 'JOINED' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Joined ({bulkOrders.filter((b) => !b.is_owner && b.is_joined).length})
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div style={{ padding: '4rem', textAlign: 'center' }}>
          <Spinner size={36} />
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Loading collective bulk orders...</p>
        </div>
      ) : errorMessage ? (
        <ErrorMessage message={errorMessage} onRetry={loadBulkOrders} />
      ) : filteredOrders.length === 0 ? (
        <Card style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'var(--primary-50, #eff6ff)', color: 'var(--primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
            <Users size={28} />
          </div>
          <h3 style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>No Bulk Orders Found</h3>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem', maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto', fontSize: '0.9rem' }}>
            {activeTab === 'CREATED'
              ? "You haven't initiated any class or group orders yet. Start one for your classmates to save on stationery & printing!"
              : activeTab === 'JOINED'
              ? "You haven't joined any class orders. Ask your class rep for an invitation code to join."
              : "No active class orders on campus right now. Create one or enter a share code."}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Button variant="outline" onClick={() => setShowJoinModal(true)} leftIcon={Key}>
              Enter Share Code
            </Button>
            <Button variant="primary" onClick={() => setShowCreateModal(true)} leftIcon={Plus}>
              Create Bulk Order
            </Button>
          </div>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
          {filteredOrders.map((order) => {
            const savings = Number(order.discount_amount || 0);
            return (
              <Card
                key={order.id}
                style={{
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: 'pointer',
                  border: order.is_owner ? '1.5px solid var(--primary-300, #93c5fd)' : '1px solid var(--border-light)',
                }}
                onClick={() => navigate(`/student/bulk-orders/${order.id}`)}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: '0.5rem' }}>
                    <Badge variant={getStatusBadgeVariant(order.status)} size="sm">
                      {order.status_display || order.status}
                    </Badge>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700, background: 'var(--bg-surface-secondary)', padding: '0.2rem 0.5rem', borderRadius: '4px', color: 'var(--text-secondary)' }}>
                      {order.share_code}
                    </span>
                  </div>

                  <h3 style={{ margin: '0 0 0.35rem 0', fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.3 }}>
                    {order.title}
                  </h3>
                  <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                    Shop: <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{order.shop_name}</span>
                  </p>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.825rem', color: 'var(--text-secondary)', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Users size={14} style={{ color: 'var(--primary-600)' }} />
                      <span>{order.active_participants_count || 1} {order.participant_limit ? `/ ${order.participant_limit}` : ''} members</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <ShoppingBag size={14} style={{ color: 'var(--primary-600)' }} />
                      <span>{order.total_quantity || 0} total units</span>
                    </div>
                  </div>

                  {savings > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#ecfdf5', color: '#047857', padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                      <Percent size={13} />
                      <span>Saved ₹{savings.toFixed(2)} with volume discount</span>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>Estimated Total</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      ₹{Number(order.total_amount || 0).toFixed(2)}
                    </span>
                  </div>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.825rem', fontWeight: 600, color: 'var(--primary-600)' }}>
                    View Details <ArrowRight size={14} />
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* JOIN BY CODE MODAL */}
      {showJoinModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' }}>
          <Card style={{ maxWidth: '450px', width: '100%', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={20} style={{ color: 'var(--primary-600)' }} />
                <h3 style={{ margin: 0, fontWeight: 700 }}>Join Class / Bulk Order</h3>
              </div>
              <button onClick={() => setShowJoinModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0 0 1.25rem' }}>
              Enter the unique 6-character share code provided by your class representative or group leader (e.g. <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>CLS-8F92K</span>).
            </p>

            {joinError && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinByCode}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Share Code *
                </label>
                <input
                  type="text"
                  placeholder="e.g. CLS-XXXXX"
                  value={shareCodeInput}
                  onChange={(e) => setShareCodeInput(e.target.value.toUpperCase())}
                  required
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontFamily: 'monospace', fontSize: '1rem', letterSpacing: '1px', fontWeight: 700, textTransform: 'uppercase' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Your Identifier / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Roll No. 42 / Room 204"
                  value={joinNotes}
                  onChange={(e) => setJoinNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowJoinModal(false)} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={joinLoading}>
                  Lookup & Join
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* CREATE BULK ORDER MODAL */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem', overflowY: 'auto' }}>
          <Card style={{ maxWidth: '650px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={22} style={{ color: 'var(--primary-600)' }} />
                <h3 style={{ margin: 0, fontWeight: 700 }}>Initiate Bulk / Class Order</h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
            </div>

            {createError && (
              <div style={{ background: '#fef2f2', color: '#b91c1c', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateOrder}>
              {/* Basic Info */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Order Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. BCA 6th Sem Final Project Files & Printing Batch"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Order Type
                  </label>
                  <select
                    value={createForm.order_type}
                    onChange={(e) => setCreateForm({ ...createForm, order_type: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  >
                    <option value="CLASS">Class / Course Batch</option>
                    <option value="GROUP">Student Study Group</option>
                    <option value="PROJECT_TEAM">Project Team</option>
                    <option value="INDIVIDUAL_BULK">Personal Bulk Purchase</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Campus Shop *
                  </label>
                  <select
                    value={selectedShopId}
                    onChange={(e) => setSelectedShopId(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  >
                    {shops.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Max Participants
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="500"
                    value={createForm.participant_limit}
                    onChange={(e) => setCreateForm({ ...createForm, participant_limit: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                </div>
              </div>

              {/* Deadline & Fulfillment */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Participant Deadline
                  </label>
                  <input
                    type="date"
                    value={createForm.deadline_date}
                    onChange={(e) => setCreateForm({ ...createForm, deadline_date: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Closing Time
                  </label>
                  <input
                    type="time"
                    value={createForm.deadline_time}
                    onChange={(e) => setCreateForm({ ...createForm, deadline_time: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                    Fulfillment Mode
                  </label>
                  <select
                    value={createForm.delivery_method}
                    onChange={(e) => setCreateForm({ ...createForm, delivery_method: e.target.value })}
                    style={{ width: '100%', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.875rem' }}
                  >
                    <option value="PICKUP">Store Counter Pickup</option>
                    <option value="DELIVERY">Campus Doorstep Delivery</option>
                  </select>
                </div>
              </div>

              {/* Item Rows */}
              <div style={{ marginBottom: '1.5rem', background: 'var(--bg-surface-secondary, #f9fafb)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Stationery Items for this Bulk Order</span>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    style={{ background: 'none', border: 'none', color: 'var(--primary-600)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Plus size={14} /> Add Another Item
                  </button>
                </div>

                {createForm.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div style={{ flex: 3 }}>
                      <select
                        value={item.product_id}
                        onChange={(e) => handleItemChange(idx, 'product_id', e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.85rem' }}
                      >
                        <option value="">Select a Product...</option>
                        {shopProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} (₹{p.price})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1.5 }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-medium)', fontSize: '0.85rem' }}
                      />
                    </div>

                    {createForm.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItemRow(idx)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '1rem', cursor: 'pointer', padding: '0.35rem' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <Button variant="secondary" onClick={() => setShowCreateModal(false)} type="button">
                  Cancel
                </Button>
                <Button variant="primary" type="submit" isLoading={isSubmitting}>
                  Create & Generate Share Code
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default StudentBulkOrders;
