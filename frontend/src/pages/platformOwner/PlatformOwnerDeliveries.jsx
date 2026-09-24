import React, { useState, useEffect } from 'react';
import {
  Truck,
  Search,
  CheckCircle,
  Clock,
  Phone,
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

const PlatformOwnerDeliveries = () => {
  const [couriers, setCouriers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [availabilityFilter, setAvailabilityFilter] = useState('ALL');

  const loadCouriers = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';
      if (availabilityFilter !== 'ALL') params.availability_status = availabilityFilter;

      const data = await platformOwnerService.getDeliveryPartners(params);
      setCouriers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load couriers:', err);
      setError('Unable to load delivery partners directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCouriers();
  }, [statusFilter, availabilityFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadCouriers();
  };

  const handleToggleStatus = async (id) => {
    try {
      const updated = await platformOwnerService.toggleDeliveryPartnerStatus(id);
      setCouriers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: updated.is_active } : c))
      );
    } catch (err) {
      console.error('Failed to toggle courier status:', err);
      alert('Failed to update status. Please try again.');
    }
  };

  const handleApproveCourier = async (id) => {
    try {
      await platformOwnerService.approveDeliveryPartner(id);
      setCouriers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, approval_status: 'APPROVED' } : c))
      );
    } catch (err) {
      console.error('Failed to approve courier:', err);
      alert('Failed to approve courier.');
    }
  };

  const handleRejectCourier = async (id) => {
    if (!window.confirm('Reject this courier application?')) return;
    try {
      await platformOwnerService.rejectDeliveryPartner(id);
      setCouriers((prev) =>
        prev.map((c) => (c.id === id ? { ...c, approval_status: 'REJECTED' } : c))
      );
    } catch (err) {
      console.error('Failed to reject courier:', err);
      alert('Failed to reject courier.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Delivery Couriers Oversight"
        subtitle="Oversight of student and campus couriers, availability, and active delivery pipelines"
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
                placeholder="Search couriers by name, email, phone..."
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
              value={availabilityFilter}
              onChange={(e) => setAvailabilityFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Availability</option>
              <option value="AVAILABLE">Available for Orders</option>
              <option value="BUSY">On Active Delivery</option>
              <option value="OFFLINE">Shift Inactive / Offline</option>
            </select>

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
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Couriers</option>
              <option value="INACTIVE">Suspended Couriers</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadCouriers}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Campus Couriers (${couriers.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading courier records..." />
          </div>
        ) : couriers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No delivery partners found matching your search.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Courier Name</th>
                  <th>Contact</th>
                  <th>Approval Status</th>
                  <th>Availability Readiness</th>
                  <th>Active Deliveries</th>
                  <th>Completed Deliveries</th>
                  <th>Account Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {couriers.map((courier) => (
                  <tr key={courier.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {courier.name || courier.username}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{courier.email}</div>
                    </td>
                    <td>{courier.phone_number || 'N/A'}</td>
                    <td>
                      <Badge
                        variant={
                          courier.approval_status === 'APPROVED'
                            ? 'success'
                            : courier.approval_status === 'PENDING'
                            ? 'warning'
                            : 'danger'
                        }
                      >
                        {courier.approval_status || 'APPROVED'}
                      </Badge>
                    </td>
                    <td>
                      <Badge
                        variant={
                          courier.availability_status === 'AVAILABLE'
                            ? 'success'
                            : courier.availability_status === 'BUSY'
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {courier.availability_status}
                      </Badge>
                    </td>
                    <td style={{ fontWeight: 600 }}>{courier.active_deliveries_count || 0} active</td>
                    <td style={{ fontWeight: 600, color: 'var(--success-700)' }}>
                      {courier.completed_deliveries_count || 0} completed
                    </td>
                    <td>
                      <Badge variant={courier.is_active ? 'success' : 'danger'}>
                        {courier.is_active ? 'Active' : 'Suspended'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', flexWrap: 'wrap' }}>
                        {courier.approval_status === 'PENDING' && (
                          <>
                            <Button
                              variant="success"
                              size="sm"
                              onClick={() => handleApproveCourier(courier.id)}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              onClick={() => handleRejectCourier(courier.id)}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                        <Button
                          variant={courier.is_active ? 'danger' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleStatus(courier.id)}
                        >
                          {courier.is_active ? 'Suspend' : 'Reactivate'}
                        </Button>
                      </div>
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

export default PlatformOwnerDeliveries;
