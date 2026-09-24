import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Clock, Star, Store, ArrowRight, Printer, BookOpen, CheckCircle2, Share2, Check } from 'lucide-react';
import { shareShop } from '../../utils/shareUtils';
import Card from '../common/Card';
import Badge from '../common/Badge';
import Button from '../common/Button';

const ShopCard = ({ shop }) => {
  const navigate = useNavigate();
  const [isShared, setIsShared] = useState(false);

  const handleShare = async (e) => {
    e.stopPropagation();
    const result = await shareShop(shop);
    if (result.success) {
      setIsShared(true);
      setTimeout(() => setIsShared(false), 2000);
    }
  };

  const getShopTypeVariant = (type) => {
    switch (type) {
      case 'PRINTING_XEROX':
        return 'primary';
      case 'COLLEGE_STATIONERY':
        return 'secondary';
      case 'BOOK_STATIONERY':
        return 'info';
      default:
        return 'neutral';
    }
  };

  const getShopIcon = (type) => {
    switch (type) {
      case 'PRINTING_XEROX':
        return Printer;
      case 'BOOK_STATIONERY':
        return BookOpen;
      default:
        return Store;
    }
  };

  const Icon = getShopIcon(shop.shop_type);

  return (
    <Card
      className="card-interactive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        height: '100%',
      }}
      onClick={() => navigate(`/student/shops/${shop.id}`)}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-50)',
                color: 'var(--primary-600)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Icon size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                {shop.name}
              </h3>
              <Badge variant={getShopTypeVariant(shop.shop_type)} size="sm" style={{ marginTop: '0.2rem' }}>
                {shop.shop_type_display || shop.shop_type}
              </Badge>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
            <Badge variant={shop.is_active ? 'success' : 'neutral'} size="sm">
              {shop.is_active ? 'Open Now' : 'Closed'}
            </Badge>
            {shop.distance_km != null && (
              <Badge variant="primary" size="sm" style={{ fontSize: '0.75rem' }}>
                📍 {shop.distance_km} km
              </Badge>
            )}
          </div>
        </div>

        {shop.description && (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, margin: '0.65rem 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {shop.description}
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.85rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <MapPin size={15} color="var(--primary-600)" />
            <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>{shop.campus_location || shop.address}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Clock size={15} />
            <span>
              {shop.opening_time ? `${shop.opening_time.slice(0, 5)} - ${shop.closing_time.slice(0, 5)}` : 'Campus Hours'}
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1.25rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <Star size={15} color="#f59e0b" fill="#f59e0b" />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            {parseFloat(shop.rating || 5.0).toFixed(1)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>• Verified</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <button
            type="button"
            className="share-btn"
            title="Share Shop"
            aria-label="Share Shop"
            onClick={handleShare}
            style={{
              background: 'none',
              border: '1px solid var(--border-light, #e2e8f0)',
              borderRadius: 'var(--radius-md, 8px)',
              width: '32px',
              height: '32px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isShared ? 'var(--success-600, #16a34a)' : 'var(--text-muted, #64748b)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backgroundColor: isShared ? 'rgba(22, 163, 74, 0.08)' : 'transparent',
            }}
          >
            {isShared ? <Check size={15} color="var(--success-600, #16a34a)" /> : <Share2 size={15} />}
          </button>

          <Button
            size="sm"
            variant="outline"
            rightIcon={ArrowRight}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/student/shops/${shop.id}`);
            }}
          >
            View Shop
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ShopCard;
