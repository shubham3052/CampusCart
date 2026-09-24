import api from './api';

export const notificationService = {
  /**
   * Fetch authenticated user's notifications.
   * @param {Object} [params] - { unread: true/false, page: 1, type: '...' }
   */
  getNotifications: async (params = {}) => {
    const res = await api.get('/notifications/', { params });
    return res.data;
  },

  /**
   * Fetch lightweight unread notification count.
   */
  getUnreadCount: async () => {
    const res = await api.get('/notifications/unread-count/');
    return res.data;
  },

  getUnreadNotificationCount: async () => {
    const res = await api.get('/notifications/unread-count/');
    return res.data;
  },

  /**
   * Mark single notification as read.
   */
  markAsRead: async (id) => {
    const res = await api.patch(`/notifications/${id}/`, { is_read: true });
    return res.data;
  },

  /**
   * Mark all notifications as read for current user.
   */
  markAllAsRead: async () => {
    const res = await api.post('/notifications/mark-all-read/');
    return res.data;
  },
};

export default notificationService;
