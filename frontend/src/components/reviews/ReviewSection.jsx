import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, ShieldCheck, Flag, Edit2, Trash2, CornerDownRight, AlertCircle } from 'lucide-react';
import engagementService from '../../services/engagementService';
import { useAuth } from '../../context/AuthContext';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { Spinner } from '../common/Loader';

const ReviewSection = ({ productId = null, shopId = null }) => {
  const { user, isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({
    average_rating: 0,
    review_count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('CREATE'); // CREATE, EDIT
  const [selectedReviewId, setSelectedReviewId] = useState(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Report Modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReviewId, setReportReviewId] = useState(null);
  const [reportReason, setReportReason] = useState('');

  const fetchReviewsAndSummary = async () => {
    setLoading(true);
    try {
      const params = {};
      if (productId) params.product = productId;
      if (shopId) params.shop = shopId;

      const [revData, sumData] = await Promise.all([
        engagementService.getReviews(params),
        engagementService.getReviewSummary(params),
      ]);

      const revList = Array.isArray(revData) ? revData : revData.results || [];
      setReviews(revList);
      if (sumData) {
        setSummary({
          average_rating: sumData.average_rating || 0,
          review_count: sumData.review_count || 0,
          distribution: sumData.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
      }
    } catch (err) {
      console.error('Failed to load reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewsAndSummary();
  }, [productId, shopId]);

  const handleOpenCreate = () => {
    setModalMode('CREATE');
    setRating(5);
    setComment('');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleOpenEdit = (rev) => {
    setModalMode('EDIT');
    setSelectedReviewId(rev.id);
    setRating(rev.rating);
    setComment(rev.comment || '');
    setErrorMsg('');
    setShowModal(true);
  };

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (modalMode === 'CREATE') {
        const payload = { rating, comment };
        if (productId) payload.product = productId;
        if (shopId) payload.shop = shopId;

        await engagementService.createReview(payload);
        setSuccessMsg('Review submitted successfully!');
      } else {
        await engagementService.updateReview(selectedReviewId, { rating, comment });
        setSuccessMsg('Review updated successfully!');
      }
      setShowModal(false);
      fetchReviewsAndSummary();
    } catch (err) {
      const msg = err.response?.data?.detail || err.response?.data?.product || err.response?.data?.shop || 'Failed to submit review. Ensure you have a completed purchase.';
      setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async (id) => {
    if (!window.confirm('Are you sure you want to delete your review?')) return;
    try {
      await engagementService.deleteReview(id);
      fetchReviewsAndSummary();
    } catch (err) {
      alert('Failed to delete review.');
    }
  };

  const handleReport = async (e) => {
    e.preventDefault();
    if (!reportReason.trim()) return;
    try {
      await engagementService.reportReview(reportReviewId, reportReason);
      alert('Thank you. This review has been reported to administrators for moderation.');
      setShowReportModal(false);
      setReportReason('');
      fetchReviewsAndSummary();
    } catch (err) {
      alert('Failed to report review.');
    }
  };

  const renderStars = (score, size = 16) => {
    return (
      <div style={{ display: 'inline-flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={size}
            fill={s <= score ? '#F59E0B' : 'none'}
            color={s <= score ? '#F59E0B' : '#D1D5DB'}
          />
        ))}
      </div>
    );
  };

  const myReview = reviews.find((r) => r.user === user?.id);

  return (
    <div style={{ marginTop: '2.5rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB', padding: '1.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MessageSquare size={22} color="var(--primary-600, #4F46E5)" />
            Customer Ratings & Reviews
          </h2>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.9rem' }}>
            Authentic feedback from verified student purchases
          </p>
        </div>

        {isAuthenticated && !myReview && (
          <Button variant="primary" onClick={handleOpenCreate}>
            Write a Review
          </Button>
        )}
      </div>

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#065F46', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {/* Aggregate Histogram Card */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 2fr', gap: '2rem', padding: '1.5rem', background: '#F9FAFB', borderRadius: '12px', marginBottom: '2rem' }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid #E5E7EB', paddingRight: '1.5rem' }}>
          <div style={{ fontSize: '3rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
            {summary.average_rating.toFixed(1)}
          </div>
          <div style={{ margin: '8px 0' }}>
            {renderStars(Math.round(summary.average_rating), 20)}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
            Based on {summary.review_count} verified {summary.review_count === 1 ? 'review' : 'reviews'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.distribution[stars] || summary.distribution[String(stars)] || 0;
            const pct = summary.review_count > 0 ? Math.round((count / summary.review_count) * 100) : 0;
            return (
              <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                <span style={{ width: '45px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  {stars} <Star size={13} fill="#F59E0B" color="#F59E0B" />
                </span>
                <div style={{ flex: 1, height: '8px', background: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#F59E0B', borderRadius: '4px' }} />
                </div>
                <span style={{ width: '40px', textAlign: 'right', color: '#6B7280' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Review List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}><Spinner size="md" /></div>
      ) : reviews.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2.5rem', color: '#9CA3AF' }}>
          <p style={{ margin: 0, fontSize: '0.95rem' }}>No reviews submitted yet. Be the first verified buyer to share your experience!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {reviews.map((rev) => {
            const isOwner = user?.id === rev.user;
            return (
              <div key={rev.id} style={{ padding: '1.25rem', border: '1px solid #E5E7EB', borderRadius: '12px', background: isOwner ? '#F8FAFC' : '#FFFFFF' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#1F2937' }}>{rev.username}</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', background: '#ECFDF5', color: '#047857', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                        <ShieldCheck size={12} /> Verified Buyer
                      </span>
                      {isOwner && <Badge variant="primary">Your Review</Badge>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      {renderStars(rev.rating, 14)}
                      <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                        {new Date(rev.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {isOwner ? (
                      <>
                        <button onClick={() => handleOpenEdit(rev)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4F46E5', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                          <Edit2 size={14} /> Edit
                        </button>
                        <button onClick={() => handleDeleteReview(rev.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                          <Trash2 size={14} /> Delete
                        </button>
                      </>
                    ) : isAuthenticated ? (
                      <button
                        onClick={() => { setReportReviewId(rev.id); setShowReportModal(true); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                        title="Report inappropriate review"
                      >
                        <Flag size={14} /> Report
                      </button>
                    ) : null}
                  </div>
                </div>

                {rev.comment && (
                  <p style={{ margin: '8px 0 0', color: '#374151', fontSize: '0.95rem', lineHeight: 1.5 }}>
                    {rev.comment}
                  </p>
                )}

                {/* Seller Response */}
                {rev.seller_response && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', background: '#F3F4F6', borderRadius: '8px', borderLeft: '3px solid var(--primary-600, #4F46E5)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                      <CornerDownRight size={14} /> Shop Owner Response
                      <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9CA3AF' }}>
                        {rev.seller_responded_at && new Date(rev.seller_responded_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.88rem', color: '#1F2937' }}>{rev.seller_response}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 1rem' }}>
              {modalMode === 'CREATE' ? 'Write a Verified Review' : 'Edit Your Review'}
            </h3>

            {errorMsg && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', color: '#B91C1C', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} /> {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmitReview}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Select Rating
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      type="button"
                      key={s}
                      onClick={() => setRating(s)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}
                    >
                      <Star size={28} fill={s <= rating ? '#F59E0B' : 'none'} color={s <= rating ? '#F59E0B' : '#D1D5DB'} />
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
                  Review Comments
                </label>
                <textarea
                  rows={4}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share details about item quality, accuracy, paper thickness, or delivery experience..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <Button variant="secondary" type="button" onClick={() => setShowModal(false)} disabled={submitting}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : modalMode === 'CREATE' ? 'Submit Review' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '440px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Report Review</h3>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: '0 0 1rem' }}>
              Help keep the campus marketplace authentic. Please explain why this review violates community guidelines:
            </p>
            <form onSubmit={handleReport}>
              <textarea
                rows={3}
                required
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                placeholder="Spam, offensive language, or irrelevant advertisement..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', marginBottom: '1.25rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" type="button" onClick={() => setShowReportModal(false)}>
                  Cancel
                </Button>
                <Button variant="danger" type="submit">
                  Submit Report
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewSection;
