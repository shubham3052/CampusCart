import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Search,
  Check,
  X,
  FileText,
  User,
  ShoppingBag
} from 'lucide-react';
import paymentService from '../../services/paymentService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const ShopOwnerPayments = () => {
  const [analytics, setAnalytics] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('TRANSACTIONS');
  const [searchQuery, setSearchQuery] = useState('');

  // Mark Cash Collected Modal
  const [selectedCashPayment, setSelectedCashPayment] = useState(null);
  const [cashNotes, setCashNotes] = useState('');
  const [markingCash, setMarkingCash] = useState(false);

  // Refund Review Modal
  const [reviewingRefund, setReviewingRefund] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [notice, setNotice] = useState(null);

  const fetchShopFinancials = async () => {
    setLoading(true);
    try {
      const [analyticsData, paymentsData, refundsData] = await Promise.all([
        paymentService.getPaymentAnalytics(),
        paymentService.getPayments(),
        paymentService.getRefunds(),
      ]);
      setAnalytics(analyticsData);
      setPayments(Array.isArray(paymentsData) ? paymentsData : paymentsData.results || []);
      setRefunds(Array.isArray(refundsData) ? refundsData : refundsData.results || []);
    } catch (err) {
      console.error('Failed to load shop financials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopFinancials();
  }, []);

  const handleMarkCashCollected = async (e) => {
    e.preventDefault();
    if (!selectedCashPayment) return;
    setMarkingCash(true);
    setNotice(null);

    try {
      const res = await paymentService.markCashCollected(selectedCashPayment.id, cashNotes);
      setNotice({
        type: 'success',
        text: res.message || `Cash payment of ₹${selectedCashPayment.amount} recorded as collected.`,
      });
      setSelectedCashPayment(null);
      setCashNotes('');
      fetchShopFinancials();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err.response?.data?.error || 'Failed to mark cash collection.',
      });
    } finally {
      setMarkingCash(false);
    }
  };

  const handleApproveRefund = async (refundId) => {
    setProcessingRefund(true);
    setNotice(null);
    try {
      await paymentService.approveRefund(refundId);
      setNotice({
        type: 'success',
        text: 'Refund approved and dispatched to gateway successfully.',
      });
      setReviewingRefund(null);
      fetchShopFinancials();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err.response?.data?.error || 'Failed to approve refund.',
      });
    } finally {
      setProcessingRefund(false);
    }
  };

  const handleRejectRefund = async (e) => {
    e.preventDefault();
    if (!reviewingRefund) return;
    setProcessingRefund(true);
    setNotice(null);
    try {
      await paymentService.rejectRefund(reviewingRefund.id, rejectReason);
      setNotice({
        type: 'success',
        text: 'Refund request declined.',
      });
      setReviewingRefund(null);
      setRejectReason('');
      fetchShopFinancials();
    } catch (err) {
      setNotice({
        type: 'error',
        text: err.response?.data?.error || 'Failed to decline refund.',
      });
    } finally {
      setProcessingRefund(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CAPTURED':
        return <Badge variant="success">Paid & Captured</Badge>;
      case 'PENDING':
        return <Badge variant="warning">Awaiting Cash / Gateway</Badge>;
      case 'FAILED':
        return <Badge variant="danger">Failed</Badge>;
      case 'REFUNDED':
        return <Badge variant="info">Fully Refunded</Badge>;
      case 'PARTIALLY_REFUNDED':
        return <Badge variant="primary">Partially Refunded</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const orderNum = (p.order_number || p.order_id || '').toString().toLowerCase();
    const customer = (p.user_name || p.customer_name || '').toLowerCase();
    return orderNum.includes(q) || customer.includes(q);
  });

  const pendingRefundsCount = refunds.filter((r) => r.status === 'REQUESTED').length;

  return (
    <div className="page-container" style={{ maxWidth: '1200px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Store Financials & Payment Management
            </h1>
            <Badge variant="primary">Merchant Dashboard</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Authoritative revenue analytics, cash-at-hand collection audits, and customer refund processing.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchShopFinancials} leftIcon={RefreshCw}>
          Refresh Ledger
        </Button>
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          style={{
            padding: '0.85rem 1.25rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: notice.type === 'success' ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${notice.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
            color: notice.type === 'success' ? '#065f46' : '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>{notice.text}</span>
          <button
            onClick={() => setNotice(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Financial Metrics Cards */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Today's Revenue</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{analytics.today_revenue?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {analytics.today_paid_orders || 0} orders paid today
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#ecfdf5', color: '#059669' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Gross Store Sales</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{analytics.gross_revenue?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.75rem', color: '#059669' }}>
                  {analytics.captured_count || 0} total paid orders
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#eff6ff', color: '#2563eb' }}>
                <ShieldCheck size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Net Merchant Payout</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb' }}>
                  ₹{analytics.merchant_payouts?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Platform Fee: ₹{analytics.platform_revenue?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#fef2f2', color: '#dc2626' }}>
                <RotateCcw size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Refunds</div>
                <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#dc2626' }}>
                  ₹{analytics.total_refunded?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Net: ₹{analytics.net_revenue?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('TRANSACTIONS')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'TRANSACTIONS' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                color: activeTab === 'TRANSACTIONS' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Order Transactions ({payments.length})
            </button>
            <button
              onClick={() => setActiveTab('REFUNDS')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'REFUNDS' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                color: activeTab === 'REFUNDS' ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>Refund Requests</span>
              {pendingRefundsCount > 0 && (
                <Badge size="sm" variant="danger">{pendingRefundsCount}</Badge>
              )}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '240px' }}>
            <Search size={16} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search by order or student..."
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

        {/* Tab 1: Transactions Table */}
        {activeTab === 'TRANSACTIONS' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}><Spinner /></div>
          ) : filteredPayments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No transactions recorded for this store yet.
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Order</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Method</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Commission</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Net Payout</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => {
                    const isPendingCash = p.status === 'PENDING' && ['COD', 'PICKUP_CASH'].includes(p.payment_method);
                    return (
                      <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                            #{p.order_number ? p.order_number.slice(0, 8) : p.order_id || p.id}
                          </span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : ''}
                          </div>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span style={{ fontWeight: 600 }}>{p.user_name || p.customer_name || 'Student'}</span>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800 }}>
                          ₹{parseFloat(p.amount).toFixed(2)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                            {p.payment_method}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          {getStatusBadge(p.status)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-muted)' }}>
                          ₹{parseFloat(p.platform_fee || 0).toFixed(2)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700, color: '#059669' }}>
                          ₹{parseFloat(p.merchant_payout || p.amount).toFixed(2)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                          {isPendingCash ? (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => setSelectedCashPayment(p)}
                            >
                              Collect Cash
                            </Button>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {p.status === 'CAPTURED' ? 'Settled' : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Tab 2: Refund Management Table */}
        {activeTab === 'REFUNDS' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}><Spinner /></div>
          ) : refunds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No refund requests submitted for your store.
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Order</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Requested Amount</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Reason</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((r) => {
                    const isPending = r.status === 'REQUESTED';
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700 }}>
                          #{r.order_number ? r.order_number.slice(0, 8) : r.order}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          {r.requested_by_name || 'Student'}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800 }}>
                          ₹{parseFloat(r.amount).toFixed(2)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', maxWidth: '240px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {r.reason || 'No reason provided'}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <Badge variant={r.status === 'COMPLETED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>
                            {r.status}
                          </Badge>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN') : '—'}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={processingRefund}
                                onClick={() => handleApproveRefund(r.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={processingRefund}
                                onClick={() => setReviewingRefund(r)}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Processed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </Card>

      {/* Collect Cash Modal */}
      {selectedCashPayment && (
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
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Confirm Cash Collection
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Confirming this records cash as received for Order #{selectedCashPayment.order_number?.slice(0, 8) || selectedCashPayment.order_id}.
            </p>

            <div style={{ padding: '0.75rem', background: 'var(--bg-surface-secondary)', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span>Collected Amount:</span>
                <span style={{ fontWeight: 800 }}>₹{parseFloat(selectedCashPayment.amount).toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Method:</span>
                <span style={{ fontWeight: 600 }}>{selectedCashPayment.payment_method}</span>
              </div>
            </div>

            <form onSubmit={handleMarkCashCollected}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Audit Notes (Optional)
              </label>
              <textarea
                rows="2"
                placeholder="e.g. Counter pickup cash received and receipt given."
                value={cashNotes}
                onChange={(e) => setCashNotes(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedCashPayment(null)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={markingCash}>
                  {markingCash ? 'Saving...' : 'Confirm Cash Collected'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Refund Modal */}
      {reviewingRefund && (
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
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
            }}
          >
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Decline Refund Request
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Provide a clear reason for declining this customer refund request of ₹{parseFloat(reviewingRefund.amount).toFixed(2)}.
            </p>

            <form onSubmit={handleRejectRefund}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Rejection Reason *
              </label>
              <textarea
                rows="3"
                required
                placeholder="e.g. Items were opened, seal broken, or delivered over 7 days ago."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.85rem',
                  marginBottom: '1rem',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <Button variant="ghost" size="sm" type="button" onClick={() => setReviewingRefund(null)}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" type="submit" disabled={processingRefund || !rejectReason.trim()}>
                  {processingRefund ? 'Rejecting...' : 'Decline Refund'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerPayments;
