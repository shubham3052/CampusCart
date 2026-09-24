import api from './api';

export const academicService = {
  // --- Institutions ---
  getInstitutions: async (params = {}) => {
    const response = await api.get('/institutions/', { params });
    return response.data;
  },

  createInstitution: async (data) => {
    const response = await api.post('/institutions/', data);
    return response.data;
  },

  updateInstitution: async (id, data) => {
    const response = await api.patch(`/institutions/${id}/`, data);
    return response.data;
  },

  // --- Academic Years ---
  getAcademicYears: async (params = {}) => {
    const response = await api.get('/academic-years/', { params });
    return response.data;
  },

  createAcademicYear: async (data) => {
    const response = await api.post('/academic-years/', data);
    return response.data;
  },

  // --- Semesters ---
  getSemesters: async (params = {}) => {
    const response = await api.get('/semesters/', { params });
    return response.data;
  },

  createSemester: async (data) => {
    const response = await api.post('/semesters/', data);
    return response.data;
  },

  // --- Academic Events ---
  getEvents: async (params = {}) => {
    const response = await api.get('/academic/', { params });
    return response.data;
  },

  getUpcomingEvents: async (days = 30, institutionId = null) => {
    const params = { days };
    if (institutionId) params.institution = institutionId;
    const response = await api.get('/academic/upcoming/', { params });
    return response.data;
  },

  getRelevantEvents: async (days = 30) => {
    const response = await api.get('/academic/relevant/', { params: { days } });
    return response.data;
  },

  getDemandInsights: async (days = 30) => {
    const response = await api.get('/academic/demand-insights/', { params: { days } });
    return response.data;
  },

  getDemandAnalytics: async (days = 60, shopId = null) => {
    const params = { days };
    if (shopId) params.shop = shopId;
    const response = await api.get('/academic/analytics/', { params });
    return response.data;
  },

  getAcademicFeatures: async (date = null, shopId = null) => {
    const params = {};
    if (date) params.date = date;
    if (shopId) params.shop = shopId;
    const response = await api.get('/academic/features/', { params });
    return response.data;
  },

  getFeatureReport: async () => {
    const response = await api.get('/academic/feature-report/');
    return response.data;
  },

  createEvent: async (data) => {
    const response = await api.post('/academic/', data);
    return response.data;
  },

  updateEvent: async (id, data) => {
    const response = await api.patch(`/academic/${id}/`, data);
    return response.data;
  },

  cancelEvent: async (id) => {
    const response = await api.post(`/academic/${id}/cancel/`);
    return response.data;
  },

  deleteEvent: async (id) => {
    const response = await api.delete(`/academic/${id}/`);
    return response.data;
  },

  // --- Academic Event Impacts ---
  getImpacts: async (params = {}) => {
    const response = await api.get('/academic-impacts/', { params });
    return response.data;
  },

  createImpact: async (data) => {
    const response = await api.post('/academic-impacts/', data);
    return response.data;
  },

  updateImpact: async (id, data) => {
    const response = await api.patch(`/academic-impacts/${id}/`, data);
    return response.data;
  },

  deleteImpact: async (id) => {
    const response = await api.delete(`/academic-impacts/${id}/`);
    return response.data;
  },

  // --- Student Academic Profile ---
  getStudentProfile: async () => {
    const response = await api.get('/student-academic-profile/me/');
    return response.data;
  },

  updateStudentProfile: async (data) => {
    const response = await api.patch('/student-academic-profile/me/', data);
    return response.data;
  },

  // --- Audit Logs ---
  getAuditLogs: async () => {
    const response = await api.get('/academic/audit-logs/');
    return response.data;
  },
};

export default academicService;
