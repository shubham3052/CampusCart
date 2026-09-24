import api from './api';

/**
 * Step 25: Authoritative Payment, Refund, and Transaction Management API client.
 */
export const paymentService = {
  // -------------------------------------------------------------
  // PAYMENT INTENT & VERIFICATION
  // -------------------------------------------------------------
  createPaymentIntent: async (orderId, paymentMethod = 'ONLINE', idempotencyKey = null) => {
    const payload = { order_id: orderId, payment_method: paymentMethod };
    if (idempotencyKey) {
      payload.idempotency_key = idempotencyKey;
    }
    const response = await api.post('/payments/create-intent/', payload);
    return response.data;
  },

  verifyPayment: async (paymentId, verificationData) => {
    const response = await api.post(`/payments/${paymentId}/verify/`, verificationData);
    return response.data;
  },

  retryPayment: async (paymentId) => {
    const response = await api.post(`/payments/${paymentId}/retry/`);
    return response.data;
  },

  markCashCollected: async (paymentId, notes = '') => {
    const response = await api.post(`/payments/${paymentId}/mark-cash-collected/`, { notes });
    return response.data;
  },

  // -------------------------------------------------------------
  // TRANSACTIONS LIST & RETRIEVAL
  // -------------------------------------------------------------
  getPayments: async (params = {}) => {
    const response = await api.get('/payments/', { params });
    return response.data;
  },

  getPaymentById: async (paymentId) => {
    const response = await api.get(`/payments/${paymentId}/`);
    return response.data;
  },

  getPaymentAnalytics: async (params = {}) => {
    const response = await api.get('/payments/analytics/', { params });
    return response.data;
  },

  getReconciliationAudit: async (shopId = null) => {
    const params = shopId ? { shop_id: shopId } : {};
    const response = await api.get('/payments/reconciliation/', { params });
    return response.data;
  },

  // -------------------------------------------------------------
  // REFUNDS
  // -------------------------------------------------------------
  getRefunds: async (params = {}) => {
    const response = await api.get('/refunds/', { params });
    return response.data;
  },

  requestRefund: async (orderId, amount, reason) => {
    const response = await api.post('/refunds/', {
      order_id: orderId,
      amount,
      reason,
    });
    return response.data;
  },

  approveRefund: async (refundId) => {
    const response = await api.post(`/refunds/${refundId}/approve/`);
    return response.data;
  },

  rejectRefund: async (refundId, reason = '') => {
    const response = await api.post(`/refunds/${refundId}/reject/`, { reason });
    return response.data;
  },
};

export default paymentService;
