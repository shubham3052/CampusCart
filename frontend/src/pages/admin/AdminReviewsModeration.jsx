import React, { useState, useEffect } from 'react';
import { Shield, Check, X, EyeOff, RefreshCw, AlertTriangle, Star, Search, Filter } from 'lucide-react';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const AdminReviewsModeration = () => {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [reportedOnly, setReportedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [selectedReview, setSelectedReview] = useState(null);
  const [targetAction, setTargetAction] = useState(null); // APPROVED, REJECTED, HIDDEN
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const params = {};
      if (selectedStatus !== 'ALL') params.status = selectedStatus;
      const data = await engagementService.getReviews(params);
      let list = Array.isArray(data) ? data : data.results || [];
      if (reportedOnly) {
        list = list.filter((r) => r.is_reported);
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        list = list.filter(
          (r) =>
            (r.username && r.username.toLowerCase().includes(q)) ||
            (r.comment && r.comment.toLowerCase().includes(q)) ||
            (r.product_name && r.product_name.toLowerCase().includes(q)) ||
            (r.shop_name && r.shop_name.toLowerCase().includes(q))
        );
      }
      setReviews(list);
    } catch (err) {
      console.error('Failed to load moderation reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, [selectedStatus, reportedOnly, searchQuery]);

  const handleOpenModeration = (rev, action) => {
    setSelectedReview(rev);
    setTargetAction(action);
    setActionNotes('');
  };

  const handleConfirmModeration = async () => {
    if (!selectedReview || !targetAction) return;
    setSubmitting(true);
    try {
      await engagementService.moderateReview(selectedReview.id, targetAction, actionNotes);
      setFeedbackMsg(`Review #${selectedReview.id} updated to ${targetAction}.`);
      setTimeout(() => setFeedbackMsg(''), 3000);
      setSelectedReview(null);
      setTargetAction(null);
      fetchReviews();
    } catch (err) {
      alert('Failed to moderate review.');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status, isReported) => {
    if (isReported) return <Badge variant="danger">Reported</Badge>;
    switch (status) {
      case 'APPROVED': return <Badge variant="success">Approved</Badge>;
      case 'PENDING': return <Badge variant="warning">Pending</Badge>;
      case 'REJECTED': return <Badge variant="danger">Rejected</Badge>;
      case 'HIDDEN': return <Badge variant="secondary">Hidden</Badge>;
      default: return <Badge variant="primary">{status}</Badge>;
    }
  };

  return (
    <div style={{ maxWidth: '1150px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Shield size={28} color="var(--primary-600, #4F46E5)" />
          Review Moderation & Trust Desk
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
          Enforce community guidelines, investigate reported reviews, and manage platform rating authenticity
        </p>
      </div>

      {feedbackMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#047857', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {feedbackMsg}
        </div>
      )}

      {/* Filters Bar */}
      <Card style={{ marginBottom: '1.5rem', padding: '1rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {['ALL', 'PENDING', 'APPROVED', 'REPORTED', 'HIDDEN', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => { setSelectedStatus(st); setReportedOnly(st === 'REPORTED'); }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid',
                  borderColor: selectedStatus === st ? '#4F46E5' : '#D1D5DB',
                  background: selectedStatus === st ? '#4F46E5' : '#FFFFFF',
                  color: selectedStatus === st ? '#FFFFFF' : '#374151',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '240px' }}>
            <Search size={16} color="#9CA3AF" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user, product, or review text..."
              style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '0.85rem' }}
            />
          </div>
        </div>
      </Card>

      {/* Reviews Queue */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : reviews.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ margin: 0, color: '#9CA3AF' }}>No reviews match your filter criteria.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reviews.map((rev) => (
            <Card key={rev.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#1F2937' }}>{rev.username}</span>
                    <span style={{ fontSize: '0.8rem', color: '#6B7280' }}>
                      re: <strong>{rev.product_name || rev.shop_name}</strong>
                    </span>
                    {getStatusBadge(rev.status, rev.is_reported)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'inline-flex', gap: '2px' }}>
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} size={13} fill={s <= rev.rating ? '#F59E0B' : 'none'} color={s <= rev.rating ? '#F59E0B' : '#D1D5DB'} />
                      ))}
                    </div>
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                      {new Date(rev.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Moderation Controls */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {rev.status !== 'APPROVED' && (
                    <Button variant="success" size="sm" onClick={() => handleOpenModeration(rev, 'APPROVED')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Check size={14} /> Approve
                    </Button>
                  )}
                  {rev.status !== 'HIDDEN' && (
                    <Button variant="secondary" size="sm" onClick={() => handleOpenModeration(rev, 'HIDDEN')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <EyeOff size={14} /> Hide
                    </Button>
                  )}
                  {rev.status !== 'REJECTED' && (
                    <Button variant="danger" size="sm" onClick={() => handleOpenModeration(rev, 'REJECTED')} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <X size={14} /> Reject
                    </Button>
                  )}
                </div>
              </div>

              {rev.comment && (
                <p style={{ margin: '6px 0 8px', fontSize: '0.92rem', color: '#374151', lineHeight: 1.4 }}>
                  {rev.comment}
                </p>
              )}

              {rev.is_reported && (
                <div style={{ marginTop: '8px', padding: '8px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px', fontSize: '0.82rem', color: '#B91C1C', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={14} /> <strong>Flagged Reason:</strong> {rev.report_reason || 'Flagged by customer for moderation'}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Action Modal */}
      {selectedReview && targetAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Confirm {targetAction} Action
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: '0 0 1rem' }}>
              Are you sure you want to change status of Review #{selectedReview.id} to <strong>{targetAction}</strong>?
            </p>

            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '4px' }}>
              Internal Moderation Note (Optional)
            </label>
            <textarea
              rows={3}
              value={actionNotes}
              onChange={(e) => setActionNotes(e.target.value)}
              placeholder="e.g. Verified legitimate order feedback; unhidden."
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.85rem', marginBottom: '1.25rem' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="secondary" type="button" onClick={() => setSelectedReview(null)}>Cancel</Button>
              <Button variant="primary" onClick={handleConfirmModeration} disabled={submitting}>
                {submitting ? 'Applying...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviewsModeration;
