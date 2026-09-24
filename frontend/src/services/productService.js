import api from './api';

const productService = {
  /**
   * Get list of products with optional query filters
   * @param {Object} params - { shop, category, search, ordering, min_price, max_price, in_stock, is_active }
   */
  async getProducts(params = {}) {
    const response = await api.get('/products/', { params });
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  /**
   * Get single product details by ID
   * @param {number|string} id
   */
  async getProductById(id) {
    const response = await api.get(`/products/${id}/`);
    return response.data;
  },

  /**
   * Create a new product (supports multipart/form-data with image upload and initial_stock)
   * @param {FormData|Object} formData
   */
  async createProduct(formData) {
    const isFormData = typeof FormData !== 'undefined' && formData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await api.post('/products/', formData, config);
    return response.data;
  },

  /**
   * Update an existing product (supports partial patch and multipart image upload)
   * @param {number|string} id
   * @param {FormData|Object} formData
   */
  async updateProduct(id, formData) {
    const isFormData = typeof FormData !== 'undefined' && formData instanceof FormData;
    const config = isFormData ? { headers: { 'Content-Type': 'multipart/form-data' } } : {};
    const response = await api.patch(`/products/${id}/`, formData, config);
    return response.data;
  },

  /**
   * Delete or soft-deactivate product
   * @param {number|string} id
   */
  async deleteProduct(id) {
    const response = await api.delete(`/products/${id}/`);
    return response.data;
  },
};

export { productService };
export default productService;
