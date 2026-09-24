import React, { useState, useEffect } from 'react';
import { HelpCircle, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Search, Filter, MessageSquare, Send } from 'lucide-react';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const AdminComplaintsManagement = () => {
  const [complaints, setComplaints] = useState([]);
  const [analytics, setAnalytics] = useState({ total_complaints: 0, open_complaints: 0, urgent_pending_complaints: 0, resolution_rate_percentage: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution / Detail Modal
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [newStatus, setNewStatus] = useState('RESOLVED');
  const [submitting, setSubmitting] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (priorityFilter !== 'ALL') params.priority = priorityFilter;
      if (searchQuery) params.search = searchQuery;

      const [data, anaData] = await Promise.all([
        engagementService.getComplaints(params),
        engagementService.getComplaintAnalytics().catch(() => null),
      ]);

      setComplaints(Array.isArray(data) ? data : data.results || []);
      if (anaData) setAnalytics(anaData);
    } catch (err) {
      console.error('Failed to load complaints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter, searchQuery]);

  const handleOpenDetail = async (comp) => {
    setSelectedComplaint(comp);
    setResolutionNotes(comp.resolution || '');
    setNewStatus(comp.status === 'OPEN' ? 'IN_REVIEW' : comp.status);
    try {
      const detailed = await engagementService.getComplaintDetail(comp.id);
      setSelectedComplaint(detailed);
      setResolutionNotes(detailed.resolution || '');
    } catch (err) {
      console.error('Failed to load detail:', err);
    }
  };

  const handleResolve = async (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim()) {
      alert('Please provide resolution notes.');
      return;
    }
    setSubmitting(true);
    try {
      await engagementService.resolveComplaint(selectedComplaint.id, resolutionNotes.trim());
      setFeedbackMsg(`Grievance #${String(selectedComplaint.ticket_number).slice(0, 8)} marked as RESOLVED.`);
      setTimeout(() => setFeedbackMsg(''), 3000);
      setSelectedComplaint(null);
      loadData();
    } catch (err) {
      alert('Failed to resolve grievance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (statusVal) => {
    try {
      await engagementService.updateComplaintStatus(selectedComplaint.id, statusVal);
      setSelectedComplaint((prev) => ({ ...prev, status: statusVal }));
      loadData();
    } catch (err) {
      alert('Failed to update status.');
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    setReplying(true);
    try {
      const msg = await engagementService.addComplaintMessage(selectedComplaint.id, replyMessage.trim());
      setSelectedComplaint((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), msg],
      }));
      setReplyMessage('');
    } catch (err) {
      alert('Failed to send reply.');
    } finally {
      setReplying(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'RESOLVED': return <Badge variant="success">Resolved</Badge>;
      case 'IN_REVIEW': return <Badge variant="warning">In Review</Badge>;
      case 'REJECTED': return <Badge variant="danger">Rejected</Badge>;
      case 'CLOSED': return <Badge variant="secondary">Closed</Badge>;
      default: return <Badge variant="primary">Open</Badge>;
    }
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'URGENT': return <Badge variant="danger">Urgent</Badge>;
      case 'HIGH': return <Badge variant="warning">High</Badge>;
      case 'MEDIUM': return <Badge variant="primary">Medium</Badge>;
      default: return <Badge variant="secondary">Low</Badge>;
    }
  };

  return (
    <div style={{ maxWidth: '1150px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <HelpCircle size={28} color="var(--primary-600, #4F46E5)" />
          Grievances & Student Support Desk
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
          Oversee student dispute tickets, assign investigations, and record official resolutions
        </p>
      </div>

      {feedbackMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#047857', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {feedbackMsg}
        </div>
      )}

      {/* KPI Counters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#EEF2FF', borderRadius: '10px', color: '#4F46E5' }}>
            <HelpCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>TOTAL GRIEVANCES</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.total_complaints}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#FEF3C7', borderRadius: '10px', color: '#D97706' }}>
            <Clock size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>OPEN / IN REVIEW</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.open_complaints}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#FEF2F2', borderRadius: '10px', color: '#DC2626' }}>
            <AlertTriangle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>URGENT PENDING</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.urgent_pending_complaints}</div>
          </div>
        </Card>

        <Card style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '10px', background: '#ECFDF5', borderRadius: '10px', color: '#059669' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>RESOLUTION RATE</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>{analytics.resolution_rate_percentage}%</div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED', 'CLOSED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: statusFilter === st ? '#4F46E5' : '#D1D5DB',
                  background: statusFilter === st ? '#4F46E5' : '#FFFFFF',
                  color: statusFilter === st ? '#FFFFFF' : '#374151',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px' }}>
            <Search size={16} color="#9CA3AF" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ticket #, subject, or student..."
              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </Card>

      {/* Complaints List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : complaints.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ margin: 0, color: '#9CA3AF' }}>No grievances match your search criteria.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {complaints.map((comp) => (
            <Card key={comp.id} onClick={() => handleOpenDetail(comp)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: '#6B7280', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }}>
                    #{String(comp.ticket_number).slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ marginLeft: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#4B5563' }}>
                    {comp.category_display || comp.category}
                  </span>
                  <span style={{ marginLeft: '8px', fontSize: '0.85rem', color: '#6B7280' }}>
                    by <strong>{comp.username}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {getPriorityBadge(comp.priority)}
                  {getStatusBadge(comp.status)}
                </div>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>
                {comp.subject}
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {comp.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#9CA3AF', borderTop: '1px solid #F3F4F6', paddingTop: '8px' }}>
                <span>Filed: {new Date(comp.created_at).toLocaleString()}</span>
                {comp.shop_name && <span>Shop: <strong>{comp.shop_name}</strong></span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Grievance Management Modal */}
      {selectedComplaint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '650px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#6B7280' }}>
                  #{String(selectedComplaint.ticket_number).slice(0, 8).toUpperCase()}
                </span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '2px 0 0' }}>{selectedComplaint.subject}</h3>
              </div>
              <button onClick={() => setSelectedComplaint(null)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {/* Grievance Metadata */}
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', fontSize: '0.85rem', color: '#4B5563' }}>
                <span>Student: <strong>{selectedComplaint.username}</strong></span>
                {selectedComplaint.shop_name && <span>Shop: <strong>{selectedComplaint.shop_name}</strong></span>}
                <span>Status: {getStatusBadge(selectedComplaint.status)}</span>
              </div>

              <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <p style={{ margin: 0, fontSize: '0.92rem', color: '#1F2937' }}>{selectedComplaint.description}</p>
              </div>

              {/* Status Quick Actions */}
              <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Set Status:</span>
                {['IN_REVIEW', 'REJECTED', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(st)}
                    style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#FFFFFF', fontSize: '0.8rem', cursor: 'pointer' }}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Official Resolution Form */}
              <div style={{ padding: '1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', marginBottom: '1.5rem' }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#166534' }}>
                  Official Administrator Resolution
                </h4>
                <textarea
                  rows={3}
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  placeholder="State the resolution findings (e.g. refund issued, reprint ordered, warning given)..."
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #86EFAC', fontSize: '0.88rem', marginBottom: '10px' }}
                />
                <Button variant="success" size="sm" onClick={handleResolve} disabled={submitting}>
                  {submitting ? 'Resolving...' : 'Save & Mark as RESOLVED'}
                </Button>
              </div>

              {/* Thread Messages */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#374151' }}>Thread Messages</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
                {(selectedComplaint.messages || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#9CA3AF', margin: 0 }}>No thread replies yet.</p>
                ) : (
                  selectedComplaint.messages.map((m) => (
                    <div key={m.id} style={{ padding: '8px 12px', background: '#F3F4F6', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6B7280', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: '#1F2937' }}>{m.sender_username}</span>
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>{m.message}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  required
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="Post message to student..."
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.88rem' }}
                />
                <Button variant="primary" type="submit" size="sm" disabled={replying}>
                  Send
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminComplaintsManagement;
