import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Info, AlertTriangle, ExternalLink } from 'lucide-react';
import { loadGoogleMapsApi, isGoogleMapsLoaded, getGoogleMapsApiKey } from '../../services/googleMapsLoader';

export const isValidCoordinate = (lat, lng) => {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return !isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
};

const DEFAULT_MAP_CENTER = { lat: 28.5450, lng: 77.1926 };

const getSafeCenter = (c) => {
  if (c && isValidCoordinate(c.lat, c.lng)) {
    return { lat: Number(c.lat), lng: Number(c.lng) };
  }
  return DEFAULT_MAP_CENTER;
};

/**
 * GoogleMapView Component
 * 
 * Resilient, Dual-Engine Campus Map Renderer:
 * 1. Primary: Google Maps Platform JavaScript SDK (when VITE_GOOGLE_MAPS_API_KEY is configured and valid).
 * 2. Fallback: Leaflet + OpenStreetMap tiles (when API key is unset, restricted, offline, or quota exceeded).
 * 
 * Features:
 * - User device location marker (with high-accuracy coordinate rendering)
 * - Custom pins for stationery shops, delivery drop points, and custom markers
 * - Interactive click-to-pick (`onMapClick`) and pin drag-and-drop (`onDragEnd`)
 * - Auto-fits bounds to include all markers
 * - Fully responsive across mobile (320px+), tablet, and desktop viewports
 * - Zero empty/dead canvas states
 */
