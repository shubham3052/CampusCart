import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Truck, AlertTriangle } from 'lucide-react';

/**
 * LiveMap Component (Step 22)
 * Production-ready, responsive map powered by Leaflet and OpenStreetMap tiles.
 * Renders real GPS coordinates, courier location, destination drop-off,
 * multi-stop sequence badges, and connecting route polylines with zero fake data.
 */
const isValidCoord = (lat, lng) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  return !isNaN(nLat) && !isNaN(nLng) && nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
};

const LiveMap = ({
  origin,
  deliveryPersonCoords,
  destination,
  destinationCoords,
  stops = [],
  routeStops = [],
  polyline = [],
  height = '360px',
  isStale = false,
  courierName = 'Courier',
  accuracy = 10,
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [mapError, setMapError] = useState(false);

  // Reconcile props from different callers
  const activeOrigin = origin || deliveryPersonCoords;
  const activeDestination = destination || destinationCoords;
  const activeStops = stops && stops.length > 0 ? stops : routeStops || [];

  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      if (!mapInstanceRef.current) {
        // Initialize Leaflet Map
        const map = L.map(mapContainerRef.current, {
          center: [28.545, 77.1926], // Default Campus Reference Datum
          zoom: 15,
          zoomControl: true,
          attributionControl: true,
        });

        // OpenStreetMap Free Tile Layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);

        const layerGroup = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        layerGroupRef.current = layerGroup;
      }
    } catch (err) {
      console.error('Failed to initialize Leaflet map:', err);
      setMapError(true);
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  // Update markers, polyline, and bounds when coords change
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const boundsCoords = [];

    // 1. Render Courier (Origin) Marker
    if (activeOrigin && isValidCoord(activeOrigin.latitude, activeOrigin.longitude)) {
      const courierLatLng = [Number(activeOrigin.latitude), Number(activeOrigin.longitude)];
      boundsCoords.push(courierLatLng);

      const courierHtml = `
        <div style="
          width: 38px;
          height: 38px;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.45);
          position: relative;
        ">
          <span style="font-size: 18px; line-height: 1;">🚚</span>
          ${
            isStale
              ? '<span style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background: #ef4444; border-radius: 50%; border: 2px solid #fff;"></span>'
              : '<span style="position: absolute; top: -2px; right: -2px; width: 10px; height: 10px; background: #22c55e; border-radius: 50%; border: 2px solid #fff;"></span>'
          }
        </div>
      `;

      const courierIcon = L.divIcon({
        html: courierHtml,
        className: 'courier-marker',
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const marker = L.marker(courierLatLng, { icon: courierIcon }).addTo(layerGroup);
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4;">
          <strong style="color: #4f46e5;">${courierName}</strong><br/>
          <span>Speed: ${activeOrigin.speed ? `${(activeOrigin.speed * 3.6).toFixed(1)} km/h` : 'En route'}</span><br/>
          <small style="color: #64748b;">${isStale ? '⚠️ Stale GPS Signal' : 'Live GPS Connected'}</small>
        </div>
      `);

      // Accuracy circle
      if (accuracy && accuracy <= 150) {
        L.circle(courierLatLng, {
          radius: Number(accuracy),
          color: '#6366f1',
          fillColor: '#818cf8',
          fillOpacity: 0.15,
          weight: 1,
        }).addTo(layerGroup);
      }
    }

    // 2. Render Destination Marker (Student Delivery Drop Point)
    if (activeDestination && isValidCoord(activeDestination.latitude, activeDestination.longitude)) {
      const destLatLng = [Number(activeDestination.latitude), Number(activeDestination.longitude)];
      boundsCoords.push(destLatLng);

      const destHtml = `
        <div style="
          width: 36px;
          height: 36px;
          background: #ef4444;
          border: 2.5px solid #ffffff;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          box-shadow: 0 4px 10px rgba(239, 68, 68, 0.4);
        ">
          <span style="font-size: 16px; line-height: 1;">📍</span>
        </div>
      `;

      const destIcon = L.divIcon({
        html: destHtml,
        className: 'destination-marker',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
      });

      const marker = L.marker(destLatLng, { icon: destIcon }).addTo(layerGroup);
      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <strong style="color: #dc2626;">Delivery Drop Point</strong><br/>
          <span style="color: #475569;">${activeDestination.address || 'Campus Location'}</span>
        </div>
      `);
    }

    // 3. Multi-Stop Sequenced Badges (For Courier Multi-Order Route)
    if (activeStops && activeStops.length > 0) {
      activeStops.forEach((stop) => {
        const sLat = stop.latitude || stop.lat;
        const sLng = stop.longitude || stop.lng;
        if (isValidCoord(sLat, sLng)) {
          const stopLatLng = [Number(sLat), Number(sLng)];
          boundsCoords.push(stopLatLng);

          const isCompleted = stop.completed;
          const bg = isCompleted ? '#16a34a' : '#2563eb';

          const stopHtml = `
            <div style="
              width: 28px;
              height: 28px;
              background: ${bg};
              border: 2px solid #ffffff;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-weight: 800;
              font-size: 12px;
              box-shadow: 0 2px 6px rgba(0,0,0,0.25);
            ">
              ${isCompleted ? '✓' : stop.sequence || '•'}
            </div>
          `;

          const stopIcon = L.divIcon({
            html: stopHtml,
            className: 'stop-marker',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          });

          const stopMarker = L.marker(stopLatLng, { icon: stopIcon }).addTo(layerGroup);
          stopMarker.bindPopup(`
            <div style="font-family: inherit; font-size: 13px;">
              <strong>Stop #${stop.sequence || 1}</strong> ${isCompleted ? '(Completed)' : ''}<br/>
              <span>${stop.address || 'Campus Delivery Node'}</span>
            </div>
          `);
        }
      });
    }

    // 4. Connecting Polyline
    if (polyline && polyline.length > 1) {
      const latLngs = polyline
        .filter((pt) => isValidCoord(pt[0], pt[1]))
        .map((pt) => [Number(pt[0]), Number(pt[1])]);
      if (latLngs.length > 1) {
        L.polyline(latLngs, {
          color: '#4f46e5',
          weight: 4.5,
          opacity: 0.85,
          dashArray: isStale ? '6, 8' : undefined,
        }).addTo(layerGroup);
      }
    } else if (boundsCoords.length >= 2) {
      // Direct dashed connecting line if polyline not supplied
      L.polyline(boundsCoords, {
        color: '#6366f1',
        weight: 3.5,
        dashArray: '5, 8',
        opacity: 0.7,
      }).addTo(layerGroup);
    }

    // 5. Fit Bounds with comfortable padding
    if (boundsCoords.length > 1) {
      map.fitBounds(boundsCoords, {
        padding: [45, 45],
        maxZoom: 17,
      });
    } else if (boundsCoords.length === 1) {
      map.setView(boundsCoords[0], 16);
    } else {
      map.setView([28.545, 77.1926], 15);
    }
  }, [activeOrigin, activeDestination, activeStops, polyline, isStale, accuracy, courierName]);

  if (mapError) {
    return (
      <div
        style={{
          height,
          backgroundColor: 'var(--bg-surface-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={32} color="#eab308" />
        <h4 style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>Live Map Temporarily Unavailable</h4>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '340px' }}>
          Real-time distance and estimated arrival remain fully operational below.
        </p>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {/* Stale Signal Overlay Warning */}
      {isStale && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            backgroundColor: 'rgba(254, 242, 242, 0.95)',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: 'var(--radius-md)',
            padding: '0.35rem 0.75rem',
            fontSize: '0.78rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            zIndex: 1000,
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
          }}
        >
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }}></span>
          <span>Stale Signal (&gt; 4m ago)</span>
        </div>
      )}

      {/* Map Legend Tag */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          border: '1px solid #e2e8f0',
          borderRadius: 'var(--radius-md)',
          padding: '0.3rem 0.65rem',
          fontSize: '0.72rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          zIndex: 1000,
          boxShadow: '0 2px 5px rgba(0,0,0,0.06)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#4f46e5', fontWeight: 600 }}>
          <span>🚚</span> Courier
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: '#dc2626', fontWeight: 600 }}>
          <span>📍</span> Drop-off
        </span>
      </div>
    </div>
  );
};

export default LiveMap;
