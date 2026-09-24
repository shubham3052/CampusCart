import React, { useState, useEffect } from 'react';
import {
  Layers,
  Search,
  Plus,
  Edit2,
  Trash2,
  Power,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Package,
  FileText,
} from 'lucide-react';
import categoryService from '../../services/categoryService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Create / Edit Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    description: '',
    is_active: true,
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete Confirmation Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await categoryService.getCategories();
      setCategories(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load categories:', err);
      setError('Unable to load stationery categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreateModal = () => {
    setEditingCategory(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      is_active: true,
    });
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (cat) => {
    setEditingCategory(cat);
    setFormData({
      name: cat.name,
      slug: cat.slug || '',
      description: cat.description || '',
      is_active: cat.is_active,
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleNameChange = (val) => {
    const slugBase = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    setFormData((prev) => ({
      ...prev,
      name: val,
      // Auto-update slug only if creating or slug wasn't customized
      slug: editingCategory ? prev.slug : slugBase,
    }));
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.name.trim()) {
      setFormError('Category name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        is_active: formData.is_active,
      };
      if (formData.slug.trim()) {
        payload.slug = formData.slug.trim().toLowerCase();
      }

      if (editingCategory) {
        await categoryService.updateCategory(editingCategory.id, payload);
        setToastMsg(`Category "${payload.name}" updated successfully.`);
      } else {
        await categoryService.createCategory(payload);
        setToastMsg(`Category "${payload.name}" created successfully.`);
      }

      setTimeout(() => setToastMsg(''), 4000);
      setModalOpen(false);
      loadCategories();
    } catch (err) {
      console.error('Failed to save category:', err);
      const resData = err.response?.data;
      if (resData?.name) {
        setFormError(`Name error: ${resData.name.join(' ')}`);
      } else if (resData?.slug) {
        setFormError(`Slug error: ${resData.slug.join(' ')}`);
      } else if (resData?.detail) {
        setFormError(resData.detail);
      } else {
        setFormError('Failed to save category. Please check your inputs.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat) => {
    try {
      const newStatus = !cat.is_active;
      await categoryService.updateCategory(cat.id, { is_active: newStatus });
      setCategories((prev) =>
        prev.map((c) => (c.id === cat.id ? { ...c, is_active: newStatus } : c))
      );
      setToastMsg(`Category "${cat.name}" is now ${newStatus ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setToastMsg(''), 3500);
    } catch (err) {
      console.error('Failed to toggle status:', err);
      alert('Unable to change category active status.');
    }
  };

  const openDeleteModal = (cat) => {
    setCategoryToDelete(cat);
    setDeleteError('');
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!categoryToDelete) return;
    setDeleting(true);
    setDeleteError('');

    try {
      await categoryService.deleteCategory(categoryToDelete.id);
      setToastMsg(`Category "${categoryToDelete.name}" deleted successfully.`);
      setTimeout(() => setToastMsg(''), 4000);
      setDeleteModalOpen(false);
      setCategoryToDelete(null);
      loadCategories();
    } catch (err) {
      console.error('Delete category error:', err);
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 500 || status === 400 || (typeof data === 'string' && data.includes('ProtectedError'))) {
        setDeleteError(
          `Cannot delete "${categoryToDelete.name}" because products are linked to it. Please deactivate the category instead to hide it.`
        );
      } else {
        setDeleteError(data?.detail || data?.error || 'Failed to delete category.');
      }
    } finally {
      setDeleting(false);
    }
  };

  const filteredCategories = categories.filter((c) => {
    if (statusFilter === 'ACTIVE' && !c.is_active) return false;
    if (statusFilter === 'INACTIVE' && c.is_active) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchSlug = (c.slug || '').toLowerCase().includes(q);
      const matchDesc = (c.description || '').toLowerCase().includes(q);
      return matchName || matchSlug || matchDesc;
    }
    return true;
  });

  const totalProducts = categories.reduce((sum, c) => sum + (c.product_count || 0), 0);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Category Taxonomy Management"
          subtitle="Configure stationery and printing categories across the campus ecosystem"
        />
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Button variant="outline" size="sm" onClick={loadCategories} icon={RefreshCw}>
            Refresh
          </Button>
          <Button variant="primary" size="sm" onClick={openCreateModal} icon={Plus}>
            Add Category
          </Button>
        </div>
      </div>

      {toastMsg && (
        <div style={{ padding: '0.75rem 1rem', background: '#ecfdf5', color: '#065f46', borderRadius: '8px', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{toastMsg}</span>
        </div>
      )}

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary-50, #eff6ff)', borderRadius: '10px', color: 'var(--primary-600, #2563eb)' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Total Categories</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{categories.length}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '10px', color: '#059669' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Active Categories</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>
              {categories.filter((c) => c.is_active).length}
            </div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: 'var(--primary-50, #eff6ff)', borderRadius: '10px', color: 'var(--primary-600, #2563eb)' }}>
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Linked Products</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{totalProducts}</div>
          </div>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card padding="1rem">
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 260px' }}>
            <Input
              type="text"
              placeholder="Search category by name, slug, keywords..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              leftIcon={Search}
            />
          </div>
          <div style={{ minWidth: '160px' }}>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #e5e7eb)',
                background: 'var(--bg-primary, #fff)',
                color: 'var(--text-primary, #111827)',
                fontSize: '0.875rem',
              }}
            >
              <option value="ALL">All Categories</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Category Table */}
      <Card padding="0">
        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" message="Loading categories..." />
          </div>
        ) : filteredCategories.length === 0 ? (
          <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
            <div style={{ margin: '0 auto 1rem', width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-secondary, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #9ca3af)' }}>
              <Layers size={24} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
              No Categories Found
            </h3>
            <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.875rem' }}>
              No categories match your criteria. You can create a new category using the button above.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Category Name</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Slug</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Description</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Products</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Status</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((c) => (
                  <tr
                    key={c.id}
                    style={{ borderBottom: '1px solid var(--border-color, #f3f4f6)', transition: 'background-color 0.15s ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'var(--primary-50, #eff6ff)', color: 'var(--primary-600, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Layers size={18} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)' }}>
                      {c.slug}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary, #4b5563)', maxWidth: '300px' }}>
                      <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {c.description || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary, #f3f4f6)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary, #111827)' }}>
                        {c.product_count || 0} items
                      </span>
                    </td>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <Badge variant={c.is_active ? 'success' : 'danger'}>
                        {c.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(c)}
                          title={c.is_active ? 'Deactivate Category' : 'Activate Category'}
                        >
                          <Power size={15} color={c.is_active ? '#dc2626' : '#059669'} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditModal(c)}
                          title="Edit Category"
                        >
                          <Edit2 size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openDeleteModal(c)}
                          style={{ color: '#dc2626' }}
                          title="Delete Category"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create / Edit Category Modal */}
      {modalOpen && (
        <Modal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editingCategory ? 'Edit Category' : 'Create New Category'}
          size="md"
        >
          <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {formError && (
              <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '0.875rem' }}>
                {formError}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                Category Name *
              </label>
              <Input
                type="text"
                placeholder="e.g. Drafting Tools & Instruments"
                value={formData.name}
                onChange={(e) => handleNameChange(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                URL Slug
              </label>
              <Input
                type="text"
                placeholder="drafting-tools-and-instruments"
                value={formData.slug}
                onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', marginTop: '0.25rem', display: 'block' }}>
                Leave as auto-generated or customize identifier.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Brief summary of stationery products categorized under this heading..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '0.625rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                  fontFamily: 'inherit',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                id="is_active_check"
                checked={formData.is_active}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
              />
              <label htmlFor="is_active_check" style={{ fontSize: '0.875rem', color: 'var(--text-primary, #111827)', cursor: 'pointer', fontWeight: 500 }}>
                Active in storefront and navigation filters
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingCategory ? 'Update Category' : 'Create Category'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && categoryToDelete && (
        <Modal
          isOpen={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          title="Delete Category"
          size="sm"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#dc2626' }}>
              <AlertTriangle size={24} />
              <div style={{ fontWeight: 600, fontSize: '1rem' }}>Are you sure?</div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #4b5563)', margin: 0, lineHeight: 1.5 }}>
              Are you sure you want to permanently delete category <strong>"{categoryToDelete.name}"</strong>?
              If products belong to this category, deletion will be blocked to preserve product catalog integrity.
            </p>

            {deleteError && (
              <div style={{ padding: '0.75rem', background: '#fef2f2', color: '#dc2626', borderRadius: '6px', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                {deleteError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={() => setDeleteModalOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete Category'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminCategories;
