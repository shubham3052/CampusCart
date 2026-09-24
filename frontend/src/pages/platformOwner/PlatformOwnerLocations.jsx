import React, { useState, useEffect } from 'react';
import { 
  MapPin, 
  Store, 
  Navigation, 
  Compass, 
  Layers, 
  RefreshCw, 
  Phone, 
  CheckCircle2, 
  XCircle, 
  Info,
  ShieldCheck
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import GoogleMapView from '../../components/maps/GoogleMapView';

export default function PlatformOwnerLocations() {
  const [data, setData] = useState({ shops: [], zones: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchLocations = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await platformOwnerService.getLocations();
      setData(res.data || { shops: [], zones: [] });
      if (res.data?.shops?.length > 0 && !selectedShop) {
        setSelectedShop(res.data.shops[0]);
      }
    } catch (err) {
      console.error('Failed to load location oversight:', err);
      setError('Unable to load campus store locations and delivery zones.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const filteredShops = (data.shops || []).filter(s => 
    s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.campus_location?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.address?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Markers for GoogleMapView / Leaflet
  const mapMarkers = (data.shops || []).map(shop => ({
    id: shop.id,
    lat: parseFloat(shop.latitude),
    lng: parseFloat(shop.longitude),
    title: shop.name,
    subtitle: shop.campus_location || shop.address,
    type: 'shop',
    color: shop.is_active ? '#6366f1' : '#ef4444',
    infoContent: `
      <div style="font-family: inherit; color: #0f172a; padding: 4px;">
        <h4 style="font-weight: 700; margin: 0 0 4px 0;">${shop.name}</h4>
        <p style="font-size: 11px; margin: 0 0 4px 0; color: #64748b;">${shop.campus_location || shop.address || 'Campus Hub'}</p>
        <span style="font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ${shop.is_active ? '#dcfce7' : '#fee2e2'}; color: ${shop.is_active ? '#166534' : '#991b1b'};">
          ${shop.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    `,
    onClick: () => setSelectedShop(shop),
  }));

  const centerCoord = selectedShop && selectedShop.latitude && selectedShop.longitude
    ? { lat: parseFloat(selectedShop.latitude), lng: parseFloat(selectedShop.longitude) }
    : data.shops?.[0]?.latitude
    ? { lat: parseFloat(data.shops[0].latitude), lng: parseFloat(data.shops[0].longitude) }
    : { lat: 28.5450, lng: 77.1926 };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Compass className="w-6 h-6" />
            </span>
            Campus Map & Location Oversight
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time geospatial layout of registered stationery vendors and campus delivery zones.
          </p>
        </div>
        <button
          onClick={fetchLocations}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-medium border border-slate-700 transition"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Nodes
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-3">
          <Info className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Map & Detail Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map View Area (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Navigation className="w-4 h-4 text-indigo-400" />
                University Campus Layout ({data.shops?.length || 0} Registered Stores)
              </div>
              <span className="text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                Leaflet / Google Maps Engine
              </span>
            </div>
            
            <div className="rounded-xl overflow-hidden border border-slate-800 relative">
              <GoogleMapView
                center={centerCoord}
                zoom={16}
                markers={mapMarkers}
                height="460px"
                onMarkerClick={(marker) => {
                  const s = (data.shops || []).find(x => x.id === marker.id);
                  if (s) setSelectedShop(s);
                }}
              />
            </div>
          </div>

          {/* Delivery Zones Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-semibold text-white">Campus Delivery Tariff Zones</h3>
              </div>
              <span className="text-xs text-slate-400">
                {data.zones?.length || 0} Defined Zones
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-800/50 text-xs font-medium text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 rounded-l-lg">Zone Name</th>
                    <th className="px-4 py-3">Min Distance</th>
                    <th className="px-4 py-3">Max Distance</th>
                    <th className="px-4 py-3 rounded-r-lg">Base Charge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.zones && data.zones.length > 0 ? (
                    data.zones.map((zone) => (
                      <tr key={zone.id} className="hover:bg-slate-800/30 transition">
                        <td className="px-4 py-3 font-semibold text-white flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-indigo-400" />
                          {zone.name}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{zone.minimum_distance} km</td>
                        <td className="px-4 py-3 text-slate-400">{zone.maximum_distance} km</td>
                        <td className="px-4 py-3 text-emerald-400 font-medium">₹{parseFloat(zone.base_charge).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="px-4 py-6 text-center text-slate-500">
                        No delivery zones configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Store Directory & Inspector (1 Col) */}
        <div className="space-y-4">
          {/* Search bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl">
            <h3 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-400" />
              Stationery Shops Directory
            </h3>
            <input
              type="text"
              placeholder="Search shops or campus zones..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Selected Shop Highlight Card */}
          {selectedShop && (
            <div className="bg-gradient-to-br from-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                  Inspected Node
                </span>
                {selectedShop.is_active ? (
                  <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                    <XCircle className="w-3.5 h-3.5" /> Inactive
                  </span>
                )}
              </div>

              <h4 className="text-lg font-bold text-white mb-1">{selectedShop.name}</h4>
              <p className="text-xs text-slate-400 mb-3">{selectedShop.shop_type || 'Stationery & Printing Center'}</p>

              <div className="space-y-2 text-xs text-slate-300 border-t border-slate-800 pt-3">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-400">Campus:</span>
                  <span className="font-medium text-slate-200">{selectedShop.campus_location || 'Main Campus'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-400">Phone:</span>
                  <span className="font-medium text-slate-200">{selectedShop.contact_phone || 'Unlisted'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="text-slate-400">GPS:</span>
                  <span className="font-mono text-[11px] text-indigo-300">
                    {parseFloat(selectedShop.latitude).toFixed(5)}, {parseFloat(selectedShop.longitude).toFixed(5)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* List of Shops */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2 max-h-[380px] overflow-y-auto">
            {filteredShops.map((shop) => (
              <button
                key={shop.id}
                onClick={() => setSelectedShop(shop)}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between ${
                  selectedShop?.id === shop.id
                    ? 'bg-indigo-600/20 border-indigo-500/50 text-white'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-300 hover:bg-slate-800/50'
                }`}
              >
                <div className="truncate mr-2">
                  <p className="font-semibold text-xs text-white truncate">{shop.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{shop.campus_location || shop.address}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <span className={`inline-block w-2 h-2 rounded-full ${shop.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                </div>
              </button>
            ))}
            {filteredShops.length === 0 && (
              <p className="text-center text-xs text-slate-500 py-6">No stores matching query.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
