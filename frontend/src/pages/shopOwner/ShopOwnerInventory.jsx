import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  PackageCheck,
  Plus,
  Search,
  Filter,
  Download,
  RefreshCw,
  FileText,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Edit3,
  Building2,
  Layers,
  ArrowUpDown,
  History,
  AlertCircle,
  ShieldAlert,
  ChevronRight,
  Sparkles,
  Award,
  Calendar,
  DollarSign,
  Tag,
  Check,
  Ban,
  Send,
  Truck,
  ExternalLink,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import inventoryService from '../../services/inventoryService';
import productService from '../../services/productService';
import shopService from '../../services/shopService';
import StatCard from '../../components/common/StatCard';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const ShopOwnerInventory = () => {
  // Navigation & Data States
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'analytics' | 'purchase_orders' | 'suppliers' | 'returns'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [shop, setShop] = useState(null);

  // Entities
  const [inventoryList, setInventoryList] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [returnsList, setReturnsList] = useState([]);
  const [products, setProducts] = useState([]);
  const [dailySales, setDailySales] = useState([]);
  const [purchaseAnalytics, setPurchaseAnalytics] = useState(null);

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Purchase Order Filtering
  const [poSearchQuery, setPoSearchQuery] = useState('');
  const [poStatusFilter, setPoStatusFilter] = useState('ALL');
  const [poSupplierFilter, setPoSupplierFilter] = useState('ALL');

  // Modals & Sub-views
  const [adjustModalItem, setAdjustModalItem] = useState(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('Physical stock count audit');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);

  const [thresholdModalItem, setThresholdModalItem] = useState(null);
  const [minStockVal, setMinStockVal] = useState(5);
  const [reorderLevelVal, setReorderLevelVal] = useState(10);
  const [maxStockVal, setMaxStockVal] = useState(100);
  const [unitCostVal, setUnitCostVal] = useState('0.00');
  const [thresholdSubmitting, setThresholdSubmitting] = useState(false);

  const [historyModalItem, setHistoryModalItem] = useState(null);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [receiveModalPO, setReceiveModalPO] = useState(null);
  const [receiveInputs, setReceiveInputs] = useState({});
  const [receiveNotes, setReceiveNotes] = useState('');
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);

  const [selectedPODetail, setSelectedPODetail] = useState(null);

  const [rejectModalPO, setRejectModalPO] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  const [damageModalItem, setDamageModalItem] = useState(null);
  const [damageQty, setDamageQty] = useState(1);
  const [damageReason, setDamageReason] = useState('Water damage during storage');
  const [damageNotes, setDamageNotes] = useState('');
  const [damageSubmitting, setDamageSubmitting] = useState(false);

  const [newPOModalOpen, setNewPOModalOpen] = useState(false);
  const [newPOSupplier, setNewPOSupplier] = useState('');
  const [newPOItems, setNewPOItems] = useState([{ product_id: '', quantity_ordered: 10, unit_cost: '5.00', supplier_sku: '' }]);
  const [newPONotes, setNewPONotes] = useState('');
  const [newPOSubmitting, setNewPOSubmitting] = useState(false);

  const [newSupplierModalOpen, setNewSupplierModalOpen] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    business_name: '',
    tax_id: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    notes: '',
    is_active: true,
  });
  const [supplierSubmitting, setSupplierSubmitting] = useState(false);

  const [supplierPerformanceModal, setSupplierPerformanceModal] = useState(null);

  const [supplierProductsModal, setSupplierProductsModal] = useState(null);
  const [supplierProductForm, setSupplierProductForm] = useState({
    product_id: '',
    purchase_price: '',
    lead_time_days: 3,
    minimum_order_quantity: 1,
    is_preferred: false,
    supplier_product_code: '',
  });
  const [supplierProductSubmitting, setSupplierProductSubmitting] = useState(false);

  // Quick Reorder Modal
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [reorderRecommendations, setReorderRecommendations] = useState([]);
  const [reorderLoading, setReorderLoading] = useState(false);
  const [selectedReorderItems, setSelectedReorderItems] = useState({});

  // Cost History Section
  const [selectedCostInvId, setSelectedCostInvId] = useState('');
  const [costData, setCostData] = useState(null);
  const [costLoading, setCostLoading] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get current shop
      const shopRes = await shopService.getMyShop();
      const currentShop = Array.isArray(shopRes) ? shopRes[0] : (shopRes?.results ? shopRes.results[0] : shopRes);
      setShop(currentShop);

      const shopId = currentShop?.id;

      // 2. Fetch parallel entities
      const [invRes, anaRes, poRes, supRes, retRes, prodRes, salesRes, poAnaRes] = await Promise.all([
        inventoryService.getInventory(shopId ? { shop: shopId } : {}),
        inventoryService.getInventoryAnalytics(shopId),
        inventoryService.getPurchaseOrders(shopId),
        inventoryService.getSuppliers(shopId),
        inventoryService.getInventoryReturns(shopId),
        productService.getProducts(shopId ? { shop: shopId } : {}),
        inventoryService.getDailySalesHistory(shopId, null, 14),
        inventoryService.getPurchaseAnalytics(shopId),
      ]);

      const loadedInv = invRes?.results || invRes || [];
      setInventoryList(loadedInv);
      setAnalytics(anaRes || {});
      setPurchaseOrders(poRes?.results || poRes || []);
      setSuppliers(supRes?.results || supRes || []);
      setReturnsList(retRes?.results || retRes || []);
      setProducts(prodRes?.results || prodRes || []);
      setDailySales(salesRes?.series || []);
      setPurchaseAnalytics(poAnaRes || {});

      if (loadedInv.length > 0 && !selectedCostInvId) {
        setSelectedCostInvId(loadedInv[0].id);
      }
    } catch (err) {
      console.error('Failed to load inventory data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fetch product cost history when selection changes
  useEffect(() => {
    if (!selectedCostInvId) return;
    const fetchCost = async () => {
      try {
        setCostLoading(true);
        const res = await inventoryService.getProductCostHistory(selectedCostInvId);
        setCostData(res);
      } catch (err) {
        console.error('Failed to fetch cost history:', err);
      } finally {
        setCostLoading(false);
      }
    };
    fetchCost();
  }, [selectedCostInvId]);

  // Filtered inventory list
  const filteredInventory = useMemo(() => {
    return inventoryList.filter((item) => {
      const matchSearch =
        !searchQuery ||
        item.product_details?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_details?.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_details?.category?.name?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'LOW_STOCK' && item.is_low_stock) ||
        (statusFilter === 'OUT_OF_STOCK' && item.is_out_of_stock) ||
        (statusFilter === 'OVERSTOCKED' && item.is_overstocked) ||
        (statusFilter === 'IN_STOCK' && item.current_stock > 0 && !item.is_low_stock);

      const matchCat =
        categoryFilter === 'ALL' ||
        String(item.product_details?.category?.id) === String(categoryFilter) ||
        item.product_details?.category?.name === categoryFilter;

      return matchSearch && matchStatus && matchCat;
    });
  }, [inventoryList, searchQuery, statusFilter, categoryFilter]);

  // Filtered purchase orders
  const filteredPurchaseOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const matchSearch =
        !poSearchQuery ||
        po.po_number?.toLowerCase().includes(poSearchQuery.toLowerCase()) ||
        po.supplier_name?.toLowerCase().includes(poSearchQuery.toLowerCase()) ||
        po.notes?.toLowerCase().includes(poSearchQuery.toLowerCase());

      const matchStatus =
        poStatusFilter === 'ALL' || po.status === poStatusFilter;

      const matchSupplier =
        poSupplierFilter === 'ALL' || String(po.supplier) === String(poSupplierFilter);

      return matchSearch && matchStatus && matchSupplier;
    });
  }, [purchaseOrders, poSearchQuery, poStatusFilter, poSupplierFilter]);

  // Categories list for filter
  const categories = useMemo(() => {
    const cats = new Map();
    inventoryList.forEach((inv) => {
      const c = inv.product_details?.category;
      if (c && c.id) {
        cats.set(c.id, c.name);
      }
    });
    return Array.from(cats.entries());
  }, [inventoryList]);

  // Actions
  const handleOpenAdjust = (inv) => {
    setAdjustModalItem(inv);
    setAdjustQty('');
    setAdjustReason('Physical stock count audit');
    setAdjustNotes('');
  };

  const handleSubmitAdjust = async (e) => {
    e.preventDefault();
    if (!adjustQty || isNaN(adjustQty) || parseInt(adjustQty, 10) === 0) {
      alert('Please enter a non-zero quantity change (+ or -).');
      return;
    }
    try {
      setAdjustSubmitting(true);
      await inventoryService.adjustStock(adjustModalItem.id, {
        quantity_change: parseInt(adjustQty, 10),
        reason: adjustReason,
        notes: adjustNotes,
      });
      setAdjustModalItem(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to adjust stock');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const handleOpenThresholds = (inv) => {
    setThresholdModalItem(inv);
    setMinStockVal(inv.minimum_stock ?? 5);
    setReorderLevelVal(inv.reorder_level ?? 10);
    setMaxStockVal(inv.maximum_stock ?? 100);
    setUnitCostVal(inv.unit_cost ?? '0.00');
  };

  const handleSubmitThresholds = async (e) => {
    e.preventDefault();
    try {
      setThresholdSubmitting(true);
      await inventoryService.updateInventoryThresholds(thresholdModalItem.id, {
        minimum_stock: parseInt(minStockVal, 10),
        reorder_level: parseInt(reorderLevelVal, 10),
        maximum_stock: parseInt(maxStockVal, 10),
        unit_cost: unitCostVal,
      });
      setThresholdModalItem(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to update thresholds');
    } finally {
      setThresholdSubmitting(false);
    }
  };

  const handleOpenDamage = (inv) => {
    setDamageModalItem(inv);
    setDamageQty(1);
    setDamageReason('Water damage during storage');
    setDamageNotes('');
  };

  const handleSubmitDamage = async (e) => {
    e.preventDefault();
    try {
      setDamageSubmitting(true);
      await inventoryService.reportDamage(damageModalItem.id, {
        quantity: parseInt(damageQty, 10),
        reason: damageReason,
        notes: damageNotes,
      });
      setDamageModalItem(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to record damage');
    } finally {
      setDamageSubmitting(false);
    }
  };

  const handleOpenHistory = async (inv) => {
    setHistoryModalItem(inv);
    setHistoryLoading(true);
    try {
      const res = await inventoryService.getInventoryHistory(inv.id);
      setHistoryLogs(res?.results || res || []);
    } catch (err) {
      console.error(err);
      setHistoryLogs([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenReceivePO = (po) => {
    setReceiveModalPO(po);
    setReceiveNotes('');
    const initialInputs = {};
    po.items?.forEach((item) => {
      initialInputs[item.id] = item.remaining_quantity;
    });
    setReceiveInputs(initialInputs);
  };

  const handleSubmitReceivePO = async (e) => {
    e.preventDefault();
    const itemsPayload = Object.entries(receiveInputs)
      .filter(([_, qty]) => parseInt(qty, 10) > 0)
      .map(([id, qty]) => ({
        item_id: parseInt(id, 10),
        quantity_to_receive: parseInt(qty, 10),
      }));

    if (itemsPayload.length === 0) {
      alert('Please enter at least one item quantity greater than 0 to receive.');
      return;
    }

    try {
      setReceiveSubmitting(true);
      const idempotencyKey = `RCV-${receiveModalPO.id}-${Date.now()}`;
      await inventoryService.receivePurchaseOrder(receiveModalPO.id, {
        items: itemsPayload,
        notes: receiveNotes || 'Inbound delivery received at shop warehouse',
        idempotency_key: idempotencyKey,
      });
      setReceiveModalPO(null);
      setSelectedPODetail(null);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.response?.data?.error || err.message || 'Failed to receive stock');
    } finally {
      setReceiveSubmitting(false);
    }
  };

  const handleSubmitForApproval = async (poId) => {
    try {
      await inventoryService.submitPOForApproval(poId);
      fetchData();
      if (selectedPODetail && selectedPODetail.id === poId) {
        const updated = await inventoryService.getPurchaseOrderDetail(poId);
        setSelectedPODetail(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to submit PO for approval');
    }
  };

  const handleApprovePO = async (poId) => {
    if (!window.confirm('Approve this purchase order for ordering?')) return;
    try {
      await inventoryService.approvePurchaseOrder(poId);
      fetchData();
      if (selectedPODetail && selectedPODetail.id === poId) {
        const updated = await inventoryService.getPurchaseOrderDetail(poId);
        setSelectedPODetail(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to approve PO');
    }
  };

  const handleOpenReject = (po) => {
    setRejectModalPO(po);
    setRejectReason('Budget constraints or vendor quote update requested');
  };

  const handleSubmitRejectPO = async (e) => {
    e.preventDefault();
    if (!rejectReason.trim()) return;
    try {
      setRejectSubmitting(true);
      await inventoryService.rejectPurchaseOrder(rejectModalPO.id, rejectReason);
      setRejectModalPO(null);
      fetchData();
      if (selectedPODetail && selectedPODetail.id === rejectModalPO.id) {
        const updated = await inventoryService.getPurchaseOrderDetail(rejectModalPO.id);
        setSelectedPODetail(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reject PO');
    } finally {
      setRejectSubmitting(false);
    }
  };

  const handleOrderPO = async (poId) => {
    if (!window.confirm('Mark this purchase order as ORDERED with the supplier?')) return;
    try {
      await inventoryService.orderPurchaseOrder(poId);
      fetchData();
      if (selectedPODetail && selectedPODetail.id === poId) {
        const updated = await inventoryService.getPurchaseOrderDetail(poId);
        setSelectedPODetail(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to mark PO as ordered');
    }
  };

  const handleCancelPO = async (poId) => {
    if (!window.confirm('Are you sure you want to cancel this Purchase Order?')) return;
    try {
      await inventoryService.cancelPurchaseOrder(poId);
      fetchData();
      if (selectedPODetail && selectedPODetail.id === poId) {
        const updated = await inventoryService.getPurchaseOrderDetail(poId);
        setSelectedPODetail(updated);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to cancel PO');
    }
  };

  const handleExportCSV = async () => {
    try {
      const blob = await inventoryService.exportInventoryCSV(shop?.id);
      const url = window.URL.createObjectURL(new Blob([blob]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Inventory_Report_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert('Failed to download CSV: ' + err.message);
    }
  };

  const handleCreateSupplier = async (e) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return;
    try {
      setSupplierSubmitting(true);
      await inventoryService.createSupplier({
        ...supplierForm,
        shop: shop?.id,
      });
      setNewSupplierModalOpen(false);
      setSupplierForm({
        name: '',
        business_name: '',
        tax_id: '',
        contact_person: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        postal_code: '',
        notes: '',
        is_active: true,
      });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to create supplier');
    } finally {
      setSupplierSubmitting(false);
    }
  };

  const handleCreatePO = async (e) => {
    e.preventDefault();
    if (!newPOSupplier) {
      alert('Please select a supplier.');
      return;
    }
    const validItems = newPOItems.filter((i) => i.product_id && parseInt(i.quantity_ordered, 10) > 0);
    if (validItems.length === 0) {
      alert('Please select at least one product with valid quantity.');
      return;
    }

    try {
      setNewPOSubmitting(true);
      await inventoryService.createPurchaseOrder({
        shop: shop?.id,
        supplier: parseInt(newPOSupplier, 10),
        notes: newPONotes,
        items_input: validItems,
      });
      setNewPOModalOpen(false);
      setNewPOItems([{ product_id: '', quantity_ordered: 10, unit_cost: '5.00', supplier_sku: '' }]);
      setNewPONotes('');
      fetchData();
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to create purchase order');
    } finally {
      setNewPOSubmitting(false);
    }
  };

  // Open Quick Reorder Recommendations
  const handleOpenReorderModal = async () => {
    setReorderModalOpen(true);
    setReorderLoading(true);
    try {
      const res = await inventoryService.getReorderRecommendations(shop?.id);
      const recs = res?.recommendations || [];
      setReorderRecommendations(recs);

      // Pre-select all recommendations with suggested quantities
      const initialMap = {};
      recs.forEach((r) => {
        initialMap[r.product_id] = {
          selected: true,
          quantity: r.recommended_purchase_quantity,
          supplier_id: r.recommended_supplier?.supplier_id || '',
          purchase_price: r.recommended_supplier?.purchase_price || 0.0,
          product_name: r.product_name,
        };
      });
      setSelectedReorderItems(initialMap);
    } catch (err) {
      console.error('Failed to load reorder recommendations:', err);
    } finally {
      setReorderLoading(false);
    }
  };

  // Submit Bulk PO from Reorder Recommendations
  const handleSubmitReorderPO = async () => {
    const selectedEntries = Object.entries(selectedReorderItems).filter(
      ([_, item]) => item.selected && item.quantity > 0 && item.supplier_id
    );

    if (selectedEntries.length === 0) {
      alert('Please select at least one product with an assigned supplier.');
      return;
    }

    // Group by supplier
    const supplierGroups = {};
    selectedEntries.forEach(([pid, item]) => {
      const sid = item.supplier_id;
      if (!supplierGroups[sid]) supplierGroups[sid] = [];
      supplierGroups[sid].push({
        product_id: parseInt(pid, 10),
        quantity_ordered: parseInt(item.quantity, 10),
        unit_cost: String(item.purchase_price),
      });
    });

    try {
      setReorderLoading(true);
      for (const [sid, items] of Object.entries(supplierGroups)) {
        await inventoryService.createPurchaseOrder({
          shop: shop?.id,
          supplier: parseInt(sid, 10),
          notes: 'Auto-replenishment order generated from Reorder Recommendations',
          items_input: items,
        });
      }
      setReorderModalOpen(false);
      fetchData();
      alert(`Successfully generated ${Object.keys(supplierGroups).length} purchase order(s).`);
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to create replenishment PO');
    } finally {
      setReorderLoading(false);
    }
  };

  // Open Supplier Products Modal
  const handleOpenSupplierProducts = (supplier) => {
    setSupplierProductsModal(supplier);
    setSupplierProductForm({
      product_id: '',
      purchase_price: '',
      lead_time_days: 3,
      minimum_order_quantity: 1,
      is_preferred: false,
      supplier_product_code: '',
    });
  };

  const handleAddSupplierProduct = async (e) => {
    e.preventDefault();
    if (!supplierProductForm.product_id) {
      alert('Please select a product.');
      return;
    }
    try {
      setSupplierProductSubmitting(true);
      await inventoryService.addSupplierProduct(supplierProductsModal.id, supplierProductForm);
      // Refresh supplier list
      const supRes = await inventoryService.getSuppliers(shop?.id);
      const updatedList = supRes?.results || supRes || [];
      setSuppliers(updatedList);
      const updatedCurrent = updatedList.find((s) => s.id === supplierProductsModal.id);
      if (updatedCurrent) setSupplierProductsModal(updatedCurrent);

      setSupplierProductForm({
        product_id: '',
        purchase_price: '',
        lead_time_days: 3,
        minimum_order_quantity: 1,
        is_preferred: false,
        supplier_product_code: '',
      });
      alert('Product mapping saved successfully.');
    } catch (err) {
      alert(err.response?.data?.message || err.message || 'Failed to map product to supplier');
    } finally {
      setSupplierProductSubmitting(false);
    }
  };

  // Helper badge color for stock
  const getStatusBadge = (inv) => {
    if (inv.is_out_of_stock) {
      return <Badge variant="danger" icon={XCircle}>OUT OF STOCK</Badge>;
    }
    if (inv.is_low_stock) {
      return <Badge variant="warning" icon={AlertTriangle}>LOW STOCK</Badge>;
    }
    if (inv.is_overstocked) {
      return <Badge variant="neutral" icon={ShieldAlert}>OVERSTOCKED</Badge>;
    }
    return <Badge variant="success" icon={CheckCircle2}>IN STOCK</Badge>;
  };

  // Helper badge color for PO status
  const getPOStatusBadge = (status) => {
    switch (status) {
      case 'DRAFT':
        return <span style={{ background: '#f1f5f9', color: '#475569', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>DRAFT</span>;
      case 'PENDING_APPROVAL':
        return <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>PENDING APPROVAL</span>;
      case 'APPROVED':
        return <span style={{ background: '#e0e7ff', color: '#4338ca', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>APPROVED</span>;
      case 'ORDERED':
      case 'PLACED':
        return <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>ORDERED</span>;
      case 'PARTIALLY_RECEIVED':
        return <span style={{ background: '#fed7aa', color: '#c2410c', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>PARTIALLY RECEIVED</span>;
      case 'RECEIVED':
        return <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>FULLY RECEIVED</span>;
      case 'REJECTED':
        return <span style={{ background: '#fee2e2', color: '#b91c1c', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>REJECTED</span>;
      case 'CANCELLED':
        return <span style={{ background: '#f3f4f6', color: '#6b7280', padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 700 }}>CANCELLED</span>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  // Charts
  const monthlySpendChartData = useMemo(() => {
    const series = purchaseAnalytics?.monthly_spend || [];
    return {
      labels: series.map((s) => s.month),
      datasets: [
        {
          label: 'Procurement Spend (₹)',
          data: series.map((s) => s.spend),
          backgroundColor: '#6366f1',
          borderRadius: 6,
        },
      ],
    };
  }, [purchaseAnalytics]);

  const supplierSpendChartData = useMemo(() => {
    const series = purchaseAnalytics?.supplier_spend || [];
    return {
      labels: series.map((s) => s.supplier_name),
      datasets: [
        {
          data: series.map((s) => s.spend),
          backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#3b82f6', '#ec4899', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff',
        },
      ],
    };
  }, [purchaseAnalytics]);

  const productCostTrendData = useMemo(() => {
    const trends = costData?.monthly_trends || [];
    return {
      labels: trends.map((t) => t.month),
      datasets: [
        {
          label: 'Average Unit Cost (₹)',
          data: trends.map((t) => t.average_cost),
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#0284c7',
        },
      ],
    };
  }, [costData]);

  if (loading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <RefreshCw size={32} className="spinning" style={{ color: 'var(--primary-600)', marginBottom: '1rem' }} />
        <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Loading Smart Inventory & Procurement...</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Aggregating live stock levels, supplier intelligence, and cost trajectories.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Smart Inventory & Procurement Intelligence
            </h1>
            <Badge variant="primary" icon={Sparkles}>Step 16 Ready</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Shop-isolated stock management, rule-based supplier scoring, approval lifecycle, and cost metrics foundation.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => { setRefreshing(true); fetchData(); }}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportCSV}>
            Export CSV
          </Button>
          <Button variant="secondary" size="sm" icon={Sparkles} onClick={handleOpenReorderModal}>
            Quick Reorder PO
          </Button>
          <Button variant="secondary" size="sm" icon={Building2} onClick={() => setNewSupplierModalOpen(true)}>
            + Add Supplier
          </Button>
          <Button variant="primary" size="sm" icon={Plus} onClick={() => setNewPOModalOpen(true)}>
            + New Purchase Order
          </Button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: 'var(--radius-md)', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
        </div>
      )}

      {/* Delayed PO Alert Banner */}
      {purchaseAnalytics?.delayed_orders_count > 0 && (
        <div style={{ padding: '1rem 1.25rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Clock size={22} style={{ color: '#d97706' }} />
            <div>
              <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>
                {purchaseAnalytics.delayed_orders_count} Inbound Purchase Order(s) Overdue
              </strong>
              <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
                Shipments have exceeded their expected delivery dates. Review active orders in the Purchase Orders tab.
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveTab('purchase_orders')}
            style={{ padding: '0.4rem 0.8rem', background: '#f59e0b', color: '#ffffff', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer' }}
          >
            Review Orders
          </button>
        </div>
      )}

      {/* KPI Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <StatCard
          title="Total Products (SKUs)"
          value={analytics?.total_products || 0}
          icon={Boxes}
          color="primary"
          subtitle="Unique shop items"
        />
        <StatCard
          title="Total Units on Hand"
          value={analytics?.total_stock_units?.toLocaleString() || 0}
          icon={Layers}
          color="success"
          subtitle="Physical units across catalog"
        />
        <StatCard
          title="Est. Stock Valuation"
          value={`₹${(analytics?.estimated_inventory_cost_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={TrendingUp}
          color="info"
          subtitle="Calculated at purchase cost"
        />
        <StatCard
          title="Low Stock Warnings"
          value={analytics?.low_stock_count || 0}
          icon={AlertTriangle}
          color="warning"
          subtitle="At or below reorder level"
        />
        <StatCard
          title="Total Suppliers"
          value={suppliers.length}
          icon={Building2}
          color="primary"
          subtitle={`${suppliers.filter((s) => s.is_active).length} active wholesale vendors`}
        />
        <StatCard
          title="Procurement Spend"
          value={`₹${(purchaseAnalytics?.total_procurement_spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="success"
          subtitle={`${purchaseOrders.length} total purchase orders`}
        />
      </div>

      {/* Tabs Navigation */}
      <div style={{ borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '1rem', overflowX: 'auto' }}>
        {[
          { key: 'stock', label: 'Stock Overview', icon: Boxes, count: filteredInventory.length },
          { key: 'analytics', label: 'Procurement Intelligence & Trends', icon: TrendingUp },
          { key: 'purchase_orders', label: 'Purchase Orders', icon: FileText, count: purchaseOrders.length },
          { key: 'suppliers', label: 'Suppliers Directory', icon: Building2, count: suppliers.length },
          { key: 'returns', label: 'Returns & Damages', icon: History, count: returnsList.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.75rem 1.25rem',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '2px solid var(--primary-600)' : '2px solid transparent',
                color: isActive ? 'var(--primary-600)' : 'var(--text-secondary)',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  style={{
                    background: isActive ? 'var(--primary-50)' : 'var(--bg-surface-secondary)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '999px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                  }}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Stock Overview */}
      {activeTab === 'stock' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', background: 'var(--bg-surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: '1 1 240px', background: 'var(--bg-surface-secondary)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)' }}>
              <Search size={18} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search product name, SKU, or category..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.875rem' }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={16} style={{ color: 'var(--text-muted)' }} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
              >
                <option value="ALL">All Stock Levels</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="LOW_STOCK">Low Stock Alert</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
                <option value="OVERSTOCKED">Overstocked</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                style={{ padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
              >
                <option value="ALL">All Categories</option>
                {categories.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Main Inventory Table */}
          <div className="table-responsive" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Product Name & SKU</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>On-Hand</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Reserved</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Available</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Min / Reorder</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Unit Cost</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Stock Value</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.length === 0 ? (
                  <tr>
                    <td colSpan="10" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No inventory records match your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredInventory.map((inv) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {inv.product_details?.name || `Product #${inv.product}`}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          SKU: {inv.product_details?.sku || 'N/A'}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                        {inv.product_details?.category?.name || 'General'}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                        {inv.current_stock}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>
                        {inv.reserved_stock}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700, color: inv.available_stock > 0 ? '#10b981' : '#ef4444' }}>
                        {inv.available_stock}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {inv.minimum_stock} / {inv.reorder_level}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        ₹{parseFloat(inv.unit_cost || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 600 }}>
                        ₹{parseFloat(inv.stock_value || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {getStatusBadge(inv)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleOpenAdjust(inv)}
                            title="Adjust Stock (+/-)"
                            style={{ padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600 }}
                          >
                            +/- Adjust
                          </button>
                          <button
                            onClick={() => handleOpenThresholds(inv)}
                            title="Configure Buffers"
                            style={{ padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Buffers
                          </button>
                          <button
                            onClick={() => handleOpenDamage(inv)}
                            title="Record Damage"
                            style={{ padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Damage
                          </button>
                          <button
                            onClick={() => handleOpenHistory(inv)}
                            title="Audit Trail"
                            style={{ padding: '0.35rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', cursor: 'pointer', fontSize: '0.75rem' }}
                          >
                            Logs
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Movements & Procurement Intelligence */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Procurement Expenditure & Status Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.25rem' }}>
            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Monthly Procurement Spend</h3>
                <Badge variant="primary">Last 6 Months</Badge>
              </div>
              <div style={{ height: '220px' }}>
                {purchaseAnalytics?.monthly_spend?.length === 0 ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    No purchase history yet.
                  </div>
                ) : (
                  <Bar
                    data={monthlySpendChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        y: { beginAtZero: true, grid: { color: '#f1f5f9' } },
                        x: { grid: { display: false } },
                      },
                    }}
                  />
                )}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Spend by Supplier</h3>
                <Badge variant="neutral">Share</Badge>
              </div>
              <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {purchaseAnalytics?.supplier_spend?.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)' }}>No supplier purchases yet.</span>
                ) : (
                  <Doughnut
                    data={supplierSpendChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } },
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Product Purchase Cost Trajectory & Intelligence */}
          <div style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Historical Purchase Cost Trajectory</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Inspect real unit purchase price fluctuations derived from actual vendor receipts.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Select Product:</label>
                <select
                  value={selectedCostInvId}
                  onChange={(e) => setSelectedCostInvId(e.target.value)}
                  style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                >
                  {inventoryList.map((inv) => (
                    <option key={inv.id} value={inv.id}>{inv.product_details?.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {costLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <RefreshCw size={24} className="spinning" />
                <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Calculating cost intelligence...</p>
              </div>
            ) : costData ? (
              <div>
                {/* Cost KPI Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ padding: '0.85rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Last Purchase Cost</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{costData.last_cost?.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: '0.85rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Average Purchase Cost</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{costData.average_cost?.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: '0.85rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Lowest Cost Paid</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#16a34a' }}>₹{costData.lowest_cost?.toFixed(2)}</div>
                  </div>
                  <div style={{ padding: '0.85rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Highest Cost Paid</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#dc2626' }}>₹{costData.highest_cost?.toFixed(2)}</div>
                  </div>
                </div>

                {costData.price_increase_alert && (
                  <div style={{ padding: '0.75rem 1rem', background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#b91c1c', fontSize: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} />
                    <span>Price Warning: Most recent supplier cost is {costData.price_increase_pct}% higher than historical average.</span>
                  </div>
                )}

                {/* Trend Chart or Empty State */}
                <div style={{ height: '220px' }}>
                  {costData.insufficient_history ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', color: 'var(--text-muted)' }}>
                      <History size={28} style={{ marginBottom: '0.5rem', opacity: 0.6 }} />
                      <div style={{ fontWeight: 600 }}>Not enough historical data to calculate a cost trend.</div>
                      <div style={{ fontSize: '0.8rem' }}>Purchase history will build dynamically as PO stock shipments are received.</div>
                    </div>
                  ) : (
                    <Line
                      data={productCostTrendData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          y: { beginAtZero: false, grid: { color: '#f1f5f9' } },
                          x: { grid: { display: false } },
                        },
                      }}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 3: Purchase Orders */}
      {activeTab === 'purchase_orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Header & Filter Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: '1 1 300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface)', padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', flex: '1 1 200px' }}>
                <Search size={16} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Filter PO # or supplier..."
                  value={poSearchQuery}
                  onChange={(e) => setPoSearchQuery(e.target.value)}
                  style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                />
              </div>

              <select
                value={poStatusFilter}
                onChange={(e) => setPoStatusFilter(e.target.value)}
                style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
              >
                <option value="ALL">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="ORDERED">Ordered</option>
                <option value="PARTIALLY_RECEIVED">Partially Received</option>
                <option value="RECEIVED">Fully Received</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="REJECTED">Rejected</option>
              </select>

              <select
                value={poSupplierFilter}
                onChange={(e) => setPoSupplierFilter(e.target.value)}
                style={{ padding: '0.45rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: 'var(--bg-surface)' }}
              >
                <option value="ALL">All Suppliers</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button variant="secondary" size="sm" icon={Sparkles} onClick={handleOpenReorderModal}>
                Quick Reorder from Low Stock
              </Button>
              <Button variant="primary" size="sm" icon={Plus} onClick={() => setNewPOModalOpen(true)}>
                + Create PO
              </Button>
            </div>
          </div>

          {/* PO List Table */}
          <div className="table-responsive" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>PO Number</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Supplier</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Items</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Grand Total</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPurchaseOrders.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No purchase orders match your filters.
                    </td>
                  </tr>
                ) : (
                  filteredPurchaseOrders.map((po) => (
                    <tr key={po.id} style={{ borderBottom: '1px solid var(--border-light)', transition: 'background 0.15s' }}>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <button
                          onClick={() => setSelectedPODetail(po)}
                          style={{ border: 'none', background: 'transparent', fontWeight: 700, color: 'var(--primary-600)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                        >
                          {po.po_number}
                        </button>
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>{po.supplier_name}</td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                        {po.order_date || po.created_at?.slice(0, 10)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {po.items?.length || 0} line items
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                        ₹{parseFloat(po.grand_total > 0 ? po.grand_total : po.subtotal || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        {getPOStatusBadge(po.status)}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <button
                            onClick={() => setSelectedPODetail(po)}
                            style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.75rem', cursor: 'pointer' }}
                          >
                            Details
                          </button>

                          {po.status === 'DRAFT' && (
                            <button
                              onClick={() => handleSubmitForApproval(po.id)}
                              style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #fde68a', background: '#fef3c7', color: '#b45309', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Submit
                            </button>
                          )}

                          {po.status === 'PENDING_APPROVAL' && (
                            <>
                              <button
                                onClick={() => handleApprovePO(po.id)}
                                style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#15803d', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleOpenReject(po)}
                                style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #fecaca', background: '#fef2f2', color: '#b91c1c', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                              >
                                Reject
                              </button>
                            </>
                          )}

                          {(po.status === 'APPROVED' || po.status === 'DRAFT') && (
                            <button
                              onClick={() => handleOrderPO(po.id)}
                              style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Place Order
                            </button>
                          )}

                          {(po.status === 'ORDERED' || po.status === 'PLACED' || po.status === 'PARTIALLY_RECEIVED') && (
                            <button
                              onClick={() => handleOpenReceivePO(po)}
                              style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Receive Stock
                            </button>
                          )}

                          {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PLACED'].includes(po.status) && (
                            <button
                              onClick={() => handleCancelPO(po.id)}
                              style={{ padding: '0.3rem 0.55rem', borderRadius: 'var(--radius-sm)', border: '1px solid #f3f4f6', background: '#f9fafb', color: '#6b7280', fontSize: '0.75rem', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: Suppliers Directory */}
      {activeTab === 'suppliers' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Wholesale Suppliers & Mills</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                Isolated merchant supplier accounts, tax identifiers, and live fulfillment scorecards.
              </p>
            </div>
            <Button variant="primary" size="sm" icon={Plus} onClick={() => setNewSupplierModalOpen(true)}>
              + Add Supplier
            </Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '1.25rem' }}>
            {suppliers.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
                No suppliers configured yet. Register wholesale vendors to enable purchase orders.
              </div>
            ) : (
              suppliers.map((sup) => {
                const perf = sup.performance_summary || {};
                return (
                  <div key={sup.id} style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <h4 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{sup.name}</h4>
                        {sup.business_name && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{sup.business_name}</div>
                        )}
                        {sup.tax_id && (
                          <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600 }}>GST: {sup.tax_id}</div>
                        )}
                      </div>
                      <Badge variant={sup.is_active ? 'success' : 'neutral'}>
                        {sup.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <div><strong>Contact:</strong> {sup.contact_person || 'N/A'} • {sup.phone || 'No phone'}</div>
                      <div><strong>Email:</strong> {sup.email || 'N/A'}</div>
                      <div><strong>City:</strong> {sup.city || 'Local Vendor'}</div>
                    </div>

                    {/* Operational Scorecard Strip */}
                    <div style={{ background: 'var(--bg-surface-secondary)', padding: '0.65rem 0.75rem', borderRadius: 'var(--radius-md)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Orders</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{perf.completed_orders || 0}/{perf.total_orders || 0}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Lead Time</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{perf.average_lead_time_days || 3}d</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Reliability</div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: (perf.reliability_score || 100) >= 90 ? '#16a34a' : '#d97706' }}>
                          {perf.reliability_score || 100}%
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)', display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleOpenSupplierProducts(sup)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Products ({sup.supplier_products?.length || 0})
                      </button>
                      <button
                        onClick={() => setSupplierPerformanceModal(perf)}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', background: 'var(--bg-surface)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Scorecard
                      </button>
                      <button
                        onClick={() => {
                          setNewPOSupplier(sup.id);
                          setNewPOModalOpen(true);
                        }}
                        style={{ padding: '0.35rem 0.65rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--primary-200)', background: 'var(--primary-50)', color: 'var(--primary-600)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        + Order
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Returns & Damages */}
      {activeTab === 'returns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Customer Returns & Damaged Stock Audit</h3>
          <div className="table-responsive" style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-light)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>ID</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Product</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, textAlign: 'center' }}>Type</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Reason</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Date</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>Logged By</th>
                </tr>
              </thead>
              <tbody>
                {returnsList.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                      No returns or damaged items recorded yet.
                    </td>
                  </tr>
                ) : (
                  returnsList.map((ret) => (
                    <tr key={ret.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>#{ret.id}</td>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600 }}>{ret.product_name}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', fontWeight: 700 }}>{ret.quantity}</td>
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                        <Badge variant={ret.return_type === 'SELLABLE' ? 'success' : 'danger'}>
                          {ret.return_type}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>{ret.reason}</td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>{ret.created_at?.slice(0, 16).replace('T', ' ')}</td>
                      <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)' }}>{ret.processed_by_name || 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODALS ================= */}

      {/* 1. Adjust Stock Modal */}
      {adjustModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.25rem' }}>Manual Stock Adjustment</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {adjustModalItem.product_details?.name} (Current Stock: {adjustModalItem.current_stock})
            </p>

            <form onSubmit={handleSubmitAdjust} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Quantity Adjustment (+/- units)
                </label>
                <input
                  type="number"
                  placeholder="e.g. -2 for deduction, +10 for addition"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
                {adjustQty && !isNaN(adjustQty) && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--primary-600)', marginTop: '0.25rem' }}>
                    New Calculated Stock: {Math.max(0, adjustModalItem.current_stock + parseInt(adjustQty, 10))}
                  </div>
                )}
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Adjustment Reason
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                >
                  <option value="Physical stock count audit">Physical stock count audit</option>
                  <option value="Found extra undamaged inventory">Found extra undamaged inventory</option>
                  <option value="Unrecorded counter sale">Unrecorded counter sale</option>
                  <option value="Promotional samples issued">Promotional samples issued</option>
                  <option value="Supplier recount reconciliation">Supplier recount reconciliation</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Audit Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Additional context..."
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setAdjustModalItem(null)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={adjustSubmitting}>
                  {adjustSubmitting ? 'Adjusting...' : 'Confirm Stock Adjustment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Thresholds Modal */}
      {thresholdModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.25rem' }}>Configure Inventory Thresholds</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {thresholdModalItem.product_details?.name}
            </p>

            <form onSubmit={handleSubmitThresholds} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Safety Stock / Min Stock (Units)
                </label>
                <input
                  type="number"
                  min="0"
                  value={minStockVal}
                  onChange={(e) => setMinStockVal(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Reorder Trigger Level (Units)
                </label>
                <input
                  type="number"
                  min="0"
                  value={reorderLevelVal}
                  onChange={(e) => setReorderLevelVal(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Maximum Storage Capacity (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={maxStockVal}
                  onChange={(e) => setMaxStockVal(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Purchase Unit Cost (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={unitCostVal}
                  onChange={(e) => setUnitCostVal(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setThresholdModalItem(null)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={thresholdSubmitting}>
                  {thresholdSubmitting ? 'Saving...' : 'Update Thresholds'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Damage Modal */}
      {damageModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.25rem' }}>
              Report Damaged / Expired Stock
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              {damageModalItem.product_details?.name} (Available: {damageModalItem.current_stock})
            </p>

            <form onSubmit={handleSubmitDamage} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Damaged Quantity to Discard
                </label>
                <input
                  type="number"
                  min="1"
                  max={damageModalItem.current_stock}
                  value={damageQty}
                  onChange={(e) => setDamageQty(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Damage Cause
                </label>
                <select
                  value={damageReason}
                  onChange={(e) => setDamageReason(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                >
                  <option value="Water damage during storage">Water damage during storage</option>
                  <option value="Transit handling damage">Transit handling damage</option>
                  <option value="Expired / Dried ink or adhesive">Expired / Dried ink or adhesive</option>
                  <option value="Manufacturing defective batch">Manufacturing defective batch</option>
                  <option value="Customer returned damaged">Customer returned damaged</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Incident Notes
                </label>
                <input
                  type="text"
                  placeholder="Details regarding damaged units..."
                  value={damageNotes}
                  onChange={(e) => setDamageNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setDamageModalItem(null)}>Cancel</Button>
                <Button type="submit" variant="danger" disabled={damageSubmitting}>
                  {damageSubmitting ? 'Discarding...' : 'Discard Damaged Stock'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. History Modal */}
      {historyModalItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '750px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Stock Audit Trail</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {historyModalItem.product_details?.name} (SKU: {historyModalItem.product_details?.sku || 'N/A'})
                </p>
              </div>
              <button
                onClick={() => setHistoryModalItem(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem' }}
              >
                <XCircle size={20} />
              </button>
            </div>

            {historyLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <RefreshCw size={24} className="spinning" />
                <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Loading audit logs...</p>
              </div>
            ) : historyLogs.length === 0 ? (
              <p style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No movement history found for this item.
              </p>
            ) : (
              <div className="table-responsive" style={{ margin: 0 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Timestamp</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Type</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Before</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Delta</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>After</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyLogs.map((tx) => (
                      <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.65rem 0.75rem', color: 'var(--text-muted)' }}>
                          {tx.created_at?.slice(0, 16).replace('T', ' ')}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                          {tx.transaction_type}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: 'var(--text-muted)' }}>
                          {tx.stock_before}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700, color: tx.quantity_change > 0 ? '#10b981' : '#ef4444' }}>
                          {tx.quantity_change > 0 ? `+${tx.quantity_change}` : tx.quantity_change}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>
                          {tx.stock_after}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                          ₹{parseFloat(tx.unit_cost || 0).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.65rem 0.75rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {tx.reference_id || 'Direct'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. Purchase Order Detail Modal */}
      {selectedPODetail && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '720px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>PO #{selectedPODetail.po_number}</h3>
                  {getPOStatusBadge(selectedPODetail.status)}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Supplier: <strong>{selectedPODetail.supplier_name}</strong> • Created: {selectedPODetail.created_at?.slice(0, 10)}
                </div>
              </div>
              <button onClick={() => setSelectedPODetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={22} />
              </button>
            </div>

            {/* Approval / Status Metadata */}
            <div style={{ background: 'var(--bg-surface-secondary)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', fontSize: '0.8rem' }}>
              <div><strong>Created By:</strong> {selectedPODetail.created_by_name || 'Merchant'}</div>
              <div><strong>Order Date:</strong> {selectedPODetail.order_date || 'Not Placed Yet'}</div>
              <div><strong>Expected Delivery:</strong> {selectedPODetail.expected_date || 'Standard'}</div>
              {selectedPODetail.approved_by_name && (
                <div><strong>Approved By:</strong> {selectedPODetail.approved_by_name}</div>
              )}
              {selectedPODetail.rejection_reason && (
                <div style={{ gridColumn: '1 / -1', color: '#b91c1c' }}>
                  <strong>Rejection Reason:</strong> {selectedPODetail.rejection_reason}
                </div>
              )}
            </div>

            {/* Items Table */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Line Items</h4>
            <div className="table-responsive" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-secondary)' }}>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Product</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Ordered</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Received</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Remaining</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPODetail.items?.map((item) => (
                    <tr key={item.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                        {item.product_name}
                        {item.supplier_sku && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block' }}>SKU: {item.supplier_sku}</span>}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>{item.quantity_ordered}</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{item.quantity_received}</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{item.remaining_quantity}</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>₹{parseFloat(item.unit_cost).toFixed(2)}</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>₹{parseFloat(item.total_cost > 0 ? item.total_cost : item.subtotal).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Summary */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.25rem' }}>
              <div style={{ width: '260px', background: 'var(--bg-surface-secondary)', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal:</span>
                  <strong>₹{parseFloat(selectedPODetail.subtotal || 0).toFixed(2)}</strong>
                </div>
                {parseFloat(selectedPODetail.tax || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Tax:</span>
                    <span>+₹{parseFloat(selectedPODetail.tax).toFixed(2)}</span>
                  </div>
                )}
                {parseFloat(selectedPODetail.discount || 0) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Discount:</span>
                    <span>-₹{parseFloat(selectedPODetail.discount).toFixed(2)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-light)', paddingTop: '0.35rem', fontWeight: 800, fontSize: '1rem' }}>
                  <span>Grand Total:</span>
                  <span>₹{parseFloat(selectedPODetail.grand_total > 0 ? selectedPODetail.grand_total : selectedPODetail.subtotal || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Contextual Action Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-light)', paddingTop: '1rem' }}>
              <div>
                {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'PLACED'].includes(selectedPODetail.status) && (
                  <button
                    onClick={() => handleCancelPO(selectedPODetail.id)}
                    style={{ padding: '0.45rem 0.85rem', borderRadius: 'var(--radius-md)', border: '1px solid #fee2e2', background: '#fef2f2', color: '#b91c1c', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    Cancel Order
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {selectedPODetail.status === 'DRAFT' && (
                  <Button variant="warning" size="sm" onClick={() => handleSubmitForApproval(selectedPODetail.id)}>
                    Submit for Approval
                  </Button>
                )}
                {selectedPODetail.status === 'PENDING_APPROVAL' && (
                  <>
                    <Button variant="danger" size="sm" onClick={() => handleOpenReject(selectedPODetail)}>
                      Reject
                    </Button>
                    <Button variant="success" size="sm" onClick={() => handleApprovePO(selectedPODetail.id)}>
                      Approve Order
                    </Button>
                  </>
                )}
                {(selectedPODetail.status === 'APPROVED' || selectedPODetail.status === 'DRAFT') && (
                  <Button variant="primary" size="sm" onClick={() => handleOrderPO(selectedPODetail.id)}>
                    Place Order with Vendor
                  </Button>
                )}
                {(selectedPODetail.status === 'ORDERED' || selectedPODetail.status === 'PLACED' || selectedPODetail.status === 'PARTIALLY_RECEIVED') && (
                  <Button variant="success" size="sm" onClick={() => handleOpenReceivePO(selectedPODetail)}>
                    Receive Stock
                  </Button>
                )}
                <Button variant="secondary" size="sm" onClick={() => setSelectedPODetail(null)}>
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Receive Stock Modal */}
      {receiveModalPO && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '620px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.25rem' }}>
              Receive Stock: PO #{receiveModalPO.po_number}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Supplier: {receiveModalPO.supplier_name} • Physical inventory will increment atomically upon submission.
            </p>

            <form onSubmit={handleSubmitReceivePO} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="table-responsive" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-surface-secondary)' }}>
                      <th style={{ padding: '0.65rem 0.75rem' }}>Product</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Ordered</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Remaining</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', width: '120px' }}>Receive Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receiveModalPO.items?.map((item) => (
                      <tr key={item.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{item.product_name}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>{item.quantity_ordered}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>{item.remaining_quantity}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                          <input
                            type="number"
                            min="0"
                            max={item.remaining_quantity}
                            value={receiveInputs[item.id] || ''}
                            onChange={(e) => setReceiveInputs({ ...receiveInputs, [item.id]: e.target.value })}
                            style={{ width: '80px', padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'right' }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Receiving Delivery Notes / Invoice Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Inbound shipment verified by storekeeper..."
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setReceiveModalPO(null)}>Cancel</Button>
                <Button type="submit" variant="success" disabled={receiveSubmitting}>
                  {receiveSubmitting ? 'Updating Stock...' : 'Confirm Stock Receipt'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. Reject PO Modal */}
      {rejectModalPO && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '440px', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#b91c1c', marginBottom: '0.25rem' }}>
              Reject Purchase Order #{rejectModalPO.po_number}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Provide a business reason for rejecting this procurement request.
            </p>

            <form onSubmit={handleSubmitRejectPO} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>
                  Rejection Rationale
                </label>
                <textarea
                  rows="3"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  required
                  placeholder="Reason for rejecting PO..."
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <Button type="button" variant="secondary" onClick={() => setRejectModalPO(null)}>Cancel</Button>
                <Button type="submit" variant="danger" disabled={rejectSubmitting}>
                  {rejectSubmitting ? 'Rejecting...' : 'Reject Order'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. Quick Reorder Recommendations Modal */}
      {reorderModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '820px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Sparkles size={20} style={{ color: '#6366f1' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Replenishment Reorder Suggestions</h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                  Rule-based reorder advisor analyzing items at or below buffer levels and matching best suppliers.
                </p>
              </div>
              <button onClick={() => setReorderModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={22} />
              </button>
            </div>

            {reorderLoading ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <RefreshCw size={28} className="spinning" />
                <p style={{ marginTop: '0.5rem', color: 'var(--text-muted)' }}>Evaluating replenishment thresholds...</p>
              </div>
            ) : reorderRecommendations.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <CheckCircle2 size={32} style={{ color: '#16a34a', margin: '0 auto 0.5rem' }} />
                <div style={{ fontWeight: 600 }}>All inventory items currently above reorder thresholds!</div>
                <div style={{ fontSize: '0.8rem' }}>No immediate supplier replenishment purchase orders required.</div>
              </div>
            ) : (
              <div>
                <div className="table-responsive" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-surface-secondary)' }}>
                        <th style={{ padding: '0.65rem 0.75rem', width: '40px' }}>Select</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Product</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Current Stock</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Reorder Level</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right', width: '100px' }}>Order Qty</th>
                        <th style={{ padding: '0.65rem 0.75rem' }}>Recommended Supplier</th>
                        <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Est. Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reorderRecommendations.map((rec) => {
                        const itemState = selectedReorderItems[rec.product_id] || {};
                        return (
                          <tr key={rec.product_id} style={{ borderTop: '1px solid var(--border-light)' }}>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!itemState.selected}
                                onChange={(e) =>
                                  setSelectedReorderItems({
                                    ...selectedReorderItems,
                                    [rec.product_id]: { ...itemState, selected: e.target.checked },
                                  })
                                }
                              />
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                              {rec.product_name}
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>SKU: {rec.sku}</div>
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#dc2626', fontWeight: 700 }}>
                              {rec.current_stock}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>{rec.reorder_level}</td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                              <input
                                type="number"
                                min="1"
                                value={itemState.quantity || rec.recommended_purchase_quantity}
                                onChange={(e) =>
                                  setSelectedReorderItems({
                                    ...selectedReorderItems,
                                    [rec.product_id]: { ...itemState, quantity: e.target.value },
                                  })
                                }
                                style={{ width: '70px', padding: '0.25rem 0.4rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem' }}>
                              {rec.recommended_supplier ? (
                                <div>
                                  <span style={{ fontWeight: 600, color: 'var(--primary-600)' }}>
                                    {rec.recommended_supplier.supplier_name}
                                  </span>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    ₹{rec.recommended_supplier.purchase_price} • {rec.recommended_supplier.lead_time_days}d lead
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No supplier mapped</span>
                              )}
                            </td>
                            <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>
                              ₹{(
                                (itemState.quantity || rec.recommended_purchase_quantity) *
                                (rec.recommended_supplier?.purchase_price || 0)
                              ).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    * Purchase orders will be grouped automatically by supplier vendor.
                  </div>
                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <Button variant="secondary" onClick={() => setReorderModalOpen(false)}>Cancel</Button>
                    <Button variant="primary" onClick={handleSubmitReorderPO} disabled={reorderLoading}>
                      {reorderLoading ? 'Generating...' : 'Create Purchase Order(s)'}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 9. Supplier Performance Scorecard Modal */}
      {supplierPerformanceModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '520px', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Supplier Performance Scorecard</h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--primary-600)', fontWeight: 600 }}>
                  {supplierPerformanceModal.supplier_name}
                </div>
              </div>
              <button onClick={() => setSupplierPerformanceModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={22} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Purchase Orders</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{supplierPerformanceModal.total_orders || 0}</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Completed Orders</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#16a34a' }}>{supplierPerformanceModal.completed_orders || 0}</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Delayed Deliveries</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: (supplierPerformanceModal.delayed_orders || 0) > 0 ? '#dc2626' : '#16a34a' }}>
                  {supplierPerformanceModal.delayed_orders || 0}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Average Delivery Days</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800 }}>{supplierPerformanceModal.average_lead_time_days || 3} days</div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Procurement Value Paid</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#4f46e5' }}>
                  ₹{(supplierPerformanceModal.total_purchase_value || 0).toFixed(2)}
                </div>
              </div>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reliability Score</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: (supplierPerformanceModal.reliability_score || 100) >= 90 ? '#16a34a' : '#d97706' }}>
                    {supplierPerformanceModal.reliability_score || 100}%
                  </div>
                </div>
                <Award size={28} style={{ color: (supplierPerformanceModal.reliability_score || 100) >= 90 ? '#16a34a' : '#d97706' }} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="secondary" onClick={() => setSupplierPerformanceModal(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Supplier Products Mapping Modal */}
      {supplierProductsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '700px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0 }}>Supplier Catalog & Pricing</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Vendor: <strong>{supplierProductsModal.name}</strong>
                </div>
              </div>
              <button onClick={() => setSupplierProductsModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <XCircle size={22} />
              </button>
            </div>

            {/* Mapped Products List */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Currently Mapped Catalog</h4>
            <div className="table-responsive" style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-surface-secondary)' }}>
                    <th style={{ padding: '0.65rem 0.75rem' }}>Product</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Purchase Price</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>MOQ</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Lead Time</th>
                    <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Preferred</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierProductsModal.supplier_products?.length === 0 ? (
                    <tr>
                      <td colSpan="5" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No products mapped to this supplier yet.
                      </td>
                    </tr>
                  ) : (
                    supplierProductsModal.supplier_products?.map((sp) => (
                      <tr key={sp.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{sp.product_name}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 700 }}>₹{parseFloat(sp.purchase_price).toFixed(2)}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>{sp.minimum_order_quantity}</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>{sp.lead_time_days} days</td>
                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                          {sp.is_preferred ? <Badge variant="success">Preferred</Badge> : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Form to Map New Product */}
            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Map / Update Product</h4>
            <form onSubmit={handleAddSupplierProduct} style={{ background: 'var(--bg-surface-secondary)', padding: '1rem', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Select Product</label>
                  <select
                    value={supplierProductForm.product_id}
                    onChange={(e) => setSupplierProductForm({ ...supplierProductForm, product_id: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Purchase Price (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="12.00"
                    value={supplierProductForm.purchase_price}
                    onChange={(e) => setSupplierProductForm({ ...supplierProductForm, purchase_price: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>MOQ</label>
                  <input
                    type="number"
                    min="1"
                    value={supplierProductForm.minimum_order_quantity}
                    onChange={(e) => setSupplierProductForm({ ...supplierProductForm, minimum_order_quantity: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Lead Time (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={supplierProductForm.lead_time_days}
                    onChange={(e) => setSupplierProductForm({ ...supplierProductForm, lead_time_days: e.target.value })}
                    required
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Vendor SKU</label>
                  <input
                    type="text"
                    placeholder="e.g. CAM-01"
                    value={supplierProductForm.supplier_product_code}
                    onChange={(e) => setSupplierProductForm({ ...supplierProductForm, supplier_product_code: e.target.value })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="checkbox"
                  id="pref_check"
                  checked={supplierProductForm.is_preferred}
                  onChange={(e) => setSupplierProductForm({ ...supplierProductForm, is_preferred: e.target.checked })}
                />
                <label htmlFor="pref_check" style={{ fontSize: '0.8rem', fontWeight: 600 }}>Set as Preferred Supplier for this Product</label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button type="submit" variant="primary" size="sm" disabled={supplierProductSubmitting}>
                  {supplierProductSubmitting ? 'Saving...' : 'Save Product Mapping'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 11. New Supplier Modal */}
      {newSupplierModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '520px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Register Wholesale Vendor</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Add a wholesale vendor or stationery distributor affiliated with your campus shop.
            </p>

            <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Supplier Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Reliable Wholesale Stationery Ltd"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Business / Legal Name</label>
                  <input
                    type="text"
                    placeholder="Registered company name"
                    value={supplierForm.business_name}
                    onChange={(e) => setSupplierForm({ ...supplierForm, business_name: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>GST / Tax ID</label>
                  <input
                    type="text"
                    placeholder="07AAAAA0000A1Z5"
                    value={supplierForm.tax_id}
                    onChange={(e) => setSupplierForm({ ...supplierForm, tax_id: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Contact Person</label>
                  <input
                    type="text"
                    placeholder="Manager Name"
                    value={supplierForm.contact_person}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Phone</label>
                  <input
                    type="text"
                    placeholder="9876543210"
                    value={supplierForm.phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Email</label>
                <input
                  type="email"
                  placeholder="orders@vendor.com"
                  value={supplierForm.email}
                  onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>City</label>
                  <input
                    type="text"
                    placeholder="e.g. New Delhi"
                    value={supplierForm.city}
                    onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>State</label>
                  <input
                    type="text"
                    placeholder="Delhi"
                    value={supplierForm.state}
                    onChange={(e) => setSupplierForm({ ...supplierForm, state: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Pincode</label>
                  <input
                    type="text"
                    placeholder="110001"
                    value={supplierForm.postal_code}
                    onChange={(e) => setSupplierForm({ ...supplierForm, postal_code: e.target.value })}
                    style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Notes</label>
                <textarea
                  rows="2"
                  placeholder="Payment terms, delivery preferences..."
                  value={supplierForm.notes}
                  onChange={(e) => setSupplierForm({ ...supplierForm, notes: e.target.value })}
                  style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setNewSupplierModalOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={supplierSubmitting}>
                  {supplierSubmitting ? 'Saving...' : 'Register Vendor'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 12. New Purchase Order Modal */}
      {newPOModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: 'var(--bg-surface)', padding: '1.75rem', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '650px', maxHeight: '85vh', overflowY: 'auto', boxShadow: 'var(--shadow-xl)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Create Purchase Order</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Procure stock in bulk from registered campus suppliers.
            </p>

            <form onSubmit={handleCreatePO} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Wholesale Vendor *</label>
                <select
                  value={newPOSupplier}
                  onChange={(e) => setNewPOSupplier(e.target.value)}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                >
                  <option value="">-- Choose Vendor --</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.city || 'Vendor'})</option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Products to Procure</label>
                  <button
                    type="button"
                    onClick={() => setNewPOItems([...newPOItems, { product_id: '', quantity_ordered: 10, unit_cost: '5.00', supplier_sku: '' }])}
                    style={{ fontSize: '0.75rem', color: 'var(--primary-600)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    + Add Another Item
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {newPOItems.map((item, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                      <select
                        value={item.product_id}
                        onChange={(e) => {
                          const updated = [...newPOItems];
                          updated[idx].product_id = e.target.value;
                          setNewPOItems(updated);
                        }}
                        required
                        style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                      >
                        <option value="">Select Item...</option>
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        min="1"
                        placeholder="Qty"
                        value={item.quantity_ordered}
                        onChange={(e) => {
                          const updated = [...newPOItems];
                          updated[idx].quantity_ordered = e.target.value;
                          setNewPOItems(updated);
                        }}
                        required
                        style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                      />

                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Unit Cost (₹)"
                        value={item.unit_cost}
                        onChange={(e) => {
                          const updated = [...newPOItems];
                          updated[idx].unit_cost = e.target.value;
                          setNewPOItems(updated);
                        }}
                        required
                        style={{ padding: '0.45rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: '0.8rem' }}
                      />

                      {newPOItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewPOItems(newPOItems.filter((_, i) => i !== idx))}
                          style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', padding: '0.25rem' }}
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.35rem' }}>Order Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Mid-semester restock order"
                  value={newPONotes}
                  onChange={(e) => setNewPONotes(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <Button type="button" variant="secondary" onClick={() => setNewPOModalOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={newPOSubmitting}>
                  {newPOSubmitting ? 'Creating...' : 'Create Draft PO'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerInventory;
