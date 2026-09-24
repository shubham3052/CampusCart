import api from './api';

/**
 * Delivery GPS & Intelligent Route Optimization Service
 * Step 22: Live GPS Tracking, Route Sequence Optimization & Courier Telemetry.
 */
export const deliveryGpsService = {
  /**
   * Post courier GPS coordinates from device geolocation API.
   * @param {Object} locationData
   * @param {number} locationData.latitude
   * @param {number} locationData.longitude
   * @param {number} [locationData.accuracy=10]
   * @param {number|null} [locationData.heading]
   * @param {number|null} [locationData.speed]
   * @param {number|null} [locationData.delivery_id]
   * @param {string} [locationData.timestamp]
   */
  async updateLocation(locationData) {
    const response = await api.post('/deliveries/location/', locationData);
    return response.data;
  },

  /**
   * Retrieve privacy-enforced live GPS tracking info for a delivery.
   * Students see only their active delivery, ETA, distance, and courier location.
   * @param {number|string} deliveryId
   */
  async getDeliveryLiveTracking(deliveryId) {
    const response = await api.get(`/deliveries/${deliveryId}/location/`);
    return response.data;
  },

  /**
   * Retrieve explainable candidate agents ranked by distance, workload, zone, and time window.
   * @param {number|string} deliveryId
   */
  async getCandidateAgents(deliveryId) {
    const response = await api.get(`/deliveries/${deliveryId}/candidate-agents/`);
    return response.data;
  },

  /**
   * Intelligently assign the top-ranked courier based on multi-factor scoring.
   * @param {number|string} deliveryId
   */
  async smartAssignAgent(deliveryId) {
    const response = await api.post(`/deliveries/${deliveryId}/smart-assign/`);
    return response.data;
  },

  /**
   * List delivery routes. Couriers see their own; admins see all.
   * @param {Object} [params]
   */
  async getDeliveryRoutes(params = {}) {
    const response = await api.get('/delivery-routes/', { params });
    return response.data.results || response.data;
  },

  /**
   * Retrieve single delivery route details with sequenced stops.
   * @param {number|string} routeId
   */
  async getDeliveryRoute(routeId) {
    const response = await api.get(`/delivery-routes/${routeId}/`);
    return response.data;
  },

  /**
   * Create an optimized multi-stop route from a batch of delivery IDs.
   * @param {Object} data - { delivery_ids: number[], courier_id?: number, start_location?: string }
   */
  async createDeliveryRoute(data) {
    const response = await api.post('/delivery-routes/', data);
    return response.data;
  },

  /**
   * Re-execute 2-Opt sequence optimization on a route.
   * @param {number|string} routeId
   */
  async optimizeRoute(routeId) {
    const response = await api.post(`/delivery-routes/${routeId}/optimize/`);
    return response.data;
  },

  /**
   * Recalculate route from live courier GPS coordinates.
   * @param {number|string} routeId
   */
  async recalculateRoute(routeId) {
    const response = await api.post(`/delivery-routes/${routeId}/recalculate/`);
    return response.data;
  },

  /**
   * Start delivery journey (sets route to ACTIVE and deliveries to OUT_FOR_DELIVERY).
   * @param {number|string} routeId
   */
  async startRoute(routeId) {
    const response = await api.post(`/delivery-routes/${routeId}/start/`);
    return response.data;
  },

  /**
   * Mark route as fully completed.
   * @param {number|string} routeId
   */
  async completeRoute(routeId) {
    const response = await api.post(`/delivery-routes/${routeId}/complete/`);
    return response.data;
  },

  /**
   * Mark a specific stop in a route as completed.
   * @param {number|string} routeId
   * @param {number|string} stopId
   */
  async completeRouteStop(routeId, stopId) {
    const response = await api.post(`/delivery-routes/${routeId}/complete-stop/`, {
      stop_id: stopId,
    });
    return response.data;
  },

  /**
   * Fetch enriched delivery and route performance analytics.
   */
  async getDeliveryAnalytics() {
    const response = await api.get('/deliveries/analytics/');
    return response.data;
  },
};

export default deliveryGpsService;
