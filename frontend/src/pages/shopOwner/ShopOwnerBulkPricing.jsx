import React, { useState, useEffect } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Percent,
  Layers,
  Store,
  RefreshCw,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import bulkOrderService from '../../services/bulkOrderService';
import shopService from '../../services/shopService';
import productService from '../../services/productService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';

const ShopOwnerBulkPricing = () => {
  const [shop, setShop] = useState(null);
  const [tiers, setTiers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    product: '',
    min_quantity: 10,
    max_quantity: '',
    discount_type: 'PERCENTAGE',
    discount_value: '5.00',
    is_active: true,
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch current shopkeeper's shop
      const shopData = await shopService.getMyShop();
      setShop(shopData);

      if (shopData?.id) {
        // 2. Fetch tiers and products for this shop in parallel
        const [tierData, productData] = await Promise.all([
          bulkOrderService.getTiers({ shop: shopData.id }),
          productService.getProducts({ shop: shopData.id, is_active: true }),
        ]);
        setTiers(Array.isArray(tierData) ? tierData : []);
        setProducts(Array.isArray(productData) ? productData : []);
      }
    } catch (err) {
      console.error('Failed to load bulk pricing configuration:', err);
      setError(err.response?.data?.error || err.response?.data?.detail || 'Failed to load bulk pricing tiers.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (tier = null) => {
    setEditingTier(tier);
    setModalError(null);
    if (tier) {
      setFormData({
        product: tier.product || '',
        min_quantity: tier.min_quantity,
        max_quantity: tier.max_quantity || '',
        discount_type: tier.discount_type || 'PERCENTAGE',
        discount_value: String(tier.discount_value),
        is_active: tier.is_active,
      });
    } else {
      setFormData({
        product: '',
        min_quantity: 10,
        max_quantity: '',
        discount_type: 'PERCENTAGE',
        discount_value: '5.00',
        is_active: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSaveTier = async (e) => {
    e.preventDefault();
    if (!shop?.id) {
      setModalError('No active shop found for your merchant account.');
      return;
    }

    const minQ = parseInt(formData.min_quantity, 10);
    const maxQ = formData.max_quantity ? parseInt(formData.max_quantity, 10) : null;
    const discVal = parseFloat(formData.discount_value);

    if (isNaN(minQ) || minQ < 2) {
      setModalError('Minimum quantity must be at least 2 units.');
      return;
    }
    if (maxQ !== null && maxQ <= minQ) {
      setModalError('Maximum quantity must be greater than minimum quantity.');
      return;
    }
    if (isNaN(discVal) || discVal <= 0) {
      setModalError('Discount value must be greater than 0.');
      return;
    }
    if (formData.discount_type === 'PERCENTAGE' && discVal > 80) {
      setModalError('Percentage discount cannot exceed 80%.');
      return;
    }

    const payload = {
      shop: shop.id,
      product: formData.product ? parseInt(formData.product, 10) : null,
      min_quantity: minQ,
      max_quantity: maxQ,
      discount_type: formData.discount_type,
      discount_value: discVal,
      is_active: formData.is_active,
    };

    try {
      setSaving(true);
      setModalError(null);

      if (editingTier) {
        const updated = await bulkOrderService.updateTier(editingTier.id, payload);
        setTiers((prev) => prev.map((t) => (t.id === editingTier.id ? updated : t)));
        setSuccessMessage('Bulk discount tier successfully updated.');
      } else {
        const created = await bulkOrderService.createTier(payload);
        setTiers((prev) => [...prev, created]);
        setSuccessMessage('New bulk discount tier added.');
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 3500);
    } catch (err) {
      console.error('Failed to save bulk tier:', err);
      const msg = err.response?.data?.detail || err.response?.data?.message || JSON.stringify(err.response?.data) || 'Failed to save tier.';
      setModalError(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tier) => {
    try {
      const updated = await bulkOrderService.updateTier(tier.id, {
        shop: tier.shop,
        product: tier.product,
        min_quantity: tier.min_quantity,
        max_quantity: tier.max_quantity,
        discount_type: tier.discount_type,
        discount_value: tier.discount_value,
        is_active: !tier.is_active,
      });
      setTiers((prev) => prev.map((t) => (t.id === tier.id ? updated : t)));
      setSuccessMessage(`Tier (${tier.min_quantity}+ units) is now ${updated.is_active ? 'Active' : 'Paused'}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to toggle tier status:', err);
      alert('Could not change tier status.');
    }
  };

  const handleDeleteTier = async (tierId) => {
    if (!window.confirm('Are you sure you want to delete this bulk pricing tier?')) return;
    try {
      await bulkOrderService.deleteTier(tierId);
      setTiers((prev) => prev.filter((t) => t.id !== tierId));
      setSuccessMessage('Pricing tier deleted.');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to delete tier:', err);
      alert('Could not delete tier.');
    }
  };

  const activeTiers = tiers.filter((t) => t.is_active);
  const maxDiscount = tiers.length > 0
    ? Math.max(...tiers.map((t) => (t.discount_type === 'PERCENTAGE' ? parseFloat(t.discount_value) : 0)))
    : 0;

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <PageHeader
        title="Volume & Class Bulk Pricing"
        subtitle="Configure graduated volume discount tiers for class batches, project teams, and student organizations."
        badge={<Badge variant="primary">Step 23: Shopping Intelligence</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={fetchInitialData}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" leftIcon={Plus} onClick={() => handleOpenModal()}>
              Add Discount Tier
            </Button>
          </div>
        }
      />

      {successMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-md)',
            color: '#166534',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={20} color="#16a34a" />
          <strong style={{ fontSize: '0.9rem' }}>{successMessage}</strong>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            color: '#991b1b',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <strong style={{ fontSize: '0.9rem' }}>{error}</strong>
        </div>
      )}

      {/* KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1.25rem',
          marginBottom: '2rem',
        }}
      >
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary-600)',
              }}
            >
              <Layers size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Configured Tiers
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {tiers.length}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--success-600)',
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Active Live Tiers
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {activeTiers.length}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d97706',
              }}
            >
              <Percent size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Max Volume Discount
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                {maxDiscount > 0 ? `${maxDiscount}% OFF` : 'N/A'}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(168, 85, 247, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9333ea',
              }}
            >
              <Store size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Current Store
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {shop?.name || 'My Campus Shop'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Info Callout */}
      <div
        style={{
          padding: '1rem 1.25rem',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: 'rgba(99, 102, 241, 0.05)',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          marginBottom: '1.75rem',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.85rem',
        }}
      >
        <HelpCircle size={20} color="var(--primary-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <strong>How Tiered Discounts Work:</strong> When class representatives or student groups aggregate item quantities in a Bulk Order, the system evaluates active tiers and applies the highest matching discount automatically on order confirmation. Stock is locked atomically to ensure counter inventory integrity.
        </div>
      </div>

      {/* Tiers List / Table */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Configured Volume Discount Tiers
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Graduated discount schedules applied to aggregate student group orders
            </p>
          </div>
          <Button variant="primary" size="sm" leftIcon={Plus} onClick={() => handleOpenModal()}>
            New Tier
          </Button>
        </div>

        {tiers.length === 0 ? (
          <div style={{ padding: '3.5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Tag size={48} style={{ opacity: 0.35, margin: '0 auto 1rem' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              No Bulk Pricing Tiers Configured Yet
            </h4>
            <p style={{ fontSize: '0.85rem', maxWidth: '450px', margin: '0 auto 1.5rem' }}>
              Incentivize class representatives and project groups to buy directly from your campus shop by offering 5%, 10%, or 15% volume discounts on multi-unit purchases.
            </p>
            <Button variant="primary" size="sm" leftIcon={Plus} onClick={() => handleOpenModal()}>
              Create First Volume Tier
            </Button>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-muted)', fontSize: '0.775rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Applies To</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Quantity Range</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Discount</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {tier.product_name || 'All Products (Store-wide)'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        {tier.product ? 'Single Item Specific Tier' : 'Campus Shop General Catalog'}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <Badge variant="neutral">
                        {tier.max_quantity ? `${tier.min_quantity} - ${tier.max_quantity} units` : `${tier.min_quantity}+ units (Open-ended)`}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <span style={{ fontWeight: 800, color: 'var(--success-600)', fontSize: '1rem' }}>
                        {tier.discount_type === 'PERCENTAGE'
                          ? `${parseFloat(tier.discount_value)}% OFF`
                          : `₹${parseFloat(tier.discount_value).toFixed(2)} off / unit`}
                      </span>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <button
                        onClick={() => handleToggleActive(tier)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          padding: 0,
                        }}
                      >
                        {tier.is_active ? (
                          <Badge variant="success">Active</Badge>
                        ) : (
                          <Badge variant="neutral">Paused</Badge>
                        )}
                      </button>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={Edit2}
                          onClick={() => handleOpenModal(tier)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          leftIcon={Trash2}
                          onClick={() => handleDeleteTier(tier.id)}
                        >
                          Delete
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

      {/* CREATE / EDIT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingTier ? 'Edit Bulk Pricing Tier' : 'Add Bulk Pricing Tier'}
        maxWidth="500px"
      >
        <form onSubmit={handleSaveTier} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
          {modalError && (
            <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.85rem' }}>
              {modalError}
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Product Scope
            </label>
            <select
              value={formData.product}
              onChange={(e) => setFormData({ ...formData, product: e.target.value })}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                fontSize: '0.9rem',
                backgroundColor: 'var(--bg-surface)',
              }}
            >
              <option value="">All Products in Shop (Store-wide bulk discount)</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (Current: ₹{parseFloat(p.price).toFixed(2)})
                </option>
              ))}
            </select>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
              Leave set to "All Products" to encourage bulk purchases across your whole stationery catalog.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Min Quantity (Units)*
              </label>
              <input
                type="number"
                min="2"
                required
                value={formData.min_quantity}
                onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Max Quantity (Optional)
              </label>
              <input
                type="number"
                min={formData.min_quantity || 2}
                placeholder="Leave blank for 50+"
                value={formData.max_quantity}
                onChange={(e) => setFormData({ ...formData, max_quantity: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Discount Type*
              </label>
              <select
                value={formData.discount_type}
                onChange={(e) => setFormData({ ...formData, discount_type: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.9rem',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <option value="PERCENTAGE">Percentage (% Off)</option>
                <option value="FIXED">Fixed Amount (₹ Off / unit)</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Discount Value*
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                required
                value={formData.discount_value}
                onChange={(e) => setFormData({ ...formData, discount_value: e.target.value })}
                placeholder={formData.discount_type === 'PERCENTAGE' ? 'e.g. 10 for 10%' : 'e.g. 5.00'}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.9rem',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
            <input
              type="checkbox"
              id="tier_active_toggle"
              checked={formData.is_active}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
              style={{ width: '16px', height: '16px' }}
            />
            <label htmlFor="tier_active_toggle" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
              Tier is active and available to students
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : editingTier ? 'Update Tier' : 'Create Tier'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ShopOwnerBulkPricing;
