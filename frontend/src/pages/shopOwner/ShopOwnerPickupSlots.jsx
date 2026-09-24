import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Users,
  ShieldAlert,
  RefreshCw,
  Power,
} from 'lucide-react';
import orderService from '../../services/orderService';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import PageHeader from '../../components/common/PageHeader';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';

const ShopOwnerPickupSlots = () => {
  const { user } = useAuth();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Filter state
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrowStr = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const [selectedDateFilter, setSelectedDateFilter] = useState(''); // '' means all upcoming
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, FULL, DISABLED

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('CREATE'); // 'CREATE' or 'EDIT'
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  // Form State
  const [slotDate, setSlotDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('10:30');
  const [capacity, setCapacity] = useState(15);
  const [isActive, setIsActive] = useState(true);

  // Delete Confirmation Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [slotToDelete, setSlotToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchSlots();
  }, [selectedDateFilter]);

  const fetchSlots = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (selectedDateFilter) {
        params.date = selectedDateFilter;
      }
      const data = await orderService.getAllPickupSlots(params);
      setSlots(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load pickup slots:', err);
      setError(err.response?.data?.detail || 'Unable to load pickup slots.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreateModal = () => {
    setModalMode('CREATE');
    setSelectedSlot(null);
    setSlotDate(selectedDateFilter || todayStr);
    setStartTime('10:00');
    setEndTime('10:30');
    setCapacity(15);
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (slot) => {
    setModalMode('EDIT');
    setSelectedSlot(slot);
    setSlotDate(slot.date);
    setStartTime(slot.start_time.slice(0, 5));
    setEndTime(slot.end_time.slice(0, 5));
    setCapacity(slot.capacity);
    setIsActive(slot.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmitSlot = async (e) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    if (startTime >= endTime) {
      setFormError('End time must be after start time.');
      setIsSubmitting(false);
      return;
    }

    try {
      if (modalMode === 'CREATE') {
        const payload = {
          shop: user.shop_id || slots[0]?.shop || 1,
          date: slotDate,
          start_time: startTime,
          end_time: endTime,
          capacity: parseInt(capacity, 10),
          is_active: isActive,
        };
        await orderService.createPickupSlot(payload);
        setSuccessMessage(`New pickup slot ${startTime}-${endTime} created successfully!`);
      } else {
        const payload = {
          capacity: parseInt(capacity, 10),
          is_active: isActive,
          start_time: startTime,
          end_time: endTime,
        };
        await orderService.updatePickupSlot(selectedSlot.id, payload);
        setSuccessMessage(`Pickup slot #${selectedSlot.id} updated successfully!`);
      }

      setIsModalOpen(false);
      fetchSlots();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Failed to save pickup slot:', err);
      const data = err.response?.data;
      if (data) {
        if (data.capacity) setFormError(Array.isArray(data.capacity) ? data.capacity[0] : data.capacity);
        else if (data.end_time) setFormError(Array.isArray(data.end_time) ? data.end_time[0] : data.end_time);
        else if (data.non_field_errors) setFormError(data.non_field_errors[0]);
        else setFormError(data.message || 'Error saving pickup slot.');
      } else {
        setFormError('Failed to save pickup slot. Check details and retry.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!slotToDelete) return;
    setIsDeleting(true);
    try {
      await orderService.deletePickupSlot(slotToDelete.id);
      setSuccessMessage(`Pickup slot #${slotToDelete.id} was deleted successfully.`);
      setDeleteModalOpen(false);
      setSlotToDelete(null);
      fetchSlots();
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error('Deletion failed:', err);
      const msg = err.response?.data?.message || err.response?.data?.detail || 'Could not delete slot with active bookings.';
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (slot) => {
    try {
      const updated = await orderService.updatePickupSlot(slot.id, {
        is_active: !slot.is_active,
      });
      setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, is_active: updated.is_active } : s)));
      setSuccessMessage(`Slot #${slot.id} is now ${updated.is_active ? 'Active' : 'Disabled'}.`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert(err.response?.data?.message || 'Could not toggle slot status.');
    }
  };

  // Filter slots for display
  const filteredSlots = slots.filter((slot) => {
    if (statusFilter === 'ACTIVE') return slot.is_active && slot.booked_count < slot.capacity;
    if (statusFilter === 'FULL') return slot.booked_count >= slot.capacity;
    if (statusFilter === 'DISABLED') return !slot.is_active;
    return true;
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '3rem' }}>
      <PageHeader
        title="Pickup Slots Management"
        subtitle="Manage daily counter pickup time windows, control peak student queues, and safeguard counter capacities."
        badge={<Badge variant="primary">Step 13: Orderly Queue Control</Badge>}
        actions={
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={fetchSlots} disabled={loading}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" leftIcon={Plus} onClick={handleOpenCreateModal}>
              Add Pickup Slot
            </Button>
          </div>
        }
      />

      {successMessage && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: 'var(--radius-md)',
            color: '#166534',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <CheckCircle2 size={20} color="#16a34a" />
          <strong style={{ fontSize: '0.9rem' }}>{successMessage}</strong>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '1rem 1.25rem',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 'var(--radius-md)',
            color: '#991b1b',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <AlertCircle size={20} color="#dc2626" />
          <strong style={{ fontSize: '0.9rem' }}>{error}</strong>
        </div>
      )}

      {/* Date & Filter Bar */}
      <Card style={{ marginBottom: '1.5rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select Date:
            </span>
            <Button
              variant={selectedDateFilter === '' ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedDateFilter('')}
            >
              All Upcoming
            </Button>
            <Button
              variant={selectedDateFilter === todayStr ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedDateFilter(todayStr)}
            >
              Today ({todayStr.slice(5)})
            </Button>
            <Button
              variant={selectedDateFilter === tomorrowStr ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setSelectedDateFilter(tomorrowStr)}
            >
              Tomorrow ({tomorrowStr.slice(5)})
            </Button>
            <input
              type="date"
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-surface)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Status:
            </span>
            {['ALL', 'ACTIVE', 'FULL', 'DISABLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.785rem',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-full)',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: statusFilter === st ? 'var(--primary-600)' : 'var(--bg-surface-secondary)',
                  color: statusFilter === st ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.2s ease',
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Slots Table */}
      <Card padding="none">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            Loading pickup slots...
          </div>
        ) : filteredSlots.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Calendar size={42} color="var(--text-muted)" style={{ margin: '0 auto 1rem auto', display: 'block' }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              No Pickup Slots Found
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto 1.5rem auto' }}>
              {selectedDateFilter
                ? `No slots configured for ${selectedDateFilter}. Add slots to allow students to schedule in-store pickups.`
                : 'No slots configured. Create slots to organize counter collections.'}
            </p>
            <Button variant="primary" size="sm" leftIcon={Plus} onClick={handleOpenCreateModal}>
              Create First Slot
            </Button>
          </div>
        ) : (
          <div className="table-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DATE</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>TIME WINDOW</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>CAPACITY</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>BOOKED</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>AVAILABLE</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)' }}>STATUS</th>
                  <th style={{ padding: '0.85rem 1.25rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredSlots.map((slot) => {
                  const isFull = slot.booked_count >= slot.capacity;
                  const avail = Math.max(0, slot.capacity - slot.booked_count);
                  const isPast = new Date(`${slot.date}T${slot.end_time}`) < new Date();

                  return (
                    <tr
                      key={slot.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        opacity: !slot.is_active || isPast ? 0.65 : 1,
                        backgroundColor: isFull ? '#fffbeb' : 'transparent',
                      }}
                    >
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {slot.date}
                        {slot.date === todayStr && (
                          <span style={{ marginLeft: '0.4rem', fontSize: '0.725rem', color: 'var(--primary-600)', fontWeight: 700 }}>
                            (Today)
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                          <Clock size={16} color="var(--primary-600)" />
                          {slot.start_time.slice(0, 5)} - {slot.end_time.slice(0, 5)}
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', fontWeight: 700 }}>
                        {slot.capacity}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <Users size={15} color="var(--text-muted)" />
                          <strong>{slot.booked_count}</strong>
                        </div>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        <strong style={{ color: avail === 0 ? 'var(--danger-600)' : 'var(--success-600)' }}>
                          {avail} left
                        </strong>
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem' }}>
                        {!slot.is_active ? (
                          <Badge variant="neutral">Disabled</Badge>
                        ) : isFull ? (
                          <Badge variant="danger">Full Capacity</Badge>
                        ) : isPast ? (
                          <Badge variant="neutral">Past Slot</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      <td style={{ padding: '0.85rem 1.25rem', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            title={slot.is_active ? 'Disable Slot' : 'Enable Slot'}
                            onClick={() => handleToggleActive(slot)}
                          >
                            <Power size={16} color={slot.is_active ? 'var(--success-600)' : 'var(--text-muted)'} />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Edit Capacity & Time"
                            onClick={() => handleOpenEditModal(slot)}
                          >
                            <Edit2 size={16} color="var(--primary-600)" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete Slot"
                            onClick={() => {
                              setSlotToDelete(slot);
                              setDeleteModalOpen(true);
                            }}
                          >
                            <Trash2 size={16} color="var(--danger-600)" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add / Edit Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={modalMode === 'CREATE' ? 'Add Counter Pickup Slot' : `Edit Pickup Slot #${selectedSlot?.id}`}
        >
          <form onSubmit={handleSubmitSlot} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {formError && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                }}
              >
                {formError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Slot Date:
              </label>
              <input
                type="date"
                required
                value={slotDate}
                onChange={(e) => setSlotDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.9rem',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Start Time:
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  End Time:
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem 0.85rem',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Max Student Capacity:
              </label>
              <input
                type="number"
                min={selectedSlot ? selectedSlot.booked_count || 1 : 1}
                max={100}
                required
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.85rem',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.9rem',
                }}
              />
              {selectedSlot && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                  Currently {selectedSlot.booked_count} student(s) booked. Capacity cannot be lower than {selectedSlot.booked_count}.
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <input
                type="checkbox"
                id="is_active_toggle"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <label htmlFor="is_active_toggle" style={{ fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                Slot Active (Visible to students for booking)
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : modalMode === 'CREATE' ? 'Create Slot' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && slotToDelete && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Pickup Slot"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Are you sure you want to delete slot #{slotToDelete.id} on <strong>{slotToDelete.date}</strong> ({slotToDelete.start_time.slice(0, 5)} - {slotToDelete.end_time.slice(0, 5)})?
            </p>

            {slotToDelete.booked_count > 0 ? (
              <div
                style={{
                  padding: '0.85rem 1rem',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 'var(--radius-md)',
                  color: '#991b1b',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                }}
              >
                <ShieldAlert size={20} color="#dc2626" />
                <span>
                  <strong>Warning:</strong> This slot already has <strong>{slotToDelete.booked_count} active booking(s)</strong>.
                  The backend protects student orders and will prevent deletion. Please <strong>disable</strong> the slot instead.
                </span>
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: '0.825rem', color: 'var(--text-muted)' }}>
                This slot has 0 bookings and can be safely deleted.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="ghost" onClick={() => setDeleteModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                style={{ color: 'var(--danger-600)', borderColor: 'var(--danger-300)' }}
                onClick={handleDeleteSlot}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ShopOwnerPickupSlots;
