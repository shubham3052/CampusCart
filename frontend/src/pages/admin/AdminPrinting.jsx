import React, { useState, useEffect } from 'react';
import {
  Printer,
  Search,
  FileText,
  RefreshCw,
  CheckCircle,
  Clock,
  Download,
  Eye,
  Store,
  User,
  Layers,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import printingService from '../../services/printingService';
import shopService from '../../services/shopService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminPrinting = () => {
  const [printOrders, setPrintOrders] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedShop, setSelectedShop] = useState('');

  // Selected Detail Modal
  const [selectedJob, setSelectedJob] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Load shops for filter dropdown
  useEffect(() => {
    const fetchShops = async () => {
      try {
        const shopsData = await shopService.getShops();
        setShops(Array.isArray(shopsData) ? shopsData : shopsData.results || []);
      } catch (err) {
        console.error('Failed to load shops for printing:', err);
      }
    };
    fetchShops();
  }, []);

  const loadPrintOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (selectedShop) params.shop = selectedShop;

      const data = await printingService.getPrintOrders(params);
      setPrintOrders(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load printing orders:', err);
      setError('Unable to load document printing jobs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrintOrders();
  }, [statusFilter, selectedShop]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadPrintOrders();
  };

  const handleDownload = async (job, doc) => {
    const docId = doc?.id || (job.documents?.[0]?.id);
    if (!docId) {
      alert('Document ID is missing for this print job.');
      return;
    }
    const filename = doc?.original_filename || job.document_title || `print_order_${job.id}.pdf`;

    try {
      setDownloadingDocId(docId);
      await printingService.downloadDocument(job.id, docId, filename);
    } catch (err) {
      console.error('Failed to download document:', err);
      alert('Failed to download document: ' + (err.response?.data?.detail || err.message));
    } finally {
      setDownloadingDocId(null);
    }
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    try {
      setUpdatingStatus(true);
      await printingService.updatePrintStatus(jobId, newStatus);
      setPrintOrders((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
      );
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob((prev) => ({ ...prev, status: newStatus }));
      }
      setToastMsg(`Print job #${jobId} status updated to ${newStatus}.`);
      setTimeout(() => setToastMsg(''), 3500);
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update job status: ' + (err.response?.data?.message || err.message));
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'COMPLETED': return <Badge variant="success">Completed</Badge>;
      case 'PRINTING': return <Badge variant="warning">Printing</Badge>;
      case 'READY': return <Badge variant="primary">Ready</Badge>;
      case 'CANCELLED': return <Badge variant="danger">Cancelled</Badge>;
      case 'WAITING':
      default: return <Badge variant="secondary">Waiting</Badge>;
    }
  };

  // Filter in memory for search query
  const filteredJobs = printOrders.filter((job) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const ordNum = String(job.order_number || job.order || '').toLowerCase();
    const student = (job.customer_name || '').toLowerCase();
    const docTitle = (job.document_title || '').toLowerCase();
    const shopName = (job.shop_name || '').toLowerCase();
    return ordNum.includes(q) || student.includes(q) || docTitle.includes(q) || shopName.includes(q);
  });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Printing & Xerox Services Oversight"
          subtitle="System-wide management of document print queues, format specifications, and print centers"
        />
        <Button variant="outline" size="sm" onClick={loadPrintOrders} icon={RefreshCw}>
          Refresh
        </Button>
      </div>

      {toastMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle size={18} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toastMsg}</span>
        </div>
      )}

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary-50, #eff6ff)', borderRadius: '10px', color: 'var(--primary-600, #2563eb)' }}>
            <Printer size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Total Print Jobs</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{printOrders.length}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#fef3c7', borderRadius: '10px', color: '#d97706' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Active in Queue</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#d97706' }}>
              {printOrders.filter((j) => ['WAITING', 'PRINTING'].includes(j.status)).length}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '10px', color: '#059669' }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Ready / Completed</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
              {printOrders.filter((j) => ['READY', 'COMPLETED'].includes(j.status)).length}
            </div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="1rem">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <Input
                type="text"
                placeholder="Search printing jobs by Order #, student, file title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="primary">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="WAITING">Waiting in Queue</option>
              <option value="PRINTING">Printing in Progress</option>
              <option value="READY">Ready for Collection</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.85rem',
              }}
            >
              <option value="">All Print Shops</option>
              {shops.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Printing Jobs Table */}
      <Card padding="0">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading printing telemetry..." />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted, #6b7280)' }}>
            <Printer size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <h4 style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary, #111827)' }}>No print orders found</h4>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>No document printing jobs match the selected filter.</p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Job ID</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Student</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Print Center</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Document Title</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Specifications</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Pages & Copies</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Cost</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((p) => {
                  const hasDoc = p.documents && p.documents.length > 0;
                  const firstDoc = hasDoc ? p.documents[0] : null;

                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary-600, #2563eb)', fontFamily: 'monospace' }}>
                          #{p.id}
                        </span>
                        {p.order_number && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', fontFamily: 'monospace' }}>
                            Ord #{String(p.order_number).slice(0, 6)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{p.customer_name || 'Student'}</div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                          <Store size={14} color="var(--primary-600, #2563eb)" />
                          <span style={{ fontWeight: 500 }}>{p.shop_name || `Shop #${p.shop}`}</span>
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                          <FileText size={15} color="var(--primary-600, #2563eb)" />
                          {p.document_title || firstDoc?.original_filename || 'PDF Document'}
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #4b5563)' }}>
                          <span style={{ fontWeight: 600 }}>{p.color_mode === 'COLOR' ? 'Color' : 'B&W'}</span> · {p.paper_size || 'A4'} · {p.print_sides === 'DOUBLE_SIDED' ? 'Double-Sided' : 'Single-Sided'}
                          {p.binding_type && p.binding_type !== 'NONE' && (
                            <div style={{ color: 'var(--primary-600, #2563eb)', marginTop: '0.125rem' }}>
                              Binding: {p.binding_type}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontWeight: 600 }}>{p.total_pages || 1}</span> pgs × {p.copies || 1} copy
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                        ₹{Number(p.price || p.total_amount || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {getStatusBadge(p.status)}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSelectedJob(p); setDetailModalOpen(true); }}
                            title="View Job Details"
                          >
                            <Eye size={16} />
                          </Button>
                          {hasDoc && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(p, firstDoc)}
                              disabled={downloadingDocId === firstDoc?.id}
                              title="Download PDF Document"
                            >
                              <Download size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      {detailModalOpen && selectedJob && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Print Job #${selectedJob.id}`}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color, #e5e7eb)' }}>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)' }}>Order Ref: </span>
                <strong style={{ fontFamily: 'monospace' }}>#{String(selectedJob.order_number || selectedJob.order).slice(0, 8)}</strong>
              </div>
              <div>{getStatusBadge(selectedJob.status)}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Student</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.customer_name || 'Student'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Print Center</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.shop_name || `Shop #${selectedJob.shop}`}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Color Mode</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.color_mode === 'COLOR' ? 'Color' : 'B&W'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Paper Size</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.paper_size || 'A4'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Sides</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.print_sides === 'DOUBLE_SIDED' ? 'Double' : 'Single'}</strong>
              </div>
              <div style={{ padding: '0.625rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Binding</span>
                <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedJob.binding_type || 'None'}</strong>
              </div>
            </div>

            {/* Documents List */}
            {selectedJob.documents && selectedJob.documents.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
                  Uploaded Documents
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedJob.documents.map((d) => (
                    <div
                      key={d.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.625rem 0.875rem',
                        background: 'var(--bg-secondary, #f9fafb)',
                        border: '1px solid var(--border-color, #e5e7eb)',
                        borderRadius: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FileText size={18} color="var(--primary-600, #2563eb)" />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-primary, #111827)' }}>
                            {d.original_filename || selectedJob.document_title || 'Document.pdf'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                            {d.page_count ? `${d.page_count} pages` : ''} {d.file_size ? `· ${(d.file_size / 1024).toFixed(0)} KB` : ''}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(selectedJob, d)}
                        disabled={downloadingDocId === d.id}
                      >
                        <Download size={14} style={{ marginRight: '4px' }} />
                        {downloadingDocId === d.id ? 'Downloading...' : 'Download'}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Update Status Actions */}
            <div style={{ borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                {selectedJob.status === 'WAITING' && (
                  <Button variant="primary" size="sm" onClick={() => handleStatusUpdate(selectedJob.id, 'PRINTING')} disabled={updatingStatus}>
                    Start Printing
                  </Button>
                )}
                {selectedJob.status === 'PRINTING' && (
                  <Button variant="primary" size="sm" onClick={() => handleStatusUpdate(selectedJob.id, 'READY')} disabled={updatingStatus}>
                    Mark Ready
                  </Button>
                )}
                {selectedJob.status === 'READY' && (
                  <Button variant="primary" size="sm" onClick={() => handleStatusUpdate(selectedJob.id, 'COMPLETED')} disabled={updatingStatus}>
                    Mark Completed
                  </Button>
                )}
              </div>

              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminPrinting;
