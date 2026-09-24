import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Search,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import StatCard from '../../components/common/StatCard';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerPayments = () => {
  const [activeTab, setActiveTab] = useState('PAYMENTS'); // 'PAYMENTS' | 'REFUNDS'
  const [payments, setPayments] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;

      if (activeTab === 'PAYMENTS') {
        const data = await platformOwnerService.getPayments(params);
        setPayments(Array.isArray(data) ? data : data.results || []);
      } else {
        const data = await platformOwnerService.getRefunds(params);
        setRefunds(Array.isArray(data) ? data : data.results || []);
      }
    } catch (err) {
      console.error('Failed to load financial records:', err);
      setError('Unable to load payment records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab, statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadData();
  };

  const totalCaptured = payments
    .filter((p) => p.status === 'CAPTURED')
    .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  const totalRefunded = refunds
    .filter((r) => r.status === 'APPROVED' || r.status === 'COMPLETED')
    .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Financial Ledger & Refunds Oversight"
        subtitle="Gateway transaction records, student payments, and refund reconciliation"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          onClick={() => { setActiveTab('PAYMENTS'); setStatusFilter('ALL'); }}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'PAYMENTS' ? 'var(--primary-600)' : 'transparent',
            color: activeTab === 'PAYMENTS' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Payment Transactions ({payments.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab('REFUNDS'); setStatusFilter('ALL'); }}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: activeTab === 'REFUNDS' ? 'var(--primary-600)' : 'transparent',
            color: activeTab === 'REFUNDS' ? '#ffffff' : 'var(--text-secondary)',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Refund Requests ({refunds.length})
        </button>
      </div>

      {/* Search and Filters */}
      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <Input
                type="text"
                placeholder={
                  activeTab === 'PAYMENTS'
                    ? 'Search by gateway ID, order #, student...'
                    : 'Search by refund #, order #, reason...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="outline" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-medium)',
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="ALL">All Statuses</option>
              {activeTab === 'PAYMENTS' ? (
                <>
                  <option value="CAPTURED">Captured / Paid</option>
                  <option value="PENDING">Pending</option>
                  <option value="FAILED">Failed</option>
                  <option value="REFUNDED">Refunded</option>
                </>
              ) : (
                <>
                  <option value="REQUESTED">Requested</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                  <option value="COMPLETED">Completed</option>
                </>
              )}
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadData}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      {/* Main Ledger Table */}
      {activeTab === 'PAYMENTS' ? (
        <Card title={`Payment Transactions (${payments.length})`}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Spinner size="md" message="Loading transaction ledger..." />
            </div>
          ) : payments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No payments recorded.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Gateway ID</th>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Payment Method</th>
                    <th>Gateway Provider</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary-700)' }}>
                        {p.gateway_payment_id || `TXN-${p.id}`}
                      </td>
                      <td>{String(p.order_number).slice(0, 8)}...</td>
                      <td>{p.customer_name || 'Student'}</td>
                      <td>{p.payment_method}</td>
                      <td>
                        <Badge variant="secondary">{p.gateway}</Badge>
                      </td>
                      <td style={{ fontWeight: 700 }}>₹{p.amount}</td>
                      <td>
                        <Badge
                          variant={
                            p.status === 'CAPTURED'
                              ? 'success'
                              : p.status === 'FAILED'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(p.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card title={`Refund Requests & Processing (${refunds.length})`}>
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <Spinner size="md" message="Loading refund records..." />
            </div>
          ) : refunds.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
              No refund requests found.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
                <thead>
                  <tr>
                    <th>Refund ID</th>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Reason</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Date Requested</th>
                  </tr>
                </thead>
                <tbody>
                  {refunds.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.gateway_refund_id || `REF-${r.id}`}</td>
                      <td>{String(r.order_number).slice(0, 8)}...</td>
                      <td>{r.customer_name || 'Student'}</td>
                      <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--danger-600)' }}>₹{r.amount}</td>
                      <td>
                        <Badge
                          variant={
                            r.status === 'APPROVED' || r.status === 'COMPLETED'
                              ? 'success'
                              : r.status === 'REJECTED'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {new Date(r.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default PlatformOwnerPayments;
