import React, { useState, useEffect } from 'react';
import { Star, MessageSquare, Reply, CheckCircle2, CornerDownRight, AlertCircle } from 'lucide-react';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const ShopOwnerReviews = () => {
  const [reviews, setReviews] = useState([]);
  const [summary, setSummary] = useState({
    average_rating: 0,
    review_count: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  });
  const [loading, setLoading] = useState(true);

  // Response Modal
  const [selectedReview, setSelectedReview] = useState(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const [revData, sumData] = await Promise.all([
        engagementService.getReviews(),
        engagementService.getReviewSummary(),
      ]);
      setReviews(Array.isArray(revData) ? revData : revData.results || []);
      if (sumData) {
        setSummary({
          average_rating: sumData.average_rating || 0,
          review_count: sumData.review_count || 0,
          distribution: sumData.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
      }
    } catch (err) {
      console.error('Failed to load merchant reviews:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleOpenRespond = (rev) => {
    setSelectedReview(rev);
    setResponseText(rev.seller_response || '');
  };

  const handleSendResponse = async (e) => {
    e.preventDefault();
    if (!responseText.trim()) return;
    setSubmitting(true);

    try {
      await engagementService.respondToReview(selectedReview.id, responseText.trim());
      setSuccessMsg('Response posted successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
      setSelectedReview(null);
      fetchReviews();
    } catch (err) {
      alert('Failed to submit response.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderStars = (score) => {
    return (
      <div style={{ display: 'inline-flex', gap: '2px' }}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Star
            key={s}
            size={14}
            fill={s <= score ? '#F59E0B' : 'none'}
            color={s <= score ? '#F59E0B' : '#D1D5DB'}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <MessageSquare size={28} color="var(--primary-600, #4F46E5)" />
          Customer Ratings & Feedback
        </h1>
        <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
          Monitor customer satisfaction, review quality trends, and reply to student reviews
        </p>
      </div>

      {successMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ECFDF5', color: '#047857', borderRadius: '8px', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {/* Aggregate Overview Card */}
      <div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        style={{
          padding: 'clamp(1rem, 3vw, 1.5rem)',
          background: '#FFFFFF',
          borderRadius: '16px',
          border: '1px solid #E5E7EB',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ fontSize: '3rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>
            {summary.average_rating.toFixed(1)}
          </div>
          <div style={{ margin: '8px 0' }}>
            {renderStars(Math.round(summary.average_rating))}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#6B7280' }}>
            From {summary.review_count} verified purchases
          </div>
        </div>

        <div
          className="md:col-span-2"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            justifyContent: 'center',
          }}
        >
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = summary.distribution[stars] || summary.distribution[String(stars)] || 0;
            const pct = summary.review_count > 0 ? Math.round((count / summary.review_count) * 100) : 0;
            return (
              <div key={stars} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem' }}>
                <span style={{ width: '45px', fontWeight: 600 }}>{stars} Stars</span>
                <div style={{ flex: 1, height: '8px', background: '#E5E7EB', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#F59E0B', borderRadius: '4px' }} />
                </div>
                <span style={{ width: '40px', textAlign: 'right', color: '#6B7280' }}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews Feed */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
      ) : reviews.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '3rem' }}>
          <p style={{ margin: 0, color: '#9CA3AF' }}>No reviews have been submitted for your shop or products yet.</p>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {reviews.map((rev) => (
            <Card key={rev.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: '#1F2937' }}>{rev.username}</span>
                    {rev.product_name && (
                      <span style={{ fontSize: '0.8rem', background: '#EEF2FF', color: '#4F46E5', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                        Product: {rev.product_name}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    {renderStars(rev.rating)}
                    <span style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>
                      {new Date(rev.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <Button variant="outline" size="sm" onClick={() => handleOpenRespond(rev)} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Reply size={14} /> {rev.seller_response ? 'Edit Response' : 'Reply'}
                </Button>
              </div>

              {rev.comment && (
                <p style={{ margin: '8px 0 0', color: '#374151', fontSize: '0.92rem', lineHeight: 1.5 }}>
                  {rev.comment}
                </p>
              )}

              {/* Existing Seller Response */}
              {rev.seller_response && (
                <div style={{ marginTop: '12px', padding: '10px 14px', background: '#F8FAFC', borderRadius: '8px', borderLeft: '3px solid var(--primary-600, #4F46E5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#4B5563', marginBottom: '4px' }}>
                    <CornerDownRight size={14} /> Your Response
                    <span style={{ fontSize: '0.75rem', fontWeight: 400, color: '#9CA3AF' }}>
                      {rev.seller_responded_at && new Date(rev.seller_responded_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.88rem', color: '#1F2937' }}>{rev.seller_response}</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Response Modal */}
      {selectedReview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
              Reply to {selectedReview.username}
            </h3>
            <p style={{ fontSize: '0.85rem', color: '#6B7280', margin: '0 0 1rem' }}>
              Your reply will be displayed publicly beneath the customer review.
            </p>

            <form onSubmit={handleSendResponse}>
              <textarea
                rows={4}
                required
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Thank the student or address their feedback professionally..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem', marginBottom: '1.25rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" type="button" onClick={() => setSelectedReview(null)}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Posting...' : 'Post Public Response'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopOwnerReviews;
