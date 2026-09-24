import api from './api';

export const purchaseAdvisorService = {
  /**
   * Retrieves summary statistics for the Smart Purchase Advisor dashboard.
   */
  getAdvisorSummary: async () => {
    const response = await api.get('/purchase-recommendations/summary/');
    return response.data;
  },

  /**
   * Retrieves purchase recommendations with optional filters.
   * @param {Object} params - { priority, status, reorder_status, category, supplier, horizon, search }
   */
  getRecommendations: async (params = {}) => {
    const response = await api.get('/purchase-recommendations/', { params });
    return response.data;
  },

  /**
   * Retrieves detail of a single recommendation with complete calculation breakdown.
   * @param {number} id
   */
  getRecommendationDetail: async (id) => {
    const response = await api.get(`/purchase-recommendations/${id}/`);
    return response.data;
  },

  /**
   * Accepts a single recommendation and generates a draft purchase order.
   * @param {number} id
   */
  acceptRecommendation: async (id) => {
    const response = await api.post(`/purchase-recommendations/${id}/accept/`);
    return response.data;
  },

  /**
   * Overrides recommended purchase quantity with merchant rationale.
   * @param {number} id
   * @param {Object} data - { manual_quantity, override_reason }
   */
  overrideRecommendation: async (id, data) => {
    const response = await api.post(`/purchase-recommendations/${id}/override/`, data);
    return response.data;
  },

  /**
   * Dismisses a purchase recommendation.
   * @param {number} id
   */
  dismissRecommendation: async (id) => {
    const response = await api.post(`/purchase-recommendations/${id}/dismiss/`);
    return response.data;
  },

  /**
   * Converts multiple recommendations into purchase orders grouped by supplier.
   * @param {Array<number>} recommendationIds
   */
  bulkAcceptRecommendations: async (recommendationIds) => {
    const response = await api.post('/purchase-recommendations/bulk-accept/', {
      recommendation_ids: recommendationIds
    });
    return response.data;
  },

  /**
   * Retrieves side-by-side comparison of all suppliers mapped to this product.
   * @param {number} id
   */
  getSupplierComparison: async (id) => {
    const response = await api.get(`/purchase-recommendations/${id}/supplier-comparison/`);
    return response.data;
  },

  /**
   * Retrieves historical recommendations (ordered, dismissed, adjusted).
   * @param {Object} params
   */
  getAdvisorHistory: async (params = {}) => {
    const response = await api.get('/purchase-recommendations/history/', { params });
    return response.data;
  },

  /**
   * Triggers an on-demand recalculation of safety stock and purchase recommendations.
   * @param {Object} data - { horizon: '7_DAYS' | '30_DAYS', service_level: 0.90 | 0.95 | 0.99 }
   */
  refreshRecommendations: async (data = {}) => {
    const response = await api.post('/purchase-recommendations/refresh/', data);
    return response.data;
  },

  /**
   * Retrieves platform-level procurement analytics for administrators.
   */
  getAdminAnalytics: async () => {
    const response = await api.get('/purchase-recommendations/admin-analytics/');
    return response.data;
  }
};

export default purchaseAdvisorService;
