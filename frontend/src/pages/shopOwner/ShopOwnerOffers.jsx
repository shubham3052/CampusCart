import React, { useState, useEffect } from 'react';
import { Tag, Plus, CheckCircle2, XCircle, Calendar, Percent, Trash2, Edit2, AlertCircle, BarChart3 } from 'lucide-react';
import engagementService from '../../services/engagementService';
import shopService from '../../services/shopService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const ShopOwnerOffers = () => {
  const [offers, setOffers] = useState([]);
  const [analytics, setAnalytics] = useState({ total_offers: 0, active_offers: 0, expired_offers: 0, total_redemptions: 0 });
  const [loading, setLoading] = useState(true);
  const [myShop, setMyShop] = useState(null);

  // Create Modal
  const [showModal, setShowModal] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('PERCENTAGE');
  const [formValue, setFormValue] = useState('');
  const [formMinOrder, setFormMinOrder] = useState('0');
  const [formMaxDiscount, setFormMaxDiscount] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [shopData, offersData, anaData] = await Promise.all([
        shopService.getMyShop().catch(() => null),
        engagementService.getOffers(),
        engagementService.getOfferAnalytics().catch(() => null),
      ]);

      if (shopData) setMyShop(shopData);
      setOffers(Array.isArray(offersData) ? offersData : offersData.results || []);
      if (anaData) setAnalytics(anaData);
    } catch (err) {
      console.error('Failed to load shop offers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
    setFormTitle('');
    setFormDesc('');
    setFormType('PERCENTAGE');
    setFormValue('');
    setFormMinOrder('0');
    setFormMaxDiscount('');
    setFormStartDate(today);
    setFormEndDate(nextWeek);
    setErrorMsg('');
    setShowModal(true);
  };

  const handleCreateOffer = async (e) => {
    e.preventDefault();
    if (!myShop) {
      setErrorMsg('No registered shop found for this account.');
      return;
    }
    setSubmitting(true);
    setErrorMsg('');

    try {
      const payload = {
        shop: myShop.id,
        title: formTitle,
        description: formDesc,
        discount_type: formType,
        discount_value: parseFloat(formValue),
        min_order_value: parseFloat(formMinOrder || 0),
        max_discount: formMaxDiscount ? parseFloat(formMaxDiscount) : null,
        start_date: new Date(formStartDate).toISOString(),
        end_date: new Date(`${formEndDate}T23:59:59`).toISOString(),
        is_active: true,
      };

      await engagementService.createOffer(payload);
      setSuccessMsg('Offer created successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      setShowModal(false);
      loadData();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.non_field_errors || Object.values(err.response?.data || {})[0] || 'Failed to create offer.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (offer) => {
    try {
      await engagementService.updateOffer(offer.id, { is_active: !offer.is_active });
      loadData();
    } catch (err) {
      alert('Failed to toggle offer status.');
    }
  };

  const handleDeleteOffer = async (id) => {
    if (!window.confirm('Delete this promotional offer?')) return;
    try {
      await engagementService.deleteOffer(id);
      loadData();
    } catch (err) {
      alert('Failed to delete offer.');
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tag size={28} color="var(--primary-600, #4F46E5)" />
            Shop Offers & Discounts
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
            Configure promotional campaigns, percentage sales, and customer savings
          </p>
        </div>

        <Button variant="primary" onClick={handleOpenCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={18} /> Create New Offer
        </Button>
      </div>

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#047857', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {/* Analytics KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.75rem' }}>
        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#EEF2FF', borderRadius: '10px', color: '#4F46E5' }}>
            <Tag size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>TOTAL OFFERS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.total_offers}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#ECFDF5', borderRadius: '10px', color: '#059669' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>ACTIVE OFFERS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.active_offers}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#FEF2F2', borderRadius: '10px', color: '#DC2626' }}>
            <XCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>EXPIRED OFFERS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.expired_offers}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#F5F3FF', borderRadius: '10px', color: '#7C3AED' }}>
            <BarChart3 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>TOTAL USAGE</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.total_redemptions}</div>
          </div>
        </Card>
      </div>

      {/* Offers Table / Feed */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : offers.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ margin: 0, color: '#9CA3AF' }}>No promotional offers configured yet. Create one to boost customer orders!</p>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
          {offers.map((off) => (
            <Card key={off.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <Badge variant={off.is_currently_valid ? 'success' : 'secondary'}>
                    {off.is_currently_valid ? 'Active Now' : off.is_active ? 'Upcoming / Expired' : 'Paused'}
                  </Badge>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleToggleActive(off)}
                      style={{ background: 'none', border: 'none', color: off.is_active ? '#059669' : '#9CA3AF', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                    >
                      {off.is_active ? 'Active' : 'Paused'}
                    </button>
                    <button
                      onClick={() => handleDeleteOffer(off.id)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>
                  {off.title}
                </h3>
                {off.description && (
                  <p style={{ margin: '0 0 10px', fontSize: '0.88rem', color: '#4B5563', lineHeight: 1.4 }}>
                    {off.description}
                  </p>
                )}

                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#4F46E5', margin: '8px 0' }}>
                  {off.discount_type === 'PERCENTAGE' ? `${parseFloat(off.discount_value)}% OFF` : `₹${parseFloat(off.discount_value)} OFF`}
                </div>

                <div style={{ fontSize: '0.82rem', color: '#6B7280', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #F3F4F6', paddingTop: '8px' }}>
                  <span>Min Spend: ₹{parseFloat(off.min_order_value || 0).toFixed(2)}</span>
                  {off.max_discount && <span>Max Cap: ₹{parseFloat(off.max_discount).toFixed(2)}</span>}
                  <span>Duration: {new Date(off.start_date).toLocaleDateString()} - {new Date(off.end_date).toLocaleDateString()}</span>
                  <span>Times Redeemed: {off.times_used}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create Offer Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem' }}>Create Promotional Offer</h3>
            {errorMsg && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', color: '#B91C1C', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreateOffer}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Offer Title</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. 15% Off All Notebooks"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Description</label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Short explanation shown to customers"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Discount Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED_AMOUNT">Fixed Amount (₹)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Discount Value {formType === 'PERCENTAGE' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder={formType === 'PERCENTAGE' ? '15' : '50'}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Min Order Spend (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formMinOrder}
                    onChange={(e) => setFormMinOrder(e.target.value)}
                    placeholder="0"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Max Cap Discount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formMaxDiscount}
                    onChange={(e) => setFormMaxDiscount(e.target.value)}
                    placeholder="Optional"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>Start Date</label>
                  <input
                    type="date"
                    required
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>End Date</label>
                  <input
                    type="date"
                    required
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Launch Offer'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerOffers;
