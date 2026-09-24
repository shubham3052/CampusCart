import React, { useState, useEffect } from 'react';
import { Bookmark, Store, MapPin, Clock, ArrowRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const StudentFavorites = () => {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const data = await engagementService.getShopFavorites();
      setFavorites(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load favorite shops:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, []);

  const handleUnfavorite = async (shopId) => {
    try {
      setFavorites((prev) => prev.filter((f) => f.shop !== shopId));
      await engagementService.toggleShopFavorite(shopId);
    } catch (err) {
      fetchFavorites();
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bookmark size={28} color="var(--primary-600, #4F46E5)" fill="var(--primary-600, #4F46E5)" />
            Favorite Shops
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
            Quick access to your preferred campus stationery and Xerox outlets
          </p>
        </div>
        <Badge variant="primary" style={{ padding: '6px 12px', fontSize: '0.9rem' }}>
          {favorites.length} {favorites.length === 1 ? 'Shop' : 'Shops'}
        </Badge>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : favorites.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
          <Store size={56} color="#D1D5DB" style={{ margin: '0 auto 1rem' }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#374151' }}>No favorite shops saved</h2>
          <p style={{ color: '#9CA3AF', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            Bookmark campus shops to quickly check catalog updates, opening hours, and pickup slots.
          </p>
          <Link to="/student/shops">
            <Button variant="primary">Browse Shops</Button>
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
          {favorites.map((fav) => {
            const s = fav.shop_details || {};
            return (
              <Card key={fav.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <Badge variant={s.is_active ? 'success' : 'danger'}>
                      {s.is_active ? 'Open & Active' : 'Closed'}
                    </Badge>
                    <button
                      onClick={() => handleUnfavorite(fav.shop)}
                      style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer', padding: '4px' }}
                      title="Remove from favorites"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>
                    {s.name}
                  </h3>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#6B7280', marginBottom: '6px' }}>
                    <MapPin size={14} /> {s.campus_location || s.address}
                  </div>

                  {s.opening_time && s.closing_time && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#6B7280', marginBottom: '12px' }}>
                      <Clock size={14} /> {s.opening_time.slice(0, 5)} - {s.closing_time.slice(0, 5)}
                    </div>
                  )}
                </div>

                <Link to={`/student/shops/${fav.shop}`} style={{ textDecoration: 'none' }}>
                  <Button variant="outline" size="sm" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    View Store Catalog <ArrowRight size={14} />
                  </Button>
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentFavorites;
