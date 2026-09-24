import api from './api';

const categoryService = {
  /**
   * Get all stationery & printing categories
   * @param {Object} params
   */
  async getCategories(params = {}) {
    const response = await api.get('/categories/', { params });
    return Array.isArray(response.data) ? response.data : (response.data?.results || []);
  },

  /**
   * Get single category by ID
   * @param {number|string} id
   */
  async getCategoryById(id) {
    const response = await api.get(`/categories/${id}/`);
    return response.data;
  },

  /**
   * Create a new category (Admin only)
   * @param {Object} data - { name, slug, description, is_active }
   */
  async createCategory(data) {
    const response = await api.post('/categories/', data);
    return response.data;
  },

  /**
   * Update category details (Admin only)
   * @param {number|string} id
   * @param {Object} data
   */
  async updateCategory(id, data) {
    const response = await api.patch(`/categories/${id}/`, data);
    return response.data;
  },

  /**
   * Delete category (Admin only; blocked if linked products exist)
   * @param {number|string} id
   */
  async deleteCategory(id) {
    const response = await api.delete(`/categories/${id}/`);
    return response.data;
  },
};

export { categoryService };
export default categoryService;
