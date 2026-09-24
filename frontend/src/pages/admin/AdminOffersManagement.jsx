import React, { useState, useEffect } from 'react';
import { 
  Tag, 
  Percent, 
  Plus, 
  Trash2, 
  Calendar, 
  Store, 
  CheckCircle2, 
  XCircle, 
  BarChart3, 
  Search, 
  Filter, 
  Clock, 
  Users, 
  ShieldCheck 
} from 'lucide-react';
import engagementService from '../../services/engagementService';
import shopService from '../../services/shopService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const AdminOffersManagement = () => {
  const [activeTab, setActiveTab] = useState('coupons'); // 'coupons' | 'offers' | 'analytics'
  const [coupons, setCoupons] = useState([]);
  const [offers, setOffers] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShopFilter, setSelectedShopFilter] = useState('');
  
  // Coupon creation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    description: '',
    discount_type: 'PERCENTAGE',
    discount_value: '',
    min_order_amount: '0.00',
    max_discount_amount: '',
    valid_from: new Date().toISOString().slice(0, 16),
    valid_to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    usage_limit: 100,
    per_user_limit: 1,
    is_active: true,
    shop: '',
  });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [couponsData, offersData, shopsData] = await Promise.all([
        engagementService.getCoupons(),
        engagementService.getOffers(),
        shopService.getAllShops ? shopService.getAllShops() : Promise.resolve([]),
      ]);
      setCoupons(Array.isArray(couponsData) ? couponsData : couponsData.results || []);
      setOffers(Array.isArray(offersData) ? offersData : offersData.results || []);
      setShops(Array.isArray(shopsData) ? shopsData : shopsData.results || []);
    } catch (err) {
      console.error('Failed to load offers & coupons data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateCoupon = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!newCoupon.code.trim()) {
      setFormError('Coupon code is required.');
      return;
    }
    if (!newCoupon.discount_value || Number(newCoupon.discount_value) <= 0) {
      setFormError('Valid discount value is required.');
      return;
    }

    setCreating(true);
    try {
      const payload = {
        ...newCoupon,
        code: newCoupon.code.trim().toUpperCase(),
        discount_value: Number(newCoupon.discount_value),
        min_order_amount: Number(newCoupon.min_order_amount) || 0,
        max_discount_amount: newCoupon.max_discount_amount ? Number(newCoupon.max_discount_amount) : null,
        usage_limit: newCoupon.usage_limit ? Number(newCoupon.usage_limit) : null,
        per_user_limit: Number(newCoupon.per_user_limit) || 1,
        shop: newCoupon.shop ? Number(newCoupon.shop) : null,
      };
      await engagementService.createCoupon(payload);
      setToastMsg(`Coupon "${payload.code}" created successfully.`);
      setTimeout(() => setToastMsg(''), 4000);
      setShowCreateModal(false);
      setNewCoupon({
        code: '',
        description: '',
        discount_type: 'PERCENTAGE',
        discount_value: '',
        min_order_amount: '0.00',
        max_discount_amount: '',
        valid_from: new Date().toISOString().slice(0, 16),
        valid_to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
        usage_limit: 100,
        per_user_limit: 1,
        is_active: true,
        shop: '',
      });
      loadData();
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.code?.[0] || 'Failed to create coupon.';
      setFormError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handleToggleCouponActive = async (coupon) => {
    try {
      await engagementService.updateCoupon(coupon.id, { is_active: !coupon.is_active });
      setCoupons(prev => prev.map(c => c.id === coupon.id ? { ...c, is_active: !c.is_active } : c));
      setToastMsg(`Coupon ${coupon.code} ${!coupon.is_active ? 'activated' : 'deactivated'}.`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      alert('Failed to update coupon status.');
    }
  };

  const handleDeleteCoupon = async (id, code) => {
    if (!window.confirm(`Are you sure you want to delete coupon ${code}?`)) return;
    try {
      await engagementService.deleteCoupon(id);
      setCoupons(prev => prev.filter(c => c.id !== id));
      setToastMsg(`Coupon ${code} removed.`);
      setTimeout(() => setToastMsg(''), 3000);
    } catch (err) {
      alert('Failed to delete coupon.');
    }
  };

  // Filtered lists
  const filteredCoupons = coupons.filter(c => {
    const matchesSearch = c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.description && c.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesShop = !selectedShopFilter || 
      (selectedShopFilter === 'GLOBAL' ? !c.shop : String(c.shop) === selectedShopFilter);
    return matchesSearch && matchesShop;
  });

  const filteredOffers = offers.filter(o => {
    const matchesSearch = o.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.shop_name && o.shop_name.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesShop = !selectedShopFilter || String(o.shop) === selectedShopFilter;
    return matchesSearch && matchesShop;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Tag size={28} color="var(--primary-600, #4F46E5)" />
            Campaign & Offers Command Desk
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
            Manage campus-wide promotional coupons, oversee merchant store discounts, and inspect engagement yield
          </p>
        </div>
        <Button 
          variant="primary" 
          onClick={() => setShowCreateModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={18} />
          Create Promo Coupon
        </Button>
      </div>

      {toastMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#047857', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle2 size={18} />
          {toastMsg}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #E5E7EB', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('coupons')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'coupons' ? '2px solid #4F46E5' : '2px solid transparent',
            color: activeTab === 'coupons' ? '#4F46E5' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Tag size={18} />
          Promo Coupons ({coupons.length})
        </button>
        <button
          onClick={() => setActiveTab('offers')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'offers' ? '2px solid #4F46E5' : '2px solid transparent',
            color: activeTab === 'offers' ? '#4F46E5' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Percent size={18} />
          Merchant Offers ({offers.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          style={{
            padding: '10px 18px',
            border: 'none',
            background: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'analytics' ? '2px solid #4F46E5' : '2px solid transparent',
            color: activeTab === 'analytics' ? '#4F46E5' : '#6B7280',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <BarChart3 size={18} />
          Discount Yield & Stats
        </button>
      </div>

      {/* Filters (for coupons and offers) */}
      {activeTab !== 'analytics' && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem', background: '#F9FAFB', padding: '1rem', borderRadius: '10px' }}>
          <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              type="text"
              placeholder={activeTab === 'coupons' ? 'Search coupon code, description...' : 'Search offer title, shop...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 38px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem'
              }}
            />
          </div>

          <div style={{ minWidth: '200px' }}>
            <select
              value={selectedShopFilter}
              onChange={(e) => setSelectedShopFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '0.9rem',
                background: '#FFFFFF'
              }}
            >
              <option value="">All Scopes & Stores</option>
              {activeTab === 'coupons' && <option value="GLOBAL">Platform-Wide Only</option>}
              {shops.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Spinner size="lg" />
        </div>
      ) : activeTab === 'coupons' ? (
        <div>
          {filteredCoupons.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
              <Tag size={40} color="#9CA3AF" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 6px', color: '#1F2937' }}>No Coupons Found</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Create a campus promo code or adjust filter criteria.</p>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
              {filteredCoupons.map((coupon) => (
                <Card key={coupon.id} style={{ border: coupon.is_active ? '1px solid #E5E7EB' : '1px dashed #D1D5DB', opacity: coupon.is_active ? 1 : 0.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <div>
                      <span style={{ 
                        fontFamily: 'monospace', 
                        fontSize: '1.25rem', 
                        fontWeight: 800, 
                        letterSpacing: '1px', 
                        color: coupon.is_active ? '#4F46E5' : '#6B7280',
                        background: '#EEF2FF',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        border: '1px solid #C7D2FE'
                      }}>
                        {coupon.code}
                      </span>
                      <div style={{ fontSize: '0.8rem', color: '#6B7280', marginTop: '6px' }}>
                        {coupon.shop ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Store size={13} /> {coupon.shop_name || `Shop #${coupon.shop}`}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669', fontWeight: 600 }}>
                            <ShieldCheck size={13} /> Platform-Wide
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <Badge variant={coupon.is_active ? 'success' : 'secondary'}>
                        {coupon.is_active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.875rem', color: '#374151', margin: '8px 0 12px', minHeight: '38px' }}>
                    {coupon.description || 'No description provided.'}
                  </p>

                  <div style={{ background: '#F9FAFB', padding: '10px', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#6B7280' }}>Discount:</span>
                      <strong style={{ color: '#1F2937' }}>
                        {coupon.discount_type === 'PERCENTAGE' ? `${coupon.discount_value}% OFF` : `₹${coupon.discount_value} OFF`}
                      </strong>
                    </div>
                    {coupon.min_order_amount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#6B7280' }}>Min Order:</span>
                        <span>₹{coupon.min_order_amount}</span>
                      </div>
                    )}
                    {coupon.max_discount_amount && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ color: '#6B7280' }}>Max Cap:</span>
                        <span>₹{coupon.max_discount_amount}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6B7280' }}>Redemptions:</span>
                      <span>{coupon.times_used || 0} / {coupon.usage_limit || '∞'}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid #F3F4F6' }}>
                    <button
                      onClick={() => handleToggleCouponActive(coupon)}
                      style={{
                        background: 'none',
                        border: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: coupon.is_active ? '#DC2626' : '#059669',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {coupon.is_active ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                      {coupon.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => handleDeleteCoupon(coupon.id, coupon.code)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#9CA3AF',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                      title="Delete coupon"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'offers' ? (
        <div>
          {filteredOffers.length === 0 ? (
            <Card style={{ padding: '3rem', textAlign: 'center', color: '#6B7280' }}>
              <Percent size={40} color="#9CA3AF" style={{ margin: '0 auto 12px' }} />
              <h3 style={{ fontSize: '1.1rem', margin: '0 0 6px', color: '#1F2937' }}>No Merchant Offers Found</h3>
              <p style={{ margin: 0, fontSize: '0.9rem' }}>Shops have not published promotional store discounts yet.</p>
            </Card>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1rem' }}>
              {filteredOffers.map((offer) => (
                <Card key={offer.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 4px', fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>{offer.title}</h4>
                      <span style={{ fontSize: '0.8rem', color: '#4F46E5', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Store size={13} /> {offer.shop_name || `Shop #${offer.shop}`}
                      </span>
                    </div>
                    <Badge variant={offer.is_active ? 'success' : 'secondary'}>
                      {offer.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <p style={{ fontSize: '0.875rem', color: '#4B5563', margin: '8px 0 12px' }}>
                    {offer.description || 'General store promotion'}
                  </p>

                  <div style={{ background: '#F3F4F6', padding: '10px', borderRadius: '6px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#6B7280' }}>Discount:</span>
                      <strong style={{ color: '#059669' }}>
                        {offer.discount_percentage ? `${offer.discount_percentage}% OFF` : `₹${offer.discount_amount} OFF`}
                      </strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#6B7280' }}>Min Order:</span>
                      <span>₹{offer.min_order_amount || '0'}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6B7280' }}>Valid Period:</span>
                      <span>{new Date(offer.start_date).toLocaleDateString()} - {new Date(offer.end_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Analytics Tab */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
          <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
            <Tag size={32} color="#4F46E5" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827' }}>
              {coupons.filter(c => c.is_active).length}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Active Promo Coupons</div>
          </Card>

          <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
            <Percent size={32} color="#059669" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827' }}>
              {offers.filter(o => o.is_active).length}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Active Store Discounts</div>
          </Card>

          <Card style={{ padding: '1.5rem', textAlign: 'center' }}>
            <Users size={32} color="#D97706" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#111827' }}>
              {coupons.reduce((acc, c) => acc + (c.times_used || 0), 0)}
            </div>
            <div style={{ color: '#6B7280', fontSize: '0.9rem' }}>Total Coupon Redemptions</div>
          </Card>
        </div>
      )}

      {/* Modal: Create Promo Coupon */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            maxWidth: '560px',
            width: '100%',
            maxHeight: '90vh',
            overflowY: 'auto',
            padding: '1.75rem',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0 }}>Create Campus Promo Coupon</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#9CA3AF' }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', color: '#DC2626', borderRadius: '6px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateCoupon}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Coupon Code *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SEMSTART20"
                  value={newCoupon.code}
                  onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontFamily: 'monospace', fontWeight: 700 }}
                />
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Description
                </label>
                <input
                  type="text"
                  placeholder="e.g. 20% off on semester exam prep bundles"
                  value={newCoupon.description}
                  onChange={(e) => setNewCoupon({ ...newCoupon, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Discount Type *
                  </label>
                  <select
                    value={newCoupon.discount_type}
                    onChange={(e) => setNewCoupon({ ...newCoupon, discount_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  >
                    <option value="PERCENTAGE">Percentage (%)</option>
                    <option value="FIXED">Flat Fixed Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Discount Value *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder={newCoupon.discount_type === 'PERCENTAGE' ? 'e.g. 20' : 'e.g. 50'}
                    value={newCoupon.discount_value}
                    onChange={(e) => setNewCoupon({ ...newCoupon, discount_value: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Min Order (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCoupon.min_order_amount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, min_order_amount: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Max Cap (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Optional max discount"
                    value={newCoupon.max_discount_amount}
                    onChange={(e) => setNewCoupon({ ...newCoupon, max_discount_amount: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                  Target Shop (Leave blank for campus-wide)
                </label>
                <select
                  value={newCoupon.shop}
                  onChange={(e) => setNewCoupon({ ...newCoupon, shop: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                >
                  <option value="">Campus-Wide (Any Shop)</option>
                  {shops.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Total Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCoupon.usage_limit}
                    onChange={(e) => setNewCoupon({ ...newCoupon, usage_limit: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
                    Per Student Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newCoupon.per_user_limit}
                    onChange={(e) => setNewCoupon({ ...newCoupon, per_user_limit: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Coupon'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOffersManagement;
