import React from 'react';
import { AlertCircle, Trash2, ArrowRight } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import Modal from './Modal';
import Button from './Button';

const ShopConflictModal = () => {
  const { shopConflict, forceAddToCart, cancelShopConflict } = useCart();

  if (!shopConflict) return null;

  const handleConfirm = () => {
    forceAddToCart(shopConflict.pendingProduct, shopConflict.pendingQuantity);
  };

  return (
    <Modal
      isOpen={Boolean(shopConflict)}
      onClose={cancelShopConflict}
      title="Different Shop Detected"
      maxWidth="460px"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={cancelShopConflict}>
            Keep Existing Cart
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm} leftIcon={Trash2}>
            Clear & Add New Item
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--warning-50)',
            color: 'var(--warning-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <AlertCircle size={22} />
        </div>
        <div>
          <p style={{ fontSize: '0.925rem', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>
            Your cart currently contains items from:
          </p>
          <div
            style={{
              padding: '0.5rem 0.75rem',
              backgroundColor: 'var(--bg-surface-secondary)',
              borderRadius: 'var(--radius-md)',
              margin: '0.5rem 0',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--primary-700)',
            }}
          >
            🏪 {shopConflict.currentShop?.name}
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Each campus delivery order must be placed with a single merchant. Would you like to clear your current cart to start an order with <strong>{shopConflict.newShop?.name}</strong>?
          </p>
        </div>
      </div>
    </Modal>
  );
};

export default ShopConflictModal;
