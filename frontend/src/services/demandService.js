import api from './api';

export const demandService = {
  /**
   * Retrieves summary statistics for the shop owner demand dashboard.
   */
  getDemandSummary: async () => {
    const response = await api.get('/demand-predictions/summary/');
    return response.data;
  },

  /**
   * Retrieves list of demand predictions with optional filters.
   * @param {Object} params - { shop, product, horizon }
   */
  getDemandPredictions: async (params = {}) => {
    const response = await api.get('/demand-predictions/', { params });
    return response.data;
  },

  /**
   * Retrieves unified historical sales time series and future forecasted daily points
   * for dual-series Chart.js plotting.
   * @param {number} productId
   * @param {number} horizon - 7 or 30
   */
  getProductForecast: async (productId, horizon = 7) => {
    const response = await api.get('/demand-predictions/forecast/', {
      params: { product_id: productId, horizon }
    });
    return response.data;
  },

  /**
   * Retrieves product-by-product trend classifications across the shop's catalog.
   */
  getDemandTrends: async () => {
    const response = await api.get('/demand-predictions/trends/');
    return response.data;
  },

  /**
   * Retrieves active demand spikes with percentage increases and severity.
   */
  getDemandSpikes: async () => {
    const response = await api.get('/demand-predictions/spikes/');
    return response.data;
  },

  /**
   * Retrieves active model training metadata and evaluation metrics.
   */
  getModelMetrics: async () => {
    const response = await api.get('/demand-predictions/model-metrics/');
    return response.data;
  }
};

export default demandService;
