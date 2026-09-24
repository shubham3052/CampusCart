import React, { useState, useEffect } from 'react';
import { Tag, Percent, Calendar, Store, Check, Copy, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const StudentOffers = () => {
  const [offers, setOffers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState('');

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const [offersData, couponsData] = await Promise.all([
        engagementService.getActiveOffers(),
        engagementService.getCoupons(),
      ]);
      setOffers(Array.isArray(offersData) ? offersData : offersData.results || []);
      setCoupons(Array.isArray(couponsData) ? couponsData : couponsData.results || []);
    } catch (err) {
      console.error('Failed to load promotions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const handleCopy = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2500);
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Tag size={28} color="var(--primary-600, #4F46E5)" />
          Offers & Student Discounts
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
          Exclusive campus discounts, semester deals, and promo coupons
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Active Promo Coupons */}
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: '#1F2937' }}>
              Checkout Promo Codes
            </h2>
            {coupons.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>No active promo codes right now. Check back soon!</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {coupons.map((c) => (
                  <div
                    key={c.id}
                    style={{
                      background: 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                      border: '2px dashed #6366F1',
                      borderRadius: '12px',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#4338CA', letterSpacing: '1px' }}>
                          {c.code}
                        </span>
                        <Badge variant="primary">
                          {c.discount_type === 'PERCENTAGE' ? `${parseFloat(c.discount_value)}% OFF` : `₹${parseFloat(c.discount_value)} OFF`}
                        </Badge>
                      </div>

                      <p style={{ margin: '0 0 8px', fontSize: '0.9rem', fontWeight: 600, color: '#1F2937' }}>
                        {c.title || `Save on stationery at ${c.shop_name || 'campus shops'}`}
                      </p>

                      <div style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {parseFloat(c.min_order_amount) > 0 && (
                          <span>Min Order: ₹{parseFloat(c.min_order_amount).toFixed(2)}</span>
                        )}
                        {c.max_discount && <span>Max Discount: ₹{parseFloat(c.max_discount).toFixed(2)}</span>}
                        {c.valid_until && (
                          <span>Expires: {new Date(c.valid_until).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCopy(c.code)}
                      style={{
                        marginTop: '12px',
                        background: copiedCode === c.code ? '#10B981' : '#4F46E5',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'background 0.2s',
                      }}
                    >
                      {copiedCode === c.code ? <><Check size={14} /> Copied to Clipboard!</> : <><Copy size={14} /> Copy Code</>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shop Promotional Offers */}
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem', color: '#1F2937' }}>
              Store Discounts
            </h2>
            {offers.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: '0.9rem' }}>No store offers active currently.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {offers.map((off) => (
                  <Card key={off.id} style={{ borderLeft: '4px solid var(--primary-600, #4F46E5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <Badge variant="success">
                        {off.discount_type === 'PERCENTAGE' ? `${parseFloat(off.discount_value)}% OFF` : `₹${parseFloat(off.discount_value)} OFF`}
                      </Badge>
                      <span style={{ fontSize: '0.8rem', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Store size={13} /> {off.shop_name}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>
                      {off.title}
                    </h3>
                    {off.description && (
                      <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: '#4B5563', lineHeight: 1.4 }}>
                        {off.description}
                      </p>
                    )}

                    <div style={{ fontSize: '0.8rem', color: '#6B7280', borderTop: '1px solid #F3F4F6', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Min Order: ₹{parseFloat(off.min_order_value || 0).toFixed(2)}</span>
                      <span>Valid till: {new Date(off.end_date).toLocaleDateString()}</span>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentOffers;
