import api from './api';

const adminManagementService = {
  /**
   * Retrieves the directory of system administrators and platform owners.
   */
  getAdmins: async (params = {}) => {
    const response = await api.get('/admin/management/admins/', { params });
    return response.data;
  },

  /**
   * Sends an administrator invitation with a 6-digit email OTP.
   */
  inviteAdmin: async (data) => {
    const response = await api.post('/admin/management/invite/', data);
    return response.data;
  },

  /**
   * Verifies the 6-digit OTP sent to an invited administrator.
   */
  verifyInvitationOtp: async (data) => {
    const response = await api.post('/admin/management/invitations/verify/', data);
    return response.data;
  },

  /**
   * Resends the 6-digit invitation OTP with cooldown enforcement.
   */
  resendInvitationOtp: async (email) => {
    const response = await api.post('/admin/management/invitations/resend/', { email });
    return response.data;
  },

  /**
   * Sets the new administrator's chosen application password and activates account.
   */
  setAdminPassword: async (data) => {
    const response = await api.post('/admin/management/invitations/set-password/', data);
    return response.data;
  },

  /**
   * Toggles the active status of an administrator account.
   */
  toggleAdminStatus: async (adminId) => {
    const response = await api.post(`/admin/management/admins/${adminId}/toggle-status/`);
    return response.data;
  },
};

export default adminManagementService;
