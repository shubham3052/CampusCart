import React, { useState, useEffect, useMemo } from 'react';
import {
  BrainCircuit,
  AlertTriangle,
  ShoppingCart,
  TrendingUp,
  Package,
  CheckCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  Info,
  ShieldCheck,
  ChevronRight,
  ExternalLink,
  Edit3,
  Check,
  X,
  Layers,
  ArrowRight,
  AlertCircle,
  Truck,
  Sparkles,
  HelpCircle,
  Calendar,
  DollarSign
} from 'lucide-react';

import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import StatCard from '../../components/common/StatCard';
import purchaseAdvisorService from '../../services/purchaseAdvisorService';

const ShopOwnerPurchaseAdvisor = () => {
  // Main Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [summary, setSummary] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [historyList, setHistoryList] = useState([]);

  // Active View & Configuration
  const [activeTab, setActiveTab] = useState('recommendations'); // 'recommendations' | 'history'
  const [planningHorizon, setPlanningHorizon] = useState('30_DAYS'); // '7_DAYS' | '30_DAYS'
  const [serviceLevel, setServiceLevel] = useState(0.95); // 0.90 | 0.95 | 0.99

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [reorderFilter, setReorderFilter] = useState('ALL');

  // Bulk Selection
  const [selectedRecIds, setSelectedRecIds] = useState([]);

  // Modals
  const [breakdownModalRec, setBreakdownModalRec] = useState(null);
  const [overrideModalRec, setOverrideModalRec] = useState(null);
  const [overrideQty, setOverrideQty] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [supplierModalData, setSupplierModalData] = useState(null);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [bulkConfirmModal, setBulkConfirmModal] = useState(false);

  // Load Advisor Data
  const loadAdvisorData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, recsRes] = await Promise.all([
        purchaseAdvisorService.getAdvisorSummary().catch(() => ({ summary: null })),
        purchaseAdvisorService.getRecommendations({ horizon: planningHorizon }).catch(() => ({ results: [] })),
      ]);

      setSummary(sumRes.summary || null);
      const recsList = Array.isArray(recsRes) ? recsRes : (recsRes.results || recsRes.recommendations || []);
      setRecommendations(recsList);
    } catch (err) {
      console.error('Failed to load Smart Purchase Advisor data:', err);
      setError('Unable to load purchase recommendations. Please verify the backend service is running.');
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryData = async () => {
    try {
      const res = await purchaseAdvisorService.getAdvisorHistory();
      const list = Array.isArray(res) ? res : (res.results || res.history || []);
      setHistoryList(list);
    } catch (err) {
      console.error('Failed to load advisor history:', err);
    }
  };

  useEffect(() => {
    loadAdvisorData();
    if (activeTab === 'history') {
      loadHistoryData();
    }
  }, [planningHorizon, serviceLevel, activeTab]);

  // Recalculate on-demand
  const handleRecalculate = async () => {
    setRefreshing(true);
    setSuccessMessage(null);
    try {
      const res = await purchaseAdvisorService.refreshRecommendations({
        horizon: planningHorizon,
        service_level: serviceLevel
      });
      setSuccessMessage(res.message || 'Recommendations successfully refreshed.');
      await loadAdvisorData();
      if (activeTab === 'history') await loadHistoryData();
    } catch (err) {
      setError('Failed to refresh recommendations.');
    } finally {
      setRefreshing(false);
    }
  };

  // Filter recommendations
  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((item) => {
      const pName = item.product_details?.name || '';
      const pSku = item.product_details?.sku || '';
      const sName = item.supplier_name || '';
      const matchesSearch =
        pName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pSku.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sName.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPriority = priorityFilter === 'ALL' || item.priority === priorityFilter;
      const matchesReorder = reorderFilter === 'ALL' || item.reorder_status === reorderFilter;

      return matchesSearch && matchesPriority && matchesReorder;
    });
  }, [recommendations, searchTerm, priorityFilter, reorderFilter]);

  // Selection toggle
  const toggleSelectAll = () => {
    if (selectedRecIds.length === filteredRecommendations.length) {
      setSelectedRecIds([]);
    } else {
      setSelectedRecIds(filteredRecommendations.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id) => {
    if (selectedRecIds.includes(id)) {
      setSelectedRecIds(selectedRecIds.filter((item) => item !== id));
    } else {
      setSelectedRecIds([...selectedRecIds, id]);
    }
  };

  // Single Accept Action
  const handleAcceptSingle = async (rec) => {
    try {
      const res = await purchaseAdvisorService.acceptRecommendation(rec.id);
      setSuccessMessage(`Draft Purchase Order ${res.po_number || ''} created successfully.`);
      await loadAdvisorData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to accept recommendation.');
    }
  };

  // Manual Override Submission
  const handleSaveOverride = async (e) => {
    e.preventDefault();
    if (!overrideModalRec) return;
    try {
      await purchaseAdvisorService.overrideRecommendation(overrideModalRec.id, {
        manual_quantity: parseInt(overrideQty, 10),
        override_reason: overrideReason
      });
      setSuccessMessage(`Quantity updated to ${overrideQty} units for ${overrideModalRec.product_details?.name}.`);
      setOverrideModalRec(null);
      setOverrideQty('');
      setOverrideReason('');
      await loadAdvisorData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to override recommendation.');
    }
  };

  // Dismiss Action
  const handleDismiss = async (rec) => {
    try {
      await purchaseAdvisorService.dismissRecommendation(rec.id);
      setSuccessMessage(`Dismissed recommendation for ${rec.product_details?.name}.`);
      await loadAdvisorData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to dismiss recommendation.');
    }
  };

  // View Supplier Comparison Modal
  const handleOpenSupplierComparison = async (rec) => {
    setLoadingSuppliers(true);
    setSupplierModalData(null);
    try {
      const res = await purchaseAdvisorService.getSupplierComparison(rec.id);
      setSupplierModalData({
        rec,
        data: res
      });
    } catch (err) {
      setError('Failed to fetch supplier comparison data.');
    } finally {
      setLoadingSuppliers(false);
    }
  };

  // Bulk Accept Submission
  const handleConfirmBulkAccept = async () => {
    try {
      const res = await purchaseAdvisorService.bulkAcceptRecommendations(selectedRecIds);
      setSuccessMessage(res.message || 'Draft purchase order(s) created.');
      setSelectedRecIds([]);
      setBulkConfirmModal(false);
      await loadAdvisorData();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create bulk purchase orders.');
    }
  };

  // Helper badge renderers
  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return <Badge variant="danger">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="warning">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="info">MEDIUM</Badge>;
      case 'LOW':
        return <Badge variant="secondary">LOW</Badge>;
      default:
        return <Badge variant="secondary">NONE</Badge>;
    }
  };

  const getReorderBadge = (status) => {
    switch (status) {
      case 'OUT_OF_STOCK':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">OUT OF STOCK</span>;
      case 'REORDER_REQUIRED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">REORDER REQUIRED</span>;
      case 'LOW_STOCK':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-orange-100 text-orange-800">LOW STOCK</span>;
      case 'OVERSTOCKED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">OVERSTOCKED</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">ADEQUATE</span>;
    }
  };

  // Grouping preview for bulk action
  const bulkSupplierGroups = useMemo(() => {
    const map = {};
    selectedRecIds.forEach((id) => {
      const rec = recommendations.find((r) => r.id === id);
      if (rec) {
        const sName = rec.supplier_name || 'Preferred Vendor';
        if (!map[sName]) map[sName] = [];
        map[sName].push(rec);
      }
    });
    return map;
  }, [selectedRecIds, recommendations]);

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Smart Purchase Advisor"
        subtitle="AI-driven procurement engine: Combines Step 17 demand forecasts, statistical safety stock, and vendor intelligence."
        icon={BrainCircuit}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            {/* Planning Horizon Selector */}
            <div className="flex items-center bg-white border border-gray-300 rounded-lg p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setPlanningHorizon('7_DAYS')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  planningHorizon === '7_DAYS'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-700 hover:text-indigo-600'
                }`}
              >
                7-Day Horizon
              </button>
              <button
                type="button"
                onClick={() => setPlanningHorizon('30_DAYS')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  planningHorizon === '30_DAYS'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-700 hover:text-indigo-600'
                }`}
              >
                30-Day Horizon (Default)
              </button>
            </div>

            {/* Service Level Selector */}
            <div className="flex items-center space-x-1.5 bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 shadow-sm text-xs text-gray-700">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span className="font-medium text-gray-500">Service Level:</span>
              <select
                value={serviceLevel}
                onChange={(e) => setServiceLevel(parseFloat(e.target.value))}
                className="font-semibold text-indigo-700 bg-transparent border-0 focus:ring-0 p-0 cursor-pointer"
                title="Higher service level increases safety stock to safeguard against stockouts, at a higher holding cost."
              >
                <option value={0.90}>90% (Low Holding Cost)</option>
                <option value={0.95}>95% (Recommended Balance)</option>
                <option value={0.99}>99% (Maximum In-Stock Buffer)</option>
              </select>
            </div>

            {/* Recalculate Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRecalculate}
              disabled={refreshing}
              className="flex items-center space-x-1.5 shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>{refreshing ? 'Recalculating...' : 'Refresh Advisor'}</span>
            </Button>
          </div>
        }
      />

      {/* Feedback Messages */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-red-800 text-sm">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        <StatCard
          title="Items Requiring Reorder"
          value={summary?.items_requiring_purchase ?? 0}
          icon={ShoppingCart}
          color="indigo"
          trend={`${summary?.items_requiring_purchase ?? 0} actionable products`}
        />
        <StatCard
          title="Critical Stockouts"
          value={summary?.critical_items ?? 0}
          icon={AlertTriangle}
          color="red"
          trend="Immediate attention"
        />
        <StatCard
          title="Est. Procurement Cost"
          value={`₹${(summary?.estimated_purchase_cost ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
          icon={DollarSign}
          color="emerald"
          trend="Authoritative calculation"
        />
        <StatCard
          title="High Demand Items"
          value={summary?.high_demand_items ?? 0}
          icon={TrendingUp}
          color="blue"
          trend="Forecast volume surges"
        />
        <StatCard
          title="Overstocked Items"
          value={summary?.overstocked_items ?? 0}
          icon={Package}
          color="purple"
          trend="Excess holding cost"
        />
        <StatCard
          title="Potential Dead Stock"
          value={summary?.potential_dead_stock ?? 0}
          icon={Clock}
          color="orange"
          trend="Zero sales >45 days"
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 space-x-8">
        <button
          type="button"
          onClick={() => setActiveTab('recommendations')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'recommendations'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BrainCircuit className="w-4 h-4" />
          <span>Active Reorder Recommendations</span>
          <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700">
            {recommendations.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`pb-3 text-sm font-semibold border-b-2 flex items-center space-x-2 transition-colors ${
            activeTab === 'history'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Recommendation History & Audit Log</span>
          <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
            {historyList.length}
          </span>
        </button>
      </div>

      {/* ============================================================ */}
      {/* TAB 1: ACTIVE RECOMMENDATIONS */}
      {/* ============================================================ */}
      {activeTab === 'recommendations' && (
        <div className="space-y-4">
          {/* Filters & Bulk Action Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search product, SKU, or supplier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Priority Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-gray-500 font-medium">Priority:</span>
                <select
                  value={priorityFilter}
                  onChange={(e) => setPriorityFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg py-1 px-2 text-xs bg-white text-gray-700 focus:ring-indigo-500"
                >
                  <option value="ALL">All Priorities</option>
                  <option value="CRITICAL">Critical Only</option>
                  <option value="HIGH">High Only</option>
                  <option value="MEDIUM">Medium Only</option>
                  <option value="LOW">Low Only</option>
                  <option value="NONE">None (Adequate)</option>
                </select>
              </div>

              {/* Reorder Status Filter */}
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-gray-500 font-medium">Stock Status:</span>
                <select
                  value={reorderFilter}
                  onChange={(e) => setReorderFilter(e.target.value)}
                  className="border border-gray-300 rounded-lg py-1 px-2 text-xs bg-white text-gray-700 focus:ring-indigo-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="OUT_OF_STOCK">Out of Stock</option>
                  <option value="REORDER_REQUIRED">Reorder Required</option>
                  <option value="LOW_STOCK">Low Stock</option>
                  <option value="OVERSTOCKED">Overstocked</option>
                  <option value="STOCK_ADEQUATE">Adequate</option>
                </select>
              </div>
            </div>

            {/* Bulk Action Trigger */}
            {selectedRecIds.length > 0 && (
              <div className="flex items-center space-x-3 bg-indigo-50 px-3.5 py-1.5 rounded-lg border border-indigo-200">
                <span className="text-xs font-semibold text-indigo-900">
                  {selectedRecIds.length} item(s) selected
                </span>
                <Button
                  size="sm"
                  onClick={() => setBulkConfirmModal(true)}
                  className="flex items-center space-x-1.5 shadow-sm"
                >
                  <ShoppingCart className="w-3.5 h-3.5" />
                  <span>Create Purchase Order(s)</span>
                </Button>
              </div>
            )}
          </div>

          {/* Recommendations Table */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto table-responsive" style={{ margin: 0 }}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <th className="p-3.5 w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredRecommendations.length > 0 &&
                          selectedRecIds.length === filteredRecommendations.length
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="p-3.5">Product & SKU</th>
                    <th className="p-3.5 text-center">Current / Available</th>
                    <th className="p-3.5 text-center">Forecast ({planningHorizon === '30_DAYS' ? '30d' : '7d'})</th>
                    <th className="p-3.5 text-center">Safety Stock (SS)</th>
                    <th className="p-3.5 text-center">Reorder Point (ROP)</th>
                    <th className="p-3.5 text-center">Recommended Qty</th>
                    <th className="p-3.5">Recommended Supplier</th>
                    <th className="p-3.5 text-right">Est. Cost</th>
                    <th className="p-3.5 text-center">Priority</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan="11" className="p-8 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                          <span>Evaluating inventory levels and regression forecasts...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredRecommendations.length === 0 ? (
                    <tr>
                      <td colSpan="11" className="p-8 text-center text-gray-500">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Package className="w-8 h-8 text-gray-400" />
                          <span className="font-medium text-gray-700">No purchase recommendations match the filters.</span>
                          <span className="text-xs text-gray-400">All products have adequate stock or no active orders required.</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRecommendations.map((rec) => {
                      const isSelected = selectedRecIds.includes(rec.id);
                      const isCritical = rec.priority === 'CRITICAL';
                      const isSpike = rec.demand_spike_alert;

                      return (
                        <tr
                          key={rec.id}
                          className={`hover:bg-indigo-50/30 transition-colors ${
                            isSelected ? 'bg-indigo-50/50' : isCritical ? 'bg-red-50/20' : ''
                          }`}
                        >
                          {/* Selection Checkbox */}
                          <td className="p-3.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOne(rec.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                          </td>

                          {/* Product */}
                          <td className="p-3.5">
                            <div className="flex flex-col">
                              <span className="font-semibold text-gray-900 flex items-center space-x-1.5">
                                <span>{rec.product_details?.name || 'Product'}</span>
                                {isSpike && (
                                  <span
                                    title="Unusually high demand spike detected!"
                                    className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-800 border border-amber-300"
                                  >
                                    SPIKE
                                  </span>
                                )}
                              </span>
                              <div className="flex items-center space-x-2 text-xs text-gray-500 mt-0.5">
                                <span>SKU: {rec.product_details?.sku || 'N/A'}</span>
                                <span>•</span>
                                <span>{rec.product_details?.category?.name || 'General'}</span>
                              </div>
                            </div>
                          </td>

                          {/* Stock Levels */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-bold text-gray-900">
                                {rec.available_stock} <span className="text-xs text-gray-400 font-normal">avail</span>
                              </span>
                              <span className="text-[11px] text-gray-500">
                                ({rec.current_stock} total / {rec.reserved_stock} res)
                              </span>
                              <div className="mt-1">{getReorderBadge(rec.reorder_status)}</div>
                            </div>
                          </td>

                          {/* Forecast Horizon */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-semibold text-indigo-600">
                                {planningHorizon === '30_DAYS' ? rec.predicted_demand_30d : rec.predicted_demand_7d} units
                              </span>
                              <span className="text-[11px] text-gray-400">
                                ~{rec.average_daily_demand} / day
                              </span>
                              {rec.days_of_cover !== null && (
                                <span className="text-[10px] text-gray-500 mt-0.5">
                                  Cover: {rec.days_of_cover}d
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Safety Stock */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-semibold text-gray-800">{rec.safety_stock} units</span>
                              <span className="text-[10px] text-gray-400">
                                Z={rec.service_level_z} ({(rec.service_level * 100).toFixed(0)}%)
                              </span>
                            </div>
                          </td>

                          {/* Reorder Point */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span className="font-bold text-amber-700">{rec.reorder_point}</span>
                              <span className="text-[10px] text-gray-400">Lead: {rec.lead_time_days}d</span>
                            </div>
                          </td>

                          {/* Recommended Quantity */}
                          <td className="p-3.5 text-center">
                            <div className="flex flex-col items-center">
                              <span
                                className={`text-base font-extrabold ${
                                  rec.recommended_quantity > 0 ? 'text-indigo-700' : 'text-gray-400'
                                }`}
                              >
                                {rec.effective_quantity}
                              </span>
                              {rec.manual_quantity !== null && (
                                <span className="text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 rounded">
                                  Manual Override
                                </span>
                              )}
                              {rec.calculation_breakdown?.moq_applied && (
                                <span className="text-[10px] text-gray-500">MOQ Bumped</span>
                              )}
                            </div>
                          </td>

                          {/* Supplier */}
                          <td className="p-3.5">
                            <div className="flex flex-col">
                              <span className="font-medium text-gray-900">{rec.supplier_name}</span>
                              <div className="flex items-center space-x-1.5 text-xs text-gray-500">
                                <span>₹{rec.unit_cost} / unit</span>
                                <span>•</span>
                                <span>{rec.lead_time_days} days lead</span>
                              </div>
                            </div>
                          </td>

                          {/* Estimated Cost */}
                          <td className="p-3.5 text-right">
                            <span className="font-bold text-gray-900">
                              ₹{parseFloat(rec.estimated_purchase_cost).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Priority */}
                          <td className="p-3.5 text-center">
                            {getPriorityBadge(rec.priority)}
                          </td>

                          {/* Actions */}
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              {/* Calculation Breakdown Modal Button */}
                              <button
                                type="button"
                                onClick={() => setBreakdownModalRec(rec)}
                                title="Transparent calculation breakdown"
                                className="p-1.5 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              >
                                <Info className="w-4 h-4" />
                              </button>

                              {/* Supplier Comparison Modal Button */}
                              <button
                                type="button"
                                onClick={() => handleOpenSupplierComparison(rec)}
                                title="Compare wholesale suppliers"
                                className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              >
                                <Layers className="w-4 h-4" />
                              </button>

                              {/* Override Quantity Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideModalRec(rec);
                                  setOverrideQty(rec.effective_quantity);
                                  setOverrideReason(rec.override_reason || '');
                                }}
                                title="Manual quantity override"
                                className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              {/* Single Accept & Create PO */}
                              <button
                                type="button"
                                onClick={() => handleAcceptSingle(rec)}
                                title="Accept & Create Draft PO"
                                className="px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center space-x-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Order</span>
                              </button>

                              {/* Dismiss */}
                              <button
                                type="button"
                                onClick={() => handleDismiss(rec)}
                                title="Dismiss recommendation"
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* TAB 2: RECOMMENDATION HISTORY & AUDIT LOG */}
      {/* ============================================================ */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900">Historical Procurement Actions & Traceability</h3>
            <span className="text-xs text-gray-500">Immutable audit log of all created orders and overrides</span>
          </div>

          <div className="overflow-x-auto table-responsive" style={{ margin: 0 }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Product</th>
                  <th className="p-3.5 text-center">System Rec</th>
                  <th className="p-3.5 text-center">Final Qty</th>
                  <th className="p-3.5">Supplier</th>
                  <th className="p-3.5 text-center">Status</th>
                  <th className="p-3.5">Purchase Order</th>
                  <th className="p-3.5">Override Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {historyList.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="p-8 text-center text-gray-500">
                      No historical purchase recommendations recorded yet.
                    </td>
                  </tr>
                ) : (
                  historyList.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="p-3.5 text-xs text-gray-500">
                        {new Date(item.updated_at || item.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3.5 font-medium text-gray-900">
                        {item.product_details?.name || 'Product'}
                      </td>
                      <td className="p-3.5 text-center font-semibold text-gray-700">
                        {item.recommended_quantity}
                      </td>
                      <td className="p-3.5 text-center font-bold text-indigo-600">
                        {item.effective_quantity}
                      </td>
                      <td className="p-3.5 text-gray-700">
                        {item.supplier_name}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded bg-gray-100 text-gray-700">
                          {item.status_display}
                        </span>
                      </td>
                      <td className="p-3.5">
                        {item.po_number ? (
                          <span className="font-mono text-xs font-semibold text-indigo-600">
                            {item.po_number}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-3.5 text-xs text-gray-600 max-w-xs truncate">
                        {item.override_reason || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 1: CALCULATION BREAKDOWN (VIVA / DEMO READY) */}
      {/* ============================================================ */}
      {breakdownModalRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <BrainCircuit className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Recommendation Breakdown: {breakdownModalRec.product_details?.name}
                  </h3>
                  <p className="text-xs text-gray-500">Transparent AI & statistical calculation panel</p>
                </div>
              </div>
              <button
                onClick={() => setBreakdownModalRec(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Formula Visual Box */}
              <div className="bg-slate-900 text-slate-100 rounded-xl p-5 font-mono text-sm space-y-3 shadow-inner">
                <div className="flex justify-between items-center text-indigo-300 text-xs border-b border-slate-700 pb-2">
                  <span>EXPLAINABLE REORDER CALCULATION</span>
                  <span>{breakdownModalRec.planning_horizon}</span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Predicted Demand ({breakdownModalRec.planning_horizon}):</span>
                    <span className="font-bold text-white">
                      {breakdownModalRec.calculation_breakdown?.predicted_demand ?? breakdownModalRec.predicted_demand} units
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">+ Statistical Safety Stock (SS):</span>
                    <span className="font-bold text-emerald-400">
                      +{breakdownModalRec.safety_stock} units
                    </span>
                  </div>

                  <div className="border-t border-slate-700 pt-1 flex justify-between font-semibold">
                    <span className="text-indigo-200">= Target Inventory Level:</span>
                    <span className="text-indigo-300">
                      {breakdownModalRec.target_stock} units
                    </span>
                  </div>

                  <div className="flex justify-between">
                    <span className="text-slate-400">- Available Stock (OnHand - Reserved):</span>
                    <span className="font-bold text-red-300">
                      -{breakdownModalRec.available_stock} units
                    </span>
                  </div>

                  <div className="border-t-2 border-indigo-500 pt-2 flex justify-between text-sm font-bold text-emerald-300">
                    <span>= Recommended Purchase Quantity:</span>
                    <span className="text-lg text-white font-extrabold">
                      {breakdownModalRec.recommended_quantity} units
                    </span>
                  </div>
                </div>
              </div>

              {/* Statistical Parameters Breakdown */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1">
                  <span className="font-semibold text-gray-700 block">Safety Stock Formula:</span>
                  <p className="text-gray-600 font-mono">
                    {breakdownModalRec.calculation_breakdown?.safety_stock_formula || 'Z × σ × √LeadTime'}
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    {breakdownModalRec.calculation_breakdown?.safety_stock_detail}
                  </p>
                </div>

                <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 space-y-1">
                  <span className="font-semibold text-gray-700 block">Reorder Point (ROP):</span>
                  <p className="text-gray-600 font-mono">
                    {breakdownModalRec.calculation_breakdown?.reorder_point_formula || 'LeadDemand + SS'}
                  </p>
                  <p className="text-gray-500 text-[11px]">
                    Trigger level: {breakdownModalRec.reorder_point} units
                  </p>
                </div>
              </div>

              {/* Academic Event Alert (Step 19) */}
              {breakdownModalRec.calculation_breakdown?.academic_context && (
                <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1.5 text-xs text-amber-900">
                  <div className="flex items-center justify-between font-bold text-amber-800">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-600" />
                      <span>Academic Event Alert: {breakdownModalRec.calculation_breakdown.academic_context.event_title}</span>
                    </div>
                    <Badge variant="warning" size="sm">
                      {breakdownModalRec.calculation_breakdown.academic_context.days_until > 0
                        ? `In ${breakdownModalRec.calculation_breakdown.academic_context.days_until} days`
                        : 'Active Now'}
                    </Badge>
                  </div>
                  <p className="text-amber-800">
                    {breakdownModalRec.calculation_breakdown.academic_context.historical_relationship}
                  </p>
                  {breakdownModalRec.calculation_breakdown.academic_context.potential_shortfall > 0 && (
                    <div className="text-[11px] font-semibold text-amber-900 pt-1 border-t border-amber-200 flex justify-between">
                      <span>Anticipated Event Demand Shortfall:</span>
                      <span className="font-bold text-red-600">{breakdownModalRec.calculation_breakdown.academic_context.potential_shortfall} units</span>
                    </div>
                  )}
                </div>
              )}

              {/* Viva Explanation Summary Card */}
              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-2 text-xs text-indigo-900">
                <span className="font-bold uppercase tracking-wider text-[10px] text-indigo-600 block">
                  Demonstration Rationale
                </span>
                <p className="leading-relaxed">{breakdownModalRec.reason}</p>
                <div className="pt-2 border-t border-indigo-200 flex justify-between items-center font-medium">
                  <span>Vendor: {breakdownModalRec.supplier_name}</span>
                  <span>Est. Cost: ₹{parseFloat(breakdownModalRec.estimated_purchase_cost).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setBreakdownModalRec(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 2: SUPPLIER COMPARISON */}
      {/* ============================================================ */}
      {supplierModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <Layers className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    Supplier Comparison: {supplierModalData.data?.product_name}
                  </h3>
                  <p className="text-xs text-gray-500">Multi-criteria vendor scoring: Price (40%), Lead Time (30%), Reliability (20%), MOQ (10%)</p>
                </div>
              </div>
              <button
                onClick={() => setSupplierModalData(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {supplierModalData.data?.suppliers?.length === 0 ? (
                <div className="p-6 text-center text-gray-500 text-sm">
                  No wholesale suppliers mapped to this product.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm table-responsive" style={{ margin: 0 }}>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 uppercase font-semibold">
                        <th className="p-3">Supplier</th>
                        <th className="p-3 text-center">Unit Price</th>
                        <th className="p-3 text-center">Lead Time</th>
                        <th className="p-3 text-center">MOQ</th>
                        <th className="p-3 text-center">Reliability</th>
                        <th className="p-3 text-center">Score</th>
                        <th className="p-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {supplierModalData.data?.suppliers?.map((sup, idx) => {
                        const isRecommended = idx === 0;
                        return (
                          <tr key={sup.supplier_id} className={isRecommended ? 'bg-indigo-50/40 font-medium' : ''}>
                            <td className="p-3">
                              <span className="font-bold text-gray-900 block">{sup.supplier_name}</span>
                              <span className="text-[10px] text-gray-500">{sup.explanation}</span>
                            </td>
                            <td className="p-3 text-center font-semibold text-gray-900">
                              ₹{sup.purchase_price}
                            </td>
                            <td className="p-3 text-center text-gray-700">
                              {sup.lead_time_days} days
                            </td>
                            <td className="p-3 text-center text-gray-700">
                              {sup.minimum_order_quantity}
                            </td>
                            <td className="p-3 text-center text-gray-700">
                              {sup.reliability_pct}%
                            </td>
                            <td className="p-3 text-center font-bold text-indigo-700">
                              {(sup.score * 100).toFixed(1)}
                            </td>
                            <td className="p-3 text-right">
                              {isRecommended ? (
                                <Badge variant="success">BEST CHOICE</Badge>
                              ) : (
                                <span className="text-gray-400 text-[11px]">Alternative</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setSupplierModalData(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 3: MANUAL OVERRIDE */}
      {/* ============================================================ */}
      {overrideModalRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Edit3 className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-gray-900 text-sm">
                  Manual Quantity Override
                </h3>
              </div>
              <button
                onClick={() => setOverrideModalRec(null)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOverride} className="p-5 space-y-4 text-xs">
              <div>
                <span className="font-semibold text-gray-700 block mb-1">Product:</span>
                <span className="font-bold text-gray-900 text-sm">
                  {overrideModalRec.product_details?.name}
                </span>
                <p className="text-gray-500 mt-0.5">
                  System recommendation: {overrideModalRec.recommended_quantity} units
                </p>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Adjusted Purchase Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={overrideQty}
                  onChange={(e) => setOverrideQty(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-sm font-semibold focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Override Rationale / Reason
                </label>
                <textarea
                  rows="3"
                  placeholder="e.g., Upcoming college fest demand surge expected; or supplier bulk discount negotiation."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <Button variant="outline" size="sm" type="button" onClick={() => setOverrideModalRec(null)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit">
                  Save Override
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL 4: BULK ACCEPT CONFIRMATION */}
      {/* ============================================================ */}
      {bulkConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-200">
            <div className="p-5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-gray-900 text-sm">
                  Confirm Bulk Purchase Orders
                </h3>
              </div>
              <button
                onClick={() => setBulkConfirmModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-gray-600">
                You have selected <span className="font-bold text-gray-900">{selectedRecIds.length} items</span>.
                The system will automatically group products by supplier and create separate draft purchase orders:
              </p>

              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {Object.entries(bulkSupplierGroups).map(([supplierName, items]) => (
                  <div key={supplierName} className="p-3 bg-gray-50/50">
                    <span className="font-bold text-gray-900 block">{supplierName}</span>
                    <span className="text-gray-500">
                      {items.length} line item(s): {items.map((i) => i.product_details?.name).join(', ')}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-gray-500">
                Draft POs will be created in your purchase order registry for final review before sending to suppliers.
              </p>
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex justify-end space-x-2">
              <Button variant="outline" size="sm" onClick={() => setBulkConfirmModal(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmBulkAccept}>
                Confirm & Create PO(s)
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerPurchaseAdvisor;
