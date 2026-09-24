import React, { useState, useEffect } from 'react';
import { Heart, Trash2, ShoppingCart, ListPlus, AlertTriangle, ArrowRight, Package, Check } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const StudentWishlist = () => {
  const navigate = useNavigate();
  const [wishlistItems, setWishlistItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');

  const fetchWishlist = async () => {
    setLoading(true);
    try {
      const data = await engagementService.getWishlist();
      setWishlistItems(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load wishlist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWishlist();
  }, []);

  const handleRemove = async (id, name) => {
    try {
      // Fast optimistic update
      setWishlistItems((prev) => prev.filter((item) => item.id !== id));
      await engagementService.toggleWishlist(id);
      setActionMsg(`'${name}' removed from your wishlist.`);
      setTimeout(() => setActionMsg(''), 3000);
      fetchWishlist();
    } catch (err) {
      fetchWishlist();
    }
  };

  const handleMoveToCart = async (item) => {
    try {
      const res = await engagementService.moveWishlistToCart(item.id);
      if (res.success && res.item) {
        // Add to local cart or trigger cart storage
        const currentCart = JSON.parse(localStorage.getItem('cart') || '[]');
        const existingIdx = currentCart.findIndex((c) => c.productId === res.item.product_id);
        if (existingIdx > -1) {
          currentCart[existingIdx].quantity += 1;
        } else {
          currentCart.push({
            productId: res.item.product_id,
            name: res.item.name,
            price: res.item.price,
            shopId: res.item.shop_id,
            shopName: res.item.shop_name,
            quantity: 1,
          });
        }
        localStorage.setItem('cart', JSON.stringify(currentCart));
        window.dispatchEvent(new Event('cart-updated'));
        setActionMsg(`'${res.item.name}' added to your cart!`);
        setTimeout(() => setActionMsg(''), 3000);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Product is out of stock.';
      alert(msg);
    }
  };

  const handleMoveToShoppingList = async (item) => {
    try {
      const res = await engagementService.moveWishlistToShoppingList(item.id);
      if (res.success) {
        setActionMsg(res.message);
        setTimeout(() => setActionMsg(''), 3000);
      }
    } catch (err) {
      alert('Failed to add to shopping list.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Heart size={28} color="#EF4444" fill="#EF4444" />
            My Wishlist
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
            Saved supplies, frequent orders, and restock notifications
          </p>
        </div>
        <Badge variant="primary" style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
          {wishlistItems.length} {wishlistItems.length === 1 ? 'Item' : 'Items'}
        </Badge>
      </div>

      {actionMsg && (
        <div style={{ padding: '0.85rem 1.25rem', background: '#ECFDF5', color: '#047857', borderRadius: '10px', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Check size={18} /> {actionMsg}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : wishlistItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
          <Heart size={56} color="#D1D5DB" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#374151' }}>Your wishlist is empty</h2>
          <p style={{ color: '#9CA3AF', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Save stationery items, class notebooks, and calculators here to check prices and restock updates.
          </p>
          <Button variant="primary" onClick={() => navigate('/student/shops')}>
            Explore Campus Shops
          </Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
          {wishlistItems.map((item) => {
            const prod = item.product_details || {};
            const inStock = item.is_in_stock;
            const alts = item.suggested_alternatives || [];

            return (
              <Card key={item.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <Badge variant={inStock ? 'success' : 'danger'}>
                      {inStock ? 'In Stock' : 'Out of Stock'}
                    </Badge>
                    <button
                      onClick={() => handleRemove(item.product, prod.name)}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                      title="Remove from wishlist"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <Link to={`/student/products/${item.product}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 4px', color: '#111827' }}>
                      {prod.name}
                    </h3>
                  </Link>

                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary-600, #4F46E5)', margin: '8px 0 12px' }}>
                    ₹{parseFloat(prod.price || 0).toFixed(2)}
                  </div>

                  {/* Unavailable State & Real Alternative Suggestions */}
                  {!inStock && alts.length > 0 && (
                    <div style={{ padding: '10px', background: '#FEF3C7', borderRadius: '8px', marginBottom: '12px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#92400E', marginBottom: '6px' }}>
                        <AlertTriangle size={14} /> Available Alternatives:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {alts.map((alt) => (
                          <Link
                            key={alt.id}
                            to={`/student/products/${alt.id}`}
                            style={{ color: '#4F46E5', textDecoration: 'none', display: 'flex', justifyContent: 'space-between' }}
                          >
                            <span>{alt.name}</span>
                            <span style={{ fontWeight: 600 }}>₹{alt.price.toFixed(2)}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!inStock}
                    onClick={() => handleMoveToCart(item)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    <ShoppingCart size={15} /> Add to Cart
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleMoveToShoppingList(item)}
                    title="Add to Shopping List"
                    style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <ListPlus size={16} /> List
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentWishlist;
