import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  FileText,
  Printer,
  Clock,
  CheckCircle2,
  Store,
  MapPin,
  Calendar,
  AlertCircle,
  Download,
  ArrowLeft,
  ShieldCheck,
  Check,
  Package,
  Key,
  Eye,
  EyeOff,
  Copy,
} from 'lucide-react';
import printingService from '../../services/printingService';
import orderService from '../../services/orderService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';

const StudentPrintOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [job, setJob] = useState(location.state?.printJob || null);
  const [loading, setLoading] = useState(!job);
  const [error, setError] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Pickup OTP State (Step 13)
  const [pickupOtp, setPickupOtp] = useState(null);
  const [isOtpLoading, setIsOtpLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otpCopied, setOtpCopied] = useState(false);
  const [otpError, setOtpError] = useState(null);

  const handleFetchOtp = async () => {
    if (showOtp) {
      setShowOtp(false);
      return;
    }
    if (pickupOtp) {
      setShowOtp(true);
      return;
    }
    if (!job?.order) return;

    try {
      setIsOtpLoading(true);
      setOtpError(null);
      const data = job.fulfillment_type === 'DELIVERY'
        ? await orderService.getDeliveryOtp(job.order)
        : await orderService.getPickupOtp(job.order);
      if (data.success && data.otp) {
        setPickupOtp(data.otp);
        setShowOtp(true);
      } else {
        setOtpError(data.message || 'OTP is not available yet.');
      }
    } catch (err) {
      console.error('Failed to fetch print OTP:', err);
      setOtpError(err.response?.data?.message || 'Could not retrieve OTP.');
    } finally {
      setIsOtpLoading(false);
    }
  };

  const handleCopyOtp = () => {
    if (!pickupOtp) return;
    navigator.clipboard.writeText(pickupOtp);
    setOtpCopied(true);
    setTimeout(() => setOtpCopied(false), 2500);
  };

  const isNewOrder = location.state?.isNewOrder;

  useEffect(() => {
    fetchJobDetails();
  }, [id]);

  const fetchJobDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await printingService.getPrintOrderById(id);
      setJob(data);
    } catch (err) {
      console.error('Failed to load print order:', err);
      setError(err.response?.data?.detail || 'Unable to load print job details. It may belong to another account.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (docId, filename) => {
    setIsDownloading(true);
    try {
      await printingService.downloadDocument(job.id, docId, filename);
    } catch (err) {
      console.error('Download failed:', err);
      alert('Failed to download document: ' + (err.response?.data?.detail || 'Unauthorized or file missing.'));
    } finally {
      setIsDownloading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'WAITING':
        return <Badge variant="warning">Waiting for Operator</Badge>;
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

  // Visual print timeline steps
  const printSteps = [
    { key: 'WAITING', label: 'Order Queued', desc: 'Job received by shop' },
    { key: 'PRINTING', label: 'Printing', desc: 'Pages currently on press' },
    { key: 'READY', label: 'Ready', desc: 'Ready for pickup/dispatch' },
    { key: 'COMPLETED', label: 'Completed', desc: 'Order fulfilled' },
  ];

  const getStepIndex = (status) => {
    switch (status) {
      case 'WAITING':
        return 0;
      case 'PRINTING':
        return 1;
      case 'READY':
        return 2;
      case 'COMPLETED':
        return 3;
      default:
        return 0;
    }
  };

  const currentStepIdx = job?.status === 'CANCELLED' ? -1 : getStepIndex(job?.status);

  if (loading) {
    return (
      <div className="page-container" style={{ maxWidth: '900px', textAlign: 'center', padding: '4rem 1rem' }}>
        <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>Loading print job specifications...</div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="page-container" style={{ maxWidth: '750px', textAlign: 'center', padding: '3rem 1rem' }}>
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1.5rem',
          }}
        >
          <AlertCircle size={32} />
        </div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          Print Order Not Found
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
          {error || 'This print job does not exist or you do not have permission to view it.'}
        </p>
        <Link to="/student/printing/orders">
          <Button variant="primary" size="md">
            View My Print Orders
          </Button>
        </Link>
      </div>
    );
  }

  const firstDoc = job.documents && job.documents[0];
  const formattedDate = new Date(job.created_at).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <div className="page-container" style={{ maxWidth: '950px' }}>
      {/* New Order Confirmation Banner */}
      {isNewOrder && (
        <div
          style={{
            padding: '1.25rem 1.5rem',
            backgroundColor: '#ecfdf5',
            border: '1.5px solid #a7f3d0',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#10b981',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CheckCircle2 size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#065f46', margin: 0 }}>
                Print Job Submitted Successfully!
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#047857', margin: '0.2rem 0 0 0' }}>
                Your document has entered the operator print queue at {job.shop_name}.
              </p>
            </div>
          </div>
          <Link to="/student/printing/orders">
            <Button variant="outline" size="sm" style={{ backgroundColor: '#fff', borderColor: '#10b981', color: '#065f46' }}>
              All Print Jobs
            </Button>
          </Link>
        </div>
      )}

      {/* Header Info */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.35rem' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Print Job #{job.id}
            </h1>
            {getStatusBadge(job.status)}
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Submitted on {formattedDate} • Core Order #{job.order_number?.slice(0, 8).toUpperCase()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Link to="/student/printing/orders">
            <Button variant="ghost" size="sm" leftIcon={ArrowLeft}>
              Back to Jobs
            </Button>
          </Link>
          <Link to="/student/printing">
            <Button variant="primary" size="sm" leftIcon={Printer}>
              New Print Job
            </Button>
          </Link>
        </div>
      </div>

      {/* Status Timeline Card */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div style={{ width: '100%', padding: '1rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
            {/* Background line */}
            <div
              style={{
                position: 'absolute',
                top: '20px',
                left: '40px',
                right: '40px',
                height: '3px',
                backgroundColor: 'var(--border-light)',
                zIndex: 1,
              }}
            />

            {/* Active line */}
            {currentStepIdx >= 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '40px',
                  width: `${(currentStepIdx / (printSteps.length - 1)) * 100}%`,
                  maxWidth: 'calc(100% - 80px)',
                  height: '3px',
                  backgroundColor: 'var(--primary-600)',
                  transition: 'width 0.4s ease',
                  zIndex: 2,
                }}
              />
            )}

            {printSteps.map((step, idx) => {
              const isDone = idx < currentStepIdx;
              const isCurrent = idx === currentStepIdx;

              let circleBg = 'var(--bg-surface)';
              let circleBorder = 'var(--border-medium)';
              let textColor = 'var(--text-muted)';
              let iconColor = 'var(--text-muted)';

              if (isDone) {
                circleBg = 'var(--primary-600)';
                circleBorder = 'var(--primary-600)';
                iconColor = '#ffffff';
                textColor = 'var(--text-primary)';
              } else if (isCurrent) {
                circleBg = 'var(--primary-50)';
                circleBorder = 'var(--primary-600)';
                iconColor = 'var(--primary-600)';
                textColor = 'var(--primary-700)';
              }

              return (
                <div
                  key={step.key}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: 3,
                    textAlign: 'center',
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: circleBg,
                      border: `2px solid ${circleBorder}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: iconColor,
                      boxShadow: isCurrent ? '0 0 0 4px var(--primary-100)' : 'none',
                    }}
                  >
                    {isDone ? <Check size={18} /> : idx + 1}
                  </div>
                  <span style={{ marginTop: '0.45rem', fontSize: '0.8rem', fontWeight: isCurrent ? 700 : 600, color: textColor }}>
                    {step.label}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'none' }} className="desktop-location">
                    {step.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details Column */}
        <div className="lg:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Document File Card */}
          <Card title="Uploaded Document">
            {firstDoc ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--primary-100)',
                      color: 'var(--primary-700)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <FileText size={22} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {firstDoc.original_filename}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {(firstDoc.file_size_bytes / (1024 * 1024)).toFixed(2)} MB • {firstDoc.page_count} Total Pages
                    </span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={Download}
                  disabled={isDownloading}
                  onClick={() => handleDownload(firstDoc.id, firstDoc.original_filename)}
                >
                  {isDownloading ? 'Downloading...' : 'Download File'}
                </Button>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)' }}>No document attached.</div>
            )}
          </Card>

          {/* Print Specifications */}
          <Card title="Printing Specifications">
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
                fontSize: '0.875rem',
              }}
            >
              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Page Selection
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {job.page_selection_type === 'CUSTOM' ? `Custom: ${job.custom_page_range}` : 'All Pages'}
                </strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
                  ({job.total_pages} printable pages)
                </span>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Copies
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{job.copies} Complete Sets</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Color Output
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{job.color_mode_display}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Paper & Sides
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {job.paper_size} • {job.print_sides_display}
                </strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Binding Option
                </span>
                <strong style={{ color: 'var(--text-primary)' }}>{job.binding_type_display}</strong>
              </div>

              <div>
                <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                  Estimated Turnaround
                </span>
                <strong style={{ color: 'var(--primary-700)' }}>~{job.estimated_prep_time_mins} minutes</strong>
              </div>
            </div>

            {job.special_instructions && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Operator Instructions:</strong> {job.special_instructions}
              </div>
            )}
          </Card>

          {/* Fulfillment Details */}
          <Card title="Fulfillment Information">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.875rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Store size={18} color="var(--primary-600)" />
                <strong>{job.shop_name}</strong>
              </div>

              {job.fulfillment_type === 'PICKUP' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--primary-50)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                      <Calendar size={16} color="var(--primary-700)" />
                      <strong style={{ color: 'var(--primary-900)' }}>Counter Pickup Slot</strong>
                    </div>
                    <span style={{ color: 'var(--primary-800)', fontSize: '0.85rem' }}>
                      {job.pickup_slot_display || 'Counter Reservation'}
                    </span>
                  </div>

                  {/* Step 13: Print Job Pickup OTP */}
                  {job.status === 'READY' && (
                    <div
                      style={{
                        padding: '1.15rem',
                        backgroundColor: '#f0fdf4',
                        borderRadius: 'var(--radius-lg)',
                        border: '2px dashed #16a34a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <Key size={18} color="#16a34a" />
                          <strong style={{ fontSize: '0.9rem', color: '#166534' }}>
                            Your Pickup OTP
                          </strong>
                        </div>
                        <Badge variant="success">READY FOR COLLECTION</Badge>
                      </div>

                      <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
                        Your prints are ready! Show this 6-digit OTP at the counter to verify and collect your documents.
                      </p>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.75rem',
                          padding: '0.65rem 0.9rem',
                          backgroundColor: '#ffffff',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #bbf7d0',
                        }}
                      >
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            letterSpacing: '5px',
                            color: showOtp ? '#15803d' : '#94a3b8',
                            flex: 1,
                          }}
                        >
                          {showOtp && pickupOtp ? pickupOtp : '••••••'}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={showOtp ? EyeOff : Eye}
                          onClick={handleFetchOtp}
                          disabled={isOtpLoading}
                        >
                          {isOtpLoading ? '...' : showOtp ? 'Hide' : 'Show OTP'}
                        </Button>

                        {showOtp && pickupOtp && (
                          <Button
                            variant="ghost"
                            size="sm"
                            leftIcon={otpCopied ? Check : Copy}
                            onClick={handleCopyOtp}
                          >
                            {otpCopied ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </div>

                      {otpError && (
                        <div style={{ fontSize: '0.785rem', color: '#dc2626' }}>
                          {otpError}
                        </div>
                      )}
                    </div>
                  )}

                  {job.status === 'COMPLETED' && (
                    <div
                      style={{
                        padding: '0.85rem 1rem',
                        backgroundColor: '#f8fafc',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.65rem',
                        color: '#15803d',
                      }}
                    >
                      <CheckCircle2 size={20} color="#16a34a" />
                      <div>
                        <strong style={{ fontSize: '0.85rem', display: 'block' }}>Pickup Completed</strong>
                        <span style={{ fontSize: '0.785rem', color: 'var(--text-muted)' }}>
                          Document verified via OTP and collected.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.2rem' }}>
                      <MapPin size={16} color="var(--primary-600)" />
                      <strong>Hostel Delivery Address</strong>
                    </div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      {job.delivery_address}
                    </span>
                  </div>

                  {/* Delivery OTP Card when READY or OUT_FOR_DELIVERY */}
                  {(job.status === 'READY' || job.status === 'OUT_FOR_DELIVERY') && (
                    <div
                      style={{
                        padding: '1rem',
                        backgroundColor: '#fffbeb',
                        borderRadius: 'var(--radius-md)',
                        border: '1.5px solid #fde68a',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.9rem', color: '#92400e', display: 'block' }}>
                            Delivery Handover OTP
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                            Share with courier upon document delivery
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={handleFetchOtp}
                          disabled={isOtpLoading}
                          icon={showOtp ? EyeOff : Eye}
                        >
                          {isOtpLoading ? 'Loading...' : showOtp ? 'Hide' : 'Show OTP'}
                        </Button>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          backgroundColor: '#ffffff',
                          padding: '0.65rem 1rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid #fef3c7',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <KeyRound size={20} color="#f59e0b" />
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '1.35rem',
                              fontWeight: 800,
                              letterSpacing: '0.25rem',
                              color: showOtp ? '#b45309' : 'var(--text-muted)',
                            }}
                          >
                            {showOtp && pickupOtp ? pickupOtp : '••••••'}
                          </span>
                        </div>

                        {showOtp && pickupOtp && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCopyOtp}
                            icon={otpCopied ? Check : Copy}
                            style={{ color: otpCopied ? '#16a34a' : 'var(--text-secondary)' }}
                          >
                            {otpCopied ? 'Copied' : 'Copy'}
                          </Button>
                        )}
                      </div>

                      {otpError && (
                        <div style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                          {otpError}
                        </div>
                      )}
                    </div>
                  )}

                  {job.status === 'COMPLETED' && (
                    <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1px solid #bbf7d0', color: '#15803d', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600 }}>
                      <CheckCircle2 size={18} color="#16a34a" />
                      <span>Documents Delivered & Handed Over</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Financial Breakdown Sidebar */}
        <div>
          <Card title="Order Financials">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.925rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Printing & Binding:</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ₹{parseFloat(job.price || 0).toFixed(2)}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                <span>Delivery Charge:</span>
                <span style={{ fontWeight: 600, color: parseFloat(job.delivery_fee || 0) === 0 ? 'var(--success-600)' : 'var(--text-primary)' }}>
                  {parseFloat(job.delivery_fee || 0) === 0 ? 'FREE' : `₹${parseFloat(job.delivery_fee).toFixed(2)}`}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '0.85rem',
                  marginTop: '0.25rem',
                  borderTop: '1px solid var(--border-light)',
                  fontWeight: 800,
                  fontSize: '1.25rem',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Total Amount:</span>
                <span style={{ color: 'var(--primary-600)' }}>
                  ₹{parseFloat(job.total_amount || job.price || 0).toFixed(2)}
                </span>
              </div>

              <div
                style={{
                  padding: '0.75rem 0.85rem',
                  backgroundColor: 'var(--bg-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.35rem',
                  marginTop: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Payment:</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{job.payment_method || 'COD'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Status:</span>
                  <strong style={{ color: 'var(--warning-700)' }}>{job.payment_status || 'PENDING'}</strong>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Link to="/student/printing">
                <Button variant="primary" size="md" fullWidth leftIcon={Printer}>
                  Print Another Document
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudentPrintOrderDetail;
