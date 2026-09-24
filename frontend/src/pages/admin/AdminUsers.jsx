import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  UserCheck,
  UserX,
  Mail,
  Phone,
  GraduationCap,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Send,
  Building2,
  Shield,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import api from '../../services/api';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedUser, setSelectedUser] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/');
      const list = res.data.results || res.data || [];
      setUsers(list);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleStatus = async (userObj) => {
    try {
      setActionLoading(true);
      const newStatus = !userObj.is_active;
      await api.patch(`/users/${userObj.id}/`, { is_active: newStatus });
      setUsers((prev) =>
        prev.map((u) => (u.id === userObj.id ? { ...u, is_active: newStatus } : u))
      );
      if (selectedUser?.id === userObj.id) {
        setSelectedUser((prev) => ({ ...prev, is_active: newStatus }));
      }
      setSuccessMsg(`User ${userObj.email} is now ${newStatus ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Status toggle error:', err);
      alert('Failed to update user status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendVerification = async (userObj) => {
    try {
      setActionLoading(true);
      const res = await api.post(`/users/${userObj.id}/resend-verification/`);
      setSuccessMsg(res.data?.message || `Verification email sent to ${userObj.email}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Verification resend error:', err);
      alert(err.response?.data?.message || 'Failed to trigger verification email.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyEmail = async (userObj) => {
    try {
      setActionLoading(true);
      const res = await api.post(`/users/${userObj.id}/verify-email/`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userObj.id ? { ...u, email_verified: true } : u))
      );
      if (selectedUser?.id === userObj.id) {
        setSelectedUser((prev) => ({ ...prev, email_verified: true }));
      }
      setSuccessMsg(res.data?.message || `Email for ${userObj.email} marked as verified.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Verify email error:', err);
      alert(err.response?.data?.message || 'Failed to verify email.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveCourier = async (userObj) => {
    try {
      setActionLoading(true);
      await api.post(`/users/${userObj.id}/approve-courier/`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userObj.id ? { ...u, approval_status: 'APPROVED' } : u))
      );
      if (selectedUser?.id === userObj.id) {
        setSelectedUser((prev) => ({ ...prev, approval_status: 'APPROVED' }));
      }
      setSuccessMsg(`✓ Courier ${userObj.email} approved successfully.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Approve courier error:', err);
      alert(err.response?.data?.message || 'Failed to approve courier.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectCourier = async (userObj) => {
    if (!window.confirm(`Reject courier application for ${userObj.email}?`)) return;
    try {
      setActionLoading(true);
      await api.post(`/users/${userObj.id}/reject-courier/`);
      setUsers((prev) =>
        prev.map((u) => (u.id === userObj.id ? { ...u, approval_status: 'REJECTED' } : u))
      );
      if (selectedUser?.id === userObj.id) {
        setSelectedUser((prev) => ({ ...prev, approval_status: 'REJECTED' }));
      }
      setSuccessMsg(`Courier ${userObj.email} rejected.`);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Reject courier error:', err);
      alert(err.response?.data?.message || 'Failed to reject courier.');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (statusFilter === 'ACTIVE' && !u.is_active) return false;
    if (statusFilter === 'INACTIVE' && u.is_active) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = `${u.first_name || ''} ${u.last_name || ''}`.toLowerCase().includes(q);
      const matchEmail = (u.email || '').toLowerCase().includes(q);
      const matchUsername = (u.username || '').toLowerCase().includes(q);
      const matchPhone = (u.phone_number || '').includes(q);
      const matchCollege = (u.college_id || '').toLowerCase().includes(q);
      return matchName || matchEmail || matchUsername || matchPhone || matchCollege;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Student & User Directory"
          subtitle="View, verify, and oversee all registered campus student accounts and platform users"
        />
        <Button variant="outline" size="sm" onClick={fetchUsers} icon={RefreshCw}>
          Refresh
        </Button>
      </div>

      {successMsg && (
        <div
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#ecfdf5',
            border: '1px solid #10b981',
            borderRadius: 'var(--radius-md)',
            color: '#065f46',
            fontSize: '0.875rem',
            fontWeight: 600,
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {/* Search and Filters Bar */}
      <Card style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 250px', position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
            <input
              type="text"
              placeholder="Search by name, email, roll number, college ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.25rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                fontSize: '0.875rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                fontSize: '0.875rem',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <option value="ALL">All Roles</option>
              <option value="STUDENT">Students</option>
              <option value="SHOP_OWNER">Shop Owners</option>
              <option value="DELIVERY_AGENT">Delivery Agents</option>
              <option value="ADMIN">Administrators</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-light)',
                fontSize: '0.875rem',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Users Table / List */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading users directory..." />
        </div>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Users size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            No users match criteria
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Try adjusting your search query or role filter.
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>User Profile</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Role</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>College ID / Dept</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Registered</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background-color 120ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: '#eef2ff',
                            color: 'var(--primary-600)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            flexShrink: 0,
                          }}
                        >
                          {(u.first_name?.[0] || u.username?.[0] || 'U').toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                            {u.full_name || `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {u.email}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                        <Badge variant={u.role === 'STUDENT' ? 'primary' : u.role === 'ADMIN' ? 'danger' : u.role === 'SHOP_OWNER' ? 'warning' : 'neutral'}>
                          {u.role}
                        </Badge>
                        {u.role === 'DELIVERY_AGENT' && (
                          <Badge variant={u.approval_status === 'APPROVED' ? 'success' : u.approval_status === 'PENDING' ? 'warning' : 'danger'}>
                            {u.approval_status || 'APPROVED'}
                          </Badge>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                      <div>{u.college_id || '—'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.department || ''}</div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Badge variant={u.is_active ? 'success' : 'danger'}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                        {u.email_verified && (
                          <span title="Email Verified" style={{ display: 'flex' }}>
                            <CheckCircle2 size={14} color="#10b981" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {u.role === 'DELIVERY_AGENT' && u.approval_status === 'PENDING' && (
                          <>
                            <Button
                              variant="success"
                              size="sm"
                              disabled={actionLoading}
                              onClick={() => handleApproveCourier(u)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={actionLoading}
                              onClick={() => handleRejectCourier(u)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          icon={Eye}
                          onClick={() => {
                            setSelectedUser(u);
                            setDetailModalOpen(true);
                          }}
                        >
                          View
                        </Button>
                        <Button
                          variant={u.is_active ? 'danger' : 'success'}
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleToggleStatus(u)}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* User Detail Modal */}
      {detailModalOpen && selectedUser && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`User Profile: ${selectedUser.username}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: '#eef2ff',
                  color: 'var(--primary-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                }}
              >
                {(selectedUser.first_name?.[0] || selectedUser.username?.[0] || 'U').toUpperCase()}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
                  {selectedUser.full_name || `${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || selectedUser.username}
                </h3>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedUser.email}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                  <Badge variant="primary">{selectedUser.role}</Badge>
                  {selectedUser.role === 'DELIVERY_AGENT' && (
                    <Badge variant={selectedUser.approval_status === 'APPROVED' ? 'success' : selectedUser.approval_status === 'PENDING' ? 'warning' : 'danger'}>
                      Courier: {selectedUser.approval_status || 'APPROVED'}
                    </Badge>
                  )}
                  <Badge variant={selectedUser.is_active ? 'success' : 'danger'}>
                    {selectedUser.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Phone Number</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedUser.phone_number || 'None provided'}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>College ID</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedUser.college_id || 'None provided'}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Department</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedUser.department || 'None provided'}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Hostel & Room</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                  {selectedUser.hostel_block ? `${selectedUser.hostel_block} - Room ${selectedUser.room_number || ''}` : 'Day Scholar / Off-campus'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Email Verification</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600, color: selectedUser.email_verified ? '#059669' : '#d97706' }}>
                  {selectedUser.email_verified ? 'Verified' : 'Unverified'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Registration Date</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                  {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '—'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {!selectedUser.email_verified && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Send}
                      disabled={actionLoading}
                      onClick={() => handleResendVerification(selectedUser)}
                    >
                      Resend Email OTP
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={CheckCircle2}
                      disabled={actionLoading}
                      onClick={() => handleVerifyEmail(selectedUser)}
                    >
                      Verify Email (Admin)
                    </Button>
                  </>
                )}
                {selectedUser.role === 'DELIVERY_AGENT' && selectedUser.approval_status === 'PENDING' && (
                  <>
                    <Button
                      variant="success"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleApproveCourier(selectedUser)}
                    >
                      Approve Application
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={actionLoading}
                      onClick={() => handleRejectCourier(selectedUser)}
                    >
                      Reject Application
                    </Button>
                  </>
                )}
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                <Button
                  variant={selectedUser.is_active ? 'danger' : 'success'}
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleToggleStatus(selectedUser)}
                >
                  {selectedUser.is_active ? 'Deactivate Account' : 'Activate Account'}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
