import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  Phone,
  Building,
  RefreshCw,
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

const PlatformOwnerAdmins = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create Modal State
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    phone_number: '',
    department: 'Operations',
    password: '',
  });

  const loadAdmins = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';

      const data = await platformOwnerService.getAdmins(params);
      setAdmins(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load administrators:', err);
      setError('Unable to load administrators directory.');
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

  const handleToggleStatus = async (adminId) => {
    try {
      const updated = await platformOwnerService.toggleAdminStatus(adminId);
      setAdmins((prev) =>
        prev.map((adm) => (adm.id === adminId ? { ...adm, is_active: updated.is_active } : adm))
      );
    } catch (err) {
      console.error('Failed to toggle admin status:', err);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!createForm.email || !createForm.password || !createForm.name) {
      setCreateError('Please complete all required fields.');
      return;
    }

    setCreating(true);
    try {
      const created = await platformOwnerService.createAdmin(createForm);
      setAdmins((prev) => [created, ...prev]);
      setCreateModalOpen(false);
      setCreateForm({
        name: '',
        email: '',
        phone_number: '',
        department: 'Operations',
        password: '',
      });
    } catch (err) {
      console.error('Failed to create administrator:', err);
      const msg =
        err.response?.data?.email?.[0] ||
        err.response?.data?.password?.[0] ||
        err.response?.data?.detail ||
        'Failed to create Administrator. Check inputs.';
      setCreateError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Administrator Management"
        subtitle="Oversight, provision, and permission governance for all system administrators"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={UserPlus}
            onClick={() => setCreateModalOpen(true)}
          >
            Provision Administrator
          </Button>
        }
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Search and Filters Bar */}
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
                placeholder="Search administrators by name, email, department..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="outline" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status:</span>
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
                cursor: 'pointer',
              }}
            >
              <option value="ALL">All Administrators</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Deactivated Only</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadAdmins}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Administrators Table */}
      <Card title={`Registered System Administrators (${admins.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading administrator directory..." />
          </div>
        ) : admins.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No administrators match the search criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.875rem' }}>
              <thead>
                <tr>
                  <th>Administrator</th>
                  <th>Department</th>
                  <th>Contact</th>
                  <th>Role Authority</th>
                  <th>Status</th>
                  <th>Provisioned Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((adm) => (
                  <tr key={adm.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {adm.name || `${adm.first_name || ''} ${adm.last_name || ''}`.trim() || adm.username}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{adm.email}</div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Building size={14} color="var(--text-muted)" />
                        {adm.department || 'Campus Administration'}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <Phone size={14} color="var(--text-muted)" />
                        {adm.phone_number || 'N/A'}
                      </span>
                    </td>
                    <td>
                      <Badge variant="warning" icon={ShieldCheck}>
                        {adm.role}
                      </Badge>
                    </td>
                    <td>
                      <Badge variant={adm.is_active ? 'success' : 'danger'}>
                        {adm.is_active ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(adm.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant={adm.is_active ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => handleToggleStatus(adm.id)}
                      >
                        {adm.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Provision Administrator Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Provision System Administrator"
        >
          {createError && (
            <div style={{ marginBottom: '1rem' }}>
              <ErrorMessage message={createError} onDismiss={() => setCreateError('')} />
            </div>
          )}

          <form onSubmit={handleCreateAdmin}>
            <Input
              label="Full Name"
              required
              placeholder="e.g. Ramesh Chandra"
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
            />

            <Input
              label="Official Campus Email"
              type="email"
              required
              placeholder="admin.ops@campus.edu"
              value={createForm.email}
              onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
            />

            <Input
              label="Phone Number"
              placeholder="+91 9876543210"
              value={createForm.phone_number}
              onChange={(e) => setCreateForm({ ...createForm, phone_number: e.target.value })}
            />

            <Input
              label="Department / Unit"
              placeholder="e.g. IT Operations / Store Oversight"
              value={createForm.department}
              onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
            />

            <Input
              label="Temporary Password"
              type="password"
              required
              placeholder="Minimum 8 characters with at least one number"
              value={createForm.password}
              onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
              helperText="Must be at least 8 characters and contain at least one digit."
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                marginTop: '1.5rem',
              }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                isLoading={creating}
              >
                Confirm Provisioning
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default PlatformOwnerAdmins;