const GoogleMapView = ({
  center = DEFAULT_MAP_CENTER, // Default University Campus Core
  zoom = 15,
  markers = [],
  height = '360px',
  onMapClick = null,
  onMarkerClick = null,
  showCurrentLocation = false,
  currentLocation = null,
  interactive = true,
  className = '',
  style = {},
}) => {
  const mapContainerRef = useRef(null);
  const activeEngineRef = useRef(null); // 'GOOGLE' | 'LEAFLET' | null

  // Google Maps instances
  const googleMapInstanceRef = useRef(null);
  const googleMarkersRef = useRef([]);
  const googleInfoWindowRef = useRef(null);

  // Leaflet instances
  const leafletMapInstanceRef = useRef(null);
  const leafletLayerGroupRef = useRef(null);

  const [engine, setEngine] = useState(null); // 'GOOGLE' | 'LEAFLET'
  const [isLoading, setIsLoading] = useState(true);

  const safeInitialCenter = getSafeCenter(center);

  // -------------------------------------------------------------
  // 1. ENGINE INITIALIZATION
  // -------------------------------------------------------------
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    loadGoogleMapsApi()
      .then((googleMaps) => {
        if (!isMounted || !mapContainerRef.current) return;

        try {
          // Initialize Google Map
          const map = new googleMaps.Map(mapContainerRef.current, {
            center: safeInitialCenter,
            zoom,
            mapTypeId: googleMaps.MapTypeId.ROADMAP,
            disableDefaultUI: !interactive,
            zoomControl: interactive,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: interactive,
            gestureHandling: interactive ? 'auto' : 'none',
            styles: [
              {
                featureType: 'poi.business',
                stylers: [{ visibility: 'simplified' }],
              },
            ],
          });

          if (onMapClick) {
            map.addListener('click', (event) => {
              onMapClick({
                lat: Number(event.latLng.lat().toFixed(6)),
                lng: Number(event.latLng.lng().toFixed(6)),
              });
            });
          }

          googleMapInstanceRef.current = map;
          googleInfoWindowRef.current = new googleMaps.InfoWindow();
          activeEngineRef.current = 'GOOGLE';
          setEngine('GOOGLE');
          setIsLoading(false);
        } catch (err) {
          console.warn('Google Map instantiation failed, falling back to Leaflet:', err);
          initLeaflet();
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        // Fallback to Leaflet + OpenStreetMap engine
        initLeaflet();
      });

    function initLeaflet() {
      if (!isMounted || !mapContainerRef.current) return;
      try {
        if (leafletMapInstanceRef.current) {
          leafletMapInstanceRef.current.remove();
        }

        const map = L.map(mapContainerRef.current, {
          center: [safeInitialCenter.lat, safeInitialCenter.lng],
          zoom,
          zoomControl: interactive,
          attributionControl: true,
          dragging: interactive,
          touchZoom: interactive,
          scrollWheelZoom: interactive ? 'center' : false,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors',
        }).addTo(map);

        const layerGroup = L.layerGroup().addTo(map);

        if (onMapClick) {
          map.on('click', (e) => {
            onMapClick({
              lat: Number(e.latlng.lat.toFixed(6)),
              lng: Number(e.latlng.lng.toFixed(6)),
            });
          });
        }

        leafletMapInstanceRef.current = map;
        leafletLayerGroupRef.current = layerGroup;
        activeEngineRef.current = 'LEAFLET';
        setEngine('LEAFLET');
        setIsLoading(false);

        // Ensure Leaflet tiles calculate container dimensions cleanly
        setTimeout(() => {
          if (map) map.invalidateSize();
        }, 200);
      } catch (lErr) {
        console.error('Failed to initialize Leaflet fallback map:', lErr);
        setIsLoading(false);
      }
    }

    return () => {
      isMounted = false;
      if (googleMarkersRef.current) {
        googleMarkersRef.current.forEach((m) => m.setMap && m.setMap(null));
        googleMarkersRef.current = [];
      }
      if (leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.remove();
        leafletMapInstanceRef.current = null;
        leafletLayerGroupRef.current = null;
      }
    };
  }, []);

  // Invalidate Leaflet size on container resize
  useEffect(() => {
    if (engine === 'LEAFLET' && leafletMapInstanceRef.current) {
      leafletMapInstanceRef.current.invalidateSize();
    }
  }, [engine, height]);

  // -------------------------------------------------------------
  // 2. RENDER MARKERS ON GOOGLE MAPS
  // -------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'GOOGLE') return;
    const map = googleMapInstanceRef.current;
    if (!map || !window.google?.maps) return;

    const googleMaps = window.google.maps;

    // Clear previous markers
    googleMarkersRef.current.forEach((m) => m.setMap && m.setMap(null));
    googleMarkersRef.current = [];

    const bounds = new googleMaps.LatLngBounds();
    let hasCoords = false;

    // User location marker
    if (showCurrentLocation && currentLocation && isValidCoordinate(currentLocation.latitude, currentLocation.longitude)) {
      const userPos = {
        lat: Number(currentLocation.latitude),
        lng: Number(currentLocation.longitude),
      };
      bounds.extend(userPos);
      hasCoords = true;

      const userMarker = new googleMaps.Marker({
        position: userPos,
        map,
        title: 'Your Location',
        icon: {
          path: googleMaps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#3b82f6',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        zIndex: 999,
      });

      googleMarkersRef.current.push(userMarker);
    }

    // Standard markers
    markers.forEach((m) => {
      if (!isValidCoordinate(m?.lat, m?.lng)) return;

      const pos = { lat: Number(m.lat), lng: Number(m.lng) };
      bounds.extend(pos);
      hasCoords = true;

      const markerColor = m.color || (m.type === 'shop' ? '#4f46e5' : m.type === 'delivery' ? '#10b981' : '#ef4444');

      const marker = new googleMaps.Marker({
        position: pos,
        map,
        title: m.title || '',
        draggable: !!m.draggable,
        icon: m.icon || {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: markerColor,
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 1.5,
          scale: 1.6,
          anchor: new googleMaps.Point(12, 22),
        },
      });

      if (m.draggable && m.onDragEnd) {
        marker.addListener('dragend', (evt) => {
          m.onDragEnd({
            lat: Number(evt.latLng.lat().toFixed(6)),
            lng: Number(evt.latLng.lng().toFixed(6)),
          });
        });
      }

      marker.addListener('click', () => {
        if (onMarkerClick) {
          onMarkerClick(m);
        }

        if (m.infoContent && googleInfoWindowRef.current) {
          googleInfoWindowRef.current.setContent(`
            <div style="font-family: inherit; padding: 4px; max-width: 220px;">
              <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #1e293b;">${m.title || 'Location'}</h4>
              <p style="margin: 0; font-size: 12px; color: #64748b; line-height: 1.3;">${m.infoContent}</p>
            </div>
          `);
          googleInfoWindowRef.current.open(map, marker);
        }
      });

      googleMarkersRef.current.push(marker);
    });

    if (hasCoords && googleMarkersRef.current.length > 1) {
      map.fitBounds(bounds);
    } else if (hasCoords && googleMarkersRef.current.length === 1) {
      map.setCenter(googleMarkersRef.current[0].getPosition());
      map.setZoom(zoom);
    }
  }, [engine, markers, showCurrentLocation, currentLocation, zoom, onMarkerClick]);

  // -------------------------------------------------------------
  // 3. RENDER MARKERS ON LEAFLET MAP
  // -------------------------------------------------------------
  useEffect(() => {
    if (engine !== 'LEAFLET') return;
    const map = leafletMapInstanceRef.current;
    const layerGroup = leafletLayerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const boundsCoords = [];

    // User location marker
    if (showCurrentLocation && currentLocation && isValidCoordinate(currentLocation.latitude, currentLocation.longitude)) {
      const userLatLng = [Number(currentLocation.latitude), Number(currentLocation.longitude)];
      boundsCoords.push(userLatLng);

      const userHtml = `
        <div style="
          width: 20px;
          height: 20px;
          background-color: #3b82f6;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(59, 130, 246, 0.7);
        "></div>
      `;

      const userIcon = L.divIcon({
        html: userHtml,
        className: 'user-location-marker',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const userMarker = L.marker(userLatLng, { icon: userIcon, zIndexOffset: 1000 }).addTo(layerGroup);
      userMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; font-weight: 600; color: #1e3a8a;">
          📍 Your Current Location
        </div>
      `);
    }

    // Standard markers
    markers.forEach((m) => {
      if (!isValidCoordinate(m?.lat, m?.lng)) return;
      const pos = [Number(m.lat), Number(m.lng)];
      boundsCoords.push(pos);

      const markerColor = m.color || (m.type === 'shop' ? '#4f46e5' : m.type === 'delivery' ? '#10b981' : '#ef4444');
      const iconEmoji = m.type === 'shop' ? '🏪' : m.type === 'delivery' ? '📍' : '📌';

      const pinHtml = `
        <div style="
          width: 34px;
          height: 34px;
          background-color: ${markerColor};
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 3px 8px rgba(0,0,0,0.3);
          color: white;
          font-size: 15px;
          cursor: pointer;
        ">
          ${iconEmoji}
        </div>
      `;

      const pinIcon = L.divIcon({
        html: pinHtml,
        className: 'custom-pin-marker',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });

      const marker = L.marker(pos, {
        icon: pinIcon,
        draggable: !!m.draggable,
      }).addTo(layerGroup);

      if (m.draggable && m.onDragEnd) {
        marker.on('dragend', (e) => {
          const latlng = e.target.getLatLng();
          m.onDragEnd({
            lat: Number(latlng.lat.toFixed(6)),
            lng: Number(latlng.lng.toFixed(6)),
          });
        });
      }

      marker.on('click', () => {
        if (onMarkerClick) {
          onMarkerClick(m);
        }
      });

      if (m.infoContent || m.title) {
        marker.bindPopup(`
          <div style="font-family: inherit; padding: 2px; max-width: 220px;">
            <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #1e293b;">${m.title || 'Location'}</h4>
            <div style="margin: 0; font-size: 12px; color: #475569; line-height: 1.35;">${m.infoContent || ''}</div>
          </div>
        `);
      }
    });

    if (boundsCoords.length > 1) {
      map.fitBounds(boundsCoords, { padding: [40, 40], maxZoom: 17 });
    } else if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], zoom);
    }
  }, [engine, markers, showCurrentLocation, currentLocation, zoom, onMarkerClick]);

  // Center panning
  useEffect(() => {
    if (center && isValidCoordinate(center.lat, center.lng)) {
      const lat = Number(center.lat);
      const lng = Number(center.lng);
      if (engine === 'GOOGLE' && googleMapInstanceRef.current) {
        googleMapInstanceRef.current.panTo({ lat, lng });
      } else if (engine === 'LEAFLET' && leafletMapInstanceRef.current) {
        leafletMapInstanceRef.current.panTo([lat, lng]);
      }
    }
  }, [center?.lat, center?.lng, engine]);

  return (
    <div
      className={`campus-map-wrapper ${className}`}
      style={{
        position: 'relative',
        isolation: 'isolate',
        zIndex: 1,
        width: '100%',
        height,
        minHeight: '280px',
        borderRadius: 'var(--radius-lg, 12px)',
        overflow: 'hidden',
        border: '1px solid var(--border-medium, #e2e8f0)',
        backgroundColor: '#f8fafc',
        boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
        ...style,
      }}
    >
      {/* Map Canvas */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
          minHeight: '280px',
          zIndex: 1,
        }}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(248, 250, 252, 0.85)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            zIndex: 20,
          }}
        >
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              border: '3px solid #e2e8f0',
              borderTopColor: 'var(--primary-600, #4f46e5)',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #64748b)', fontWeight: 500 }}>
            Initializing Map Platform...
          </span>
        </div>
      )}

      {/* Engine Status Tag */}
      {engine && !isLoading && (
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
            zIndex: 10,
            pointerEvents: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          {engine === 'GOOGLE' ? 'Google Maps' : 'OpenStreetMap'}
        </div>
      )}
    </div>
  );
};

export default GoogleMapView;
