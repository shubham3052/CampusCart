import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Package,
  Store,
  MapPin,
  Check,
  Plus,
  Minus,
  ShoppingCart,
  Zap,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Bell,
  Users,
  TrendingDown,
  ExternalLink,
  Heart,
  Share2,
} from 'lucide-react';
import productService from '../../services/productService';
import recommendationService from '../../services/recommendationService';
import bulkOrderService from '../../services/bulkOrderService';
import engagementService from '../../services/engagementService';
import { shareProduct } from '../../utils/shareUtils';
import { useCart } from '../../context/CartContext';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';
import ShopConflictModal from '../../components/common/ShopConflictModal';
import ProductCard from '../../components/cards/ProductCard';
import ReviewSection from '../../components/reviews/ReviewSection';

const ProductDetail = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { addToCart } = useCart();

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [isAdded, setIsAdded] = useState(false);
  const [frequentlyBought, setFrequentlyBought] = useState([]);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [bundleAdded, setBundleAdded] = useState(false);

  // Advanced Shopping Intelligence state
  const [comparisonData, setComparisonData] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertTargetPrice, setAlertTargetPrice] = useState('');
  const [alertSubmitting, setAlertSubmitting] = useState(false);
  const [alertSuccess, setAlertSuccess] = useState(false);
  const [alertError, setAlertError] = useState('');

  // Share state
  const [isShared, setIsShared] = useState(false);

  const handleShare = async () => {
    if (!product) return;
    const res = await shareProduct(product);
    if (res.success) {
      setIsShared(true);
      setTimeout(() => setIsShared(false), 2000);
    }
  };

  // Wishlist state
  const [inWishlist, setInWishlist] = useState(false);
  const [wishlistLoading, setWishlistLoading] = useState(false);

  const handleToggleWishlist = async () => {
    setWishlistLoading(true);
    try {
      const res = await engagementService.toggleWishlist(productId);
      setInWishlist(res.status === 'added');
    } catch (err) {
      console.error('Failed to toggle wishlist:', err);
    } finally {
      setWishlistLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setErrorMessage('');

    engagementService.checkWishlist(productId)
      .then((res) => {
        if (isMounted && res?.in_wishlist !== undefined) {
          setInWishlist(res.in_wishlist);
        }
      })
      .catch(() => {});

    productService.getProductById(productId)
      .then((data) => {
        if (isMounted) {
          setProduct(data);
          setQuantity(1);
          setAlertTargetPrice((parseFloat(data.price || 0) * 0.9).toFixed(2));
          recommendationService.trackInteraction({
            product: data.id,
            shop: data.shop_id || (data.shop?.id),
            recommendation_type: 'PRODUCT_PAGE',
            action: 'VIEWED',
          }).catch(() => {});
        }
      })
      .catch((err) => {
        console.error('Failed to load product:', err);
        if (isMounted) {
          setErrorMessage(
            err.response?.status === 404
              ? 'Product not found. It may have been discontinued or removed.'
              : 'Unable to load product information. Please check your connection.'
          );
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    // Cross-shop price comparison
    bulkOrderService.getPriceComparison(productId)
      .then((res) => {
        if (isMounted && res?.success) {
          setComparisonData(res);
        }
      })
      .catch(() => {});

    // In-stock product alternatives
    bulkOrderService.getAlternatives(productId)
      .then((res) => {
        if (isMounted && res?.success) {
          setAlternatives(res.alternatives || []);
        }
      })
      .catch(() => {});

    recommendationService.getFrequentlyBoughtTogether(productId, 3)
      .then((res) => {
        if (isMounted && res?.success) {
          setFrequentlyBought(res.recommendations || []);
        }
      })
      .catch(() => {});

    recommendationService.getSimilarProducts(productId, 4)
      .then((res) => {
        if (isMounted && res?.success) {
          setSimilarProducts(res.recommendations || []);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [productId]);

  if (isLoading) {
    return (
      <div className="page-container" style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }

  if (errorMessage || !product) {
    return (
      <div className="page-container" style={{ maxWidth: '700px', marginTop: '3rem' }}>
        <ErrorMessage
          title="Product Unavailable"
          message={errorMessage || "The requested stationery product could not be found."}
          onRetry={() => window.location.reload()}
        />
        <div style={{ marginTop: '1.25rem' }}>
          <Button variant="outline" onClick={() => navigate('/student/shops')} leftIcon={ArrowLeft}>
            Browse Campus Shops
          </Button>
        </div>
      </div>
    );
  }

  const stock = Number(product.current_stock ?? 0);
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 10;
  const price = parseFloat(product.price || 0);

  const handleIncrement = () => {
    if (quantity < stock) {
      setQuantity((q) => q + 1);
    }
  };

  const handleDecrement = () => {
    if (quantity > 1) {
      setQuantity((q) => q - 1);
    }
  };

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    const result = addToCart(product, quantity);
    if (result.success) {
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
    }
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    const result = addToCart(product, quantity);
    if (result.success) {
      navigate('/student/cart');
    }
  };

  return (
    <div className="page-container" style={{ maxWidth: '1000px' }}>
      <ShopConflictModal />

      {/* Breadcrumbs */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.85rem',
          color: 'var(--text-muted)',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <Link to="/student/shops" style={{ color: 'var(--text-muted)' }}>
          Shops
        </Link>
        <ChevronRight size={14} />
        {product.shop && (
          <>
            <Link to={`/student/shops/${product.shop}`} style={{ color: 'var(--primary-600)', fontWeight: 500 }}>
              {product.shop_name}
            </Link>
            <ChevronRight size={14} />
          </>
        )}
        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{product.name}</span>
      </nav>

      {/* Product Detail Grid */}
      <div
        className="card"
        style={{
          padding: 'clamp(1rem, 3vw, 2rem)',
          borderRadius: 'var(--radius-xl)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '2.5rem',
        }}
      >
        {/* Left Column: Product Visual */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div
            style={{
              width: '100%',
              height: 'clamp(220px, 40vw, 320px)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--bg-surface-secondary)',
              border: '1px solid var(--border-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {product.image ? (
              <img
                src={product.image}
                alt={product.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--text-light)' }}>
                <Package size={64} color="var(--primary-400)" />
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {product.brand || 'Official Campus Stationery'}
                </span>
              </div>
            )}
          </div>

          {/* Quick Assurance Badges */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-surface-secondary)',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={16} color="var(--success-600)" />
              100% Genuine
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Zap size={16} color="var(--primary-600)" />
              Instant Pickup
            </span>
          </div>
        </div>

        {/* Right Column: Information & Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            {/* Category & Stock Badges + Share Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <Badge variant="primary">
                  {product.category_details?.name || 'General Stationery'}
                </Badge>
                {isOutOfStock ? (
                  <Badge variant="danger">Out of Stock</Badge>
                ) : isLowStock ? (
                  <Badge variant="warning">Low Stock ({stock} available)</Badge>
                ) : (
                  <Badge variant="success">In Stock ({stock} units)</Badge>
                )}
              </div>
              <button
                type="button"
                onClick={handleShare}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: isShared ? '1px solid #86efac' : '1px solid var(--border-medium)',
                  background: isShared ? '#f0fdf4' : 'var(--bg-surface)',
                  color: isShared ? '#16a34a' : 'var(--primary-600)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Share Product"
                aria-label="Share Product"
              >
                {isShared ? <Check size={14} color="#16a34a" /> : <Share2 size={14} />}
                <span>{isShared ? 'Link Copied!' : 'Share Product'}</span>
              </button>
            </div>

            <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3 }}>
              {product.name}
            </h1>

            {/* Merchant Location Tag */}
            {product.shop && (
              <div style={{ marginTop: '0.65rem' }}>
                <Link
                  to={`/student/shops/${product.shop}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    fontSize: '0.875rem',
                    color: 'var(--primary-600)',
                    fontWeight: 600,
                  }}
                >
                  <Store size={16} />
                  <span>Available at <strong>{product.shop_name}</strong></span>
                </Link>
                {product.shop_location && (
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                    ({product.shop_location})
                  </span>
                )}
              </div>
            )}

            {/* Price Box with Price Alert Trigger */}
            <div
              style={{
                margin: '1.25rem 0',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-secondary)',
                border: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  ₹{price.toFixed(2)}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  per {product.unit_display || product.unit || 'unit'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAlertModalOpen(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.4rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  background: 'var(--bg-surface)',
                  color: 'var(--primary-600)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Bell size={14} />
                Price Drop Alert
              </button>
            </div>

            {/* Description */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                Description
              </h4>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', lineHeight: 1.6 }}>
                {product.description || "Official university student stationery item tested and approved for campus coursework."}
              </p>
            </div>

            {/* Product Meta Specifications */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.75rem',
                fontSize: '0.825rem',
                padding: '0.85rem 0',
                borderTop: '1px solid var(--border-light)',
                borderBottom: '1px solid var(--border-light)',
                marginBottom: '1.5rem',
              }}
            >
              {product.brand && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Brand: </span>
                  <strong>{product.brand}</strong>
                </div>
              )}
              {product.sku && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>SKU: </span>
                  <strong>{product.sku}</strong>
                </div>
              )}
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Unit: </span>
                <strong>{product.unit_display || product.unit || 'Piece'}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Available Stock: </span>
                <strong style={{ color: isOutOfStock ? 'var(--danger-600)' : 'var(--success-600)' }}>
                  {stock} units
                </strong>
              </div>
            </div>
          </div>

          {/* Quantity Selector & Action Buttons */}
          <div>
            {!isOutOfStock ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Quantity:
                  </span>
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
                      onClick={handleDecrement}
                      disabled={quantity <= 1}
                      style={{
                        padding: '0.5rem 0.85rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: quantity <= 1 ? 'not-allowed' : 'pointer',
                        color: quantity <= 1 ? 'var(--text-light)' : 'var(--text-primary)',
                      }}
                    >
                      <Minus size={16} />
                    </button>
                    <span style={{ minWidth: '36px', textAlign: 'center', fontWeight: 700, fontSize: '0.95rem' }}>
                      {quantity}
                    </span>
                    <button
                      onClick={handleIncrement}
                      disabled={quantity >= stock}
                      style={{
                        padding: '0.5rem 0.85rem',
                        border: 'none',
                        background: 'transparent',
                        cursor: quantity >= stock ? 'not-allowed' : 'pointer',
                        color: quantity >= stock ? 'var(--text-light)' : 'var(--text-primary)',
                      }}
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    (Max: {stock})
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <Button
                    variant={isAdded ? 'secondary' : 'primary'}
                    size="lg"
                    onClick={handleAddToCart}
                    leftIcon={isAdded ? Check : ShoppingCart}
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    {isAdded ? 'Added to Cart' : 'Add to Cart'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={handleBuyNow}
                    leftIcon={Zap}
                    style={{ flex: 1, minWidth: '150px' }}
                  >
                    Buy Now
                  </Button>
                </div>

                <button
                  type="button"
                  onClick={handleToggleWishlist}
                  disabled={wishlistLoading}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    borderRadius: 'var(--radius-md)',
                    border: inWishlist ? '1px solid #FDA4AF' : '1px solid var(--border-medium)',
                    background: inWishlist ? '#FFF1F2' : 'var(--bg-surface)',
                    color: inWishlist ? '#E11D48' : 'var(--text-secondary)',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Heart size={17} fill={inWishlist ? '#E11D48' : 'none'} color={inWishlist ? '#E11D48' : 'currentColor'} />
                  {inWishlist ? 'Saved in Wishlist' : 'Add to Wishlist'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--danger-50)',
                    color: 'var(--danger-700)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  <AlertTriangle size={20} />
                  <span>This item is currently out of stock. Save it to your wishlist to get notified when restocked.</span>
                </div>

                <button
                  type="button"
                  onClick={handleToggleWishlist}
                  disabled={wishlistLoading}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    borderRadius: 'var(--radius-md)',
                    border: inWishlist ? '1px solid #FDA4AF' : '1px solid var(--border-medium)',
                    background: inWishlist ? '#FFF1F2' : 'var(--bg-surface)',
                    color: inWishlist ? '#E11D48' : 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Heart size={18} fill={inWishlist ? '#E11D48' : 'none'} color={inWishlist ? '#E11D48' : 'currentColor'} />
                  {inWishlist ? 'In Your Wishlist' : 'Save Out-of-Stock Item to Wishlist'}
                </button>
              </div>
            )}

            {/* Bulk / Class Ordering Promo Banner */}
            <div
              style={{
                marginTop: '1.25rem',
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08) 0%, rgba(168, 85, 247, 0.08) 100%)',
                border: '1px dashed var(--primary-300)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'var(--primary-100)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--primary-600)',
                    flexShrink: 0,
                  }}
                >
                  <Users size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                    Need in Bulk for Class or Project Team?
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)' }}>
                    Pool orders with classmates & unlock up to 20% campus volume discounts.
                  </div>
                </div>
              </div>
              <Link to="/student/bulk-orders">
                <Button size="sm" variant="outline">
                  Create / Join Class Order
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* CROSS-SHOP PRICE & AVAILABILITY COMPARISON */}
      {comparisonData && comparisonData.comparisons && comparisonData.comparisons.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: '2.5rem',
            padding: '1.75rem',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Campus Merchant Price & Stock Comparison
                </h3>
                <Badge variant="neutral">{comparisonData.shops_compared_count || comparisonData.comparisons.length} Stores</Badge>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Real-time stock and pricing for identical stationery items across campus merchants
              </p>
            </div>
            {comparisonData.potential_savings > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.85rem',
                  borderRadius: 'var(--radius-md)',
                  background: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  color: '#065f46',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                <TrendingDown size={16} color="#059669" />
                <span>Save ₹{comparisonData.potential_savings.toFixed(2)} at {comparisonData.best_shop}!</span>
              </div>
            )}
          </div>

          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-medium)', color: 'var(--text-muted)', fontSize: '0.775rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Campus Merchant</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Price</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Stock Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Fulfillment</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.comparisons.map((item) => (
                  <tr
                    key={item.product_id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      backgroundColor: item.is_current_product ? 'rgba(99, 102, 241, 0.04)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Store size={15} color="var(--primary-600)" />
                        {item.shop_name}
                        {item.is_current_product && (
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'var(--primary-100)', color: 'var(--primary-700)', fontWeight: 700 }}>
                            Current
                          </span>
                        )}
                        {item.is_best_price && (
                          <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 700 }}>
                            Lowest Price
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.shop_address}</div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                        ₹{parseFloat(item.price).toFixed(2)}
                      </div>
                      {item.price_difference < 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--success-600)', fontWeight: 600 }}>
                          -₹{Math.abs(item.price_difference).toFixed(2)} cheaper
                        </span>
                      ) : item.price_difference > 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          +₹{item.price_difference.toFixed(2)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Same price</span>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      {item.available_stock > 10 ? (
                        <Badge variant="success">In Stock ({item.available_stock})</Badge>
                      ) : item.available_stock > 0 ? (
                        <Badge variant="warning">Low Stock ({item.available_stock})</Badge>
                      ) : (
                        <Badge variant="danger">Out of Stock</Badge>
                      )}
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {item.pickup_available && <span>Pickup</span>}
                        {item.pickup_available && item.delivery_available && <span>•</span>}
                        {item.delivery_available && <span>Delivery</span>}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                      {item.is_current_product ? (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Viewing</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/student/products/${item.product_id}`)}
                          rightIcon={ExternalLink}
                        >
                          View Store
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* IN-STOCK ALTERNATIVES */}
      {alternatives && alternatives.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: '2.5rem',
            padding: '1.75rem',
            borderRadius: 'var(--radius-xl)',
            backgroundColor: isOutOfStock ? '#fffbeb' : 'var(--bg-surface)',
            border: isOutOfStock ? '1px solid #fde68a' : '1px solid var(--border-light)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {isOutOfStock ? 'Available In-Stock Alternatives' : 'Alternative Options in Stock'}
                </h3>
                {isOutOfStock && <Badge variant="warning">Recommended for Instant Purchase</Badge>}
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                {isOutOfStock
                  ? 'The current item is out of stock, but these identical or comparable items are ready for pickup or delivery right now.'
                  : 'Compare similar or identical models available from active campus merchants.'}
              </p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: '1rem',
            }}
          >
            {alternatives.map((alt) => (
              <div
                key={alt.product_id}
                style={{
                  padding: '1.25rem',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-light)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Badge variant={alt.match_type === 'IDENTICAL_OTHER_SHOP' ? 'primary' : 'neutral'}>
                      {alt.match_type === 'IDENTICAL_OTHER_SHOP' ? 'Exact Match' : 'Similar Item'}
                    </Badge>
                    <span style={{ fontSize: '0.75rem', color: 'var(--success-600)', fontWeight: 600 }}>
                      {alt.available_stock} in stock
                    </span>
                  </div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                    {alt.name}
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.775rem', color: 'var(--primary-600)', marginBottom: '0.75rem' }}>
                    <Store size={13} />
                    <span>{alt.shop_name}</span>
                  </div>
                  <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
                    {alt.reason}
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      ₹{parseFloat(alt.price).toFixed(2)}
                    </span>
                    {alt.price_difference < 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--success-600)', fontWeight: 700 }}>
                        Save ₹{Math.abs(alt.price_difference).toFixed(2)}
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    style={{ width: '100%' }}
                    onClick={() => navigate(`/student/products/${alt.product_id}`)}
                  >
                    View Product
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. FREQUENTLY BOUGHT TOGETHER BUNDLE */}
      {frequentlyBought.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: '2.5rem',
            padding: '1.5rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Frequently Bought Together
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Students frequently purchase these companion stationery items with this product
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--primary-700)' }}>
                Bundle: ₹{(price + frequentlyBought.reduce((acc, curr) => acc + (curr.price || 0), 0)).toFixed(2)}
              </span>
              <Button
                size="sm"
                variant={bundleAdded ? 'secondary' : 'primary'}
                onClick={() => {
                  if (!isOutOfStock) addToCart(product, 1);
                  frequentlyBought.forEach((item) => addToCart(item, 1));
                  setBundleAdded(true);
                  setTimeout(() => setBundleAdded(false), 2000);
                }}
                leftIcon={bundleAdded ? Check : Plus}
              >
                {bundleAdded ? 'Bundle Added!' : 'Add All to Cart'}
              </Button>
            </div>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {frequentlyBought.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      )}

      {/* 2. SIMILAR PRODUCTS */}
      {similarProducts.length > 0 && (
        <div style={{ marginTop: '2.5rem', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Similar Stationery Products
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Comparable specifications, brand, and category options
              </p>
            </div>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
          >
            {similarProducts.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </div>
      )}

      {/* 3. RATINGS & VERIFIED REVIEWS */}
      <div style={{ marginTop: '2.5rem', marginBottom: '2.5rem' }}>
        <ReviewSection productId={productId} />
      </div>

      {/* PRICE DROP & RESTOCK ALERT MODAL */}
      <Modal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        title="Set Price Drop & Restock Alert"
        maxWidth="460px"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!alertTargetPrice || parseFloat(alertTargetPrice) <= 0) {
              setAlertError('Please enter a valid target price.');
              return;
            }
            try {
              setAlertSubmitting(true);
              setAlertError('');
              await bulkOrderService.setPriceAlert(productId, parseFloat(alertTargetPrice));
              setAlertSuccess(true);
              setTimeout(() => {
                setIsAlertModalOpen(false);
                setAlertSuccess(false);
              }, 2000);
            } catch (err) {
              console.error('Failed to set price alert:', err);
              setAlertError(err.response?.data?.message || err.response?.data?.detail || 'Failed to set price alert.');
            } finally {
              setAlertSubmitting(false);
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
              {product.name}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Current Price: <strong>₹{price.toFixed(2)}</strong> at {product.shop_name}
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            We'll automatically monitor campus stock and merchant price changes. When this item drops to or below your target price, or restocks, you'll receive an instant campus alert notification.
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Notify Me If Price Drops To (₹):
            </label>
            <input
              type="number"
              step="0.50"
              min="1"
              max={price}
              value={alertTargetPrice}
              onChange={(e) => setAlertTargetPrice(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                fontSize: '1rem',
                fontWeight: 600,
              }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
              Suggested target (10% off): ₹{(price * 0.9).toFixed(2)}
            </span>
          </div>

          {alertError && (
            <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: '#fef2f2', color: '#991b1b', fontSize: '0.8rem' }}>
              {alertError}
            </div>
          )}

          {alertSuccess && (
            <div style={{ padding: '0.65rem', borderRadius: 'var(--radius-sm)', backgroundColor: '#f0fdf4', color: '#166534', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <CheckCircle2 size={16} />
              Alert set successfully! We'll notify you when price changes.
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAlertModalOpen(false)}
              disabled={alertSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              leftIcon={Bell}
              disabled={alertSubmitting}
            >
              {alertSubmitting ? 'Saving Alert...' : 'Set Alert'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ProductDetail;
