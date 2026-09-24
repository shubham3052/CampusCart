import api from './api';

const recommendationService = {
  /**
   * GET /api/recommendations/home/
   * Aggregated home recommendation payload
   */
  getHomeRecommendations: async (limit = 6) => {
    const response = await api.get('/recommendations/home/', { params: { limit } });
    return response.data;
  },

  /**
   * GET /api/recommendations/personalized/
   */
  getPersonalizedRecommendations: async (limit = 10) => {
    const response = await api.get('/recommendations/personalized/', { params: { limit } });
    return response.data;
  },

  /**
   * GET /api/recommendations/buy-again/
   */
  getBuyAgainRecommendations: async (limit = 8) => {
    const response = await api.get('/recommendations/buy-again/', { params: { limit } });
    return response.data;
  },

  /**
   * GET /api/recommendations/academic/
   */
  getAcademicRecommendations: async (limit = 8, days = 30) => {
    const response = await api.get('/recommendations/academic/', { params: { limit, days } });
    return response.data;
  },

  /**
   * GET /api/recommendations/trending/
   */
  getTrendingProducts: async (params = {}) => {
    const response = await api.get('/recommendations/trending/', { params });
    return response.data;
  },

  /**
   * GET /api/recommendations/popular/
   */
  getPopularProducts: async (params = {}) => {
    const response = await api.get('/recommendations/popular/', { params });
    return response.data;
  },

  /**
   * GET /api/recommendations/frequently-bought/?product_id=123
   */
  getFrequentlyBoughtTogether: async (productId, limit = 4) => {
    const response = await api.get('/recommendations/frequently-bought/', {
      params: { product_id: productId, limit },
    });
    return response.data;
  },

  /**
   * GET /api/recommendations/similar/<product_id>/
   */
  getSimilarProducts: async (productId, limit = 4) => {
    const response = await api.get(`/recommendations/similar/${productId}/`, {
      params: { limit },
    });
    return response.data;
  },

  /**
   * GET /api/recommendations/shops/
   */
  getRecommendedShops: async (limit = 4) => {
    const response = await api.get('/recommendations/shops/', { params: { limit } });
    return response.data;
  },

  /**
   * POST /api/recommendations/track/
   */
  trackInteraction: async (data) => {
    const response = await api.post('/recommendations/track/', data);
    return response.data;
  },

  /**
   * POST /api/recommendations/feedback/
   */
  submitFeedback: async (data) => {
    const response = await api.post('/recommendations/feedback/', data);
    return response.data;
  },

  /**
   * GET /api/recommendations/admin-analytics/
   */
  getAdminAnalytics: async () => {
    const response = await api.get('/recommendations/admin-analytics/');
    return response.data;
  },

  /**
   * GET /api/recommendations/config/
   */
  getConfig: async () => {
    const response = await api.get('/recommendations/config/');
    return response.data;
  },

  /**
   * PUT /api/recommendations/config/
   */
  updateConfig: async (configData) => {
    const response = await api.put('/recommendations/config/', configData);
    return response.data;
  },

  /**
   * GET /api/recommendations/shop-insights/?shop=1
   */
  getShopInsights: async (shopId) => {
    const response = await api.get('/recommendations/shop-insights/', {
      params: { shop: shopId },
    });
    return response.data;
  },
};

export default recommendationService;
