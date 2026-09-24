import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Store, MapPin, Navigation, Clock, AlertCircle, Compass, CheckCircle2, ExternalLink } from 'lucide-react';
import { loadGoogleMapsApi } from '../../services/googleMapsLoader';
import useGeolocation, { DEFAULT_CAMPUS_DATUM } from '../../hooks/useGeolocation';
import Button from '../common/Button';

// Haversine distance utility for Leaflet fallback
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * DeliveryRouteMap Component
 * 
 * Multi-stop static delivery route display:
 * [Delivery Partner (on-demand GPS)] -> [Shop / Pickup Location] -> [Customer / Drop-off Location]
 * 
 * Dual-Engine Support:
 * - Google Maps Platform (DirectionsRenderer) when API key is configured
 * - Leaflet + OpenStreetMap fallback with real waypoints, polylines, and distance/time metrics
 * - Responsive on mobile (320px+) and desktop
 * - NO continuous GPS streaming / background tracking
 */
const DeliveryRouteMap = ({
  delivery,
  height = '360px',
}) => {
  const mapContainerRef = useRef(null);
  const activeEngineRef = useRef(null);

  // Google Maps refs
  const googleMapRef = useRef(null);
  const directionsRendererRef = useRef(null);

  // Leaflet refs
  const leafletMapRef = useRef(null);
  const leafletLayerGroupRef = useRef(null);

  const { requestLocation, isLoading: detectingLocation, errorMessage: geoError } = useGeolocation();
  const [partnerCoords, setPartnerCoords] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [engine, setEngine] = useState(null); // 'GOOGLE' | 'LEAFLET'

  const isValidCoordinate = (lat, lng) => {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return !isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
  };

  // Coordinates with robust fallbacks
  const rawShopLat = delivery?.shop_latitude ?? delivery?.shop?.latitude;
  const rawShopLng = delivery?.shop_longitude ?? delivery?.shop?.longitude;
  const shopLat = isValidCoordinate(rawShopLat, rawShopLng) ? Number(rawShopLat) : DEFAULT_CAMPUS_DATUM.latitude;
  const shopLng = isValidCoordinate(rawShopLat, rawShopLng) ? Number(rawShopLng) : DEFAULT_CAMPUS_DATUM.longitude;
  const shopName = delivery?.shop_name || delivery?.shop?.name || 'Campus Stationery Shop';
  const shopAddress = delivery?.shop_address || delivery?.shop?.address || 'Campus Center Counter';

  const rawCustLat = delivery?.order?.delivery_latitude ?? delivery?.delivery_latitude ?? delivery?.customer_latitude ?? delivery?.latitude;
  const rawCustLng = delivery?.order?.delivery_longitude ?? delivery?.delivery_longitude ?? delivery?.customer_longitude ?? delivery?.longitude;
  const customerLat = isValidCoordinate(rawCustLat, rawCustLng) ? Number(rawCustLat) : 28.5420;
  const customerLng = isValidCoordinate(rawCustLat, rawCustLng) ? Number(rawCustLng) : 77.1915;
  const customerName = delivery?.customer_name || 'Student';
  const customerAddress = delivery?.delivery_address || (delivery?.hostel_block ? `${delivery.hostel_block}, ${delivery.room_number}` : 'Campus Hostel Room');

  // On-demand location detection
  const handleDetectLocation = async () => {
    try {
      const pos = await requestLocation();
      if (isValidCoordinate(pos.latitude, pos.longitude)) {
        setPartnerCoords({
          lat: Number(pos.latitude.toFixed(6)),
          lng: Number(pos.longitude.toFixed(6)),
        });
      }
    } catch (err) {
      console.warn('Courier location detection ended:', err);
    }
  };

  // 1. Initialize Map Engine (Google or Leaflet fallback)
  useEffect(() => {
    let isMounted = true;

    loadGoogleMapsApi()
      .then((googleMaps) => {
        if (!isMounted || !mapContainerRef.current) return;

        try {
          const map = new googleMaps.Map(mapContainerRef.current, {
            center: { lat: shopLat, lng: shopLng },
            zoom: 15,
            mapTypeId: googleMaps.MapTypeId.ROADMAP,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: true,
          });

          const directionsRenderer = new googleMaps.DirectionsRenderer({
            map,
            suppressMarkers: false,
            polylineOptions: {
              strokeColor: '#4f46e5',
              strokeWeight: 4,
              strokeOpacity: 0.85,
            },
          });

          googleMapRef.current = map;
          directionsRendererRef.current = directionsRenderer;
          activeEngineRef.current = 'GOOGLE';
          setEngine('GOOGLE');
        } catch (err) {
          console.warn('Google Map route init failed, switching to Leaflet:', err);
          initLeaflet();
        }
      })
      .catch(() => {
        if (!isMounted) return;
        initLeaflet();
      });

    function initLeaflet() {
      if (!isMounted || !mapContainerRef.current) return;
      try {
        if (leafletMapRef.current) {
          leafletMapRef.current.remove();
        }

        const map = L.map(mapContainerRef.current, {
          center: [shopLat, shopLng],
          zoom: 15,
          zoomControl: true,
          attributionControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layerGroup = L.layerGroup().addTo(map);

        leafletMapRef.current = map;
        leafletLayerGroupRef.current = layerGroup;
        activeEngineRef.current = 'LEAFLET';
        setEngine('LEAFLET');

        setTimeout(() => {
          if (map) map.invalidateSize();
        }, 200);
      } catch (lErr) {
        console.error('Failed to initialize Leaflet route map:', lErr);
      }
    }

    return () => {
      isMounted = false;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        leafletLayerGroupRef.current = null;
      }
    };
  }, []);

  // 2. Compute Google Maps directions
  useEffect(() => {
    if (engine !== 'GOOGLE' || !window.google?.maps || !directionsRendererRef.current) return;

    const googleMaps = window.google.maps;
    const directionsService = new googleMaps.DirectionsService();

    const origin = partnerCoords
      ? new googleMaps.LatLng(partnerCoords.lat, partnerCoords.lng)
      : new googleMaps.LatLng(shopLat, shopLng);

    const destination = new googleMaps.LatLng(customerLat, customerLng);

    const waypoints = partnerCoords
      ? [{ location: new googleMaps.LatLng(shopLat, shopLng), stopover: true }]
      : [];

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: googleMaps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === googleMaps.DirectionsStatus.OK) {
          directionsRendererRef.current.setDirections(result);

          let totalMeters = 0;
          let totalSeconds = 0;
          result.routes[0].legs.forEach((leg) => {
            totalMeters += leg.distance.value;
            totalSeconds += leg.duration.value;
          });

          setRouteInfo({
            distanceKm: (totalMeters / 1000).toFixed(2),
            durationMins: Math.max(1, Math.round(totalSeconds / 60)),
          });
        }
      }
    );
  }, [engine, partnerCoords, shopLat, shopLng, customerLat, customerLng]);

  // 3. Compute Leaflet Route (Markers + Polyline + Metrics)
  useEffect(() => {
    if (engine !== 'LEAFLET') return;
    const map = leafletMapRef.current;
    const layerGroup = leafletLayerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const points = [];
    const boundsCoords = [];
    let sequenceIndex = 1;

    // A. Courier Location (Optional)
    if (partnerCoords) {
      const courierPoint = [partnerCoords.lat, partnerCoords.lng];
      points.push(courierPoint);
      boundsCoords.push(courierPoint);

      const courierIcon = L.divIcon({
        html: `
          <div style="
            width: 32px;
            height: 32px;
            background: #22c55e;
            border: 2.5px solid #fff;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: 800;
            font-size: 13px;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          ">1</div>
        `,
        className: 'route-stop-courier',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker(courierPoint, { icon: courierIcon }).addTo(layerGroup);
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <strong style="color: #15803d;">Stop 1: Delivery Partner (You)</strong><br/>
          <span>Lat: ${partnerCoords.lat.toFixed(5)}, Lng: ${partnerCoords.lng.toFixed(5)}</span>
        </div>
      `);
      sequenceIndex++;
    }

    // B. Pickup Shop
    const shopPoint = [shopLat, shopLng];
    points.push(shopPoint);
    boundsCoords.push(shopPoint);

    const shopIcon = L.divIcon({
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #4f46e5;
          border: 2.5px solid #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 13px;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
        ">${sequenceIndex}</div>
      `,
      className: 'route-stop-shop',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const shopMarker = L.marker(shopPoint, { icon: shopIcon }).addTo(layerGroup);
    shopMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 13px;">
        <strong style="color: #3730a3;">Stop ${sequenceIndex}: Pickup (${shopName})</strong><br/>
        <span>${shopAddress}</span>
      </div>
    `);
    sequenceIndex++;

    // C. Customer Drop-off
    const customerPoint = [customerLat, customerLng];
    points.push(customerPoint);
    boundsCoords.push(customerPoint);

    const custIcon = L.divIcon({
      html: `
        <div style="
          width: 32px;
          height: 32px;
          background: #ef4444;
          border: 2.5px solid #fff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 800;
          font-size: 13px;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
        ">${sequenceIndex}</div>
      `,
      className: 'route-stop-customer',
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const custMarker = L.marker(customerPoint, { icon: custIcon }).addTo(layerGroup);
    custMarker.bindPopup(`
      <div style="font-family: inherit; font-size: 13px;">
        <strong style="color: #dc2626;">Stop ${sequenceIndex}: Drop-off (${customerName})</strong><br/>
        <span>${customerAddress}</span>
      </div>
    `);

    // D. Connecting Route Polyline
    L.polyline(points, {
      color: '#4f46e5',
      weight: 4.5,
      opacity: 0.85,
      dashArray: '7, 9',
    }).addTo(layerGroup);

    // E. Calculate Haversine Total Distance & Estimated Travel Time
    let totalKm = 0;
    for (let i = 0; i < points.length - 1; i++) {
      totalKm += calculateHaversineKm(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
    }
    const estMins = Math.max(2, Math.round(totalKm * 3.5)); // Average campus road speed
    setRouteInfo({
      distanceKm: totalKm.toFixed(2),
      durationMins: estMins,
    });

    // F. Fit bounds
    if (boundsCoords.length > 1) {
      map.fitBounds(boundsCoords, { padding: [45, 45], maxZoom: 17 });
    }
  }, [engine, partnerCoords, shopLat, shopLng, customerLat, customerLng, shopName, shopAddress, customerName, customerAddress]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
      {/* On-Demand Location Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: '0.65rem 0.85rem',
          backgroundColor: 'var(--bg-surface-secondary, #f8fafc)',
          borderRadius: 'var(--radius-md, 8px)',
          border: '1px solid var(--border-light, #e2e8f0)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <Truck size={16} color="var(--primary-600)" />
          <span>
            {partnerCoords
              ? 'Your current GPS position is included in the route'
              : 'Add your current device location to start route'}
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          leftIcon={Navigation}
          onClick={handleDetectLocation}
          disabled={detectingLocation}
        >
          {detectingLocation ? 'Detecting Location...' : partnerCoords ? 'Update Location' : 'Include My Location'}
        </Button>
      </div>

      {geoError && (
        <div style={{ fontSize: '0.75rem', color: '#d97706', padding: '0.25rem 0' }}>
          ⚠️ {geoError}
        </div>
      )}

      {/* Map Canvas */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height,
          minHeight: '280px',
          borderRadius: 'var(--radius-lg, 12px)',
          overflow: 'hidden',
          border: '1px solid var(--border-medium, #e2e8f0)',
          backgroundColor: '#f1f5f9',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '100%',
            minHeight: '280px',
          }}
        />

        {/* Engine Badge */}
        {engine && (
          <div
            style={{
              position: 'absolute',
              bottom: '8px',
              right: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '2px 7px',
              fontSize: '11px',
              fontWeight: 600,
              color: '#475569',
              zIndex: 1000,
              pointerEvents: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            {engine === 'GOOGLE' ? 'Google Maps Route' : 'OpenStreetMap Route'}
          </div>
        )}
      </div>

      {/* Route Summary Metric */}
      {routeInfo && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1.5rem',
            padding: '0.65rem 1rem',
            backgroundColor: 'var(--primary-50, #eff6ff)',
            borderRadius: 'var(--radius-md, 8px)',
            border: '1px solid var(--primary-200, #bfdbfe)',
            fontSize: '0.85rem',
            color: 'var(--primary-900, #1e3a8a)',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <strong>Est. Road Distance:</strong> {routeInfo.distanceKm} km
          </div>
          <div>
            <strong>Est. Travel Time:</strong> ~{routeInfo.durationMins} mins
          </div>
        </div>
      )}

      {/* Sequential Route Stop Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {partnerCoords && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.65rem 0.85rem',
              borderRadius: 'var(--radius-md, 8px)',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              fontSize: '0.85rem',
            }}
          >
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#22c55e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
              1
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#15803d' }}>Delivery Partner Location (You)</div>
              <div style={{ fontSize: '0.75rem', color: '#166534' }}>Lat: {partnerCoords.lat.toFixed(5)}, Lng: {partnerCoords.lng.toFixed(5)}</div>
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md, 8px)',
            backgroundColor: '#eef2ff',
            border: '1px solid #c7d2fe',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '200px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
              {partnerCoords ? '2' : '1'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#3730a3' }}>Pickup: {shopName}</div>
              <div style={{ fontSize: '0.75rem', color: '#4338ca', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shopAddress}</div>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${shopLat},${shopLng}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-md, 6px)',
              backgroundColor: '#ffffff',
              color: '#3730a3',
              border: '1px solid #c7d2fe',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={12} />
            Directions
          </a>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 'var(--radius-md, 8px)',
            backgroundColor: '#faf5ff',
            border: '1px solid #e9d5ff',
            fontSize: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '200px' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: '#9333ea', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
              {partnerCoords ? '3' : '2'}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#6b21a8' }}>Drop-off: {customerName}</div>
              <div style={{ fontSize: '0.75rem', color: '#7e22ce', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerAddress}</div>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${customerLat},${customerLng}`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.78rem',
              padding: '0.35rem 0.65rem',
              borderRadius: 'var(--radius-md, 6px)',
              backgroundColor: '#ffffff',
              color: '#6b21a8',
              border: '1px solid #e9d5ff',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            <ExternalLink size={12} />
            Directions
          </a>
        </div>
      </div>
    </div>
  );
};

export default DeliveryRouteMap;
