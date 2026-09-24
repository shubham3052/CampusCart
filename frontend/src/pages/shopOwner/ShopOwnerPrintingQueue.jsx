import React, { useState, useEffect } from 'react';
import {
  Printer,
  Clock,
  CheckCircle2,
  Play,
  Check,
  Download,
  AlertCircle,
  FileText,
  User,
  Search,
  RefreshCw,
  Eye,
  Filter,
  Key,
} from 'lucide-react';
import printingService from '../../services/printingService';
import orderService from '../../services/orderService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';

const ShopOwnerPrintingQueue = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingId, setUpdatingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  // OTP Verification State (Step 13)
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [targetJobForOtp, setTargetJobForOtp] = useState(null);
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const handleOpenOtpModal = (job) => {
    setTargetJobForOtp(job);
    setOtpInput('');
    setOtpError(null);
    setIsOtpModalOpen(true);
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!targetJobForOtp || !otpInput.trim()) return;

    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      await orderService.verifyPickupOtp(targetJobForOtp.order, otpInput.trim());
      // Update job status in queue to COMPLETED
      setJobs((prev) =>
        prev.map((j) => (j.id === targetJobForOtp.id ? { ...j, status: 'COMPLETED', status_display: 'Completed' } : j))
      );
      setIsOtpModalOpen(false);
    } catch (err) {
      console.error('Print OTP verification failed:', err);
      setOtpError(err.response?.data?.message || 'Invalid or expired OTP code.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await printingService.getPrintOrders();
      setJobs(data);
    } catch (err) {
      console.error('Failed to load queue:', err);
      setError('Could not load print queue. Please refresh.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (jobId, newStatus) => {
    setUpdatingId(jobId);
    try {
      const updated = await printingService.updatePrintStatus(jobId, newStatus);
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? updated.order || updated : j))
      );
    } catch (err) {
      console.error('Status transition failed:', err);
      alert(err.response?.data?.message || 'Could not update print job status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownload = async (job) => {
    const doc = job.documents && job.documents[0];
    if (!doc) {
      alert('No document file attached.');
      return;
    }
    setDownloadingId(job.id);
    try {
      await printingService.downloadDocument(job.id, doc.id, doc.original_filename);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Download error: ' + (err.response?.data?.detail || 'Unauthorized or missing file.'));
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'WAITING':
        return <Badge variant="warning">Waiting in Queue</Badge>;
      case 'PRINTING':
        return <Badge variant="primary">Printing in Progress</Badge>;
      case 'READY':
        return <Badge variant="success">Ready for Collection</Badge>;
      case 'COMPLETED':
        return <Badge variant="neutral">Completed</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const filterTabs = [
    { label: 'All Jobs', value: 'ALL', count: jobs.length },
    { label: 'Waiting', value: 'WAITING', count: jobs.filter((j) => j.status === 'WAITING').length },
    { label: 'Printing', value: 'PRINTING', count: jobs.filter((j) => j.status === 'PRINTING').length },
    { label: 'Ready', value: 'READY', count: jobs.filter((j) => j.status === 'READY').length },
    { label: 'Completed', value: 'COMPLETED', count: jobs.filter((j) => j.status === 'COMPLETED').length },
  ];

  const filteredJobs = jobs.filter((j) => {
    const matchesStatus = statusFilter === 'ALL' || j.status === statusFilter;
    const docName = j.documents?.[0]?.original_filename || '';
    const customer = j.customer_name || '';
    const matchesSearch =
      searchQuery.trim() === '' ||
      docName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(j.id).includes(searchQuery);
    return matchesStatus && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Live Xerox & Printing Queue
          </h1>
          <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Process submitted assignments, download PDFs, and update print completion status
          </p>
        </div>

        <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={fetchQueue} disabled={loading}>
          Refresh Queue
        </Button>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto' }}>
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                border: 'none',
                backgroundColor: statusFilter === tab.value ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                color: statusFilter === tab.value ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 600,
                fontSize: '0.8rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{tab.label}</span>
              <span
                style={{
                  backgroundColor: statusFilter === tab.value ? 'rgba(255,255,255,0.25)' : 'var(--border-medium)',
                  color: statusFilter === tab.value ? '#ffffff' : 'var(--text-secondary)',
                  padding: '0.05rem 0.4rem',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ position: 'relative', width: '260px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          <input
            type="text"
            placeholder="Search customer or document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem 0.5rem 2.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-medium)',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: 'var(--radius-md)' }}>
          {error}
        </div>
      )}

      {/* Queue Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading live printing queue...
        </div>
      ) : filteredJobs.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)' }}>
          <Printer size={40} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            No print jobs in this category
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            New student document orders will appear here automatically.
          </p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-light)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-xs)',
          }}
        >
          <div className="table-responsive" style={{ margin: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Job #</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Document</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Customer</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Specs</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Fulfillment</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Total</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const doc = job.documents?.[0];
                  const filename = doc?.original_filename || 'Uploaded Document';
                  const formattedTime = new Date(job.created_at).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={job.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: job.status === 'WAITING' ? 'rgba(245, 158, 11, 0.03)' : 'transparent',
                      }}
                    >
                      {/* Job ID */}
                      <td style={{ padding: '1rem', fontWeight: 800, color: 'var(--primary-600)' }}>
                        #{job.id}
                      </td>

                      {/* Document Name & Download */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={16} color="var(--primary-600)" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {filename}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {job.page_selection_type === 'CUSTOM' ? `Pages: ${job.custom_page_range}` : `All ${job.total_pages} pgs`} • {job.copies} {job.copies > 1 ? 'copies' : 'copy'}
                        </div>
                      </td>

                      {/* Customer */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {job.customer_name || 'Student'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {job.customer_phone || job.customer_email}
                        </div>
                      </td>

                      {/* Specifications */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <Badge variant={job.color_mode === 'COLOR' ? 'warning' : 'neutral'}>
                            {job.color_mode === 'COLOR' ? 'Color' : 'B/W'}
                          </Badge>
                          <Badge variant="neutral">{job.paper_size}</Badge>
                          <Badge variant="neutral">{job.print_sides === 'DOUBLE_SIDED' ? 'Duplex' : 'Single'}</Badge>
                        </div>
                        {job.binding_type !== 'NONE' && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--primary-700)', fontWeight: 600, marginTop: '0.25rem' }}>
                            {job.binding_type_display}
                          </div>
                        )}
                      </td>

                      {/* Fulfillment */}
                      <td style={{ padding: '1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.825rem' }}>
                          {job.fulfillment_type === 'DELIVERY' ? 'Doorstep Delivery' : 'Counter Pickup'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {job.fulfillment_type === 'DELIVERY'
                            ? (job.delivery_address?.slice(0, 25) + '...')
                            : (job.pickup_slot_display || 'Counter Slot')}
                        </div>
                      </td>

                      {/* Total */}
                      <td style={{ padding: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{parseFloat(job.total_amount || job.price || 0).toFixed(2)}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '1rem' }}>
                        {getStatusBadge(job.status)}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {formattedTime} • ~{job.estimated_prep_time_mins}m
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td style={{ padding: '1rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem' }}>
                          {/* Secure Download Button */}
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Download student document"
                            disabled={downloadingId === job.id}
                            onClick={() => handleDownload(job)}
                          >
                            <Download size={15} />
                          </Button>

                          {/* Progression Actions */}
                          {job.status === 'WAITING' && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={updatingId === job.id}
                              onClick={() => handleStatusUpdate(job.id, 'PRINTING')}
                            >
                              <Play size={13} style={{ marginRight: '4px' }} />
                              Start Printing
                            </Button>
                          )}

                          {job.status === 'PRINTING' && (
                            <Button
                              variant="primary"
                              size="sm"
                              style={{ backgroundColor: '#059669', borderColor: '#059669' }}
                              disabled={updatingId === job.id}
                              onClick={() => handleStatusUpdate(job.id, 'READY')}
                            >
                              <CheckCircle2 size={14} style={{ marginRight: '4px' }} />
                              Mark Ready
                            </Button>
                          )}

                          {job.status === 'READY' && (
                            job.fulfillment_type === 'PICKUP' ? (
                              <Button
                                variant="primary"
                                size="sm"
                                leftIcon={Key}
                                style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
                                onClick={() => handleOpenOtpModal(job)}
                              >
                                Verify OTP
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={updatingId === job.id}
                                onClick={() => handleStatusUpdate(job.id, 'COMPLETED')}
                              >
                                <Check size={14} style={{ marginRight: '4px' }} />
                                Complete
                              </Button>
                            )
                          )}

                          {job.status === 'COMPLETED' && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--success-600)', fontWeight: 600 }}>
                              Done
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OTP Verification Modal */}
      {isOtpModalOpen && targetJobForOtp && (
        <Modal
          isOpen={isOtpModalOpen}
          onClose={() => setIsOtpModalOpen(false)}
          title="Verify Print Pickup OTP"
        >
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ padding: '0.85rem 1rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Print Job:</span>
                <strong>#{targetJobForOtp.id} ({targetJobForOtp.documents?.[0]?.original_filename || 'PDF Document'})</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Customer:</span>
                <strong>{targetJobForOtp.customer_name}</strong>
              </div>
            </div>

            {otpError && (
              <div style={{ padding: '0.75rem 1rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.85rem' }}>
                {otpError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem' }}>
                Enter Student 6-Digit Pickup OTP:
              </label>
              <input
                type="text"
                autoFocus
                required
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="6-digit code"
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  fontSize: '1.75rem',
                  fontFamily: 'monospace',
                  textAlign: 'center',
                  letterSpacing: '8px',
                  fontWeight: 800,
                  border: '2px solid var(--primary-500)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="ghost" type="button" onClick={() => setIsOtpModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={isVerifyingOtp || otpInput.length < 6}
                style={{ backgroundColor: '#16a34a', borderColor: '#16a34a' }}
              >
                {isVerifyingOtp ? 'Verifying...' : 'Verify OTP & Complete Handover'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

export default ShopOwnerPrintingQueue;
