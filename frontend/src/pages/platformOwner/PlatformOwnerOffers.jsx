import React, { useState, useEffect } from 'react';
import {
  Tag,
  Plus,
  Search,
  CheckCircle,
  XCircle,
  Calendar,
  Percent,
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

const PlatformOwnerOffers = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Create Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [form, setForm] = useState({
    code: '',
    title: '',
    description: '',
    discount_type: 'PERCENTAGE',
    discount_value: '10',
    minimum_order_amount: '100',
    max_discount_amount: '50',
    usage_limit: '100',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const loadCoupons = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      const data = await platformOwnerService.getCoupons(params);
      setCoupons(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load coupons:', err);
      setError('Unable to load promotional coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCoupons();
  }, []);

  const handleToggleStatus = async (id) => {
    try {
      const updated = await platformOwnerService.toggleCouponStatus(id);
      setCoupons((prev) =>
        prev.map((c) => (c.id === id ? { ...c, is_active: updated.is_active } : c))
      );
    } catch (err) {
      console.error('Failed to toggle coupon status:', err);
      alert('Failed to update coupon status.');
    }
  };

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!form.code.trim() || !form.discount_value) {
      setCreateError('Please specify coupon code and discount value.');
      return;
    }

    setCreating(true);
    try {
      const created = await platformOwnerService.createCoupon(form);
      setCoupons((prev) => [created, ...prev]);
      setCreateModalOpen(false);
      setForm({
        code: '',
        title: '',
        description: '',
        discount_type: 'PERCENTAGE',
        discount_value: '10',
        minimum_order_amount: '100',
        max_discount_amount: '50',
        usage_limit: '100',
        valid_from: new Date().toISOString().slice(0, 10),
        valid_until: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      });
    } catch (err) {
      console.error('Failed to create coupon:', err);
      setCreateError(err.response?.data?.code?.[0] || 'Unable to create promo code.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Promotions & Campus Offers Oversight"
        subtitle="Platform-wide student discount campaigns, merchant coupon oversight, and promo rules"
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={Plus}
            onClick={() => setCreateModalOpen(true)}
          >
            Create Platform Coupon
          </Button>
        }
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      <Card title={`Active Promotional Campaigns (${coupons.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading promotional campaigns..." />
          </div>
        ) : coupons.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No coupons or promotional offers found.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Promo Code</th>
                  <th>Title & Description</th>
                  <th>Discount</th>
                  <th>Order Threshold</th>
                  <th>Usage Limit</th>
                  <th>Redeemed</th>
                  <th>Validity Window</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span
                        style={{
                          fontWeight: 800,
                          color: '#4f46e5',
                          backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          padding: '0.2rem 0.6rem',
                          borderRadius: 'var(--radius-sm)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {c.code}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.title || c.code}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.description || 'Campus promo'}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>
                        {c.discount_type === 'PERCENTAGE' ? `${c.discount_value}% OFF` : `₹${c.discount_value} FLAT`}
                      </span>
                    </td>
                    <td>Min: ₹{c.minimum_order_amount}</td>
                    <td>{c.usage_limit || 'Unlimited'}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{c.total_used || 0}</span> used
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {c.valid_from} to {c.valid_until}
                    </td>
                    <td>
                      <Badge variant={c.is_active ? 'success' : 'danger'}>
                        {c.is_active ? 'Active' : 'Expired / Disabled'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Button
                        variant={c.is_active ? 'danger' : 'outline'}
                        size="sm"
                        onClick={() => handleToggleStatus(c.id)}
                      >
                        {c.is_active ? 'Disable' : 'Enable'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Coupon Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Create Platform Promotional Coupon"
        >
          {createError && (
            <div style={{ marginBottom: '1rem' }}>
              <ErrorMessage message={createError} onDismiss={() => setCreateError('')} />
            </div>
          )}

          <form onSubmit={handleCreateCoupon}>
            <Input
              label="Coupon Code"
              required
              placeholder="e.g. EXAMBONUS20"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            />

            <Input
              label="Campaign Title"
              placeholder="e.g. Semester Exam Preparation Discount"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Discount Type
                </label>
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                  }}
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FLAT">Flat Cash (₹)</option>
                </select>
              </div>

              <Input
                label="Discount Value"
                type="number"
                required
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
              <Input
                label="Minimum Order (₹)"
                type="number"
                value={form.minimum_order_amount}
                onChange={(e) => setForm({ ...form, minimum_order_amount: e.target.value })}
              />
              <Input
                label="Usage Limit"
                type="number"
                value={form.usage_limit}
                onChange={(e) => setForm({ ...form, usage_limit: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" isLoading={creating}>
                Launch Campaign
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default PlatformOwnerOffers;
