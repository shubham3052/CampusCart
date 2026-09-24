import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Store,
  MapPin,
  Clock,
  Star,
  Phone,
  Mail,
  ArrowLeft,
  Search,
  Filter,
  Package,
  Printer,
  Tag,
  MessageSquare,
  Truck,
  CheckCircle2,
  Heart,
  Share2,
  Check,
} from 'lucide-react';
import shopService from '../../services/shopService';
import productService from '../../services/productService';
import categoryService from '../../services/categoryService';
import recommendationService from '../../services/recommendationService';
import engagementService from '../../services/engagementService';
import { shareShop } from '../../utils/shareUtils';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import SearchBar from '../../components/common/SearchBar';
import Select from '../../components/common/Select';
import { Spinner } from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import ErrorMessage from '../../components/common/ErrorMessage';
import ProductCard from '../../components/cards/ProductCard';
import ShopConflictModal from '../../components/common/ShopConflictModal';
import ReviewSection from '../../components/reviews/ReviewSection';

const ShopDetail = () => {
  const { shopId } = useParams();
  const navigate = useNavigate();

  const [shop, setShop] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [popularInShop, setPopularInShop] = useState([]);
  const [activeTab, setActiveTab] = useState('products');

  // Filters & Sorting states for shop products
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortOrder, setSortOrder] = useState('name');
  const [inStockOnly, setInStockOnly] = useState(false);

  // Loading & error states
  const [isLoadingShop, setIsLoadingShop] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [shopError, setShopError] = useState('');
  const [toastText, setToastText] = useState('');

  // Shop Share state
  const [isShared, setIsShared] = useState(false);

  const handleShare = async () => {
    if (!shop) return;
    const res = await shareShop(shop);
    if (res.success) {
      setIsShared(true);
      setToastText('Shop link copied to clipboard!');
      setTimeout(() => setIsShared(false), 2000);
      setTimeout(() => setToastText(''), 3000);
    }
  };

  // Shop Favorite state
  const [isFavorite, setIsFavorite] = useState(false);
  const [favLoading, setFavLoading] = useState(false);

  const handleToggleFavorite = async () => {
    setFavLoading(true);
    try {
      const res = await engagementService.toggleShopFavorite(shopId);
      setIsFavorite(res.status === 'added');
      setToastText(res.status === 'added' ? 'Added store to your favorites!' : 'Removed store from favorites.');
      setTimeout(() => setToastText(''), 3000);
    } catch (err) {
      console.error('Failed to toggle shop favorite:', err);
    } finally {
      setFavLoading(false);
    }
  };

  // 1. Fetch Shop details and Categories
  useEffect(() => {
    let isMounted = true;
    setIsLoadingShop(true);
    setShopError('');

    engagementService.checkShopFavorite(shopId)
      .then((res) => {
        if (isMounted && res?.is_favorite !== undefined) {
          setIsFavorite(res.is_favorite);
        }
      })
      .catch(() => {});

    Promise.all([
      shopService.getShopById(shopId),
      categoryService.getCategories({ is_active: true }),
    ])
      .then(([shopData, catsData]) => {
        if (isMounted) {
          setShop(shopData);
          setCategories(catsData);
        }
      })
      .catch((err) => {
        console.error('Failed to load shop details:', err);
        if (isMounted) {
          setShopError(err.response?.status === 404 ? 'Shop not found. It may have been closed or removed.' : 'Unable to connect to the merchant store. Please try again.');
        }
      })
      .finally(() => {
        if (isMounted) setIsLoadingShop(false);
      });

    recommendationService.getPopularProducts({ shop: shopId, limit: 4 })
      .then((res) => {
        if (isMounted && res?.success) {
          setPopularInShop(res.recommendations || []);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [shopId]);

  // 2. Fetch Products for this shop with filters
  const loadProducts = () => {
    if (!shopId) return;
    setIsLoadingProducts(true);

    const params = {
      shop: shopId,
      is_active: true,
      ordering: sortOrder,
    };
    if (productSearch.trim()) params.search = productSearch.trim();
    if (selectedCategory) params.category = selectedCategory;
    if (inStockOnly) params.in_stock = 'true';

    productService.getProducts(params)
      .then(setProducts)
      .catch((err) => console.error('Failed to load shop products:', err))
      .finally(() => setIsLoadingProducts(false));
  };

  useEffect(() => {
    if (shop) {
      loadProducts();
    }
  }, [shop, selectedCategory, sortOrder, inStockOnly]);

  const handleSearchSubmit = (query) => {
    setProductSearch(query);
    loadProducts();
  };

  const handleProductAdded = (prod) => {
    setToastText(`Added "${prod.name}" to cart`);
    setTimeout(() => setToastText(''), 2200);
  };

  if (isLoadingShop) {
    return (
      <div className="page-container" style={{ minHeight: '60vh', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Spinner size={36} />
      </div>
    );
  }

  if (shopError || !shop) {
    return (
      <div className="page-container" style={{ maxWidth: '800px', marginTop: '2rem' }}>
        <ErrorMessage
          title="Merchant Unavailable"
          message={shopError || "This shop is currently unavailable."}
          onRetry={() => window.location.reload()}
        />
        <div style={{ marginTop: '1rem' }}>
          <Button variant="outline" onClick={() => navigate('/student/shops')} leftIcon={ArrowLeft}>
            Back to All Shops
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '1150px' }}>
      <ShopConflictModal />

      {/* Floating toast notification */}
      {toastText && (
        <div
          className="animate-fade-in"
          style={{
            position: 'fixed',
            bottom: '5rem',
            right: '1.5rem',
            zIndex: 100,
            backgroundColor: '#0f172a',
            color: 'white',
            padding: '0.8rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            fontSize: '0.875rem',
            border: '1px solid #334155',
          }}
        >
          <CheckCircle2 size={18} color="var(--success-500)" />
          <span>{toastText}</span>
        </div>
      )}

      {/* Breadcrumb & Back */}
      <div style={{ marginBottom: '1rem' }}>
        <Link
          to="/student/shops"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} /> Back to Shops Directory
        </Link>
      </div>

      {/* Shop Header Banner Card */}
      <div
        className="card"
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
          padding: '1.75rem',
          marginBottom: '2rem',
          borderRadius: 'var(--radius-xl)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {shop.name}
              </h1>
              <Badge variant="primary">{shop.shop_type_display || shop.shop_type}</Badge>
              <Badge variant={shop.is_active ? 'success' : 'neutral'}>
                {shop.is_active ? 'Open Now' : 'Closed'}
              </Badge>
            </div>

            {shop.description && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem', marginTop: '0.5rem', maxWidth: '750px', lineHeight: 1.5 }}>
                {shop.description}
              </p>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <MapPin size={15} color="var(--primary-600)" />
                <strong>{shop.campus_location || shop.address}</strong>
              </span>

              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Clock size={15} color="var(--primary-600)" />
                <span>{shop.opening_time?.slice(0, 5)} - {shop.closing_time?.slice(0, 5)}</span>
              </span>

              <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Star size={15} color="#f59e0b" fill="#f59e0b" />
                <strong>{parseFloat(shop.rating || 5.0).toFixed(1)} Rating</strong>
              </span>

              {shop.contact_phone && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Phone size={15} color="var(--primary-600)" />
                  <span>{shop.contact_phone}</span>
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Badge variant="secondary" icon={Truck}>Hostel Delivery</Badge>
              <Badge variant="info" icon={CheckCircle2}>Counter Pickup</Badge>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleShare}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: isShared ? '1px solid #86efac' : '1px solid var(--border-medium)',
                  background: isShared ? '#f0fdf4' : 'var(--bg-surface)',
                  color: isShared ? '#16a34a' : 'var(--primary-600)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                title="Share Store"
                aria-label="Share Store"
              >
                {isShared ? <Check size={16} color="#16a34a" /> : <Share2 size={16} />}
                <span>{isShared ? 'Link Copied!' : 'Share Shop'}</span>
              </button>
              <button
                type="button"
                onClick={handleToggleFavorite}
                disabled={favLoading}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  padding: '0.5rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: isFavorite ? '1px solid #FDA4AF' : '1px solid var(--border-medium)',
                  background: isFavorite ? '#FFF1F2' : 'var(--bg-surface)',
                  color: isFavorite ? '#E11D48' : 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
              >
                <Heart size={16} fill={isFavorite ? '#E11D48' : 'none'} color={isFavorite ? '#E11D48' : 'currentColor'} />
                {isFavorite ? 'Favorited Store' : 'Add to Favorites'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-light)',
          marginBottom: '1.5rem',
          gap: '1rem',
        }}
      >
        <button
          onClick={() => setActiveTab('products')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'products' ? '3px solid var(--primary-600)' : '3px solid transparent',
            color: activeTab === 'products' ? 'var(--primary-600)' : 'var(--text-muted)',
            fontWeight: activeTab === 'products' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          <Package size={18} />
          <span>Products ({products.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('printing')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'printing' ? '3px solid var(--primary-600)' : '3px solid transparent',
            color: activeTab === 'printing' ? 'var(--primary-600)' : 'var(--text-muted)',
            fontWeight: activeTab === 'printing' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          <Printer size={18} />
          <span>Printing & Xerox Services</span>
        </button>

        <button
          onClick={() => setActiveTab('reviews')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'reviews' ? '3px solid var(--primary-600)' : '3px solid transparent',
            color: activeTab === 'reviews' ? 'var(--primary-600)' : 'var(--text-muted)',
            fontWeight: activeTab === 'reviews' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
          }}
        >
          <MessageSquare size={18} />
          <span>Reviews</span>
        </button>
      </div>

      {/* TAB CONTENT */}
      {activeTab === 'products' && (
        <div>
          {/* Popular in this shop */}
          {popularInShop.length > 0 && !productSearch && !selectedCategory && (
            <div
              style={{
                marginBottom: '1.75rem',
                backgroundColor: '#f8fafc',
                padding: '1.25rem',
                borderRadius: 'var(--radius-xl)',
                border: '1px solid #e2e8f0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <Star size={18} color="#eab308" fill="#eab308" />
                <h4 style={{ fontSize: '1rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  Popular Customer Favorites in {shop.name}
                </h4>
              </div>
              <div
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}
              >
                {popularInShop.map((prod) => (
                  <ProductCard key={prod.id} product={prod} onAddToCartSuccess={handleProductAdded} />
                ))}
              </div>
            </div>
          )}

          {/* Products Filter & Search Bar */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.5rem',
              backgroundColor: 'var(--bg-surface)',
              padding: '1rem',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
            }}
          >
            <div style={{ flex: 1, minWidth: '260px' }}>
              <SearchBar
                value={productSearch}
                onChange={setProductSearch}
                onSearch={handleSearchSubmit}
                placeholder="Search products in this shop..."
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Sorting */}
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                style={{
                  padding: '0.65rem 0.9rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              >
                <option value="name">Sort: Name (A → Z)</option>
                <option value="-name">Sort: Name (Z → A)</option>
                <option value="price">Price: Low → High</option>
                <option value="-price">Price: High → Low</option>
                <option value="-created_at">Newly Added</option>
              </select>

              {/* In-stock checkbox */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500 }}>
                <input
                  type="checkbox"
                  checked={inStockOnly}
                  onChange={(e) => setInStockOnly(e.target.checked)}
                />
                <span>In Stock Only</span>
              </label>
            </div>
          </div>

          {/* Products Grid */}
          {isLoadingProducts ? (
            <div style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center' }}>
              <Spinner size={36} />
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products found"
              description={productSearch || selectedCategory ? "No stationery items match your search or filter inside this shop." : "This shop has not catalogued any products yet."}
              actionLabel={productSearch || selectedCategory ? "Clear Filters" : undefined}
              onAction={() => {
                setProductSearch('');
                setSelectedCategory('');
                setInStockOnly(false);
              }}
            />
          ) : (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
            >
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={{ ...product, shop_name: shop.name }}
                  onAddToCartSuccess={handleProductAdded}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'printing' && (
        <Card style={{ textAlign: 'center', padding: '3.5rem 1.5rem' }}>
          <Printer size={48} color="var(--primary-600)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Printing & Xerox Service Integration</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: '480px', margin: '0.5rem auto 1.5rem', lineHeight: 1.5 }}>
            Online PDF document upload, B&W / colour rate selection, spiral binding, and print queue monitoring will be connected in Step 12.
          </p>
          <Button variant="outline" size="sm" onClick={() => setActiveTab('products')}>
            Browse Stationery Products Instead
          </Button>
        </Card>
      )}

      {activeTab === 'reviews' && (
        <div style={{ marginTop: '1rem' }}>
          <ReviewSection shopId={shopId} />
        </div>
      )}
    </div>
  );
};

export default ShopDetail;
