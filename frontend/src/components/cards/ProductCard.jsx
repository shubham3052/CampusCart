import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Check, Eye, Package, Sparkles, Share2 } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { shareProduct } from '../../utils/shareUtils';
import Badge from '../common/Badge';
import Button from '../common/Button';

const ProductCard = ({ product, onAddToCartSuccess }) => {
  const { addToCart } = useCart();
  const navigate = useNavigate();
  const [isAdded, setIsAdded] = useState(false);
  const [isShared, setIsShared] = useState(false);

  const stock = Number(product.current_stock ?? 0);
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 10;
  const price = parseFloat(product.price || 0);

  const handleAdd = (e) => {
    e.stopPropagation();
    if (isOutOfStock) return;

    const result = addToCart(product, 1);
    if (result.success) {
      setIsAdded(true);
      if (onAddToCartSuccess) onAddToCartSuccess(product);
      setTimeout(() => setIsAdded(false), 1800);
    }
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    const result = await shareProduct(product);
    if (result.success) {
      setIsShared(true);
      setTimeout(() => setIsShared(false), 2000);
    }
  };

  return (
    <div
      className="card card-interactive"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '1.25rem',
        cursor: 'pointer',
        height: '100%',
      }}
      onClick={() => navigate(`/student/products/${product.id}`)}
    >
      <div>
        {/* Top Badges: Category & Stock Status */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {product.category_details?.name || product.category_name || 'Stationery'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {isOutOfStock ? (
              <Badge variant="danger" size="sm">Out of Stock</Badge>
            ) : isLowStock ? (
              <Badge variant="warning" size="sm">Only {stock} Left</Badge>
            ) : (
              <Badge variant="success" size="sm">In Stock</Badge>
            )}
            <button
              type="button"
              className="share-btn"
              title="Share Product"
              aria-label="Share Product"
              onClick={handleShare}
              style={{
                background: 'none',
                border: '1px solid var(--border-light, #e2e8f0)',
                borderRadius: 'var(--radius-sm, 6px)',
                width: '26px',
                height: '26px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isShared ? 'var(--success-600, #16a34a)' : 'var(--text-muted, #64748b)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: isShared ? 'rgba(22, 163, 74, 0.08)' : 'transparent',
              }}
            >
              {isShared ? <Check size={13} color="var(--success-600, #16a34a)" /> : <Share2 size={13} />}
            </button>
          </div>
        </div>

        {/* Product Visual Placeholder or Image */}
        <div
          style={{
            height: '130px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '0.85rem',
            overflow: 'hidden',
            border: '1px solid var(--border-light)',
          }}
        >
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', color: 'var(--text-light)' }}>
              <Package size={36} color="var(--primary-400)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{product.brand || 'Stationery'}</span>
            </div>
          )}
        </div>

        {/* Product Title & Details */}
        <h4
          style={{
            fontSize: '0.975rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.4,
            minHeight: '42px',
            marginBottom: '0.25rem',
          }}
        >
          {product.name}
        </h4>

        {product.reason_text && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.725rem',
              color: '#4338ca',
              backgroundColor: '#eef2ff',
              border: '1px solid #c7d2fe',
              padding: '0.2rem 0.45rem',
              borderRadius: 'var(--radius-sm)',
              marginTop: '0.25rem',
              marginBottom: '0.4rem',
              lineHeight: 1.25,
            }}
          >
            <Sparkles size={11} color="#6366f1" style={{ flexShrink: 0 }} />
            <span>{product.reason_text}</span>
          </div>
        )}

        {product.shop_name && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
            🏪 {product.shop_name}
          </p>
        )}
      </div>

      {/* Pricing & Add to Cart Section */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '1rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-light)',
        }}
      >
        <div>
          <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{price.toFixed(2)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>
            per {product.unit_display || product.unit || 'unit'}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.35rem' }} onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant={isAdded ? 'secondary' : isOutOfStock ? 'outline' : 'primary'}
            disabled={isOutOfStock}
            onClick={handleAdd}
            leftIcon={isAdded ? Check : Plus}
          >
            {isAdded ? 'Added' : isOutOfStock ? 'Sold Out' : 'Add'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
