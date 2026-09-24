import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  CheckCircle,
  XCircle,
  Mail,
  Phone,
  GraduationCap,
  Home,
  RefreshCw,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';

      const data = await platformOwnerService.getUsers(params);
      setUsers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load students:', err);
      setError('Unable to load student directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadUsers();
  };

  const handleToggleStatus = async (userId) => {
    try {
      const updated = await platformOwnerService.toggleUserStatus(userId);
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_active: updated.is_active } : u))
      );
    } catch (err) {
      console.error('Failed to toggle user status:', err);
      alert('Failed to update status. Please try again.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Student & Customer Oversight"
        subtitle="Global platform directory of enrolled campus students and account activity"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Filter and Search */}
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
                placeholder="Search students by name, email, roll number, hostel..."
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
              <option value="ALL">All Students</option>
              <option value="ACTIVE">Active Accounts</option>
              <option value="INACTIVE">Deactivated Accounts</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadUsers}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Student List Table */}
      <Card title={`Campus Students (${users.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading student accounts..." />
          </div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No students found matching your criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Campus Roll / ID</th>
                  <th>Department / Hostel</th>
                  <th>Contact</th>
                  <th>Verification</th>
                  <th>Orders</th>
                  <th>Lifetime Spend</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((usr) => (
                  <tr key={usr.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {usr.name || `${usr.first_name || ''} ${usr.last_name || ''}`.trim() || usr.username}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{usr.email}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        {usr.college_id || 'Not Provided'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        <span>{usr.department || 'General'}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                          {usr.hostel_block ? `${usr.hostel_block} - Room ${usr.room_number || ''}` : 'Off-campus'}
                        </span>
                      </div>
                    </td>
                    <td>{usr.phone_number || 'N/A'}</td>
                    <td>
                      <Badge variant={usr.email_verified ? 'success' : 'warning'}>
                        {usr.email_verified ? 'Verified' : 'Pending OTP'}
                      </Badge>
                    </td>
                    <td style={{ fontWeight: 600 }}>{usr.orders_count || 0}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success-700)' }}>
                      ₹{(usr.total_spend || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td>
                      <Badge variant={usr.is_active ? 'success' : 'danger'}>
                        {usr.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant={usr.is_active ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => handleToggleStatus(usr.id)}
                      >
                        {usr.is_active ? 'Suspend' : 'Activate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PlatformOwnerUsers;
