import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  ArrowLeft,
  Store,
  ShieldCheck,
  AlertCircle,
  Info,
} from 'lucide-react';
import { useCart } from '../../context/CartContext';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';

const StudentCart = () => {
  const {
    cartItems,
    cartShop,
    updateQuantity,
    removeFromCart,
    clearCart,
    cartTotal,
    itemCount,
  } = useCart();

  const navigate = useNavigate();
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [itemToRemove, setItemToRemove] = useState(null);

  if (cartItems.length === 0) {
    return (
      <div className="page-container" style={{ maxWidth: '800px' }}>
        <PageHeader title="Your Shopping Cart" subtitle="Items queued for campus delivery or counter pickup" />
        <EmptyState
          icon={ShoppingBag}
          title="Your cart is empty"
          description="Looks like you haven't added any stationery or xerox items to your cart yet."
          actionLabel="Explore Campus Shops"
          onAction={() => navigate('/student/shops')}
        />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1050px' }}>
      <PageHeader
        title="Your Shopping Cart"
        subtitle={`${itemCount} items ready for checkout`}
        actions={
          <Button
            variant="outline"
            size="sm"
            style={{ color: 'var(--danger-600)', borderColor: 'var(--danger-300)' }}
            onClick={() => setShowClearConfirm(true)}
            leftIcon={Trash2}
          >
            Clear Cart
          </Button>
        }
      />

      {/* Active Shop Banner */}
      {cartShop && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            backgroundColor: 'var(--primary-50)',
            border: '1px solid var(--primary-200)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Store size={20} color="var(--primary-700)" />
            <div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary-600)', textTransform: 'uppercase' }}>
                Active Merchant Store
              </span>
              <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--primary-900)' }}>
                {cartShop.name}
              </h4>
            </div>
          </div>
          <Link to={`/student/shops/${cartShop.id}`}>
            <Button variant="outline" size="sm" style={{ backgroundColor: 'white' }}>
              Add More Items From This Shop
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items List */}
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {cartItems.map((item) => {
            const price = parseFloat(item.price || 0);
            const maxStock = Number(item.current_stock ?? 999);
            const itemSubtotal = price * item.quantity;

            return (
              <div
                key={item.productId}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1.25rem',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <Link
                    to={`/student/products/${item.productId}`}
                    style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}
                  >
                    {item.productName}
                  </Link>

                  <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    ₹{price.toFixed(2)} / {item.unit || 'piece'} • In Stock: {maxStock}
                  </div>

                  <div style={{ fontSize: '0.925rem', fontWeight: 800, color: 'var(--primary-600)', marginTop: '0.4rem' }}>
                    Subtotal: ₹{itemSubtotal.toFixed(2)}
                  </div>
                </div>

                {/* Quantity Controls & Remove */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      backgroundColor: 'var(--bg-surface)',
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      style={{
                        padding: '0.4rem 0.65rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                      }}
                      aria-label="Decrease quantity"
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ minWidth: '28px', textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      disabled={item.quantity >= maxStock}
                      style={{
                        padding: '0.4rem 0.65rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: item.quantity >= maxStock ? 'not-allowed' : 'pointer',
                        color: item.quantity >= maxStock ? 'var(--text-light)' : 'var(--text-secondary)',
                      }}
                      aria-label="Increase quantity"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <button
                    onClick={() => setItemToRemove(item)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--danger-500)',
                      padding: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-sm)',
                    }}
                    title="Remove item"
                    aria-label={`Remove ${item.productName} from cart`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Order Summary Column */}
        <div>
          <Card title="Order Summary">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.925rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Items Subtotal ({itemCount} items)</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>₹{cartTotal.toFixed(2)}</span>
              </div>

              {/* Delivery Note */}
              <div
                style={{
                  padding: '0.65rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Info size={14} />
                <span>Fulfillment & delivery fee will be calculated at checkout.</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '0.85rem',
                  marginTop: '0.25rem',
                  borderTop: '1px solid var(--border-light)',
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Cart Total</span>
                <span style={{ color: 'var(--primary-600)' }}>₹{cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                rightIcon={ArrowRight}
                onClick={() => navigate('/student/checkout')}
              >
                Proceed to Checkout
              </Button>

              <Button
                variant="outline"
                size="md"
                fullWidth
                leftIcon={ArrowLeft}
                onClick={() => {
                  if (cartShop?.id) navigate(`/student/shops/${cartShop.id}`);
                  else navigate('/student/shops');
                }}
              >
                Continue Shopping
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Clear Cart Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={() => {
          clearCart();
          setShowClearConfirm(false);
        }}
        title="Clear Entire Cart?"
        message={`Are you sure you want to remove all ${itemCount} items from your cart? This will completely empty your cart.`}
        confirmText="Yes, Clear Cart"
        cancelText="Cancel"
        isDanger
      />

      {/* Remove Single Item Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!itemToRemove}
        onClose={() => setItemToRemove(null)}
        onConfirm={() => {
          if (itemToRemove) {
            removeFromCart(itemToRemove.productId);
            setItemToRemove(null);
          }
        }}
        title="Remove Item from Cart?"
        message={`Are you sure you want to remove "${itemToRemove?.productName || 'this item'}" from your cart?`}
        confirmText="Remove Item"
        cancelText="Cancel"
        isDanger
      />
    </div>
  );
};

export default StudentCart;
