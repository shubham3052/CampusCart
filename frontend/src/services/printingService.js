import api from './api';

/**
 * Printing Service
 * Handles API communication for campus Xerox & document printing operations.
 */
export const printingService = {
  /**
   * Fetch active campus shops offering document printing services and their rate cards.
   */
  async getPrintingShops() {
    const response = await api.get('/printing/shops/');
    return response.data.results || response.data;
  },

  /**
   * Upload a PDF for server-side inspection using pypdf to extract page count and metadata.
   * @param {File} file
   */
  async inspectDocument(file) {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/printing/inspect-file/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Calculate authoritative pricing for a print configuration.
   * @param {Object} params
   * @param {number} params.shop
   * @param {number} params.total_pages
   * @param {number} params.copies
   * @param {string} params.color_mode - 'BW' or 'COLOR'
   * @param {string} params.paper_size - 'A4' or 'A3'
   * @param {string} params.print_sides - 'SINGLE_SIDED' or 'DOUBLE_SIDED'
   * @param {string} params.binding_type - 'NONE', 'CORNER_STAPLE', 'SPIRAL', etc.
   * @param {string} params.fulfillment_type - 'PICKUP' or 'DELIVERY'
   */
  async calculatePrice(params) {
    const response = await api.post('/printing/calculate-price/', params);
    return response.data;
  },

  /**
   * Place a real printing order with file upload and configuration.
   * @param {FormData} formData
   */
  async createPrintOrder(formData) {
    const response = await api.post('/printing/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Retrieve list of print jobs (filtered by role on backend).
   * @param {Object} [params] - Query params like { status, shop }
   */
  async getPrintOrders(params = {}) {
    const response = await api.get('/printing/', { params });
    return response.data.results || response.data;
  },

  /**
   * Retrieve single print order details by ID.
   * @param {number|string} id
   */
  async getPrintOrderById(id) {
    const response = await api.get(`/printing/${id}/`);
    return response.data;
  },

  /**
   * Update print job status in queue (Shop Owner action: WAITING -> PRINTING -> READY -> COMPLETED).
   * @param {number|string} id
   * @param {string} status
   */
  async updatePrintStatus(id, status) {
    const response = await api.patch(`/printing/${id}/update-status/`, { status });
    return response.data;
  },

  /**
   * Download a student's uploaded document with authentication and RBAC permissions.
   * @param {number|string} orderId
   * @param {number|string} docId
   * @param {string} filename
   */
  async downloadDocument(orderId, docId, filename = 'document.pdf') {
    const response = await api.get(`/printing/${orderId}/documents/${docId}/download/`, {
      responseType: 'blob',
    });

    // Create a temporary object URL to trigger browser download
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  },
};

export default printingService;
