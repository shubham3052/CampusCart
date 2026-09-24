import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  CreditCard,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Receipt,
  Search,
  RefreshCw,
  X,
  AlertCircle
} from 'lucide-react';
import paymentService from '../../services/paymentService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const StudentPayments = () => {
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Refund Modal State
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [refundError, setRefundError] = useState('');
  const [refundSuccess, setRefundSuccess] = useState('');

  // Retry State
  const [retryingId, setRetryingId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);

  const fetchPaymentData = async () => {
    setLoading(true);
    try {
      const [paymentsData, refundsData] = await Promise.all([
        paymentService.getPayments(),
        paymentService.getRefunds(),
      ]);
      setPayments(Array.isArray(paymentsData) ? paymentsData : paymentsData.results || []);
      setRefunds(Array.isArray(refundsData) ? refundsData : refundsData.results || []);
    } catch (err) {
      console.error('Failed to load student payments/refunds:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentData();
  }, []);

  const handleOpenRefundModal = (payment) => {
    setSelectedPayment(payment);
    setRefundAmount(payment.amount);
    setRefundReason('');
    setRefundError('');
    setRefundSuccess('');
    setShowRefundModal(true);
  };

  const handleSubmitRefund = async (e) => {
    e.preventDefault();
    if (!selectedPayment) return;
    setSubmittingRefund(true);
    setRefundError('');
    setRefundSuccess('');

    try {
      const res = await paymentService.requestRefund(
        selectedPayment.order_id || selectedPayment.order,
        refundAmount,
        refundReason
      );
      setRefundSuccess(
        `Refund request for ₹${res.amount || refundAmount} submitted successfully. Status: ${res.status || 'REQUESTED'}.`
      );
      setTimeout(() => {
        setShowRefundModal(false);
        fetchPaymentData();
      }, 1500);
    } catch (err) {
      setRefundError(err.response?.data?.error || err.message || 'Failed to submit refund request.');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleRetryPayment = async (payment) => {
    setRetryingId(payment.id);
    setActionNotice(null);
    try {
      const res = await paymentService.retryPayment(payment.id);
      if (res.success && res.session) {
        setActionNotice({
          type: 'success',
          text: `Payment session re-initialized (Session ID: ${res.session.gateway_order_id}). You can complete checkout.`,
        });
        fetchPaymentData();
      }
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: err.response?.data?.error || 'Unable to re-initialize payment attempt.',
      });
    } finally {
      setRetryingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CAPTURED':
        return <Badge variant="success">Paid & Captured</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Payment Pending</Badge>;
      case 'CREATED':
        return <Badge variant="neutral">Created</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Payment Failed</Badge>;
      case 'REFUNDED':
        return <Badge variant="info">Fully Refunded</Badge>;
      case 'PARTIALLY_REFUNDED':
        return <Badge variant="primary">Partially Refunded</Badge>;
      case 'CANCELLED':
        return <Badge variant="danger">Cancelled</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (activeTab === 'CAPTURED' && p.status !== 'CAPTURED') return false;
    if (activeTab === 'PENDING' && p.status !== 'PENDING' && p.status !== 'CREATED') return false;
    if (activeTab === 'FAILED' && p.status !== 'FAILED') return false;
    if (activeTab === 'REFUNDED' && p.status !== 'REFUNDED' && p.status !== 'PARTIALLY_REFUNDED') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const orderNum = (p.order_number || p.order_id || '').toString().toLowerCase();
      const shopName = (p.shop_name || '').toLowerCase();
      const refId = (p.gateway_payment_id || p.gateway_order_id || '').toLowerCase();
      return orderNum.includes(q) || shopName.includes(q) || refId.includes(q);
    }
    return true;
  });

  // Financial Stats
  const totalPaid = payments
    .filter((p) => ['CAPTURED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(p.status))
    .reduce((acc, p) => acc + parseFloat(p.amount || 0), 0);

  const capturedCount = payments.filter((p) => p.status === 'CAPTURED').length;
  const pendingCount = payments.filter((p) => ['PENDING', 'CREATED'].includes(p.status)).length;
  const totalRefunded = refunds
    .filter((r) => r.status === 'COMPLETED')
    .reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

  return (
    <div className="page-container" style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Payment & Transaction History
            </h1>
            <Badge variant="primary">Campus Authoritative Ledger</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Track your online payments, cash settlements, refund statuses, and receipts.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={fetchPaymentData} leftIcon={RefreshCw}>
            Refresh
          </Button>
          <Link to="/student/orders">
            <Button variant="primary" size="sm">
              My Orders
            </Button>
          </Link>
        </div>
      </div>

      {/* Action Notice Banner */}
      {actionNotice && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: actionNotice.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${actionNotice.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: actionNotice.type === 'success' ? '#065f46' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{actionNotice.text}</span>
          <button
            onClick={() => setActionNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: '12px', background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
              <DollarSign size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Spent</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{totalPaid.toFixed(2)}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#ecfdf5', color: '#059669' }}>
              <CheckCircle2 size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Successful Payments</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{capturedCount}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#fffbeb', color: '#d97706' }}>
              <Clock size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Pending Settlements</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>{pendingCount}</div>
            </div>
          </div>
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#f5f3ff', color: '#7c3aed' }}>
              <RotateCcw size={24} />
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Refunded</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>₹{totalRefunded.toFixed(2)}</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Tabs & Search Bar */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {['ALL', 'CAPTURED', 'PENDING', 'FAILED', 'REFUNDED'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: '20px',
                  border: 'none',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  backgroundColor: activeTab === tab ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                  color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {tab === 'ALL' ? 'All Records' : tab.replace('_', ' ')}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '240px' }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by order or shop..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                fontSize: '0.85rem',
              }}
            />
          </div>
        </div>

        {/* Payments Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <Spinner />
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>Loading transactions...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <Receipt size={40} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              No Transactions Found
            </h3>
            <p style={{ fontSize: '0.875rem' }}>You have no payments matching the selected criteria.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Transaction / Order</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Merchant</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Method</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                  <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => {
                  const isCaptured = p.status === 'CAPTURED';
                  const isFailed = p.status === 'FAILED';
                  const canRefund = isCaptured && (!p.refund_status || p.refund_status !== 'FULL');

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          #{p.order_number ? p.order_number.slice(0, 8) : p.order_id || p.id}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          ID: {p.gateway_payment_id ? p.gateway_payment_id.slice(0, 16) : `TX-${p.id}`}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {p.shop_name || 'Campus Store'}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
                          ₹{parseFloat(p.amount).toFixed(2)}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                          {p.payment_method}
                        </span>
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          {p.gateway || 'DIRECT'}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        {getStatusBadge(p.status)}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        <div style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                          {p.created_at ? new Date(p.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
                        </div>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                          <Link to={`/student/orders/${p.order_id || p.order}`}>
                            <Button variant="ghost" size="sm">
                              View Order
                            </Button>
                          </Link>

                          {isFailed && (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={retryingId === p.id}
                              onClick={() => handleRetryPayment(p)}
                            >
                              {retryingId === p.id ? 'Retrying...' : 'Retry'}
                            </Button>
                          )}

                          {canRefund && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenRefundModal(p)}
                            >
                              Refund
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

      {/* Request Refund Modal */}
      {showRefundModal && selectedPayment && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: '480px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <RotateCcw size={20} color="var(--primary-600)" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>
                  Request Order Refund
                </h3>
              </div>
              <button
                onClick={() => setShowRefundModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {refundError && (
              <div style={{ padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--radius-md)', color: '#991b1b', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {refundError}
              </div>
            )}

            {refundSuccess && (
              <div style={{ padding: '0.75rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 'var(--radius-md)', color: '#065f46', fontSize: '0.85rem', marginBottom: '1rem' }}>
                {refundSuccess}
              </div>
            )}

            <form onSubmit={handleSubmitRefund} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Original Paid Amount:</span>
                  <span style={{ fontWeight: 700 }}>₹{parseFloat(selectedPayment.amount).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Fulfilling Store:</span>
                  <span style={{ fontWeight: 600 }}>{selectedPayment.shop_name}</span>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Refund Amount (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={selectedPayment.amount}
                  min="1"
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.9rem',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Full or partial refunds supported. Cannot exceed captured payment balance.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Reason for Refund Request *
                </label>
                <textarea
                  rows="3"
                  required
                  placeholder="e.g. Defective notebook received, duplicate transaction, or wrong item."
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-medium)',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <Button variant="ghost" size="sm" type="button" onClick={() => setShowRefundModal(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={submittingRefund}>
                  {submittingRefund ? 'Submitting...' : 'Submit Refund Request'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentPayments;
