import api from './api';

export const engagementService = {
  // ----------------------------------------------------
  // REVIEWS & RATINGS
  // ----------------------------------------------------
  getReviews: async (params = {}) => {
    const res = await api.get('/reviews/', { params });
    return res.data;
  },

  getReviewSummary: async (params = {}) => {
    const res = await api.get('/reviews/summary/', { params });
    return res.data;
  },

  createReview: async (payload) => {
    const res = await api.post('/reviews/', payload);
    return res.data;
  },

  updateReview: async (id, payload) => {
    const res = await api.patch(`/reviews/${id}/`, payload);
    return res.data;
  },

  deleteReview: async (id) => {
    const res = await api.delete(`/reviews/${id}/`);
    return res.data;
  },

  moderateReview: async (id, status, notes = '') => {
    const res = await api.post(`/reviews/${id}/moderate/`, { status, moderation_notes: notes });
    return res.data;
  },

  reportReview: async (id, reason) => {
    const res = await api.post(`/reviews/${id}/report/`, { reason });
    return res.data;
  },

  respondToReview: async (id, sellerResponse) => {
    const res = await api.post(`/reviews/${id}/respond/`, { seller_response: sellerResponse });
    return res.data;
  },

  // ----------------------------------------------------
  // WISHLIST
  // ----------------------------------------------------
  getWishlist: async () => {
    const res = await api.get('/wishlist/');
    return res.data;
  },

  toggleWishlist: async (productId) => {
    const res = await api.post('/wishlist/toggle/', { product_id: productId });
    return res.data;
  },

  checkWishlist: async (productId) => {
    const res = await api.get('/wishlist/check/', { params: { product: productId } });
    return res.data;
  },

  moveWishlistToCart: async (id) => {
    const res = await api.post(`/wishlist/${id}/move-to-cart/`);
    return res.data;
  },

  moveWishlistToShoppingList: async (id, listId = null) => {
    const res = await api.post(`/wishlist/${id}/move-to-shopping-list/`, { shopping_list_id: listId });
    return res.data;
  },

  // ----------------------------------------------------
  // SHOP FAVORITES
  // ----------------------------------------------------
  getShopFavorites: async () => {
    const res = await api.get('/favorites/shops/');
    return res.data;
  },

  toggleShopFavorite: async (shopId) => {
    const res = await api.post('/favorites/shops/toggle/', { shop_id: shopId });
    return res.data;
  },

  checkShopFavorite: async (shopId) => {
    const res = await api.get('/favorites/shops/check/', { params: { shop: shopId } });
    return res.data;
  },

  // ----------------------------------------------------
  // OFFERS & DISCOUNTS
  // ----------------------------------------------------
  getActiveOffers: async (shopId = null) => {
    const params = shopId ? { shop: shopId } : {};
    const res = await api.get('/offers/active/', { params });
    return res.data;
  },

  getOffers: async (params = {}) => {
    const res = await api.get('/offers/', { params });
    return res.data;
  },

  createOffer: async (payload) => {
    const res = await api.post('/offers/', payload);
    return res.data;
  },

  updateOffer: async (id, payload) => {
    const res = await api.patch(`/offers/${id}/`, payload);
    return res.data;
  },

  deleteOffer: async (id) => {
    const res = await api.delete(`/offers/${id}/`);
    return res.data;
  },

  getOfferAnalytics: async () => {
    const res = await api.get('/offers/analytics/');
    return res.data;
  },

  // ----------------------------------------------------
  // COUPONS
  // ----------------------------------------------------
  validateCoupon: async (code, shopId, items) => {
    const res = await api.post('/coupons/validate/', {
      code,
      shop: shopId,
      items,
    });
    return res.data;
  },

  getCoupons: async (params = {}) => {
    const res = await api.get('/coupons/', { params });
    return res.data;
  },

  createCoupon: async (payload) => {
    const res = await api.post('/coupons/', payload);
    return res.data;
  },

  updateCoupon: async (id, payload) => {
    const res = await api.patch(`/coupons/${id}/`, payload);
    return res.data;
  },

  deleteCoupon: async (id) => {
    const res = await api.delete(`/coupons/${id}/`);
    return res.data;
  },

  // ----------------------------------------------------
  // COMPLAINTS & GRIEVANCES
  // ----------------------------------------------------
  getComplaints: async (params = {}) => {
    const res = await api.get('/complaints/', { params });
    return res.data;
  },

  getComplaintDetail: async (id) => {
    const res = await api.get(`/complaints/${id}/`);
    return res.data;
  },

  createComplaint: async (payload) => {
    const res = await api.post('/complaints/', payload);
    return res.data;
  },

  addComplaintMessage: async (id, message) => {
    const res = await api.post(`/complaints/${id}/add-message/`, { message });
    return res.data;
  },

  resolveComplaint: async (id, resolution) => {
    const res = await api.post(`/complaints/${id}/resolve/`, { resolution });
    return res.data;
  },

  updateComplaintStatus: async (id, status, priority = null) => {
    const payload = { status };
    if (priority) payload.priority = priority;
    const res = await api.post(`/complaints/${id}/update-status/`, payload);
    return res.data;
  },

  getComplaintAnalytics: async () => {
    const res = await api.get('/complaints/analytics/');
    return res.data;
  },

  // ----------------------------------------------------
  // NOTIFICATION PREFERENCES
  // ----------------------------------------------------
  getNotificationPreferences: async () => {
    const res = await api.get('/notification-preferences/my-preferences/');
    return res.data;
  },

  updateNotificationPreferences: async (payload) => {
    const res = await api.patch('/notification-preferences/my-preferences/', payload);
    return res.data;
  },
};

export default engagementService;
