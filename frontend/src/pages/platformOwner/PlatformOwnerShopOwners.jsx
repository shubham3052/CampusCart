import React, { useState, useEffect } from 'react';
import {
  Store,
  Search,
  Building,
  Phone,
  Mail,
  Star,
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

const PlatformOwnerShopOwners = () => {
  const [shopOwners, setShopOwners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadShopOwners = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';

      const data = await platformOwnerService.getShopOwners(params);
      setShopOwners(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load shop owners:', err);
      setError('Unable to load shop owner directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShopOwners();
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadShopOwners();
  };

  const handleToggleStatus = async (id) => {
    try {
      const updated = await platformOwnerService.toggleShopOwnerStatus(id);
      setShopOwners((prev) =>
        prev.map((o) => (o.id === id ? { ...o, is_active: updated.is_active } : o))
      );
    } catch (err) {
      console.error('Failed to toggle shop owner status:', err);
      alert('Failed to update status. Please try again.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Shop Owner Oversight"
        subtitle="Oversight of registered stationery & xerox merchants across university campus"
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
                placeholder="Search shop owners by merchant name, email, phone..."
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
              <option value="ALL">All Merchants</option>
              <option value="ACTIVE">Active Merchants</option>
              <option value="INACTIVE">Deactivated Merchants</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadShopOwners}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Registered Shop Owners (${shopOwners.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading merchant records..." />
          </div>
        ) : shopOwners.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No shop owners found matching your query.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Shop Owner</th>
                  <th>Contact</th>
                  <th>Assigned Store</th>
                  <th>Campus Location</th>
                  <th>Rating</th>
                  <th>Total Orders</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shopOwners.map((owner) => {
                  const shop = owner.shop_details;
                  return (
                    <tr key={owner.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          {owner.name || owner.username}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{owner.email}</div>
                      </td>
                      <td>{owner.phone_number || 'N/A'}</td>
                      <td>
                        {shop ? (
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--primary-700)' }}>{shop.name}</span>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{shop.shop_type_display}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No shop assigned</span>
                        )}
                      </td>
                      <td>{shop?.campus_location || 'N/A'}</td>
                      <td>
                        {shop ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', fontWeight: 600 }}>
                            <Star size={14} color="#f59e0b" fill="#f59e0b" />
                            {shop.rating}
                          </span>
                        ) : (
                          'N/A'
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{shop?.total_orders || 0}</td>
                      <td>
                        <Badge variant={owner.is_active ? 'success' : 'danger'}>
                          {owner.is_active ? 'Active' : 'Suspended'}
                        </Badge>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Button
                          variant={owner.is_active ? 'danger' : 'outline'}
                          size="sm"
                          onClick={() => handleToggleStatus(owner.id)}
                        >
                          {owner.is_active ? 'Suspend Merchant' : 'Reactivate'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PlatformOwnerShopOwners;
