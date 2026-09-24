import api from './api';

const shopService = {
  /**
   * Get list of shops with optional filters (search, shop_type, is_active, ordering)
   * @param {Object} params - { search, shop_type, is_active, ordering }
   */
  async getShops(params = {}) {
    const response = await api.get('/shops/', { params });
    // DRF may return array directly or { results: [...] } if paginated
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  /**
   * Get single shop details by ID
   * @param {number|string} id
   */
  async getShopById(id) {
    const response = await api.get(`/shops/${id}/`);
    return response.data;
  },

  /**
   * Get currently logged-in merchant's shop
   */
  async getMyShop() {
    const response = await api.get('/shops/my-shop/');
    return response.data;
  },

  /**
   * Search nearby shops based on GPS coordinates and optional radius
   * @param {Object} params - { latitude, longitude, radius, shop_type, search }
   */
  async getNearbyShops(params = {}) {
    const response = await api.get('/shops/nearby/', { params });
    return response.data;
  },

  /**
   * Update shop location coordinates and landmark
   * @param {number|string} shopId
   * @param {Object} locationData - { latitude, longitude, address, campus_location }
   */
  async updateShopLocation(shopId, locationData) {
    const response = await api.patch(`/shops/${shopId}/`, locationData);
    return response.data;
  },
};

export default shopService;
