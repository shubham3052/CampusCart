import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  MapPin,
  Printer,
  Sparkles,
  ShoppingBag,
  Clock,
  Star,
  BookOpen,
  Calendar,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Flame,
  ThumbsUp,
  FileText,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import shopService from '../../services/shopService';
import productService from '../../services/productService';
import categoryService from '../../services/categoryService';
import academicService from '../../services/academicService';
import recommendationService from '../../services/recommendationService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import SearchBar from '../../components/common/SearchBar';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';
import EmptyState from '../../components/common/EmptyState';
import ProductCard from '../../components/cards/ProductCard';
import ShopCard from '../../components/cards/ShopCard';
import ShopConflictModal from '../../components/common/ShopConflictModal';

const StudentHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [searchTerm, setSearchTerm] = useState('');

  // Marketplace & Recommendation state
  const [categories, setCategories] = useState([]);
  const [recommendedForYou, setRecommendedForYou] = useState([]);
  const [buyAgain, setBuyAgain] = useState([]);
  const [becauseYouBought, setBecauseYouBought] = useState(null);
  const [academicRecs, setAcademicRecs] = useState(null);
  const [trendingProducts, setTrendingProducts] = useState([]);
  const [popularProducts, setPopularProducts] = useState([]);
  const [nearbyShops, setNearbyShops] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [academicMeta, setAcademicMeta] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchMarketplaceAndRecommendations = async () => {
      setIsLoading(true);
      setLoadError('');
      try {
        const [catsRes, recsRes, shopsRes, academicRes] = await Promise.allSettled([
          categoryService.getCategories({ is_active: true }),
          recommendationService.getHomeRecommendations(6),
          shopService.getShops({ is_active: true }),
          academicService.getRelevantEvents(30),
        ]);

        if (isMounted) {
          if (catsRes.status === 'fulfilled') setCategories(catsRes.value || []);
          if (shopsRes.status === 'fulfilled') setNearbyShops((shopsRes.value || []).slice(0, 4));
          if (academicRes.status === 'fulfilled') {
            setUpcomingEvents(academicRes.value?.events || []);
            setAcademicMeta(academicRes.value);
          }

          if (recsRes.status === 'fulfilled' && recsRes.value?.success) {
            const feed = recsRes.value;
            setRecommendedForYou(feed.recommended_for_you || []);
            setBuyAgain(feed.buy_again || []);
            setBecauseYouBought(feed.because_you_bought || null);
            setAcademicRecs(feed.academic_recommendations || null);
            setTrendingProducts(feed.trending || []);
            setPopularProducts(feed.popular || []);
          } else {
            // Fallback to recent products if recommendation feed fails
            const prods = await productService.getProducts({ is_active: true, ordering: '-created_at' });
            if (isMounted) setPopularProducts((prods || []).slice(0, 8));
          }
        }
      } catch (err) {
        console.error('Failed to load marketplace home data:', err);
        if (isMounted) {
          setLoadError('Unable to connect to the campus marketplace. Please ensure the backend server is running.');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchMarketplaceAndRecommendations();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleSearchSubmit = (query) => {
    if (query && query.trim()) {
      navigate(`/student/shops?search=${encodeURIComponent(query.trim())}`);
    }
  };

  const handleProductAdded = (product) => {
    setToastMessage(`Added "${product.name}" to cart`);
    setTimeout(() => setToastMessage(''), 2500);
    // Track interaction
    recommendationService.trackInteraction({
      product: product.id,
      shop: product.shop_id || (product.shop?.id),
      recommendation_type: product.recommendation_type || 'GENERAL',
      action: 'ADDED_TO_CART'
    }).catch(() => {});
  };

  return (
    <div className="page-container" style={{ maxWidth: '1150px' }}>
      <ShopConflictModal />

      {/* Floating Success Toast */}
      {toastMessage && (
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
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Welcome & Campus Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: 'white',
          borderRadius: 'var(--radius-xl)',
          padding: '2rem',
          marginBottom: '1.75rem',
          boxShadow: 'var(--shadow-lg)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'relative', zIndex: 2 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: 'rgba(255, 255, 255, 0.18)',
              padding: '0.25rem 0.75rem',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: '0.75rem',
            }}
          >
            <MapPin size={14} />
            <span>Delivering to: {user?.hostel_block ? `${user.hostel_block}, Room ${user.room_number || ''}` : 'Hostel Block A, Room 304'}</span>
          </div>

          <h1 style={{ color: 'white', fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
            Hey {user?.name || user?.first_name || user?.username || 'Student'} 👋 What do you need today?
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.85)', fontSize: '0.95rem', maxWidth: '600px', marginBottom: '1.5rem' }}>
            Smart recommendations for your academic semester, exam revision supplies, and fast-track Xerox printing.
          </p>

          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onSearch={handleSearchSubmit}
            placeholder="Search pens, registers, engineering sheets, or xerox shops... (Press Enter)"
            maxWidth="650px"
          />
        </div>
      </div>

      {loadError && (
        <ErrorMessage
          message={loadError}
          onRetry={() => window.location.reload()}
        />
      )}

      {/* 1. Academic Event Notice Banner */}
      {academicMeta && academicMeta.has_academic_profile && academicMeta.has_upcoming_events ? (
        <div
          className="card animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe',
            padding: '1rem 1.25rem',
            marginBottom: '1.75rem',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#3b82f6',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Calendar size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>
                    {academicMeta.institution_code || 'CAMPUS'} ACADEMIC ALERT
                  </span>
                  <Badge variant="primary" size="sm">
                    {upcomingEvents.length} Event{upcomingEvents.length !== 1 ? 's' : ''} Ahead
                  </Badge>
                </div>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e3a8a', margin: '0.15rem 0 0 0' }}>
                  {upcomingEvents[0]?.title} begins {upcomingEvents[0]?.days_until === 0 ? 'today!' : upcomingEvents[0]?.days_until === 1 ? 'tomorrow!' : `in ${upcomingEvents[0]?.days_until} days.`}
                </h4>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              style={{ borderColor: '#3b82f6', color: '#1d4ed8' }}
              onClick={() => navigate('/student/profile')}
            >
              Academic Settings
            </Button>
          </div>
        </div>
      ) : null}

      {/* 2. RECOMMENDED FOR YOU (Hybrid Personalized) */}
      {recommendedForYou.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Sparkles size={20} color="#6366f1" />
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Recommended For You</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Personalized stationery tailored to your course and activity</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/student/shops')} rightIcon={ChevronRight}>
              Explore More
            </Button>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
          >
            {recommendedForYou.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCartSuccess={handleProductAdded}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3. BUY AGAIN (Repeat Essentials) */}
      {buyAgain.length > 0 && (
        <div
          style={{
            marginBottom: '2.5rem',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 'var(--radius-xl)',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <RotateCcw size={20} color="#059669" />
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>Buy Again</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Quick reorder for notebooks, pens, and paper you frequently use</p>
              </div>
            </div>
            <Badge variant="success" size="sm">{buyAgain.length} Past Purchases</Badge>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
          >
            {buyAgain.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCartSuccess={handleProductAdded}
              />
            ))}
          </div>
        </div>
      )}

      {/* 4. ACADEMIC RECOMMENDATIONS & SERVICES */}
      {academicRecs && academicRecs.has_events && (
        <div
          style={{
            marginBottom: '2.75rem',
            background: 'linear-gradient(135deg, #faf5ff 0%, #f3e8ff 100%)',
            border: '1px solid #e9d5ff',
            borderRadius: 'var(--radius-xl)',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Calendar size={22} color="#7e22ce" />
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#581c87' }}>
                  {academicRecs.upcoming_event?.title || 'Academic Schedule'} Essentials
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#7e22ce' }}>
                  Supplies and printing services recommended for your upcoming {academicRecs.upcoming_event?.event_type_display || 'Exam / Submission'}
                </p>
              </div>
            </div>
            <Badge variant="primary" size="sm">
              {academicRecs.upcoming_event?.days_until !== undefined
                ? `${academicRecs.upcoming_event.days_until} days remaining`
                : 'Upcoming'}
            </Badge>
          </div>

          {/* Recommended Stationery Products for Event */}
          {academicRecs.products && academicRecs.products.length > 0 && (
            <div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', marginBottom: '1.25rem' }}
            >
              {academicRecs.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCartSuccess={handleProductAdded}
                />
              ))}
            </div>
          )}

          {/* Recommended Printing / Binding Services */}
          {academicRecs.services && academicRecs.services.length > 0 && (
            <div style={{ borderTop: '1px dashed #d8b4fe', paddingTop: '1rem', marginTop: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#581c87', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Printer size={16} /> Fast-Track Print & Binding Centers for {academicRecs.upcoming_event?.title}:
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {academicRecs.services.map((srv, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'white',
                      border: '1px solid #e9d5ff',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <h5 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                        {srv.shop_name}
                      </h5>
                      <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0.2rem 0' }}>
                        B/W: ₹{srv.bw_rate_per_page}/page • Spiral: ₹{srv.spiral_binding_price}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      style={{ borderColor: '#a855f7', color: '#7e22ce', width: '100%' }}
                      onClick={() => navigate(srv.target_route)}
                    >
                      Pre-Order Printing
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 5. BECAUSE YOU BOUGHT THIS (Co-purchase bundle) */}
      {becauseYouBought && becauseYouBought.items && becauseYouBought.items.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ThumbsUp size={20} color="#0284c7" />
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  Because You Bought &ldquo;{becauseYouBought.reference_product_name}&rdquo;
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Students often purchase these complementary supplies together</p>
              </div>
            </div>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
          >
            {becauseYouBought.items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCartSuccess={handleProductAdded}
              />
            ))}
          </div>
        </div>
      )}

      {/* 6. TRENDING NOW */}
      {trendingProducts.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Flame size={20} color="#ea580c" />
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Trending Now</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fastest selling supplies surging across campus this week</p>
              </div>
            </div>
            <Badge variant="warning" size="sm">High Demand</Badge>
          </div>

          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}
          >
            {trendingProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCartSuccess={handleProductAdded}
              />
            ))}
          </div>
        </div>
      )}

      {/* 7. POPULAR STATIONERY */}
      <div style={{ marginBottom: '2.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Star size={20} color="#eab308" />
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Popular Campus Stationery</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Top customer ratings and verified in-stock items</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/student/shops')} rightIcon={ChevronRight}>
            Explore All
          </Button>
        </div>

        {popularProducts.length === 0 ? (
          <EmptyState
            title="No Products Available"
            description="No products found in the database."
          />
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
          >
            {popularProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCartSuccess={handleProductAdded}
              />
            ))}
          </div>
        )}
      </div>

      {/* 8. BROWSE BY CATEGORY */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Browse by Category</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Official stationery categories verified by campus stores</p>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '1rem 0' }}><Spinner size={24} /></div>
        ) : categories.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No categories found in the system.</p>
        ) : (
          <div style={{ display: 'flex', gap: '0.65rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/student/shops?category=${cat.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.6rem 1.1rem',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-light)',
                  backgroundColor: 'var(--bg-surface)',
                  color: 'var(--text-primary)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  boxShadow: 'var(--shadow-xs)',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--primary-400)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-light)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <BookOpen size={16} color="var(--primary-600)" />
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 9. NEARBY CAMPUS SHOPS */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Nearby Campus Shops</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Verified stationery stores & Xerox centers on campus</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/student/shops')} rightIcon={ChevronRight}>
            View All Shops
          </Button>
        </div>

        {isLoading ? (
          <div style={{ padding: '2rem 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner size={28} />
          </div>
        ) : nearbyShops.length === 0 ? (
          <EmptyState
            title="No Shops Found"
            description="No active campus shops found in the database."
          />
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
          >
            {nearbyShops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentHome;
