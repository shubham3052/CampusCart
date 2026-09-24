import api from './api';

const bulkOrderService = {
  /**
   * Get list of bulk orders accessible to the user
   */
  async getBulkOrders(params = {}) {
    const response = await api.get('/bulk-orders/', { params });
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  /**
   * Get single bulk order details by ID
   */
  async getBulkOrderById(id) {
    const response = await api.get(`/bulk-orders/${id}/`);
    return response.data;
  },

  /**
   * Create a new bulk order
   */
  async createBulkOrder(data) {
    const response = await api.post('/bulk-orders/', data);
    return response.data;
  },

  /**
   * Join a bulk order using share code
   */
  async joinByCode(id, data) {
    const response = await api.post(`/bulk-orders/${id}/join_by_code/`, data);
    return response.data;
  },

  /**
   * Owner confirms bulk order and triggers atomic inventory reservation
   */
  async confirmBulkOrder(id) {
    const response = await api.post(`/bulk-orders/${id}/confirm/`);
    return response.data;
  },

  /**
   * Cancel bulk order and release reserved stock
   */
  async cancelBulkOrder(id, reason = '') {
    const response = await api.post(`/bulk-orders/${id}/cancel/`, { reason });
    return response.data;
  },

  /**
   * Shop owner advances bulk order status
   */
  async advanceStatus(id, newStatus, notes = '') {
    const response = await api.post(`/bulk-orders/${id}/advance_status/`, {
      status: newStatus,
      notes,
    });
    return response.data;
  },

  /**
   * Get bulk order platform analytics
   */
  async getAnalytics() {
    const response = await api.get('/bulk-orders/analytics/');
    return response.data;
  },

  /**
   * Get cross-shop price comparisons for a product
   */
  async getPriceComparison(productId) {
    const response = await api.get(`/products/${productId}/price_comparison/`);
    return response.data;
  },

  /**
   * Get in-stock alternatives for a product
   */
  async getAlternatives(productId) {
    const response = await api.get(`/products/${productId}/alternatives/`);
    return response.data;
  },

  /**
   * Set price drop alert for a product
   */
  async setPriceAlert(productId, targetPrice) {
    const response = await api.post(`/products/${productId}/price_alert/`, {
      target_price: targetPrice,
    });
    return response.data;
  },

  /**
   * Bulk pricing tiers management
   */
  async getTiers(params = {}) {
    const response = await api.get('/bulk-pricing-tiers/', { params });
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  async createTier(data) {
    const response = await api.post('/bulk-pricing-tiers/', data);
    return response.data;
  },

  async updateTier(id, data) {
    const response = await api.put(`/bulk-pricing-tiers/${id}/`, data);
    return response.data;
  },

  async deleteTier(id) {
    const response = await api.delete(`/bulk-pricing-tiers/${id}/`);
    return response.data;
  },
};

export default bulkOrderService;
