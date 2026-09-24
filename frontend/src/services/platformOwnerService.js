import api from './api';

const platformOwnerService = {
  // 1. Dashboard Overview Stats
  async getDashboardStats() {
    const response = await api.get('/platform-owner/dashboard-stats/');
    return response.data;
  },

  // 2. Admin Management
  async getAdmins(params = {}) {
    const response = await api.get('/platform-owner/admins/', { params });
    return response.data;
  },

  async createAdmin(adminData) {
    const response = await api.post('/platform-owner/admins/', adminData);
    return response.data;
  },

  async getAdmin(id) {
    const response = await api.get(`/platform-owner/admins/${id}/`);
    return response.data;
  },

  async updateAdmin(id, data) {
    const response = await api.patch(`/platform-owner/admins/${id}/`, data);
    return response.data;
  },

  async toggleAdminStatus(id) {
    const response = await api.post(`/platform-owner/admins/${id}/toggle-status/`);
    return response.data;
  },

  // 3. User / Student Oversight
  async getUsers(params = {}) {
    const response = await api.get('/platform-owner/users/', { params });
    return response.data;
  },

  async toggleUserStatus(id) {
    const response = await api.post(`/platform-owner/users/${id}/toggle-status/`);
    return response.data;
  },

  // 4. Shop Owner Oversight
  async getShopOwners(params = {}) {
    const response = await api.get('/platform-owner/shop-owners/', { params });
    return response.data;
  },

  async toggleShopOwnerStatus(id) {
    const response = await api.post(`/platform-owner/shop-owners/${id}/toggle-status/`);
    return response.data;
  },

  // 5. Shops Directory
  async getShops(params = {}) {
    const response = await api.get('/platform-owner/shops/', { params });
    return response.data;
  },

  async toggleShopStatus(id) {
    const response = await api.post(`/platform-owner/shops/${id}/toggle-status/`);
    return response.data;
  },

  // 6. Delivery Partners Oversight
  async getDeliveryPartners(params = {}) {
    const response = await api.get('/platform-owner/delivery-partners/', { params });
    return response.data;
  },

  async toggleDeliveryPartnerStatus(id) {
    const response = await api.post(`/platform-owner/delivery-partners/${id}/toggle-status/`);
    return response.data;
  },

  async approveDeliveryPartner(id) {
    const response = await api.post(`/platform-owner/delivery-partners/${id}/approve/`);
    return response.data;
  },

  async rejectDeliveryPartner(id) {
    const response = await api.post(`/platform-owner/delivery-partners/${id}/reject/`);
    return response.data;
  },

  // 7. Orders Oversight
  async getOrders(params = {}) {
    const response = await api.get('/platform-owner/orders/', { params });
    return response.data;
  },

  async getOrder(id) {
    const response = await api.get(`/platform-owner/orders/${id}/`);
    return response.data;
  },

  async cancelOrder(id, reason) {
    const response = await api.post(`/platform-owner/orders/${id}/cancel/`, { reason });
    return response.data;
  },

  // 8. Payments & Refunds Oversight
  async getPayments(params = {}) {
    const response = await api.get('/platform-owner/payments/', { params });
    return response.data;
  },

  async getRefunds(params = {}) {
    const response = await api.get('/platform-owner/refunds/', { params });
    return response.data;
  },

  // 9. Inventory Health Oversight
  async getInventory(params = {}) {
    const response = await api.get('/platform-owner/inventory/', { params });
    return response.data;
  },

  // 10. Demand Predictions Oversight
  async getDemandPredictions(params = {}) {
    const response = await api.get('/platform-owner/demand-predictions/', { params });
    return response.data;
  },

  // 11. Printing Jobs Oversight
  async getPrintOrders(params = {}) {
    const response = await api.get('/platform-owner/print-orders/', { params });
    return response.data;
  },

  // 12. Campus Map & Locations
  async getLocations() {
    const response = await api.get('/platform-owner/locations/');
    return response.data;
  },

  // 13. Promos & Coupons
  async getCoupons(params = {}) {
    const response = await api.get('/platform-owner/coupons/', { params });
    return response.data;
  },

  async createCoupon(data) {
    const response = await api.post('/platform-owner/coupons/', data);
    return response.data;
  },

  async toggleCouponStatus(id) {
    const response = await api.post(`/platform-owner/coupons/${id}/toggle-status/`);
    return response.data;
  },

  // 14. Notifications & System Broadcasts
  async getNotifications() {
    const response = await api.get('/platform-owner/notifications/');
    return response.data;
  },

  async getUnreadNotificationCount() {
    const response = await api.get('/platform-owner/notifications/unread-count/');
    return response.data;
  },

  async markAllNotificationsRead() {
    const response = await api.post('/platform-owner/notifications/mark-all-read/');
    return response.data;
  },

  async sendBroadcast(broadcastData) {
    const response = await api.post('/platform-owner/notifications/broadcast/', broadcastData);
    return response.data;
  },

  // 15. Security & Audit Logs
  async getAuditLogs(params = {}) {
    const response = await api.get('/platform-owner/audit-logs/', { params });
    return response.data;
  },

  // 16. Profile & Password Management
  async getProfile() {
    const response = await api.get('/platform-owner/profile/');
    return response.data;
  },

  async updateProfile(data) {
    const response = await api.patch('/platform-owner/profile/', data);
    return response.data;
  },

  async changePassword(data) {
    const response = await api.post('/platform-owner/change-password/', data);
    return response.data;
  },
};

export default platformOwnerService;
