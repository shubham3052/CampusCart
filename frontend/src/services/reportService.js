import api from './api';

const reportService = {
  // Generic report fetcher
  getReportData: async (reportType, params = {}) => {
    const response = await api.get(`/reports/admin/${reportType}/`, { params });
    return response.data;
  },

  // Export CSV downloader
  downloadReportCsv: async (reportType, params = {}) => {
    const response = await api.get(`/reports/admin/${reportType}/export/`, {
      params,
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    // Resolve filename from server Content-Disposition header if available
    const disposition = response.headers['content-disposition'] || response.headers['Content-Disposition'];
    let filename = `${reportType}_report.csv`;
    if (disposition) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return filename;
  },
};

export default reportService;
