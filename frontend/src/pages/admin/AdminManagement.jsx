import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Building,
  RefreshCw,
  Crown,
  Clock,
  Lock,
  UserCheck,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react';
import adminManagementService from '../../services/adminManagementService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminManagement = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Invitation Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [invitedAdminInfo, setInvitedAdminInfo] = useState(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    name: '',
    department: 'Campus Operations',
  });

  const loadAdmins = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';

      const data = await adminManagementService.getAdmins(params);
      setAdmins(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load administrators:', err);
      setError('Unable to load administrators directory. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadAdmins();
  };

  const handleToggleStatus = async (adminUser) => {
    if (adminUser.is_owner || adminUser.email.toLowerCase() === 'garibhokya@gmail.com') {
      alert('The System Owner account cannot be deactivated.');
      return;
    }

    try {
      const updated = await adminManagementService.toggleAdminStatus(adminUser.id);
      setAdmins((prev) =>
        prev.map((adm) => (adm.id === adminUser.id ? { ...adm, is_active: updated.is_active } : adm))
      );
    } catch (err) {
      console.error('Failed to toggle admin status:', err);
      const msg = err.response?.data?.message || 'Failed to update administrator status.';
      alert(msg);
    }
  };

  const handleInviteAdmin = async (e) => {
    e.preventDefault();
    setInviteError('');

    if (!inviteForm.email) {
      setInviteError('Please provide an email address.');
      return;
    }

    setInviting(true);
    try {
      const res = await adminManagementService.inviteAdmin(inviteForm);
      setInvitedAdminInfo({
        email: inviteForm.email.trim().toLowerCase(),
        name: inviteForm.name,
        department: inviteForm.department,
        message: res.message || 'Invitation sent successfully.',
      });
      loadAdmins();
    } catch (err) {
      console.error('Failed to invite administrator:', err);
      const msg =
        err.response?.data?.email?.[0] ||
        err.response?.data?.message ||
        err.response?.data?.detail ||
        'Failed to send administrator invitation. Please check inputs.';
      setInviteError(msg);
    } finally {
      setInviting(false);
    }
  };

  // Quick stats
  const totalCount = admins.length;
  const activeCount = admins.filter((a) => a.is_active).length;
  const pendingCount = admins.filter((a) => !a.email_verified || a.approval_status === 'PENDING').length;
  const ownerAccount = admins.find((a) => a.is_owner || a.role === 'PLATFORM_OWNER');

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Administrator Management"
        subtitle="Controlled administrator invitations, role governance, and active status control"
        badge={
          <Badge variant="primary" icon={ShieldCheck}>
            RBAC Protected
          </Badge>
        }
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={loadAdmins}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={UserPlus}
              onClick={() => {
                setInviteError('');
                setInvitedAdminInfo(null);
                setInviteModalOpen(true);
              }}
            >
              Invite Administrator
            </Button>
          </div>
        }
      />

      {/* Verification Notice Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          padding: '0.875rem 1.25rem',
          backgroundColor: 'rgba(99, 102, 241, 0.08)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          borderRadius: 'var(--radius-lg)',
          fontSize: '0.85rem',
          color: 'var(--text-main)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <ShieldCheck size={20} color="#818cf8" />
          <span>
            Invited administrators must verify their 6-digit OTP code and create an application password before logging in.
          </span>
        </div>
        <Link
          to="/admin/invitation/verify"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            color: '#818cf8',
            fontWeight: 700,
            textDecoration: 'none',
            fontSize: '0.8125rem',
          }}
        >
          Open Verification Portal <ExternalLink size={13} />
        </Link>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
            }}
          >
            <ShieldCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Total Administrators
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
              {totalCount}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}
          >
            <UserCheck size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Active Admins
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>
              {activeCount}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f59e0b',
            }}
          >
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              Pending Invitations
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b' }}>
              {pendingCount}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              backgroundColor: 'rgba(147, 51, 234, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9333ea',
            }}
          >
            <Crown size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontWeight: 500 }}>
              System Owner
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#9333ea', wordBreak: 'break-all' }}>
              {ownerAccount?.email || 'garibhokya@gmail.com'}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card style={{ padding: '1rem' }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', flex: 1, minWidth: '240px' }}>
            <Input
              placeholder="Search by name, email, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={Search}
              style={{ width: '100%' }}
            />
            <Button type="submit" variant="secondary" size="md">
              Filter
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Filter size={16} color="var(--text-muted)" />
            {['ALL', 'ACTIVE', 'INACTIVE'].map((statusKey) => (
              <button
                key={statusKey}
                type="button"
                onClick={() => setStatusFilter(statusKey)}
                style={{
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid',
                  borderColor:
                    statusFilter === statusKey ? 'var(--primary-color)' : 'var(--border-color)',
                  backgroundColor:
                    statusFilter === statusKey ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                  color: statusFilter === statusKey ? 'var(--primary-color)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {statusKey.charAt(0) + statusKey.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </form>
      </Card>

      {/* Error Notice */}
      {error && <ErrorMessage message={error} />}

      {/* Admins Table */}
      <Card style={{ overflow: 'hidden', padding: 0 }}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="lg" />
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>
              Loading administrator accounts...
            </p>
          </div>
        ) : admins.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <ShieldCheck size={48} style={{ opacity: 0.25, margin: '0 auto 1rem' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-main)' }}>
              No Administrators Found
            </h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.875rem' }}>
              No accounts match the current filters. Invite an administrator to get started.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.875rem',
                minWidth: '700px',
              }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    borderBottom: '1px solid var(--border-color)',
                    color: 'var(--text-muted)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '0.85rem 1.25rem' }}>Administrator</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Role</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Department</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Account Status</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Verification</th>
                  <th style={{ padding: '0.85rem 1.25rem' }}>Created</th>
                  <th style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((adminUser) => {
                  const isOwner = adminUser.is_owner || adminUser.role === 'PLATFORM_OWNER';
                  return (
                    <tr
                      key={adminUser.id}
                      style={{
                        borderBottom: '1px solid var(--border-color)',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.02)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Name & Email */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div
                            style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              backgroundColor: isOwner ? 'rgba(147, 51, 234, 0.15)' : 'rgba(99, 102, 241, 0.1)',
                              color: isOwner ? '#9333ea' : '#6366f1',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.875rem',
                            }}
                          >
                            {isOwner ? <Crown size={18} /> : (adminUser.name?.[0] || adminUser.email[0]).toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                              {adminUser.name || 'Unnamed Admin'}
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                              {adminUser.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        {isOwner ? (
                          <Badge variant="primary" style={{ backgroundColor: '#f3e8ff', color: '#9333ea', border: '1px solid #d8b4fe' }}>
                            Platform Owner
                          </Badge>
                        ) : (
                          <Badge variant="primary">Administrator</Badge>
                        )}
                      </td>

                      {/* Department */}
                      <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)' }}>
                        {adminUser.department || 'Operations'}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        {adminUser.is_active ? (
                          <Badge variant="success" icon={CheckCircle2}>
                            Active
                          </Badge>
                        ) : adminUser.approval_status === 'PENDING' || !adminUser.email_verified ? (
                          <Badge variant="warning" icon={Clock}>
                            Pending Verification
                          </Badge>
                        ) : (
                          <Badge variant="danger" icon={XCircle}>
                            Inactive
                          </Badge>
                        )}
                      </td>

                      {/* Email Verification */}
                      <td style={{ padding: '1rem 1.25rem' }}>
                        {adminUser.email_verified ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#10b981', fontWeight: 500, fontSize: '0.8125rem' }}>
                            <CheckCircle2 size={15} /> Verified
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', fontWeight: 500, fontSize: '0.8125rem' }}>
                            <Clock size={15} /> Pending OTP
                          </span>
                        )}
                      </td>

                      {/* Created Date */}
                      <td style={{ padding: '1rem 1.25rem', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                        {adminUser.created_at ? new Date(adminUser.created_at).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '1rem 1.25rem', textAlign: 'right' }}>
                        {isOwner ? (
                          <span
                            title="System Owner is permanent and protected from deactivation"
                            style={{
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--text-muted)',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              backgroundColor: 'var(--bg-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <Lock size={12} /> Permanent
                          </span>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                            {(!adminUser.email_verified || !adminUser.is_active) && (
                              <Link
                                to={`/admin/invitation/verify?email=${encodeURIComponent(adminUser.email)}`}
                                target="_blank"
                                style={{ textDecoration: 'none' }}
                                title="Open invitation verification screen for this administrator"
                              >
                                <Button variant="outline" size="sm" style={{ borderColor: '#6366f1', color: '#818cf8' }}>
                                  Verify OTP
                                </Button>
                              </Link>
                            )}
                            <Button
                              variant={adminUser.is_active ? 'outline' : 'primary'}
                              size="sm"
                              onClick={() => handleToggleStatus(adminUser)}
                              style={{
                                borderColor: adminUser.is_active ? '#ef4444' : undefined,
                                color: adminUser.is_active ? '#ef4444' : undefined,
                              }}
                            >
                              {adminUser.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite Administrator Modal */}
      <Modal
        isOpen={inviteModalOpen}
        onClose={() => {
          if (!inviting) {
            setInviteModalOpen(false);
            setInvitedAdminInfo(null);
            setInviteForm({ email: '', name: '', department: 'Campus Operations' });
          }
        }}
        title={invitedAdminInfo ? "Administrator Invitation Sent" : "Invite Administrator"}
        size="md"
      >
        {invitedAdminInfo ? (
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto',
              }}
            >
              <CheckCircle2 size={32} />
            </div>

            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                Invitation Dispatched Successfully
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.5 }}>
                Invitation sent successfully. The invited Admin must verify the OTP using the invitation verification page.
              </p>
            </div>

            <div
              style={{
                backgroundColor: 'var(--bg-muted)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                textAlign: 'left',
                fontSize: '0.8125rem',
              }}
            >
              <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Invited Recipient:</div>
              <div style={{ fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.75rem', fontFamily: 'monospace' }}>
                {invitedAdminInfo.email}
              </div>

              <div style={{ color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Verification URL:</div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  backgroundColor: 'var(--bg-surface)',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  wordBreak: 'break-all',
                  color: 'var(--primary-600, #6366f1)',
                }}
              >
                {window.location.origin}/admin/invitation/verify?email={encodeURIComponent(invitedAdminInfo.email)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '0.25rem' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon={copiedLink ? Check : Copy}
                onClick={() => {
                  const url = `${window.location.origin}/admin/invitation/verify?email=${encodeURIComponent(invitedAdminInfo.email)}`;
                  navigator.clipboard.writeText(url);
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
              >
                {copiedLink ? 'Link Copied!' : 'Copy Verification Link'}
              </Button>
              <Link
                to={`/admin/invitation/verify?email=${encodeURIComponent(invitedAdminInfo.email)}`}
                target="_blank"
                style={{ textDecoration: 'none' }}
              >
                <Button type="button" variant="primary" size="sm" icon={ExternalLink}>
                  Open Verification Page
                </Button>
              </Link>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem', marginTop: '0.5rem' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setInviteModalOpen(false);
                  setInvitedAdminInfo(null);
                  setInviteForm({ email: '', name: '', department: 'Campus Operations' });
                }}
                style={{ width: '100%' }}
              >
                Done / Return to Directory
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInviteAdmin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>
              Enter the email address of the administrator you wish to authorize. Django will dispatch a secure 6-digit verification invitation code to their registered inbox.
            </p>

            {inviteError && <ErrorMessage message={inviteError} />}

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.35rem',
                }}
              >
                Administrator Email <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <Input
                type="email"
                placeholder="e.g. admin.ops@campus.edu"
                icon={Mail}
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                required
                disabled={inviting}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.35rem',
                }}
              >
                Full Name (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. Prof. Arvind Verma"
                value={inviteForm.name}
                onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })}
                disabled={inviting}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: 'var(--text-main)',
                  marginBottom: '0.35rem',
                }}
              >
                Department / Unit (Optional)
              </label>
              <Input
                type="text"
                placeholder="e.g. Campus Procurement, Security"
                icon={Building}
                value={inviteForm.department}
                onChange={(e) => setInviteForm({ ...inviteForm, department: e.target.value })}
                disabled={inviting}
              />
            </div>

            <div
              style={{
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--bg-muted)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              <strong>Security Notice:</strong> The new administrator will not have active administrative privileges until they verify their email OTP and set their own application password. Permanent passwords are never sent via email.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteModalOpen(false)}
                disabled={inviting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={inviting}>
                Send Invitation
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default AdminManagement;
