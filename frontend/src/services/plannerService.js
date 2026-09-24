import api from './api';

export const plannerService = {
  // --- Planner Overview & Suggestions ---
  getOverview: async () => {
    const response = await api.get('/planner/overview/');
    return response.data;
  },

  getSuggestions: async (taskId = null) => {
    const params = taskId ? { task_id: taskId } : {};
    const response = await api.get('/planner/suggestions/', { params });
    return response.data;
  },

  getAcademicTaskSuggestions: async () => {
    const response = await api.get('/planner/academic-task-suggestions/');
    return response.data;
  },

  createSuggestedTasks: async (tasks) => {
    const payload = Array.isArray(tasks) ? { tasks } : { tasks: [tasks] };
    const response = await api.post('/planner/create-suggested-tasks/', payload);
    return response.data;
  },

  validateAndAddToCart: async (items) => {
    const response = await api.post('/planner/add-to-cart/', { items });
    return response.data;
  },

  getAdminStats: async () => {
    const response = await api.get('/planner/admin-stats/');
    return response.data;
  },

  getShopkeeperInsights: async () => {
    const response = await api.get('/planner/shopkeeper-insights/');
    return response.data;
  },

  // --- Student Tasks ---
  getTasks: async (params = {}) => {
    const response = await api.get('/tasks/', { params });
    return response.data;
  },

  createTask: async (data) => {
    const response = await api.post('/tasks/', data);
    return response.data;
  },

  updateTask: async (id, data) => {
    const response = await api.patch(`/tasks/${id}/`, data);
    return response.data;
  },

  deleteTask: async (id) => {
    const response = await api.delete(`/tasks/${id}/`);
    return response.data;
  },

  toggleTaskComplete: async (id) => {
    const response = await api.post(`/tasks/${id}/toggle-complete/`);
    return response.data;
  },

  changeTaskPriority: async (id, priority) => {
    const response = await api.post(`/tasks/${id}/change-priority/`, { priority });
    return response.data;
  },

  changeTaskStatus: async (id, status) => {
    const response = await api.post(`/tasks/${id}/change-status/`, { status });
    return response.data;
  },

  // --- Personal Notes ---
  getNotes: async (params = {}) => {
    const response = await api.get('/notes/', { params });
    return response.data;
  },

  createNote: async (data) => {
    const response = await api.post('/notes/', data);
    return response.data;
  },

  updateNote: async (id, data) => {
    const response = await api.patch(`/notes/${id}/`, data);
    return response.data;
  },

  deleteNote: async (id) => {
    const response = await api.delete(`/notes/${id}/`);
    return response.data;
  },

  pinNote: async (id) => {
    const response = await api.post(`/notes/${id}/pin/`);
    return response.data;
  },

  unpinNote: async (id) => {
    const response = await api.post(`/notes/${id}/unpin/`);
    return response.data;
  },

  archiveNote: async (id) => {
    const response = await api.post(`/notes/${id}/archive/`);
    return response.data;
  },

  unarchiveNote: async (id) => {
    const response = await api.post(`/notes/${id}/unarchive/`);
    return response.data;
  },

  // --- Shopping Lists ---
  getShoppingLists: async () => {
    const response = await api.get('/shopping-lists/');
    return response.data;
  },

  createShoppingList: async (name) => {
    const response = await api.post('/shopping-lists/', { name });
    return response.data;
  },

  deleteShoppingList: async (id) => {
    const response = await api.delete(`/shopping-lists/${id}/`);
    return response.data;
  },

  addShoppingListItem: async (listId, data) => {
    const response = await api.post(`/shopping-lists/${listId}/add-item/`, data);
    return response.data;
  },

  updateShoppingListItem: async (listId, data) => {
    const response = await api.post(`/shopping-lists/${listId}/update-item/`, data);
    return response.data;
  },

  removeShoppingListItem: async (listId, data) => {
    const response = await api.post(`/shopping-lists/${listId}/remove-item/`, data);
    return response.data;
  },

  clearCompletedShoppingItems: async (listId) => {
    const response = await api.post(`/shopping-lists/${listId}/clear-completed/`);
    return response.data;
  },

  addShoppingListToCart: async (listId, itemIds = null, onlyChecked = false) => {
    const payload = {};
    if (itemIds) payload.item_ids = itemIds;
    if (onlyChecked) payload.only_checked = true;
    const response = await api.post(`/shopping-lists/${listId}/add-to-cart/`, payload);
    return response.data;
  },

  // --- Checklists ---
  getChecklists: async () => {
    const response = await api.get('/checklists/');
    return response.data;
  },

  createChecklist: async (data) => {
    const response = await api.post('/checklists/', data);
    return response.data;
  },

  deleteChecklist: async (id) => {
    const response = await api.delete(`/checklists/${id}/`);
    return response.data;
  },

  addChecklistItem: async (checklistId, data) => {
    const response = await api.post(`/checklists/${checklistId}/add-item/`, data);
    return response.data;
  },

  toggleChecklistItem: async (checklistId, itemId, isCompleted = null) => {
    const payload = { item_id: itemId };
    if (isCompleted !== null) payload.is_completed = isCompleted;
    const response = await api.post(`/checklists/${checklistId}/toggle-item/`, payload);
    return response.data;
  },

  removeChecklistItem: async (checklistId, itemId) => {
    const response = await api.post(`/checklists/${checklistId}/remove-item/`, { item_id: itemId });
    return response.data;
  },

  getChecklistTemplates: async () => {
    const response = await api.get('/checklists/templates/');
    return response.data;
  },

  createFromTemplate: async (templateId) => {
    const response = await api.post('/checklists/create-from-template/', { template_id: templateId });
    return response.data;
  },
};

export default plannerService;
