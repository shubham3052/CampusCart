import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  ShieldCheck,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  Truck,
  Printer,
  Building2,
  Filter,
  ArrowUpRight,
  ShieldAlert,
  Check,
  X
} from 'lucide-react';
import paymentService from '../../services/paymentService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const AdminPaymentsDashboard = () => {
  const [analytics, setAnalytics] = useState(null);
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reconciling, setReconciling] = useState(false);
  const [activeTab, setActiveTab] = useState('ANALYTICS');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [notice, setNotice] = useState(null);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [analyticsData, paymentsData, refundsData, reconData] = await Promise.all([
        paymentService.getPaymentAnalytics(),
        paymentService.getPayments(),
        paymentService.getRefunds(),
        paymentService.getReconciliationAudit(),
      ]);
      setAnalytics(analyticsData);
      setPayments(Array.isArray(paymentsData) ? paymentsData : paymentsData.results || []);
      setRefunds(Array.isArray(refundsData) ? refundsData : refundsData.results || []);
      setReconciliation(reconData);
    } catch (err) {
      console.error('Failed to load admin payment dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const handleRunReconciliation = async () => {
    setReconciling(true);
    try {
      const reconData = await paymentService.getReconciliationAudit();
      setReconciliation(reconData);
      setNotice({
        type: 'success',
        text: `Reconciliation audit completed. ${reconData.summary?.discrepancies_found || 0} discrepancies flagged.`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: 'Failed to run transaction reconciliation.',
      });
    } finally {
      setReconciling(false);
    }
  };

  const handleApproveRefund = async (refundId) => {
    try {
      await paymentService.approveRefund(refundId);
      setNotice({ type: 'success', text: 'Refund approved and captured via gateway.' });
      fetchAdminData();
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.error || 'Failed to approve refund.' });
    }
  };

  const handleRejectRefund = async (refundId) => {
    const reason = window.prompt('Enter reason for declining this refund:');
    if (!reason) return;
    try {
      await paymentService.rejectRefund(refundId, reason);
      setNotice({ type: 'success', text: 'Refund rejected.' });
      fetchAdminData();
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.error || 'Failed to decline refund.' });
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'CAPTURED':
        return <Badge variant="success">CAPTURED</Badge>;
      case 'PENDING':
        return <Badge variant="warning">PENDING</Badge>;
      case 'FAILED':
        return <Badge variant="danger">FAILED</Badge>;
      case 'REFUNDED':
        return <Badge variant="info">REFUNDED</Badge>;
      case 'PARTIALLY_REFUNDED':
        return <Badge variant="primary">PARTIALLY REFUNDED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const getSeverityBadge = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="danger">CRITICAL</Badge>;
      case 'HIGH':
        return <Badge variant="warning">HIGH</Badge>;
      case 'MEDIUM':
        return <Badge variant="neutral">MEDIUM</Badge>;
      default:
        return <Badge variant="neutral">{severity}</Badge>;
    }
  };

  const filteredPayments = payments.filter((p) => {
    if (selectedStatus !== 'ALL' && p.status !== selectedStatus) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const orderNum = (p.order_number || p.order_id || '').toString().toLowerCase();
    const shop = (p.shop_name || '').toLowerCase();
    const user = (p.user_name || p.customer_name || '').toLowerCase();
    return orderNum.includes(q) || shop.includes(q) || user.includes(q);
  });

  return (
    <div className="page-container" style={{ maxWidth: '1280px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              Platform Financials & Reconciliation
            </h1>
            <Badge variant="primary">System Administrator</Badge>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.925rem' }}>
            Campus-wide gross transaction ledger, automated platform commission, and transaction reconciliation desk.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" size="sm" onClick={fetchAdminData} leftIcon={RefreshCw}>
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={reconciling}
            onClick={handleRunReconciliation}
            leftIcon={ShieldAlert}
          >
            {reconciling ? 'Auditing...' : 'Run Reconciliation'}
          </Button>
        </div>
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

      {/* KPI Cards */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total GMV (Gross)</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  ₹{analytics.gross_revenue?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.725rem', color: '#059669' }}>
                  {analytics.captured_count || 0} captured orders
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
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Platform Commission</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669' }}>
                  ₹{analytics.platform_revenue?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Net Platform Revenue
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#eff6ff', color: '#2563eb' }}>
                <Building2 size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Merchant Disbursals</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#2563eb' }}>
                  ₹{analytics.merchant_payouts?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Net store earnings
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
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Total Refunds</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#dc2626' }}>
                  ₹{analytics.total_refunded?.toFixed(2) || '0.00'}
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  Net Platform: ₹{analytics.net_revenue?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ padding: '0.65rem', borderRadius: '12px', background: '#fffbeb', color: '#d97706' }}>
                <CheckCircle2 size={24} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Success Rate</div>
                <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#d97706' }}>
                  {analytics.success_rate_percentage || 100}%
                </div>
                <span style={{ fontSize: '0.725rem', color: 'var(--text-muted)' }}>
                  {analytics.failed_count || 0} failed attempts
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Navigation Tabs */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => setActiveTab('ANALYTICS')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'ANALYTICS' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                color: activeTab === 'ANALYTICS' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              All Transactions ({payments.length})
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
              }}
            >
              Platform Refunds ({refunds.length})
            </button>
            <button
              onClick={() => setActiveTab('RECONCILIATION')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '8px',
                border: 'none',
                fontSize: '0.875rem',
                fontWeight: 700,
                cursor: 'pointer',
                backgroundColor: activeTab === 'RECONCILIATION' ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                color: activeTab === 'RECONCILIATION' ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <span>Transaction Reconciliation</span>
              {reconciliation?.summary?.discrepancies_found > 0 && (
                <Badge size="sm" variant="danger">{reconciliation.summary.discrepancies_found}</Badge>
              )}
            </button>
          </div>

          {activeTab === 'ANALYTICS' && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="CAPTURED">Captured</option>
                <option value="PENDING">Pending</option>
                <option value="FAILED">Failed</option>
                <option value="REFUNDED">Refunded</option>
              </select>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '220px' }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search order, shop..."
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
          )}
        </div>

        {/* Tab 1: All Payments */}
        {activeTab === 'ANALYTICS' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}><Spinner /></div>
          ) : filteredPayments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No payments matching your query.
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Transaction ID / Order</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Store</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Gross</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Platform Fee</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Store Payout</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Method / Gateway</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p) => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <div style={{ fontWeight: 700 }}>#{p.order_number ? p.order_number.slice(0, 8) : p.order_id || p.id}</div>
                        <span style={{ fontSize: '0.725rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                          {p.gateway_payment_id ? p.gateway_payment_id.slice(0, 16) : `TX-${p.id}`}
                        </span>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>
                        {p.shop_name || 'Store'}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        {p.user_name || p.customer_name || 'Student'}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800 }}>
                        ₹{parseFloat(p.amount).toFixed(2)}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', color: '#059669', fontWeight: 600 }}>
                        ₹{parseFloat(p.platform_fee || 0).toFixed(2)}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', color: '#2563eb', fontWeight: 600 }}>
                        ₹{parseFloat(p.merchant_payout || p.amount).toFixed(2)}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.75rem' }}>{p.payment_method}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{p.gateway}</div>
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem' }}>
                        {getStatusBadge(p.status)}
                      </td>

                      <td style={{ padding: '0.85rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {p.created_at ? new Date(p.created_at).toLocaleDateString('en-IN') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* Tab 2: Refunds */}
        {activeTab === 'REFUNDS' && (
          loading ? (
            <div style={{ textAlign: 'center', padding: '3rem' }}><Spinner /></div>
          ) : refunds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              No refund requests submitted platform-wide.
            </div>
          ) : (
            <div className="table-responsive">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1.5px solid var(--border-medium)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Refund ID</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Order</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Store</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Customer</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Amount</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Reason</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>Staff Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((r) => {
                    const isPending = r.status === 'REQUESTED';
                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 700 }}>
                          RF-{r.id}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          #{r.order_number ? r.order_number.slice(0, 8) : r.order}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 600 }}>
                          {r.shop_name || 'Store'}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          {r.requested_by_name || 'Customer'}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', fontWeight: 800 }}>
                          ₹{parseFloat(r.amount).toFixed(2)}
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', maxWidth: '200px' }}>
                          <span style={{ fontSize: '0.775rem', color: 'var(--text-secondary)' }}>
                            {r.reason || '—'}
                          </span>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem' }}>
                          <Badge variant={r.status === 'COMPLETED' ? 'success' : r.status === 'REJECTED' ? 'danger' : 'warning'}>
                            {r.status}
                          </Badge>
                        </td>

                        <td style={{ padding: '0.85rem 0.5rem', textAlign: 'right' }}>
                          {isPending ? (
                            <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleApproveRefund(r.id)}
                              >
                                Approve
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleRejectRefund(r.id)}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Settled</span>
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

        {/* Tab 3: Reconciliation Engine */}
        {activeTab === 'RECONCILIATION' && (
          <div>
            {reconciliation?.summary && (
              <div style={{ padding: '1rem', backgroundColor: reconciliation.summary.healthy ? '#ecfdf5' : '#fffbeb', borderRadius: 'var(--radius-md)', border: `1px solid ${reconciliation.summary.healthy ? '#a7f3d0' : '#fde68a'}`, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {reconciliation.summary.healthy ? (
                      <CheckCircle2 size={22} color="#059669" />
                    ) : (
                      <AlertTriangle size={22} color="#d97706" />
                    )}
                    <div>
                      <h4 style={{ fontWeight: 700, margin: 0, color: reconciliation.summary.healthy ? '#065f46' : '#92400e' }}>
                        {reconciliation.summary.healthy
                          ? 'Ledger Reconciled: Zero Discrepancies Found'
                          : `${reconciliation.summary.discrepancies_found} Discrepancies Flagged For Audit`}
                      </h4>
                      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Evaluated {reconciliation.summary.total_payments_evaluated} transactions (Total Gross Volume: ₹{reconciliation.summary.gross_volume?.toFixed(2)}).
                      </p>
                    </div>
                  </div>

                  <Badge variant={reconciliation.summary.healthy ? 'success' : 'warning'}>
                    {reconciliation.summary.healthy ? 'HEALTHY' : 'AUDIT REQUIRED'}
                  </Badge>
                </div>
              </div>
            )}

            {reconciliation?.discrepancies?.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                <ShieldCheck size={44} color="#059669" style={{ margin: '0 auto 0.75rem' }} />
                <h4 style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                  All Transactions Fully Balanced
                </h4>
                <p style={{ fontSize: '0.85rem' }}>
                  No payment-order status inconsistencies, amount mismatches, or excessive refunds detected.
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {reconciliation?.discrepancies?.map((d, index) => (
                  <div
                    key={index}
                    style={{
                      padding: '1rem',
                      border: '1px solid var(--border-medium)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-surface)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                        {getSeverityBadge(d.severity)}
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {d.type}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Order #{d.order_number?.slice(0, 8) || d.order_id} • {d.shop_name}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 0.35rem 0', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        {d.description}
                      </p>
                      <span style={{ fontSize: '0.775rem', color: 'var(--primary-700)', fontWeight: 600 }}>
                        Suggested Action: {d.suggested_action}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Amount Involved</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        ₹{(d.amount || d.paid_amount || d.captured_amount || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default AdminPaymentsDashboard;
