import React, { useState, useEffect } from 'react';
import {
  Truck,
  Search,
  Filter,
  Eye,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  Phone,
  Mail,
  User,
  Store,
  MapPin,
  Calendar,
  AlertTriangle,
  Send,
} from 'lucide-react';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminDeliveries = () => {
  const [activeTab, setActiveTab] = useState('deliveries'); // 'deliveries' | 'couriers'
  const [deliveries, setDeliveries] = useState([]);
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Assign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Delivery Detail Modal
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewDelivery, setViewDelivery] = useState(null);

  // Action states for courier approvals
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [delRes, couriersRes] = await Promise.all([
        api.get('/deliveries/'),
        api.get('/deliveries/agents/').catch(() => ({ data: [] })),
      ]);

      const delList = delRes.data?.results || (Array.isArray(delRes.data) ? delRes.data : []);
      const courList = couriersRes.data?.results || (Array.isArray(couriersRes.data) ? couriersRes.data : []);

      setDeliveries(delList);

      // Also fetch full user details for DELIVERY_AGENT to get approval_status
      try {
        const usersRes = await api.get('/users/', { params: { role: 'DELIVERY_AGENT' } });
        const allCouriers = usersRes.data?.results || (Array.isArray(usersRes.data) ? usersRes.data : []);
        setCouriers(allCouriers.length > 0 ? allCouriers : courList);
      } catch (err) {
        setCouriers(courList);
      }
    } catch (err) {
      console.error('Failed to load delivery data:', err);
      setError('Unable to load campus delivery logistics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleApproveCourier = async (courierId) => {
    try {
      setActionLoadingId(courierId);
      await api.post(`/users/${courierId}/approve-courier/`);
      setCouriers((prev) =>
        prev.map((c) => (c.id === courierId ? { ...c, approval_status: 'APPROVED' } : c))
      );
      setToastMsg('Courier application approved successfully.');
      setTimeout(() => setToastMsg(''), 4000);
    } catch (err) {
      console.error('Failed to approve courier:', err);
      alert('Failed to approve courier: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectCourier = async (courierId) => {
    const reason = window.prompt('Enter reason for rejecting courier application:', 'Incomplete campus verification');
    if (reason === null) return;

    try {
      setActionLoadingId(courierId);
      await api.post(`/users/${courierId}/reject-courier/`, { reason });
      setCouriers((prev) =>
        prev.map((c) => (c.id === courierId ? { ...c, approval_status: 'REJECTED' } : c))
      );
      setToastMsg('Courier application marked as rejected.');
      setTimeout(() => setToastMsg(''), 4000);
    } catch (err) {
      console.error('Failed to reject courier:', err);
      alert('Failed to reject courier: ' + (err.response?.data?.message || err.message));
    } finally {
      setActionLoadingId(null);
    }
  };

  const openAssignModal = (delivery) => {
    setSelectedDelivery(delivery);
    setSelectedAgentId(delivery.delivery_agent?.id || delivery.delivery_agent || '');
    setAssignModalOpen(true);
  };

  const handleConfirmAssign = async (e) => {
    e.preventDefault();
    if (!selectedDelivery || !selectedAgentId) return;

    setAssigning(true);
    try {
      await api.post(`/deliveries/${selectedDelivery.id}/assign/`, {
        delivery_agent_id: selectedAgentId,
      });

      const assignedAgent = couriers.find((c) => String(c.id) === String(selectedAgentId));
      setDeliveries((prev) =>
        prev.map((d) =>
          d.id === selectedDelivery.id
            ? {
                ...d,
                delivery_agent: assignedAgent || selectedAgentId,
                delivery_agent_name: assignedAgent?.name || assignedAgent?.username,
                delivery_status: 'ASSIGNED',
              }
            : d
        )
      );

      setToastMsg('Courier assigned to delivery successfully.');
      setTimeout(() => setToastMsg(''), 4000);
      setAssignModalOpen(false);
      setSelectedDelivery(null);
    } catch (err) {
      console.error('Failed to assign courier:', err);
      alert('Failed to assign courier: ' + (err.response?.data?.message || err.message));
    } finally {
      setAssigning(false);
    }
  };

  const getDeliveryStatusBadge = (status) => {
    switch (status) {
      case 'DELIVERED': return <Badge variant="success">Delivered</Badge>;
      case 'OUT_FOR_DELIVERY':
      case 'ARRIVING': return <Badge variant="info">In Transit</Badge>;
      case 'PICKED_UP': return <Badge variant="warning">Picked Up</Badge>;
      case 'ASSIGNED': return <Badge variant="primary">Assigned</Badge>;
      case 'FAILED':
      case 'RETURNED': return <Badge variant="danger">{status}</Badge>;
      case 'PENDING':
      default: return <Badge variant="secondary">Pending Courier</Badge>;
    }
  };

  const filteredDeliveries = deliveries.filter((d) => {
    if (statusFilter !== 'ALL' && d.delivery_status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const num = String(d.id || '').toLowerCase();
      const ordNum = String(d.order?.order_number || d.order_number || d.order || '').toLowerCase();
      const agent = (d.delivery_agent_name || d.delivery_agent?.name || d.delivery_agent?.username || '').toLowerCase();
      const addr = (d.delivery_address || d.address || '').toLowerCase();
      return num.includes(q) || ordNum.includes(q) || agent.includes(q) || addr.includes(q);
    }
    return true;
  });

  const filteredCouriers = couriers.filter((c) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (c.name || c.username || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone_number || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    }
    return true;
  });

  const pendingApprovalsCount = couriers.filter((c) => c.approval_status === 'PENDING').length;
  const activeDeliveriesCount = deliveries.filter((d) => ['ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'ARRIVING'].includes(d.delivery_status)).length;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Campus Delivery Logistics"
          subtitle="Real-time monitoring of hostel delivery runs, dispatch assignments, and campus courier fleet"
        />
        <Button variant="outline" size="sm" onClick={loadData} icon={RefreshCw}>
          Refresh
        </Button>
      </div>

      {toastMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toastMsg}</span>
        </div>
      )}

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary-50, #eff6ff)', borderRadius: '10px', color: 'var(--primary-600, #2563eb)' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Active Deliveries</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{activeDeliveriesCount}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '10px', color: '#059669' }}>
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Approved Couriers</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
              {couriers.filter((c) => c.approval_status === 'APPROVED').length}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '10px', color: '#d97706' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Pending Approvals</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>{pendingApprovalsCount}</div>
          </div>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color, #e5e7eb)', paddingBottom: '0.25rem' }}>
        <button
          onClick={() => setActiveTab('deliveries')}
          style={{
            padding: '0.625rem 1.25rem',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'deliveries' ? '2px solid var(--primary-600, #2563eb)' : '2px solid transparent',
            color: activeTab === 'deliveries' ? 'var(--primary-600, #2563eb)' : 'var(--text-muted, #6b7280)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Truck size={16} />
          Delivery Dispatches ({deliveries.length})
        </button>

        <button
          onClick={() => setActiveTab('couriers')}
          style={{
            padding: '0.625rem 1.25rem',
            border: 'none',
            background: 'transparent',
            borderBottom: activeTab === 'couriers' ? '2px solid var(--primary-600, #2563eb)' : '2px solid transparent',
            color: activeTab === 'couriers' ? 'var(--primary-600, #2563eb)' : 'var(--text-muted, #6b7280)',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <User size={16} />
          Courier Fleet & Approvals ({couriers.length})
          {pendingApprovalsCount > 0 && (
            <span style={{ padding: '0.125rem 0.375rem', borderRadius: '10px', background: '#dc2626', color: '#fff', fontSize: '0.6875rem', fontWeight: 700 }}>
              {pendingApprovalsCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Deliveries Logistics Feed */}
      {activeTab === 'deliveries' && (
        <>
          <Card padding="1rem">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px' }}>
                <Input
                  type="text"
                  placeholder="Search deliveries by ID, Order #, address, courier..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={Search}
                />
              </div>

              <div style={{ minWidth: '180px' }}>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color, #e5e7eb)',
                    background: 'var(--bg-primary, #fff)',
                    color: 'var(--text-primary, #111827)',
                    fontSize: '0.85rem',
                  }}
                >
                  <option value="ALL">All Delivery Statuses</option>
                  <option value="PENDING">Pending Assignment</option>
                  <option value="ASSIGNED">Courier Assigned</option>
                  <option value="PICKED_UP">Picked Up from Shop</option>
                  <option value="OUT_FOR_DELIVERY">Out for Delivery</option>
                  <option value="ARRIVING">Arriving</option>
                  <option value="DELIVERED">Delivered</option>
                  <option value="FAILED">Failed Attempt</option>
                  <option value="RETURNED">Returned</option>
                </select>
              </div>
            </div>
          </Card>

          <Card padding="0">
            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <Spinner size="md" message="Loading delivery dispatches..." />
              </div>
            ) : filteredDeliveries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #6b7280)' }}>
                <Truck size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>No deliveries found</h4>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>No delivery records match your current filter.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Delivery ID</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Order #</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Destination Address</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Courier Partner</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Timeline</th>
                      <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeliveries.map((d) => {
                      const courierName = d.delivery_agent_name || d.delivery_agent?.name || d.delivery_agent?.username || (d.delivery_agent ? `Agent #${d.delivery_agent}` : 'Unassigned');
                      const orderRef = d.order?.order_number || d.order_number || d.order;

                      return (
                        <tr
                          key={d.id}
                          style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', transition: 'background-color 0.15s ease' }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                        >
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontWeight: 700, color: 'var(--primary-600, #2563eb)', fontFamily: 'monospace' }}>
                              #{d.id}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                              #{String(orderRef).slice(0, 8)}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                              <MapPin size={14} color="var(--primary-600, #2563eb)" />
                              <span style={{ fontWeight: 500 }}>{d.delivery_address || d.address || 'Campus Hostel'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                              <User size={14} color={d.delivery_agent ? '#059669' : '#9ca3af'} />
                              <span style={{ fontWeight: d.delivery_agent ? 600 : 400, color: d.delivery_agent ? 'var(--text-primary, #111827)' : 'var(--text-muted, #6b7280)' }}>
                                {courierName}
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: '0.75rem 1rem' }}>
                            {getDeliveryStatusBadge(d.delivery_status)}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                            {d.created_at ? new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                          <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setViewDelivery(d); setDetailModalOpen(true); }}
                                title="View Delivery Details"
                              >
                                <Eye size={16} />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAssignModal(d)}
                                title="Assign or Reassign Courier"
                              >
                                {d.delivery_agent ? 'Reassign' : 'Assign'}
                              </Button>
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
        </>
      )}

      {/* Tab 2: Couriers Fleet & Approvals */}
      {activeTab === 'couriers' && (
        <Card padding="0">
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Spinner size="md" message="Loading courier fleet..." />
            </div>
          ) : filteredCouriers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #6b7280)' }}>
              <UserCheck size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>No couriers found</h4>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>No delivery partner accounts registered in system.</p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Courier Name</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Contact Info</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Approval Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Shift Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Active Loads</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Application Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCouriers.map((c) => {
                    const isPending = c.approval_status === 'PENDING';
                    const isApproved = c.approval_status === 'APPROVED';

                    return (
                      <tr
                        key={c.id}
                        style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                            {c.name || c.username}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                            ID #{c.id} · @{c.username}
                          </div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <div style={{ fontSize: '0.8125rem', color: 'var(--text-primary, #111827)' }}>{c.email}</div>
                          {c.phone_number && (
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.125rem' }}>
                              <Phone size={12} />
                              {c.phone_number}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <Badge variant={isApproved ? 'success' : isPending ? 'warning' : 'danger'}>
                            {c.approval_status || 'APPROVED'}
                          </Badge>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: c.availability_status === 'AVAILABLE' ? '#059669' : 'var(--text-muted, #6b7280)' }}>
                            ● {c.availability_status || 'AVAILABLE'}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem' }}>
                          <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary, #f3f4f6)', fontSize: '0.75rem', fontWeight: 600 }}>
                            {c.active_deliveries_count || 0} packages
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                            {!isApproved && (
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleApproveCourier(c.id)}
                                disabled={actionLoadingId === c.id}
                              >
                                <UserCheck size={14} style={{ marginRight: '4px' }} />
                                Approve
                              </Button>
                            )}
                            {c.approval_status !== 'REJECTED' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleRejectCourier(c.id)}
                                disabled={actionLoadingId === c.id}
                                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                              >
                                <UserX size={14} style={{ marginRight: '4px' }} />
                                Reject
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
      )}

      {/* Assign Courier Modal */}
      {assignModalOpen && selectedDelivery && (
        <Modal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          title={`Assign Courier for Delivery #${selectedDelivery.id}`}
          size="md"
        >
          <form onSubmit={handleConfirmAssign} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', display: 'block', marginBottom: '0.25rem' }}>
                Delivery Address:
              </span>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px', fontWeight: 500, fontSize: '0.875rem' }}>
                {selectedDelivery.delivery_address || selectedDelivery.address || 'Campus Location'}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-primary, #111827)' }}>
                Select Active Campus Courier *
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">-- Choose Courier Partner --</option>
                {couriers
                  .filter((c) => c.approval_status !== 'REJECTED')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.username} ({c.availability_status || 'AVAILABLE'}) - {c.active_deliveries_count || 0} active packages
                    </option>
                  ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" type="button" onClick={() => setAssignModalOpen(false)} disabled={assigning}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={assigning || !selectedAgentId}>
                {assigning ? 'Assigning...' : 'Confirm Assignment'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailModalOpen && viewDelivery && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Delivery Record #${viewDelivery.id}`}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)' }}>Order Number: </span>
                <strong style={{ fontFamily: 'monospace' }}>#{String(viewDelivery.order?.order_number || viewDelivery.order_number || viewDelivery.order).slice(0, 8)}</strong>
              </div>
              <div>{getDeliveryStatusBadge(viewDelivery.delivery_status)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Destination</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{viewDelivery.delivery_address || viewDelivery.address || 'Campus Hostel'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Courier Assigned</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{viewDelivery.delivery_agent_name || viewDelivery.delivery_agent?.name || 'Unassigned'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Created At</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{viewDelivery.created_at ? new Date(viewDelivery.created_at).toLocaleString() : '—'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Assigned At</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{viewDelivery.assigned_at ? new Date(viewDelivery.assigned_at).toLocaleString() : 'Not Yet'}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminDeliveries;
