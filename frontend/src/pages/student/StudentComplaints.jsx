import React, { useState, useEffect } from 'react';
import { HelpCircle, Plus, MessageSquare, AlertCircle, CheckCircle2, Clock, Send, ShieldAlert, ChevronDown, ChevronUp, BookOpen } from 'lucide-react';
import engagementService from '../../services/engagementService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import { Spinner } from '../../components/common/Loader';

const FAQ_ITEMS = [
  {
    id: 'ordering',
    question: 'How do I place an order for stationery items?',
    answer: 'Browse products across campus shops from the Shops tab, select your preferred stationery or supplies, choose your quantity, and add them to your cart. Proceed to checkout to choose either Counter Pickup or Hostel Doorstep Delivery.',
  },
  {
    id: 'multiple-merchants',
    question: 'Can I order items from multiple shops in the same cart?',
    answer: 'To guarantee fast fulfillment and preserve merchant-specific pickup/delivery logistics, your cart holds items from one merchant at a time. If you choose an item from a different shop, CampusCart will ask if you want to clear your current cart or continue with the existing shop.',
  },
  {
    id: 'delivery-otp',
    question: 'How does hostel doorstep delivery and verification OTP work?',
    answer: 'Once you select Hostel Delivery, choose your saved hostel block and room number. When the campus courier arrives at your hostel, an exclusive 6-digit delivery OTP is revealed in your Order Details screen. Simply provide this code to the courier to verify and receive your package securely.',
  },
  {
    id: 'counter-pickup',
    question: 'How does store counter pickup work?',
    answer: 'When you select Counter Pickup, the shop receives your order and begins packing. Once ready, you will receive an alert and your 6-digit Pickup OTP will become visible on the Order Details page. Walk to the shop counter, present your Pickup OTP, and collect your stationery.',
  },
  {
    id: 'printing-service',
    question: 'How do Xerox and document printing orders work?',
    answer: 'Visit the Printing tab, upload your academic PDF document, select color (B&W or Color), orientation, double-sided printing, and optional spiral binding. The system automatically computes exact pricing based on page count. Once the shop finishes printing, you will receive a notification to collect your documents.',
  },
  {
    id: 'cancellations',
    question: 'Can I cancel an order or report damaged products?',
    answer: 'You can cancel any stationery order directly from the Order Details page as long as its status is "PENDING". Once confirmed or prepared by the merchant, cancellation is closed. If an item is missing or damaged, switch to the "File a Grievance" tab below to submit a support ticket to campus administrators.',
  },
];

