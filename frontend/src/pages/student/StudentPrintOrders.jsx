import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Printer,
  Clock,
  CheckCircle2,
  FileText,
  Store,
  ChevronRight,
  Plus,
  Package,
} from 'lucide-react';
import printingService from '../../services/printingService';
import PageHeader from '../../components/common/PageHeader';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import EmptyState from '../../components/common/EmptyState';

const StudentPrintOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const navigate = useNavigate();

  useEffect(() => {
    fetchPrintOrders();
  }, []);

  const fetchPrintOrders = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await printingService.getPrintOrders();
      setOrders(data);
    } catch (err) {
      console.error('Failed to load print orders:', err);
      setError('Could not load your print orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'WAITING':
        return <Badge variant="warning">In Queue (Waiting)</Badge>;
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

  const filterOptions = [
    { label: 'All Jobs', value: 'ALL' },
    { label: 'Waiting', value: 'WAITING' },
    { label: 'Printing', value: 'PRINTING' },
    { label: 'Ready', value: 'READY' },
    { label: 'Completed', value: 'COMPLETED' },
  ];

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter === 'ALL') return true;
    return ord.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="page-container" style={{ maxWidth: '950px' }}>
        <PageHeader title="My Print & Xerox Jobs" subtitle="Real-time queue tracking for your submitted documents" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              style={{
                height: '110px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--bg-surface-secondary)',
                animation: 'pulse 1.5s infinite ease-in-out',
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-container" style={{ maxWidth: '950px' }}>
      <PageHeader
        title="My Print & Xerox Jobs"
        subtitle="Track queue progress, operator status, and ready-to-collect notifications"
        actions={
          <Link to="/student/printing">
            <Button variant="primary" size="sm" leftIcon={Plus}>
              New Print Job
            </Button>
          </Link>
        }
      />

      {/* Filter Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1.5rem',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '0.75rem',
          overflowX: 'auto',
        }}
      >
        {filterOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            style={{
              padding: '0.45rem 0.95rem',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              backgroundColor: statusFilter === opt.value ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
              color: statusFilter === opt.value ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.825rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          style={{
            padding: '1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
          }}
        >
          {error}
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <EmptyState
          icon={Printer}
          title={statusFilter === 'ALL' ? 'No print jobs submitted yet' : `No ${statusFilter.toLowerCase()} print jobs`}
          description={
            statusFilter === 'ALL'
              ? 'Upload your PDF documents to print without standing in long counter lines.'
              : 'Try selecting a different filter above.'
          }
          actionLabel="Upload New Document"
          onAction={() => navigate('/student/printing')}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {filteredOrders.map((job) => {
            const firstDoc = job.documents && job.documents[0];
            const filename = firstDoc?.original_filename || 'Uploaded Document.pdf';
            const formattedDate = new Date(job.created_at).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={job.id}
                className="card card-interactive"
                onClick={() => navigate(`/student/printing/orders/${job.id}`)}
                style={{
                  padding: '1.25rem 1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1.25rem',
                  cursor: 'pointer',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '240px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem' }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                      Print Job #{job.id}
                    </h3>
                    {getStatusBadge(job.status)}
                    <Badge variant={job.color_mode === 'COLOR' ? 'warning' : 'neutral'}>
                      {job.color_mode === 'COLOR' ? 'Color' : 'B/W'}
                    </Badge>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.35rem' }}>
                    <FileText size={16} color="var(--primary-600)" />
                    <span>{filename}</span>
                  </div>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {job.shop_name} • {job.total_pages} pages × {job.copies} {job.copies > 1 ? 'copies' : 'copy'} • {job.paper_size} {job.print_sides === 'DOUBLE_SIDED' ? '(Duplex)' : '(Single)'}
                  </div>

                  <div style={{ fontSize: '0.785rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                    Submitted on {formattedDate} • Est. Turnaround: ~{job.estimated_prep_time_mins} mins
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', textAlign: 'right' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>
                      Price
                    </span>
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      ₹{parseFloat(job.total_amount || job.price || 0).toFixed(2)}
                    </span>
                  </div>

                  <Button variant="outline" size="sm" rightIcon={ChevronRight}>
                    View Details
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentPrintOrders;
