import api from './api';

export const inventoryService = {
  // Inventory Stock & Thresholds
  getInventory: async (params = {}) => {
    const response = await api.get('/inventory/', { params });
    return response.data;
  },

  getInventoryDetail: async (id) => {
    const response = await api.get(`/inventory/${id}/`);
    return response.data;
  },

  updateInventoryThresholds: async (id, data) => {
    const response = await api.patch(`/inventory/${id}/`, data);
    return response.data;
  },

  adjustStock: async (id, payload) => {
    const response = await api.post(`/inventory/${id}/adjust/`, payload);
    return response.data;
  },

  receiveDirectStock: async (id, payload) => {
    const response = await api.post(`/inventory/${id}/receive/`, payload);
    return response.data;
  },

  reportDamage: async (id, payload) => {
    const response = await api.post(`/inventory/${id}/damage/`, payload);
    return response.data;
  },

  getInventoryHistory: async (id) => {
    const response = await api.get(`/inventory/${id}/history/`);
    return response.data;
  },

  getInventoryAnalytics: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/inventory/analytics/', { params });
    return response.data;
  },

  getDailySalesHistory: async (shopId, productId = null, days = 30) => {
    const params = { shop: shopId, days };
    if (productId) params.product = productId;
    const response = await api.get('/inventory/daily-sales/', { params });
    return response.data;
  },

  exportInventoryCSV: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/inventory/export-csv/', {
      params,
      responseType: 'blob'
    });
    return response.data;
  },

  // Suppliers Management
  getSuppliers: async (shopId, params = {}) => {
    const combinedParams = { ...(shopId ? { shop: shopId } : {}), ...params };
    const response = await api.get('/suppliers/', { params: combinedParams });
    return response.data;
  },

  createSupplier: async (data) => {
    const response = await api.post('/suppliers/', data);
    return response.data;
  },

  updateSupplier: async (id, data) => {
    const response = await api.patch(`/suppliers/${id}/`, data);
    return response.data;
  },

  deleteSupplier: async (id) => {
    const response = await api.delete(`/suppliers/${id}/`);
    return response.data;
  },

  getSupplierPerformance: async (supplierId) => {
    const response = await api.get(`/suppliers/${supplierId}/performance/`);
    return response.data;
  },

  getSupplierPerformanceSummary: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/suppliers/performance-summary/', { params });
    return response.data;
  },

  getSupplierRecommendation: async (productId, shopId, quantity = 1) => {
    const params = { product_id: productId, quantity, ...(shopId ? { shop: shopId } : {}) };
    const response = await api.get('/suppliers/recommend/', { params });
    return response.data;
  },

  addSupplierProduct: async (supplierId, data) => {
    const response = await api.post(`/suppliers/${supplierId}/add-product/`, data);
    return response.data;
  },

  // Purchase Orders Management
  getPurchaseOrders: async (shopId, params = {}) => {
    const combinedParams = { ...(shopId ? { shop: shopId } : {}), ...params };
    const response = await api.get('/purchase-orders/', { params: combinedParams });
    return response.data;
  },

  getPurchaseOrderDetail: async (id) => {
    const response = await api.get(`/purchase-orders/${id}/`);
    return response.data;
  },

  createPurchaseOrder: async (data) => {
    const response = await api.post('/purchase-orders/', data);
    return response.data;
  },

  submitPOForApproval: async (id) => {
    const response = await api.post(`/purchase-orders/${id}/submit-approval/`);
    return response.data;
  },

  approvePurchaseOrder: async (id, data = {}) => {
    const response = await api.post(`/purchase-orders/${id}/approve/`, data);
    return response.data;
  },

  rejectPurchaseOrder: async (id, reason) => {
    const response = await api.post(`/purchase-orders/${id}/reject/`, { reason });
    return response.data;
  },

  placePurchaseOrder: async (id) => {
    const response = await api.post(`/purchase-orders/${id}/place/`);
    return response.data;
  },

  orderPurchaseOrder: async (id) => {
    const response = await api.post(`/purchase-orders/${id}/order/`);
    return response.data;
  },

  receivePurchaseOrder: async (id, payload) => {
    const response = await api.post(`/purchase-orders/${id}/receive/`, payload);
    return response.data;
  },

  cancelPurchaseOrder: async (id) => {
    const response = await api.post(`/purchase-orders/${id}/cancel/`);
    return response.data;
  },

  getPurchaseAnalytics: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/purchase-orders/analytics/', { params });
    return response.data;
  },

  // Inventory Cost Trajectory & Reorder Intelligence
  getProductCostHistory: async (inventoryId) => {
    const response = await api.get(`/inventory/${inventoryId}/cost-history/`);
    return response.data;
  },

  getReorderRecommendations: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/inventory/reorder-recommendations/', { params });
    return response.data;
  },

  // Audit Transactions & Returns
  getInventoryTransactions: async (params = {}) => {
    const response = await api.get('/inventory-transactions/', { params });
    return response.data;
  },

  getInventoryReturns: async (shopId) => {
    const params = shopId ? { shop: shopId } : {};
    const response = await api.get('/inventory-returns/', { params });
    return response.data;
  },

  createInventoryReturn: async (data) => {
    const response = await api.post('/inventory-returns/', data);
    return response.data;
  }
};

export default inventoryService;