const StudentComplaints = () => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replying, setReplying] = useState(false);

  // Tab State: 'faq' | 'tickets'
  const [activeTab, setActiveTab] = useState('faq');
  const [expandedFaq, setExpandedFaq] = useState('ordering');

  // Form state
  const [formCategory, setFormCategory] = useState('ORDER');
  const [formSubject, setFormSubject] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchComplaints = async () => {
    setLoading(true);
    try {
      const data = await engagementService.getComplaints();
      setComplaints(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load complaints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const handleCreateComplaint = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    try {
      await engagementService.createComplaint({
        category: formCategory,
        subject: formSubject,
        description: formDescription,
      });
      setShowCreateModal(false);
      setFormSubject('');
      setFormDescription('');
      setActiveTab('tickets');
      fetchComplaints();
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to file grievance.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetail = async (comp) => {
    setSelectedComplaint(comp);
    try {
      const detailed = await engagementService.getComplaintDetail(comp.id);
      setSelectedComplaint(detailed);
    } catch (err) {
      console.error('Failed to load detail:', err);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyMessage.trim()) return;
    setReplying(true);

    try {
      const newMsg = await engagementService.addComplaintMessage(selectedComplaint.id, replyMessage.trim());
      setSelectedComplaint((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), newMsg],
      }));
      setReplyMessage('');
    } catch (err) {
      alert('Failed to send follow-up message.');
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

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <HelpCircle size={28} color="var(--primary-600, #4F46E5)" />
            Help Center & Support
          </h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: '0.95rem' }}>
            Frequently Asked Questions, store policies, order help, and grievance tickets
          </p>
        </div>

        <Button variant="primary" onClick={() => setShowCreateModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={18} /> File a Grievance
        </Button>
      </div>

      {/* Tabs Switcher */}
      <div
        style={{
          display: 'flex',
          borderBottom: '2px solid #E5E7EB',
          marginBottom: '1.5rem',
          gap: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('faq')}
          style={{
            padding: '0.75rem 0.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'faq' ? '2.5px solid var(--primary-600, #4F46E5)' : '2.5px solid transparent',
            color: activeTab === 'faq' ? 'var(--primary-600, #4F46E5)' : '#6B7280',
            fontWeight: activeTab === 'faq' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            transition: 'all 0.15s ease',
          }}
        >
          <BookOpen size={17} />
          <span>Help & FAQs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tickets')}
          style={{
            padding: '0.75rem 0.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'tickets' ? '2.5px solid var(--primary-600, #4F46E5)' : '2.5px solid transparent',
            color: activeTab === 'tickets' ? 'var(--primary-600, #4F46E5)' : '#6B7280',
            fontWeight: activeTab === 'tickets' ? 700 : 500,
            fontSize: '0.95rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.45rem',
            transition: 'all 0.15s ease',
          }}
        >
          <MessageSquare size={17} />
          <span>My Tickets & Grievances</span>
          {complaints.length > 0 && (
            <span
              style={{
                backgroundColor: activeTab === 'tickets' ? 'var(--primary-600, #4F46E5)' : '#E5E7EB',
                color: activeTab === 'tickets' ? '#fff' : '#4B5563',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '0.1rem 0.45rem',
                borderRadius: '999px',
              }}
            >
              {complaints.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: FAQ ACCORDION */}
      {activeTab === 'faq' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {FAQ_ITEMS.map((faq) => {
            const isExpanded = expandedFaq === faq.id;
            return (
              <div
                key={faq.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 'var(--radius-lg)',
                  border: isExpanded ? '1.5px solid var(--primary-300, #A5B4FC)' : '1px solid #E5E7EB',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  boxShadow: isExpanded ? '0 4px 12px rgba(79, 70, 229, 0.06)' : 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => setExpandedFaq(isExpanded ? null : faq.id)}
                  style={{
                    width: '100%',
                    padding: '1.1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    background: isExpanded ? '#F8FAFC' : '#FFFFFF',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                  aria-expanded={isExpanded}
                >
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: isExpanded ? 'var(--primary-700, #4338CA)' : 'var(--text-primary, #111827)' }}>
                    {faq.question}
                  </span>
                  <div
                    style={{
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                      flexShrink: 0,
                      color: isExpanded ? 'var(--primary-600, #4F46E5)' : '#9CA3AF',
                    }}
                  >
                    <ChevronDown size={20} />
                  </div>
                </button>

                {isExpanded && (
                  <div
                    style={{
                      padding: '0.75rem 1.25rem 1.25rem',
                      color: 'var(--text-secondary, #4B5563)',
                      fontSize: '0.925rem',
                      lineHeight: 1.6,
                      borderTop: '1px solid #F3F4F6',
                    }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}

          {/* Need More Assistance Banner */}
          <div
            style={{
              marginTop: '1.5rem',
              padding: '1.25rem',
              backgroundColor: '#EEF2FF',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid #C7D2FE',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#3730A3' }}>
                Still have questions or facing an issue?
              </h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#4338CA' }}>
                Our campus help desk and shop admins are ready to assist you directly.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              Submit Support Ticket
            </Button>
          </div>
        </div>
      )}

      {/* TAB 2: MY TICKETS & GRIEVANCES */}
      {activeTab === 'tickets' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}><Spinner size="lg" /></div>
          ) : complaints.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem 1rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E5E7EB' }}>
              <CheckCircle2 size={56} color="#10B981" style={{ margin: '0 auto 1rem' }} />
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: '#374151' }}>No support grievances filed</h2>
              <p style={{ color: '#9CA3AF', marginBottom: '1.5rem', maxWidth: '400px', margin: '0 auto 1.5rem' }}>
                All your orders and campus services are running smoothly!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {complaints.map((comp) => (
            <Card
              key={comp.id}
              onClick={() => handleOpenDetail(comp)}
              style={{ cursor: 'pointer', transition: 'transform 0.15s, box-shadow 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#6B7280', background: '#F3F4F6', padding: '2px 6px', borderRadius: '4px' }}>
                    #{String(comp.ticket_number).slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ marginLeft: '8px', fontSize: '0.85rem', fontWeight: 600, color: '#4B5563' }}>
                    {comp.category_display || comp.category}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {getStatusBadge(comp.status)}
                </div>
              </div>

              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 6px', color: '#111827' }}>
                {comp.subject}
              </h3>
              <p style={{ margin: '0 0 10px', fontSize: '0.9rem', color: '#4B5563', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {comp.description}
              </p>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: '#9CA3AF', borderTop: '1px solid #F3F4F6', paddingTop: '8px' }}>
                <span>Filed: {new Date(comp.created_at).toLocaleDateString()}</span>
                {comp.status === 'RESOLVED' && <span style={{ color: '#059669', fontWeight: 600 }}>Resolved by Campus Admin</span>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '500px', width: '100%', padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 1rem' }}>File a Customer Grievance</h3>
            {errorMsg && (
              <div style={{ padding: '0.75rem', background: '#FEF2F2', color: '#B91C1C', borderRadius: '8px', marginBottom: '1rem', fontSize: '0.85rem' }}>
                {errorMsg}
              </div>
            )}
            <form onSubmit={handleCreateComplaint}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Category</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                >
                  <option value="ORDER">Order & Missing Items</option>
                  <option value="PRODUCT">Damaged / Defective Product</option>
                  <option value="SHOP">Shopkeeper Misbehavior / Overcharging</option>
                  <option value="PRINTING">Print Quality / Paper Jam Issue</option>
                  <option value="DELIVERY">Delivery Courier Issue</option>
                  <option value="PAYMENT">Payment Dispute</option>
                  <option value="OTHER">General Grievance</option>
                </select>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Subject</label>
                <input
                  type="text"
                  required
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Brief summary of the issue..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>Description</label>
                <textarea
                  rows={4}
                  required
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Explain clearly what happened so administrators can investigate..."
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button variant="primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Ticket'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail / Conversation Modal */}
      {selectedComplaint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '16px', maxWidth: '600px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#6B7280' }}>
                  #{String(selectedComplaint.ticket_number).slice(0, 8).toUpperCase()}
                </span>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '2px 0 0' }}>{selectedComplaint.subject}</h3>
              </div>
              <button onClick={() => setSelectedComplaint(null)} style={{ background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: '#6B7280' }}>✕</button>
            </div>

            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              <div style={{ padding: '1rem', background: '#F9FAFB', borderRadius: '10px', marginBottom: '1.25rem' }}>
                <p style={{ margin: '0 0 6px', fontSize: '0.95rem', color: '#1F2937' }}>{selectedComplaint.description}</p>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF' }}>
                  Reported on {new Date(selectedComplaint.created_at).toLocaleString()}
                </div>
              </div>

              {/* Resolution Banner */}
              {selectedComplaint.status === 'RESOLVED' && selectedComplaint.resolution && (
                <div style={{ padding: '1rem', background: '#ECFDF5', border: '1px solid #A7F3D0', borderRadius: '10px', marginBottom: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#065F46', marginBottom: '4px', fontSize: '0.9rem' }}>
                    <CheckCircle2 size={16} /> Official Resolution
                  </div>
                  <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: '#047857' }}>{selectedComplaint.resolution}</p>
                  <div style={{ fontSize: '0.75rem', color: '#065F46' }}>
                    Resolved by {selectedComplaint.resolved_by_username || 'Admin'} on {selectedComplaint.resolved_at && new Date(selectedComplaint.resolved_at).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Threaded Discussion Messages */}
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#374151' }}>Discussion Thread</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem' }}>
                {(selectedComplaint.messages || []).length === 0 ? (
                  <p style={{ fontSize: '0.85rem', color: '#9CA3AF', margin: 0 }}>No follow-up messages yet.</p>
                ) : (
                  selectedComplaint.messages.map((m) => (
                    <div key={m.id} style={{ padding: '10px 12px', background: '#F3F4F6', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6B7280', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 700, color: '#1F2937' }}>{m.sender_username}</span>
                        <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '0.88rem', color: '#374151' }}>{m.message}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Reply Form */}
              {selectedComplaint.status !== 'CLOSED' && (
                <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                  <input
                    type="text"
                    required
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Add follow-up information or proof..."
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.9rem' }}
                  />
                  <Button variant="primary" type="submit" size="sm" disabled={replying} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Send size={14} /> Send
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentComplaints;
