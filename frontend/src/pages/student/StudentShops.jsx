import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Store, Search, Filter, RefreshCw, MapPin, Navigation, LayoutGrid, Map as MapIcon, Compass } from 'lucide-react';
import shopService from '../../services/shopService';
import ShopCard from '../../components/cards/ShopCard';
import PageHeader from '../../components/common/PageHeader';
import SearchBar from '../../components/common/SearchBar';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';
import EmptyState from '../../components/common/EmptyState';
import ErrorMessage from '../../components/common/ErrorMessage';
import GoogleMapView from '../../components/maps/GoogleMapView';
import useGeolocation, { DEFAULT_CAMPUS_DATUM } from '../../hooks/useGeolocation';

const StudentShops = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const initialType = searchParams.get('shop_type') || 'ALL';

  const [searchTerm, setSearchTerm] = useState(initialSearch);
  const [selectedType, setSelectedType] = useState(initialType);
  const [viewMode, setViewMode] = useState('GRID'); // 'GRID' | 'MAP'
  const [radiusKm, setRadiusKm] = useState(10.0);
  const [shops, setShops] = useState([]);
  const [nearbyShops, setNearbyShops] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  // Geolocation
  const { coords: userCoords, requestLocation, isLoading: detectingLocation, errorMessage: geoError, isDenied: geoDenied } = useGeolocation();

  // Active query position: userCoords or fallback campus reference datum
  const activePosition = userCoords
    ? { lat: userCoords.latitude, lng: userCoords.longitude }
    : { lat: DEFAULT_CAMPUS_DATUM.latitude, lng: DEFAULT_CAMPUS_DATUM.longitude };

  const shopTypes = [
    { label: 'All Merchants', value: 'ALL' },
    { label: 'College Stationery', value: 'COLLEGE_STATIONERY' },
    { label: 'Printing & Xerox', value: 'PRINTING_XEROX' },
    { label: 'Local Stationery', value: 'LOCAL_STATIONERY' },
    { label: 'Book & Stationery', value: 'BOOK_STATIONERY' },
  ];

  // Standard shop catalog fetch
  const fetchShops = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = { is_active: true };
      if (selectedType !== 'ALL') {
        params.shop_type = selectedType;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const data = await shopService.getShops(params);
      setShops(data);
    } catch (err) {
      console.error('Error loading shops from backend:', err);
      setErrorMessage('Unable to load campus shops. Please verify the backend API is active.');
    } finally {
      setIsLoading(false);
    }
  };

  // Nearby shops fetch
  const fetchNearbyShops = async () => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const params = {
        latitude: activePosition.lat,
        longitude: activePosition.lng,
        radius: radiusKm,
      };
      if (selectedType !== 'ALL') {
        params.shop_type = selectedType;
      }
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const data = await shopService.getNearbyShops(params);
      const results = data.results || [];
      setNearbyShops(results);
    } catch (err) {
      console.error('Error loading nearby shops:', err);
      setErrorMessage('Unable to load nearby shops based on location coordinates.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'MAP') {
      fetchNearbyShops();
    } else {
      fetchShops();
    }
  }, [selectedType, viewMode, radiusKm, userCoords]);

  const handleSearch = (query) => {
    setSearchTerm(query);
    const params = {};
    if (selectedType !== 'ALL') params.shop_type = selectedType;
    if (query.trim()) params.search = query.trim();
    setSearchParams(params);

    if (viewMode === 'MAP') {
      fetchNearbyShops();
    } else {
      fetchShops();
    }
  };

  const handleTypeChange = (typeVal) => {
    setSelectedType(typeVal);
    const params = {};
    if (typeVal !== 'ALL') params.shop_type = typeVal;
    if (searchTerm.trim()) params.search = searchTerm.trim();
    setSearchParams(params);
  };

  const handleDetectLocation = async () => {
    try {
      await requestLocation();
    } catch (err) {
      console.warn('Geolocation detection ended:', err);
    }
  };

  // Map markers for nearby shops
  const mapMarkers = nearbyShops
    .filter((s) => s.latitude && s.longitude)
    .map((s) => ({
      id: s.id,
      lat: Number(s.latitude),
      lng: Number(s.longitude),
      title: s.name,
      type: 'shop',
      color: '#4f46e5',
      infoContent: `
        <strong>${s.name}</strong><br/>
        <span style="color: #64748b; font-size: 11px;">${s.campus_location || s.address}</span><br/>
        <span style="color: #2563eb; font-weight: 700; font-size: 11px;">📍 ${s.distance_km || 0} km away</span>
      `,
    }));

  return (
    <div className="page-container" style={{ maxWidth: '1150px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <PageHeader
          title="Campus Stationery & Printing Merchants"
          subtitle="Browse verified campus book depots, Xerox centers, and engineering supply stores"
        />

        {/* View Mode Switcher */}
        <div
          style={{
            display: 'flex',
            backgroundColor: 'var(--bg-surface-secondary, #f1f5f9)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '3px',
            border: '1px solid var(--border-medium, #e2e8f0)',
          }}
        >
          <button
            type="button"
            onClick={() => setViewMode('GRID')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: viewMode === 'GRID' ? '#ffffff' : 'transparent',
              color: viewMode === 'GRID' ? 'var(--primary-700, #4338ca)' : 'var(--text-secondary, #64748b)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'GRID' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={16} />
            <span>List View</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('MAP')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: viewMode === 'MAP' ? '#ffffff' : 'transparent',
              color: viewMode === 'MAP' ? 'var(--primary-700, #4338ca)' : 'var(--text-secondary, #64748b)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: 'pointer',
              boxShadow: viewMode === 'MAP' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <MapIcon size={16} />
            <span>Nearby Map View</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.75rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            onSearch={handleSearch}
            placeholder="Search shops by name, campus location, or landmark..."
            maxWidth="440px"
          />
          <Button
            variant="outline"
            size="md"
            onClick={() => handleSearch(searchTerm)}
            leftIcon={Search}
          >
            Search
          </Button>

          {/* Map Controls */}
          {viewMode === 'MAP' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <Button
                variant="outline"
                size="md"
                leftIcon={detectingLocation ? RefreshCw : Navigation}
                onClick={handleDetectLocation}
                disabled={detectingLocation}
              >
                {detectingLocation ? 'Detecting...' : userCoords ? 'GPS Active' : 'Use My Location'}
              </Button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.825rem', color: 'var(--text-secondary)' }}>
                <span>Radius:</span>
                <select
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(Number(e.target.value))}
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: 'var(--radius-md, 6px)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.825rem',
                    backgroundColor: 'var(--bg-surface)',
                  }}
                >
                  <option value={2}>2 km</option>
                  <option value={5}>5 km</option>
                  <option value={10}>10 km</option>
                  <option value={25}>25 km</option>
                </select>
              </div>
            </div>
          )}

          {(searchTerm || selectedType !== 'ALL') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setSelectedType('ALL');
                setSearchParams({});
                if (viewMode === 'MAP') {
                  fetchNearbyShops();
                } else {
                  fetchShops();
                }
              }}
            >
              Reset Filters
            </Button>
          )}
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
          {shopTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeChange(type.value)}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: 'var(--radius-full)',
                border: selectedType === type.value ? '1px solid var(--primary-600)' : '1px solid var(--border-light)',
                backgroundColor: selectedType === type.value ? 'var(--primary-600)' : 'var(--bg-surface)',
                color: selectedType === type.value ? 'white' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: 'var(--shadow-xs)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      {/* Geolocation notice / status */}
      {viewMode === 'MAP' && (
        <div style={{ marginBottom: '1.25rem' }}>
          {geoError ? (
            <div
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: '#fffbeb',
                border: '1px solid #fef3c7',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: '0.825rem',
                color: '#b45309',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Compass size={16} />
              <span>{geoError} Defaulting search origin to University Campus Center.</span>
            </div>
          ) : userCoords ? (
            <div
              style={{
                padding: '0.65rem 1rem',
                backgroundColor: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: '0.825rem',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Navigation size={16} />
              <span>Showing campus stationery shops within <strong>{radiusKm} km</strong> of your device position.</span>
            </div>
          ) : null}
        </div>
      )}

      {errorMessage && (
        <ErrorMessage
          message={errorMessage}
          onRetry={viewMode === 'MAP' ? fetchNearbyShops : fetchShops}
        />
      )}

      {/* ============================================================ */}
      {/* MAP VIEW MODE */}
      {/* ============================================================ */}
      {viewMode === 'MAP' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Map Display */}
          <GoogleMapView
            center={activePosition}
            zoom={15}
            height="420px"
            showCurrentLocation={!!userCoords}
            currentLocation={userCoords}
            markers={mapMarkers}
            onMarkerClick={(m) => {
              navigate(`/student/shops/${m.id}`);
            }}
          />

          {/* Nearby Shops Listing */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                Nearby Stationery & Xerox Shops ({nearbyShops.length})
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Sorted by proximity (closest first)
              </span>
            </div>

            {isLoading ? (
              <div style={{ padding: '3rem 0', display: 'flex', justifyContent: 'center' }}>
                <Spinner size={36} />
              </div>
            ) : nearbyShops.length === 0 ? (
              <EmptyState
                icon={Store}
                title="No stationery shops found nearby"
                description={`No shops found within ${radiusKm} km radius. Try increasing the search radius or resetting filters.`}
                actionLabel="Expand to 25 km"
                onAction={() => setRadiusKm(25)}
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
      ) : (
        /* ============================================================ */
        /* STANDARD GRID VIEW MODE */
        /* ============================================================ */
        isLoading ? (
          <div style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center' }}>
            <Spinner size={36} />
          </div>
        ) : shops.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No shops found"
            description={searchTerm ? `No campus shops matched "${searchTerm}". Try adjusting your keyword or filter.` : "There are currently no active shops in this category."}
            actionLabel="Clear Filters"
            onAction={() => {
              setSearchTerm('');
              setSelectedType('ALL');
              setSearchParams({});
              shopService.getShops({ is_active: true }).then(setShops);
            }}
          />
        ) : (
          <div
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))' }}
          >
            {shops.map((shop) => (
              <ShopCard key={shop.id} shop={shop} />
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default StudentShops;
