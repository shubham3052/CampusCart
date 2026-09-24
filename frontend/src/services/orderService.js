import api from './api';

/**
 * Order Service
 * Handles API communication for placing orders, fetching order history,
 * viewing single order details, cancelling orders, and fetching available pickup slots.
 */
export const orderService = {
  /**
   * Create a new stationery order.
   * Authoritative price, stock validation, and totals are computed strictly on the backend.
   * @param {Object} orderData
   * @param {number} orderData.shop - Target shop ID
   * @param {string} orderData.fulfillment_type - 'PICKUP' or 'DELIVERY'
   * @param {number|null} [orderData.pickup_slot] - Required if fulfillment_type is 'PICKUP'
   * @param {string} [orderData.delivery_address] - Required if fulfillment_type is 'DELIVERY'
   * @param {string} [orderData.payment_method] - e.g. 'COD' or 'ONLINE'
   * @param {string} [orderData.order_notes]
   * @param {Array<{product_id: number, quantity: number}>} orderData.items
   */
  async createOrder(orderData) {
    const response = await api.post('/orders/', orderData);
    return response.data;
  },

  /**
   * Retrieve list of orders for the authenticated student.
   * Backend enforces that students only see their own orders.
   * @param {Object} [params] - Filtering parameters (e.g. status)
   */
  async getOrders(params = {}) {
    const response = await api.get('/orders/', { params });
    return response.data.results || response.data;
  },

  /**
   * Retrieve single order details by integer ID or UUID order_number.
   * @param {number|string} orderId
   */
  async getOrderById(orderId) {
    const response = await api.get(`/orders/${orderId}/`);
    return response.data;
  },

  /**
   * Cancel a PENDING order and release reserved stock.
   * @param {number|string} orderId
   */
  async cancelOrder(orderId) {
    const response = await api.post(`/orders/${orderId}/cancel/`);
    return response.data;
  },

  /**
   * Fetch available pickup slots for a specific shop.
   * Uses dedicated /available/ endpoint returning active future slots with capacity.
   * @param {number} shopId
   * @param {string} [date] - Optional ISO date filter (YYYY-MM-DD)
   */
  async getAvailablePickupSlots(shopId, date = null) {
    const params = { shop_id: shopId };
    if (date) params.date = date;
    const response = await api.get('/pickup-slots/available/', { params });
    return response.data.results || response.data;
  },

  /**
   * Legacy slot retrieval method for backward compatibility.
   */
  async getPickupSlots(shopId, date = null) {
    return this.getAvailablePickupSlots(shopId, date);
  },

  /**
   * Fetch all pickup slots (used by shop owners to manage slots).
   * @param {Object} [params]
   */
  async getAllPickupSlots(params = {}) {
    const response = await api.get('/pickup-slots/', { params });
    return response.data.results || response.data;
  },

  /**
   * Create a new counter pickup slot (Shop Owner only).
   * @param {Object} slotData
   */
  async createPickupSlot(slotData) {
    const response = await api.post('/pickup-slots/', slotData);
    return response.data;
  },

  /**
   * Update an existing pickup slot (Shop Owner only).
   * @param {number} slotId
   * @param {Object} slotData
   */
  async updatePickupSlot(slotId, slotData) {
    const response = await api.patch(`/pickup-slots/${slotId}/`, slotData);
    return response.data;
  },

  /**
   * Delete a pickup slot (Shop Owner only, blocked if booked_count > 0).
   * @param {number} slotId
   */
  async deletePickupSlot(slotId) {
    const response = await api.delete(`/pickup-slots/${slotId}/`);
    return response.data;
  },

  /**
   * Retrieve secure 6-digit pickup OTP (Student customer of the order only).
   * @param {number|string} orderId
   */
  async getPickupOtp(orderId) {
    const response = await api.get(`/orders/${orderId}/pickup-otp/`);
    return response.data;
  },

  /**
   * Verify student pickup OTP and complete order (Shop Owner or Student).
   * @param {number|string} orderId
   * @param {string} otp
   */
  async verifyPickupOtp(orderId, otp) {
    const response = await api.post(`/orders/${orderId}/verify-pickup-otp/`, { otp });
    return response.data;
  },

  /**
   * Update order status (Shop Owner order lifecycle management).
   * @param {number|string} orderId
   * @param {string} status - PENDING -> CONFIRMED -> PREPARING -> READY
   */
  async updateOrderStatus(orderId, status) {
    const response = await api.patch(`/orders/${orderId}/`, { status });
    return response.data;
  },

  /* ========================================================================== */
  /* STEP 14: DELIVERY & ADDRESS MANAGEMENT                                      */
  /* ========================================================================== */

  /**
   * List saved student campus addresses.
   */
  async getStudentAddresses() {
    const response = await api.get('/addresses/');
    return response.data;
  },

  /**
   * Create a new campus delivery address.
   * @param {Object} data - { label, hostel_block, room_number, landmark, phone_number, is_default }
   */
  async createStudentAddress(data) {
    const response = await api.post('/addresses/', data);
    return response.data;
  },

  /**
   * Update a campus delivery address.
   * @param {number} id
   * @param {Object} data
   */
  async updateStudentAddress(id, data) {
    const response = await api.patch(`/addresses/${id}/`, data);
    return response.data;
  },

  /**
   * Delete a campus delivery address.
   * @param {number} id
   */
  async deleteStudentAddress(id) {
    const response = await api.delete(`/addresses/${id}/`);
    return response.data;
  },

  /**
   * Mark an address as the default delivery address.
   * @param {number} id
   */
  async setDefaultStudentAddress(id) {
    const response = await api.post(`/addresses/${id}/set-default/`);
    return response.data;
  },

  /**
   * List deliveries filtered by query parameters.
   * @param {Object} [params] - e.g. { status, available, shop_id }
   */
  async getDeliveries(params = {}) {
    const response = await api.get('/deliveries/', { params });
    return response.data;
  },

  /**
   * Get single delivery details.
   * @param {number|string} id
   */
  async getDeliveryDetail(id) {
    const response = await api.get(`/deliveries/${id}/`);
    return response.data;
  },

  /**
   * List available campus delivery couriers with active load counts.
   */
  async getAvailableDeliveryAgents() {
    const response = await api.get('/deliveries/agents/');
    return response.data;
  },

  /**
   * Assign a delivery courier to an order (Shop Owner / Admin).
   * @param {number|string} deliveryId
   * @param {number} agentId
   * @param {string} [notes]
   */
  async assignDeliveryAgent(deliveryId, agentId, notes = '') {
    const response = await api.post(`/deliveries/${deliveryId}/assign/`, {
      delivery_agent_id: agentId,
      delivery_notes: notes,
    });
    return response.data;
  },

  /**
   * Update delivery status (e.g. ASSIGNED -> OUT_FOR_DELIVERY).
   * @param {number|string} deliveryId
   * @param {string} status - 'OUT_FOR_DELIVERY' | 'CANCELLED'
   * @param {number} [estimatedMinutes=25]
   * @param {string} [notes]
   */
  async updateDeliveryStatus(deliveryId, status, estimatedMinutes = 25, notes = '') {
    const response = await api.post(`/deliveries/${deliveryId}/update-status/`, {
      status,
      estimated_minutes: estimatedMinutes,
      delivery_notes: notes,
    });
    return response.data;
  },

  /**
   * Retrieve secure 6-digit delivery OTP (Ordering Student only).
   * @param {number|string} deliveryId
   */
  async getDeliveryOtp(deliveryId) {
    try {
      const response = await api.get(`/deliveries/${deliveryId}/delivery-otp/`);
      return response.data;
    } catch {
      // Fallback to order route if called with order ID
      const response = await api.get(`/orders/${deliveryId}/delivery-otp/`);
      return response.data;
    }
  },

  /**
   * Verify delivery OTP upon doorstep handover (Courier, Shop Owner, or Admin).
   * @param {number|string} deliveryId
   * @param {string} otp
   * @param {string} [notes]
   */
  async verifyDeliveryOtp(deliveryId, otp, notes = '') {
    try {
      const response = await api.post(`/deliveries/${deliveryId}/verify-delivery-otp/`, {
        otp,
        delivery_notes: notes,
      });
      return response.data;
    } catch {
      // Fallback to order route
      const response = await api.post(`/orders/${deliveryId}/verify-delivery-otp/`, {
        otp,
        delivery_notes: notes,
      });
      return response.data;
    }
  },

  /**
   * Calculate campus delivery fee based on order subtotal.
   * @param {number} subtotal
   * @param {string} [hostelBlock]
   */
  async calculateDeliveryCharge(subtotal = 0, hostelBlock = '') {
    const response = await api.post('/deliveries/calculate-charge/', {
      subtotal,
      hostel_block: hostelBlock,
    });
    return response.data;
  },

  /**
   * Get available delivery slots for a shop on a date.
   */
  async getDeliverySlots(shopId, date = '') {
    const params = { shop_id: shopId };
    if (date) params.date = date;
    const response = await api.get('/delivery-slots/available/', { params });
    return response.data.results || response.data || [];
  },

  /**
   * Shop Owner: list all delivery slots for shop.
   */
  async getAllDeliverySlots(shopId, date = '') {
    const params = { shop_id: shopId };
    if (date) params.date = date;
    const response = await api.get('/delivery-slots/', { params });
    return response.data.results || response.data || [];
  },

  /**
   * Shop Owner: create delivery slot.
   */
  async createDeliverySlot(data) {
    const response = await api.post('/delivery-slots/', data);
    return response.data;
  },

  /**
   * Shop Owner: update delivery slot.
   */
  async updateDeliverySlot(id, data) {
    const response = await api.patch(`/delivery-slots/${id}/`, data);
    return response.data;
  },

  /**
   * Shop Owner: delete delivery slot.
   */
  async deleteDeliverySlot(id) {
    const response = await api.delete(`/delivery-slots/${id}/`);
    return response.data;
  },

  /**
   * Get active delivery zones.
   */
  async getDeliveryZones(shopId = null) {
    const params = {};
    if (shopId) params.shop_id = shopId;
    const response = await api.get('/delivery-zones/', { params });
    return response.data.results || response.data || [];
  },

  /**
   * Courier: mark arrival at shop counter to pick up order.
   */
  async markDeliveryArrivedAtShop(deliveryId) {
    const response = await api.post(`/deliveries/${deliveryId}/arrived-at-shop/`);
    return response.data;
  },

  /**
   * Courier: mark package collected from shop.
   */
  async markDeliveryPickup(deliveryId) {
    const response = await api.post(`/deliveries/${deliveryId}/pickup/`);
    return response.data;
  },

  /**
   * Courier: mark out on delivery.
   */
  async markDeliveryOutForDelivery(deliveryId) {
    const response = await api.post(`/deliveries/${deliveryId}/out-for-delivery/`);
    return response.data;
  },

  /**
   * Fetch authenticated user's notifications.
   * @param {Object} [params] - { unread: true/false }
   */
  async getNotifications(params = {}) {
    const response = await api.get('/notifications/', { params });
    return response.data;
  },

  /**
   * Mark an individual notification as read.
   * @param {number|string} id
   */
  async markNotificationRead(id) {
    const response = await api.patch(`/notifications/${id}/`, { is_read: true });
    return response.data;
  },

  /**
   * Mark all notifications as read for current user.
   */
  async markAllNotificationsRead() {
    const response = await api.post('/notifications/mark-all-read/');
    return response.data;
  },

  /**
   * Fetch lightweight unread notification count.
   */
  async getUnreadNotificationCount() {
    const response = await api.get('/notifications/unread-count/');
    return response.data;
  },

  /**
   * Courier: mark arriving at customer doorstep.
   */
  async markDeliveryArriving(deliveryId) {
    const response = await api.post(`/deliveries/${deliveryId}/arriving/`);
    return response.data;
  },

  /**
   * Courier: record failed delivery with reason.
   */
  async markDeliveryFailed(deliveryId, reason, notes = '') {
    const response = await api.post(`/deliveries/${deliveryId}/failed/`, {
      reason,
      notes,
    });
    return response.data;
  },

  /**
   * Student or Merchant: reschedule failed delivery to a new slot.
   */
  async rescheduleDelivery(deliveryId, slotId) {
    const response = await api.post(`/deliveries/${deliveryId}/reschedule/`, {
      delivery_slot_id: slotId,
    });
    return response.data;
  },

  /**
   * Courier: toggle availability status (AVAILABLE, BUSY, OFFLINE).
   */
  async toggleCourierAvailability(availabilityStatus) {
    const response = await api.post('/deliveries/toggle-availability/', {
      availability_status: availabilityStatus,
    });
    return response.data;
  },

  /**
   * Shop Owner / Admin: delivery analytics metrics.
   */
  async getDeliveryAnalytics(shopId = null) {
    const params = {};
    if (shopId) params.shop_id = shopId;
    const response = await api.get('/deliveries/analytics/', { params });
    return response.data;
  },
};

export default orderService;

