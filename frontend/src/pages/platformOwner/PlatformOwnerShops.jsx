import React, { useState, useEffect } from 'react';
import {
  Building2,
  Search,
  MapPin,
  Star,
  Package,
  ShoppingBag,
  AlertTriangle,
  RefreshCw,
  Phone,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerShops = () => {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');

  const loadShops = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';
      if (typeFilter !== 'ALL') params.shop_type = typeFilter;

      const data = await platformOwnerService.getShops(params);
      setShops(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load campus stores:', err);
      setError('Unable to load stores directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, [statusFilter, typeFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadShops();
  };

  const handleToggleStatus = async (shopId) => {
    try {
      const updated = await platformOwnerService.toggleShopStatus(shopId);
      setShops((prev) =>
        prev.map((s) => (s.id === shopId ? { ...s, is_active: updated.is_active } : s))
      );
    } catch (err) {
      console.error('Failed to toggle store status:', err);
      alert('Failed to update store status. Please try again.');
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Campus Stores Network"
        subtitle="Universal oversight of affiliated stationery stores and Xerox centers"
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
                placeholder="Search shops by store name, address, landmark, owner email..."
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
              <option value="ALL">All Categories</option>
              <option value="COLLEGE_STATIONERY">College Stationery</option>
              <option value="LOCAL_STATIONERY">Local Stationery</option>
              <option value="BOOK_STATIONERY">Book + Stationery</option>
              <option value="PRINTING_XEROX">Printing / Xerox</option>
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
              <option value="ACTIVE">Online Stores</option>
              <option value="INACTIVE">Offline Stores</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadShops}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Campus Stores Directory (${shops.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading store records..." />
          </div>
        ) : shops.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No shops match the selected criteria.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Store Name</th>
                  <th>Category</th>
                  <th>Campus Location</th>
                  <th>Owner</th>
                  <th>Catalog & Orders</th>
                  <th>Inventory Warnings</th>
                  <th>Commission</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shops.map((shop) => (
                  <tr key={shop.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{shop.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Hours: {shop.opening_time} - {shop.closing_time}
                      </div>
                    </td>
                    <td>
                      <Badge variant="secondary">{shop.shop_type}</Badge>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                        <MapPin size={14} color="var(--text-muted)" />
                        {shop.campus_location}
                      </span>
                    </td>
                    <td>
                      <div>{shop.owner_name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{shop.owner_email}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        <span style={{ fontWeight: 600 }}>{shop.total_products}</span> items ·{' '}
                        <span style={{ fontWeight: 600 }}>{shop.total_orders}</span> orders
                      </div>
                    </td>
                    <td>
                      {shop.low_stock_count > 0 ? (
                        <Badge variant="danger" icon={AlertTriangle}>
                          {shop.low_stock_count} Low Stock
                        </Badge>
                      ) : (
                        <Badge variant="success">Normal</Badge>
                      )}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{shop.commission_rate}%</span>
                    </td>
                    <td>
                      <Badge variant={shop.is_active ? 'success' : 'danger'}>
                        {shop.is_active ? 'Online' : 'Disabled'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant={shop.is_active ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => handleToggleStatus(shop.id)}
                      >
                        {shop.is_active ? 'Deactivate Store' : 'Activate Store'}
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

export default PlatformOwnerShops;
