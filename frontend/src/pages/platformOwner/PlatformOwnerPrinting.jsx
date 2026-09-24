import React, { useState, useEffect } from 'react';
import {
  Printer,
  Search,
  FileText,
  RefreshCw,
  CheckCircle,
  Clock,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerPrinting = () => {
  const [printOrders, setPrintOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const loadPrintOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'ALL') params.status = statusFilter;

      const data = await platformOwnerService.getPrintOrders(params);
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
  }, [statusFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadPrintOrders();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Campus Printing & Xerox Oversight"
        subtitle="System-wide monitoring of document print queues, page volumes, and Xerox jobs (Private metadata protected)"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

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
                placeholder="Search printing jobs by Order #, store, student..."
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
              <option value="WAITING">Waiting</option>
              <option value="PRINTING">Printing in Progress</option>
              <option value="READY">Ready for Collection</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadPrintOrders}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Document Printing Queue & History (${printOrders.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Loading printing telemetry..." />
          </div>
        ) : printOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            No print orders recorded.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Job / Order #</th>
                  <th>Student</th>
                  <th>Print Center</th>
                  <th>Document Title</th>
                  <th>Specs & Format</th>
                  <th>Pages / Copies</th>
                  <th>Cost</th>
                  <th>Job Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {printOrders.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>
                        {String(p.order_number).slice(0, 8)}...
                      </span>
                    </td>
                    <td>{p.customer_name || 'Student'}</td>
                    <td>{p.shop_name}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 600 }}>
                        <FileText size={15} color="var(--primary-600)" />
                        {p.document_title}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.78rem' }}>
                        <span>{p.color_mode} · {p.paper_size}</span>
                        <div style={{ color: 'var(--text-muted)' }}>{p.binding_type}</div>
                      </div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{p.total_pages}</span> pgs × {p.copies} copy
                    </td>
                    <td>
                      <span style={{ fontWeight: 700 }}>₹{p.price}</span>
                    </td>
                    <td>
                      <Badge
                        variant={
                          p.status === 'COMPLETED'
                            ? 'success'
                            : p.status === 'PRINTING'
                            ? 'warning'
                            : p.status === 'CANCELLED'
                            ? 'danger'
                            : 'primary'
                        }
                      >
                        {p.status}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PlatformOwnerPrinting;
