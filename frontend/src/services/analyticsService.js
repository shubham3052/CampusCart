import api from './api';

const analyticsService = {
  // Shop Owner Analytics APIs
  getShopOverview: async (params = {}) => {
    const response = await api.get('/analytics/shop/overview/', { params });
    return response.data;
  },

  getShopSales: async (params = {}) => {
    const response = await api.get('/analytics/shop/sales/', { params });
    return response.data;
  },

  getShopOrders: async (params = {}) => {
    const response = await api.get('/analytics/shop/orders/', { params });
    return response.data;
  },

  getShopProducts: async (params = {}) => {
    const response = await api.get('/analytics/shop/products/', { params });
    return response.data;
  },

  getShopInventory: async (params = {}) => {
    const response = await api.get('/analytics/shop/inventory/', { params });
    return response.data;
  },

  getShopDemand: async (params = {}) => {
    const response = await api.get('/analytics/shop/demand/', { params });
    return response.data;
  },

  getShopPrinting: async (params = {}) => {
    const response = await api.get('/analytics/shop/printing/', { params });
    return response.data;
  },

  getShopDelivery: async (params = {}) => {
    const response = await api.get('/analytics/shop/delivery/', { params });
    return response.data;
  },

  getShopCustomers: async (params = {}) => {
    const response = await api.get('/analytics/shop/customers/', { params });
    return response.data;
  },

  // Admin Analytics APIs
  getAdminOverview: async (params = {}) => {
    const response = await api.get('/analytics/admin/overview/', { params });
    return response.data;
  },

  getAdminShops: async (params = {}) => {
    const response = await api.get('/analytics/admin/shops/', { params });
    return response.data;
  },

  getAdminUsers: async (params = {}) => {
    const response = await api.get('/analytics/admin/users/', { params });
    return response.data;
  },

  // Student Personal Summary API
  getStudentSummary: async () => {
    const response = await api.get('/analytics/student/summary/');
    return response.data;
  },
};

export default analyticsService;
