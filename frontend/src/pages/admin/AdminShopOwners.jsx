import React, { useState, useEffect } from 'react';
import {
  Store,
  Search,
  CheckCircle2,
  AlertCircle,
  Eye,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Clock,
  Star,
  Printer,
  ShieldCheck,
  Power,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import api from '../../services/api';

export default function AdminShopOwners() {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [selectedShop, setSelectedShop] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchShops = async () => {
    try {
      setLoading(true);
      const res = await api.get('/shops/');
      const list = res.data.results || res.data || [];
      setShops(list);
    } catch (err) {
      console.error('Failed to load shops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShops();
  }, []);

  const handleToggleShopStatus = async (shopObj) => {
    try {
      setActionLoading(true);
      const newStatus = !shopObj.is_active;
      await api.patch(`/shops/${shopObj.id}/`, { is_active: newStatus });
      setShops((prev) =>
        prev.map((s) => (s.id === shopObj.id ? { ...s, is_active: newStatus } : s))
      );
      if (selectedShop?.id === shopObj.id) {
        setSelectedShop((prev) => ({ ...prev, is_active: newStatus }));
      }
      setSuccessMsg(`Shop '${shopObj.name}' is now ${newStatus ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setSuccessMsg(''), 3500);
    } catch (err) {
      console.error('Shop status toggle error:', err);
      alert('Failed to update shop status.');
    } finally {
      setActionLoading(false);
    }
  };

  const filtered = shops.filter((s) => {
    if (statusFilter === 'ACTIVE' && !s.is_active) return false;
    if (statusFilter === 'INACTIVE' && s.is_active) return false;
    if (typeFilter !== 'ALL' && s.shop_type !== typeFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (s.name || '').toLowerCase().includes(q);
      const matchLoc = (s.campus_location || '').toLowerCase().includes(q);
      const matchOwner = (s.owner_name || s.contact_email || '').toLowerCase().includes(q);
      return matchName || matchLoc || matchOwner;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Merchant & Shop Oversight"
          subtitle="Manage campus stationery stores, printing centers, shopkeepers, and operating credentials"
        />
        <Button variant="outline" size="sm" onClick={fetchShops} icon={RefreshCw}>
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

      {/* Filter Bar */}
      <Card style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 250px', position: 'relative' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
            <input
              type="text"
              placeholder="Search by shop name, campus location, or merchant..."
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

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              fontSize: '0.875rem',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <option value="ALL">All Store Types</option>
            <option value="STATIONERY">Stationery Only</option>
            <option value="PRINTING">Printing / Xerox</option>
            <option value="BOTH">Both Combined</option>
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
      </Card>

      {/* Grid of Shops */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner size="lg" message="Loading campus merchants..." />
        </div>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Store size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            No merchants found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Try broadening your search terms or type filter.
          </p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filtered.map((s) => (
            <Card key={s.id} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: '#eff6ff',
                        color: 'var(--primary-600)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Store size={22} />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {s.name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                        <Badge variant="primary" size="sm">{s.shop_type}</Badge>
                        <Badge variant={s.is_active ? 'success' : 'danger'} size="sm">
                          {s.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {s.rating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', backgroundColor: '#fffbeb', padding: '0.2rem 0.45rem', borderRadius: 'var(--radius-sm)' }}>
                      <Star size={13} fill="#f59e0b" color="#f59e0b" />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400e' }}>{s.rating}</span>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 1rem 0', lineHeight: 1.4 }}>
                  {s.description || 'Campus stationery & Xerox center.'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <MapPin size={14} color="var(--primary-600)" />
                    <span>{s.campus_location || s.address || 'Campus Location'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Clock size={14} />
                    <span>{s.opening_time} - {s.closing_time}</span>
                  </div>
                  {s.contact_phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Phone size={14} />
                      <span>{s.contact_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Eye}
                  onClick={() => {
                    setSelectedShop(s);
                    setDetailModalOpen(true);
                  }}
                >
                  View Details
                </Button>
                <Button
                  variant={s.is_active ? 'danger' : 'success'}
                  size="sm"
                  disabled={actionLoading}
                  onClick={() => handleToggleShopStatus(s)}
                >
                  {s.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Shop Detail Modal */}
      {detailModalOpen && selectedShop && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Store Profile: ${selectedShop.name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#eff6ff',
                  color: 'var(--primary-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Store size={28} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>
                  {selectedShop.name}
                </h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedShop.campus_location || selectedShop.address}
                </p>
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem' }}>
                  <Badge variant="primary">{selectedShop.shop_type}</Badge>
                  <Badge variant={selectedShop.is_active ? 'success' : 'danger'}>
                    {selectedShop.is_active ? 'Store Active' : 'Store Inactive'}
                  </Badge>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Store Phone</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedShop.contact_phone || 'None'}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Store Email</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedShop.contact_email || 'None'}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Operating Hours</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedShop.opening_time} - {selectedShop.closing_time}</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Store Rating</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedShop.rating} / 5.0</p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>GPS Coordinates</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>
                  {selectedShop.latitude && selectedShop.longitude
                    ? `${selectedShop.latitude}, ${selectedShop.longitude}`
                    : 'Campus Datum'}
                </p>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Commission Rate</span>
                <p style={{ margin: '0.2rem 0 0', fontWeight: 600 }}>{selectedShop.commission_rate ?? 5.0}%</p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <Button
                variant={selectedShop.is_active ? 'danger' : 'success'}
                size="sm"
                disabled={actionLoading}
                onClick={() => handleToggleShopStatus(selectedShop)}
              >
                {selectedShop.is_active ? 'Deactivate Store' : 'Activate Store'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
