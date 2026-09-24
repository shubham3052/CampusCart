import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Upload,
  Image as ImageIcon,
  Boxes,
  PackageCheck,
  Tag,
  LayoutGrid,
  List,
  Eye,
  EyeOff,
  X,
  AlertCircle
} from 'lucide-react';
import productService from '../../services/productService';
import categoryService from '../../services/categoryService';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import EmptyState from '../../components/common/EmptyState';
import { Spinner } from '../../components/common/Loader';

const UNIT_CHOICES = [
  { value: 'PIECE', label: 'Piece' },
  { value: 'PACK', label: 'Pack' },
  { value: 'BOX', label: 'Box' },
  { value: 'REAM', label: 'Paper Ream (500 sheets)' },
  { value: 'SET', label: 'Set / Kit' },
];

const ShopOwnerProducts = () => {
  // Data States
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filtering & View Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL | IN_STOCK | LOW_STOCK | OUT_OF_STOCK
  const [activeFilter, setActiveFilter] = useState('ALL'); // ALL | ACTIVE | INACTIVE
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'

  // Add Product Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    category: '',
    price: '',
    initial_stock: '10',
    unit: 'PIECE',
    brand: '',
    description: '',
    is_active: true,
  });
  const [addImageFile, setAddImageFile] = useState(null);
  const [addImagePreview, setAddImagePreview] = useState(null);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState('');
  const addFileInputRef = useRef(null);

  // Edit Product Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    category: '',
    price: '',
    unit: 'PIECE',
    brand: '',
    description: '',
    is_active: true,
  });
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreview, setEditImagePreview] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState('');
  const editFileInputRef = useRef(null);

  // Delete Confirmation State
  const [productToDelete, setProductToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Load Data
  const loadData = async () => {
    try {
      setErrorMessage('');
      const [prodRes, catRes] = await Promise.all([
        productService.getProducts(),
        categoryService.getCategories().catch(() => []),
      ]);
      setProducts(Array.isArray(prodRes) ? prodRes : prodRes.results || []);
      setCategories(Array.isArray(catRes) ? catRes : catRes.results || []);
    } catch (err) {
      console.error('Failed to load products:', err);
      setErrorMessage(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Unable to load product catalogue. Please check your connection.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Metrics Calculations
  const metrics = useMemo(() => {
    const total = products.length;
    const active = products.filter((p) => p.is_active).length;
    const outOfStock = products.filter((p) => (p.current_stock ?? 0) === 0).length;
    const lowStock = products.filter(
      (p) => (p.current_stock ?? 0) > 0 && (p.current_stock ?? 0) <= 10
    ).length;
    const inStock = products.filter((p) => (p.current_stock ?? 0) > 0).length;

    return { total, active, outOfStock, lowStock, inStock };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((prod) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = prod.name?.toLowerCase().includes(q);
        const matchesSku = prod.sku?.toLowerCase().includes(q);
        const matchesBrand = prod.brand?.toLowerCase().includes(q);
        const matchesDesc = prod.description?.toLowerCase().includes(q);
        if (!matchesName && !matchesSku && !matchesBrand && !matchesDesc) {
          return false;
        }
      }

      // Category filter
      if (selectedCategory !== 'ALL') {
        const catId = typeof prod.category === 'object' ? prod.category?.id : prod.category;
        if (String(catId) !== String(selectedCategory)) {
          return false;
        }
      }

      // Stock status filter
      if (stockFilter === 'IN_STOCK' && (prod.current_stock ?? 0) <= 0) return false;
      if (
        stockFilter === 'LOW_STOCK' &&
        ((prod.current_stock ?? 0) === 0 || (prod.current_stock ?? 0) > 10)
      )
        return false;
      if (stockFilter === 'OUT_OF_STOCK' && (prod.current_stock ?? 0) > 0) return false;

      // Active status filter
      if (activeFilter === 'ACTIVE' && !prod.is_active) return false;
      if (activeFilter === 'INACTIVE' && prod.is_active) return false;

      return true;
    });
  }, [products, searchQuery, selectedCategory, stockFilter, activeFilter]);

  // Image validation helper
  const validateImageFile = (file) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return 'Please upload a valid image file (JPEG, PNG, WEBP, or GIF).';
    }
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return 'Image file size must be less than 5 MB.';
    }
    return null;
  };

  // ==========================================
  // ADD PRODUCT HANDLERS
  // ==========================================
  const handleOpenAddModal = () => {
    setAddForm({
      name: '',
      category: categories.length > 0 ? categories[0].id : '',
      price: '',
      initial_stock: '10',
      unit: 'PIECE',
      brand: '',
      description: '',
      is_active: true,
    });
    setAddImageFile(null);
    setAddImagePreview(null);
    setAddError('');
    setShowAddModal(true);
  };

  const handleAddImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setAddError(error);
      return;
    }

    setAddError('');
    setAddImageFile(file);
    setAddImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveAddImage = () => {
    setAddImageFile(null);
    if (addImagePreview) {
      URL.revokeObjectURL(addImagePreview);
      setAddImagePreview(null);
    }
    if (addFileInputRef.current) {
      addFileInputRef.current.value = '';
    }
  };

  const handleCreateProduct = async (e) => {
    e.preventDefault();
    setAddError('');

    // Validation
    if (!addForm.name.trim() || addForm.name.trim().length < 2) {
      setAddError('Product name must be at least 2 characters long.');
      return;
    }
    if (!addForm.category) {
      setAddError('Please select a product category.');
      return;
    }
    const numPrice = parseFloat(addForm.price);
    if (isNaN(numPrice) || numPrice < 0) {
      setAddError('Please enter a valid price (greater than or equal to 0).');
      return;
    }

    const numStock = parseInt(addForm.initial_stock, 10);
    if (isNaN(numStock) || numStock < 0) {
      setAddError('Please enter a valid initial stock count (0 or higher).');
      return;
    }

    setAddSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('name', addForm.name.trim());
      formData.append('category', addForm.category);
      formData.append('price', numPrice.toFixed(2));
      formData.append('initial_stock', numStock);
      formData.append('unit', addForm.unit);
      if (addForm.brand.trim()) formData.append('brand', addForm.brand.trim());
      if (addForm.description.trim()) formData.append('description', addForm.description.trim());
      formData.append('is_active', addForm.is_active ? 'true' : 'false');

      if (addImageFile) {
        formData.append('image', addImageFile);
      }

      await productService.createProduct(formData);
      setSuccessMessage(`Product "${addForm.name.trim()}" added successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setShowAddModal(false);
      handleRemoveAddImage();
      loadData();
    } catch (err) {
      console.error('Failed to create product:', err);
      const resData = err.response?.data;
      let msg = 'Failed to create product. Please verify all inputs.';
      if (typeof resData === 'string') {
        msg = resData;
      } else if (resData?.detail) {
        msg = resData.detail;
      } else if (resData && typeof resData === 'object') {
        const firstKey = Object.keys(resData)[0];
        const val = resData[firstKey];
        msg = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
      }
      setAddError(msg);
    } finally {
      setAddSubmitting(false);
    }
  };

  // ==========================================
  // EDIT PRODUCT HANDLERS
  // ==========================================
  const handleOpenEditModal = (product) => {
    setEditingProduct(product);
    const catId = typeof product.category === 'object' ? product.category?.id : product.category;
    setEditForm({
      name: product.name || '',
      category: catId || '',
      price: product.price || '',
      unit: product.unit || 'PIECE',
      brand: product.brand || '',
      description: product.description || '',
      is_active: Boolean(product.is_active),
    });
    setEditImageFile(null);
    setEditImagePreview(null);
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const error = validateImageFile(file);
    if (error) {
      setEditError(error);
      return;
    }

    setEditError('');
    setEditImageFile(file);
    setEditImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveEditImage = () => {
    setEditImageFile(null);
    if (editImagePreview) {
      URL.revokeObjectURL(editImagePreview);
      setEditImagePreview(null);
    }
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const handleUpdateProduct = async (e) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditError('');

    if (!editForm.name.trim() || editForm.name.trim().length < 2) {
      setEditError('Product name must be at least 2 characters long.');
      return;
    }
    if (!editForm.category) {
      setEditError('Please select a category.');
      return;
    }
    const numPrice = parseFloat(editForm.price);
    if (isNaN(numPrice) || numPrice < 0) {
      setEditError('Please enter a valid price (greater than or equal to 0).');
      return;
    }

    setEditSubmitting(true);

    try {
      const formData = new FormData();
      formData.append('name', editForm.name.trim());
      formData.append('category', editForm.category);
      formData.append('price', numPrice.toFixed(2));
      formData.append('unit', editForm.unit);
      formData.append('brand', editForm.brand.trim());
      formData.append('description', editForm.description.trim());
      formData.append('is_active', editForm.is_active ? 'true' : 'false');

      if (editImageFile) {
        formData.append('image', editImageFile);
      }

      await productService.updateProduct(editingProduct.id, formData);
      setSuccessMessage(`Product "${editForm.name.trim()}" updated successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setShowEditModal(false);
      handleRemoveEditImage();
      loadData();
    } catch (err) {
      console.error('Failed to update product:', err);
      const resData = err.response?.data;
      let msg = 'Failed to update product.';
      if (typeof resData === 'string') {
        msg = resData;
      } else if (resData?.detail) {
        msg = resData.detail;
      } else if (resData && typeof resData === 'object') {
        const firstKey = Object.keys(resData)[0];
        const val = resData[firstKey];
        msg = Array.isArray(val) ? `${firstKey}: ${val[0]}` : `${firstKey}: ${val}`;
      }
      setEditError(msg);
    } finally {
      setEditSubmitting(false);
    }
  };

  // ==========================================
  // DELETE / DEACTIVATE HANDLER
  // ==========================================
  const handleConfirmDelete = async () => {
    if (!productToDelete) return;
    setDeleteLoading(true);

    try {
      await productService.deleteProduct(productToDelete.id);
      setSuccessMessage(`Product "${productToDelete.name}" removed successfully.`);
      setTimeout(() => setSuccessMessage(''), 4000);
      setProductToDelete(null);
      loadData();
    } catch (err) {
      console.error('Failed to delete product:', err);
      setErrorMessage(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Failed to remove product. Please try again.'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  // Helper for Stock Status Badge
  const renderStockBadge = (stock) => {
    const qty = stock ?? 0;
    if (qty <= 0) {
      return <Badge variant="danger" size="sm">Out of Stock (0)</Badge>;
    }
    if (qty <= 10) {
      return <Badge variant="warning" size="sm">Low Stock ({qty})</Badge>;
    }
    return <Badge variant="success" size="sm">In Stock ({qty})</Badge>;
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '3rem' }}>
      {/* Page Header */}
      <PageHeader
        title="Product Catalogue"
        subtitle="Manage your shop stationery catalogue, pricing, initial inventory, and student visibility."
        actions={
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={handleRefresh}
              isLoading={refreshing}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={handleOpenAddModal}
            >
              + Add Product
            </Button>
          </div>
        }
      />

      {/* Global Alerts */}
      {successMessage && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.9rem 1.25rem',
            backgroundColor: 'var(--success-50, #ecfdf5)',
            border: '1px solid var(--success-200, #a7f3d0)',
            color: 'var(--success-700, #047857)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: '0.925rem',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={20} />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          className="animate-fade-in"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.9rem 1.25rem',
            backgroundColor: 'var(--danger-50, #fef2f2)',
            border: '1px solid var(--danger-200, #fecaca)',
            color: 'var(--danger-700, #b91c1c)',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.25rem',
            fontSize: '0.925rem',
            fontWeight: 500,
          }}
        >
          <AlertCircle size={20} />
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage('')}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
          marginBottom: '1.75rem',
        }}
      >
        <StatCard
          title="Total Products"
          value={metrics.total}
          icon={Boxes}
          color="primary"
          subtitle="Listed in catalog"
        />
        <StatCard
          title="Active in Store"
          value={metrics.active}
          icon={CheckCircle2}
          color="success"
          subtitle="Visible to students"
        />
        <StatCard
          title="In Stock Items"
          value={metrics.inStock}
          icon={PackageCheck}
          color="info"
          subtitle="Ready for order"
        />
        <StatCard
          title="Low / Out of Stock"
          value={metrics.lowStock + metrics.outOfStock}
          icon={AlertTriangle}
          color={metrics.lowStock + metrics.outOfStock > 0 ? 'warning' : 'success'}
          subtitle={`${metrics.outOfStock} out, ${metrics.lowStock} low`}
        />
      </div>

      {/* Controls & Filter Bar */}
      <Card style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          {/* Search Box */}
          <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '0.85rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Search product, SKU, or brand..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input"
              style={{ paddingLeft: '2.5rem', width: '100%' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '0.75rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Filters & Mode Toggle */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input"
              style={{ width: 'auto', minWidth: '150px' }}
            >
              <option value="ALL">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Stock Filter */}
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="input"
              style={{ width: 'auto', minWidth: '140px' }}
            >
              <option value="ALL">All Stock Levels</option>
              <option value="IN_STOCK">In Stock</option>
              <option value="LOW_STOCK">Low Stock (≤10)</option>
              <option value="OUT_OF_STOCK">Out of Stock (0)</option>
            </select>

            {/* Active Status Filter */}
            <select
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              className="input"
              style={{ width: 'auto', minWidth: '130px' }}
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            {/* View Mode Toggle */}
            <div
              style={{
                display: 'flex',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Grid View"
                style={{
                  padding: '0.45rem 0.65rem',
                  background: viewMode === 'grid' ? 'var(--primary-50)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--primary-600)' : 'var(--text-muted)',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <LayoutGrid size={18} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Table View"
                style={{
                  padding: '0.45rem 0.65rem',
                  background: viewMode === 'table' ? 'var(--primary-50)' : 'transparent',
                  color: viewMode === 'table' ? 'var(--primary-600)' : 'var(--text-muted)',
                  border: 'none',
                  borderLeft: '1px solid var(--border-light)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <List size={18} />
              </button>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Content Area */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Spinner size="lg" message="Loading product catalog..." />
        </div>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products found"
          description={
            products.length === 0
              ? 'You have not added any stationery products yet. Click "+ Add Product" to get started.'
              : 'No products match the selected filters or search query.'
          }
          actionLabel={products.length === 0 ? '+ Add Product' : 'Reset Filters'}
          onAction={
            products.length === 0
              ? handleOpenAddModal
              : () => {
                  setSearchQuery('');
                  setSelectedCategory('ALL');
                  setStockFilter('ALL');
                  setActiveFilter('ALL');
                }
          }
        />
      ) : viewMode === 'grid' ? (
        /* ======================================================== */
        /* GRID VIEW                                                */
        /* ======================================================== */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1.25rem',
          }}
        >
          {filteredProducts.map((prod) => {
            const categoryName = prod.category_details?.name || 'Stationery';
            const price = parseFloat(prod.price || 0).toFixed(2);
            const stock = prod.current_stock ?? 0;

            return (
              <Card
                key={prod.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  height: '100%',
                  overflow: 'hidden',
                  position: 'relative',
                  border: !prod.is_active ? '1px dashed var(--border-color)' : undefined,
                  opacity: !prod.is_active ? 0.78 : 1,
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                {/* Top image box */}
                <div
                  style={{
                    height: '170px',
                    width: '100%',
                    backgroundColor: 'var(--bg-subtle, #f8fafc)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    borderBottom: '1px solid var(--border-light)',
                    overflow: 'hidden',
                  }}
                >
                  {prod.image ? (
                    <img
                      src={prod.image}
                      alt={prod.name}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        padding: '0.75rem',
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        color: 'var(--text-muted)',
                        gap: '0.35rem',
                      }}
                    >
                      <Package size={44} color="var(--primary-400)" />
                      <span style={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        {prod.brand || 'No Image'}
                      </span>
                    </div>
                  )}

                  {/* Stock Badge overlay */}
                  <div style={{ position: 'absolute', top: '0.65rem', right: '0.65rem' }}>
                    {renderStockBadge(stock)}
                  </div>

                  {/* Active/Inactive badge overlay */}
                  <div style={{ position: 'absolute', top: '0.65rem', left: '0.65rem' }}>
                    <Badge variant={prod.is_active ? 'success' : 'neutral'} size="sm">
                      {prod.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {/* Card Content */}
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flex: 1 }}>
                  {/* Category & Brand */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.35rem',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--primary-600)' }}>
                      {categoryName}
                    </span>
                    {prod.brand && <span>{prod.brand}</span>}
                  </div>

                  {/* Product Title */}
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      lineHeight: 1.35,
                      marginBottom: '0.35rem',
                    }}
                  >
                    {prod.name}
                  </h3>

                  {/* SKU & Unit */}
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.75rem',
                      display: 'flex',
                      gap: '0.75rem',
                    }}
                  >
                    {prod.sku && <span>SKU: {prod.sku}</span>}
                    <span>Unit: {prod.unit_display || prod.unit || 'Piece'}</span>
                  </div>

                  {/* Description preview */}
                  {prod.description && (
                    <p
                      style={{
                        fontSize: '0.825rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.4,
                        marginBottom: '1rem',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {prod.description}
                    </p>
                  )}

                  {/* Price & Action Footer */}
                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '0.85rem',
                      borderTop: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Price</span>
                      <div
                        style={{
                          fontSize: '1.2rem',
                          fontWeight: 800,
                          color: 'var(--primary-700)',
                        }}
                      >
                        ₹{price}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.45rem' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Edit2}
                        onClick={() => handleOpenEditModal(prod)}
                        title="Edit Product"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={Trash2}
                        onClick={() => setProductToDelete(prod)}
                        title="Delete or Deactivate Product"
                        style={{ color: 'var(--danger-600)' }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* ======================================================== */
        /* TABLE VIEW                                               */
        /* ======================================================== */
        <Card style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--bg-subtle, #f8fafc)',
                    borderBottom: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  <th style={{ padding: '0.85rem 1rem' }}>Product</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Category</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Price</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Stock</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Visibility</th>
                  <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((prod) => {
                  const categoryName = prod.category_details?.name || 'Stationery';
                  const price = parseFloat(prod.price || 0).toFixed(2);
                  const stock = prod.current_stock ?? 0;

                  return (
                    <tr
                      key={prod.id}
                      style={{
                        borderBottom: '1px solid var(--border-light)',
                        backgroundColor: !prod.is_active ? 'var(--bg-subtle)' : 'transparent',
                        opacity: !prod.is_active ? 0.78 : 1,
                      }}
                    >
                      {/* Product Name & Thumbnail */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                          <div
                            style={{
                              width: '46px',
                              height: '46px',
                              borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'var(--bg-subtle)',
                              border: '1px solid var(--border-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            {prod.image ? (
                              <img
                                src={prod.image}
                                alt={prod.name}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : (
                              <Package size={22} color="var(--primary-400)" />
                            )}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                              {prod.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              {prod.sku && <span>SKU: {prod.sku} • </span>}
                              <span>{prod.brand || 'Stationery'}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <Badge variant="primary" size="sm">
                          {categoryName}
                        </Badge>
                      </td>

                      {/* Price */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span style={{ fontWeight: 700, color: 'var(--primary-700)' }}>
                          ₹{price}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                          / {prod.unit_display || prod.unit || 'Piece'}
                        </span>
                      </td>

                      {/* Stock Status */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        {renderStockBadge(stock)}
                      </td>

                      {/* Visibility */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <Badge variant={prod.is_active ? 'success' : 'neutral'} size="sm">
                          {prod.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '0.45rem' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Edit2}
                            onClick={() => handleOpenEditModal(prod)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={Trash2}
                            onClick={() => setProductToDelete(prod)}
                            style={{ color: 'var(--danger-600)' }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ======================================================== */}
      {/* ADD PRODUCT MODAL                                        */}
      {/* ======================================================== */}
      <Modal
        isOpen={showAddModal}
        onClose={() => !addSubmitting && setShowAddModal(false)}
        title="Add New Stationery Product"
        maxWidth="620px"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddModal(false)}
              disabled={addSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateProduct}
              isLoading={addSubmitting}
            >
              Create Product
            </Button>
          </>
        }
      >
        <form onSubmit={handleCreateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {addError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--danger-50, #fef2f2)',
                border: '1px solid var(--danger-200, #fecaca)',
                color: 'var(--danger-700, #b91c1c)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}
            >
              <AlertCircle size={18} />
              <span>{addError}</span>
            </div>
          )}

          {/* Product Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Product Name <span style={{ color: 'var(--danger-500)' }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g., Classmate A4 Ruled Notebook (240 Pages)"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              required
            />
          </div>

          {/* Row: Category & Brand */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Category <span style={{ color: 'var(--danger-500)' }}>*</span>
              </label>
              <select
                className="input"
                value={addForm.category}
                onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                required
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Brand / Manufacturer
              </label>
              <input
                type="text"
                className="input"
                placeholder="e.g., Doms, Camlin, Reynolds"
                value={addForm.brand}
                onChange={(e) => setAddForm({ ...addForm, brand: e.target.value })}
              />
            </div>
          </div>

          {/* Row: Price, Initial Stock, Unit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Price (₹) <span style={{ color: 'var(--danger-500)' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                placeholder="0.00"
                value={addForm.price}
                onChange={(e) => setAddForm({ ...addForm, price: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Initial Stock Units <span style={{ color: 'var(--danger-500)' }}>*</span>
              </label>
              <input
                type="number"
                min="0"
                className="input"
                placeholder="10"
                value={addForm.initial_stock}
                onChange={(e) => setAddForm({ ...addForm, initial_stock: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Unit of Sale
              </label>
              <select
                className="input"
                value={addForm.unit}
                onChange={(e) => setAddForm({ ...addForm, unit: e.target.value })}
              >
                {UNIT_CHOICES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Image Upload */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Product Image
            </label>
            <input
              type="file"
              ref={addFileInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleAddImageChange}
            />

            {addImagePreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-subtle)',
                }}
              >
                <img
                  src={addImagePreview}
                  alt="Preview"
                  style={{
                    width: '64px',
                    height: '64px',
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#fff',
                    border: '1px solid var(--border-light)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {addImageFile?.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(addImageFile?.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => addFileInputRef.current?.click()}
                >
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveAddImage}
                  style={{ color: 'var(--danger-600)' }}
                >
                  <X size={18} />
                </Button>
              </div>
            ) : (
              <div
                onClick={() => addFileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.5rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-subtle)',
                  transition: 'border-color 0.2s ease',
                }}
              >
                <Upload size={28} color="var(--primary-500)" style={{ margin: '0 auto 0.5rem' }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Click to select product image
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                  PNG, JPEG, WEBP or GIF up to 5MB
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Description / Specifications
            </label>
            <textarea
              className="input"
              rows={3}
              placeholder="Provide details about size, page count, binding, compatibility, or intended academic use..."
              value={addForm.description}
              onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
            />
          </div>

          {/* Active Status Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <input
              type="checkbox"
              id="add_is_active"
              checked={addForm.is_active}
              onChange={(e) => setAddForm({ ...addForm, is_active: e.target.checked })}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label
              htmlFor="add_is_active"
              style={{ fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}
            >
              Make product immediately visible and active in student store
            </label>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* EDIT PRODUCT MODAL                                       */}
      {/* ======================================================== */}
      <Modal
        isOpen={showEditModal}
        onClose={() => !editSubmitting && setShowEditModal(false)}
        title={`Edit "${editingProduct?.name || 'Product'}"`}
        maxWidth="620px"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEditModal(false)}
              disabled={editSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleUpdateProduct}
              isLoading={editSubmitting}
            >
              Save Changes
            </Button>
          </>
        }
      >
        <form onSubmit={handleUpdateProduct} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {editError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                padding: '0.75rem 1rem',
                backgroundColor: 'var(--danger-50, #fef2f2)',
                border: '1px solid var(--danger-200, #fecaca)',
                color: 'var(--danger-700, #b91c1c)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
              }}
            >
              <AlertCircle size={18} />
              <span>{editError}</span>
            </div>
          )}

          {/* Read-only Live Stock Info Notice */}
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: 'var(--info-50, #eff6ff)',
              border: '1px solid var(--info-200, #bfdbfe)',
              color: 'var(--info-800, #1e40af)',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <strong>Current Physical Stock:</strong> {editingProduct?.current_stock ?? 0} units
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--info-600)' }}>
              (Audit stock in Inventory tab)
            </span>
          </div>

          {/* Product Name */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Product Name <span style={{ color: 'var(--danger-500)' }}>*</span>
            </label>
            <input
              type="text"
              className="input"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
          </div>

          {/* Row: Category & Brand */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Category <span style={{ color: 'var(--danger-500)' }}>*</span>
              </label>
              <select
                className="input"
                value={editForm.category}
                onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                required
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Brand / Manufacturer
              </label>
              <input
                type="text"
                className="input"
                value={editForm.brand}
                onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
              />
            </div>
          </div>

          {/* Row: Price & Unit */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Price (₹) <span style={{ color: 'var(--danger-500)' }}>*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input"
                value={editForm.price}
                onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                Unit of Sale
              </label>
              <select
                className="input"
                value={editForm.unit}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
              >
                {UNIT_CHOICES.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Product Image Replacement */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Product Image
            </label>
            <input
              type="file"
              ref={editFileInputRef}
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: 'none' }}
              onChange={handleEditImageChange}
            />

            {editImagePreview ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-subtle)',
                }}
              >
                <img
                  src={editImagePreview}
                  alt="New Preview"
                  style={{
                    width: '64px',
                    height: '64px',
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#fff',
                    border: '1px solid var(--border-light)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {editImageFile?.name} (New upload)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {(editImageFile?.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => editFileInputRef.current?.click()}
                >
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveEditImage}
                  style={{ color: 'var(--danger-600)' }}
                >
                  <X size={18} />
                </Button>
              </div>
            ) : editingProduct?.image ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-subtle)',
                }}
              >
                <img
                  src={editingProduct.image}
                  alt={editingProduct.name}
                  style={{
                    width: '64px',
                    height: '64px',
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: '#fff',
                    border: '1px solid var(--border-light)',
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Current product photo
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Click Replace to select a new image
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => editFileInputRef.current?.click()}
                >
                  Replace Photo
                </Button>
              </div>
            ) : (
              <div
                onClick={() => editFileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-light)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.25rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'var(--bg-subtle)',
                }}
              >
                <Upload size={24} color="var(--primary-500)" style={{ margin: '0 auto 0.35rem' }} />
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Upload product photo
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  PNG, JPEG, WEBP or GIF up to 5MB
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
              Description
            </label>
            <textarea
              className="input"
              rows={3}
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
            />
          </div>

          {/* Active Status Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <input
              type="checkbox"
              id="edit_is_active"
              checked={editForm.is_active}
              onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
              style={{ width: '16px', height: '16px', cursor: 'pointer' }}
            />
            <label
              htmlFor="edit_is_active"
              style={{ fontSize: '0.875rem', color: 'var(--text-primary)', cursor: 'pointer', userSelect: 'none' }}
            >
              Product is active and visible in the student store
            </label>
          </div>
        </form>
      </Modal>

      {/* ======================================================== */}
      {/* DELETE / DEACTIVATE CONFIRMATION DIALOG                  */}
      {/* ======================================================== */}
      <ConfirmDialog
        isOpen={Boolean(productToDelete)}
        onClose={() => !deleteLoading && setProductToDelete(null)}
        onConfirm={handleConfirmDelete}
        title="Remove Product"
        message={`Are you sure you want to remove "${productToDelete?.name}"? If this product has historical student orders, it will be safely deactivated to preserve past order records.`}
        confirmText="Remove Product"
        cancelText="Cancel"
        isDanger={true}
        isLoading={deleteLoading}
      />
    </div>
  );
};

export default ShopOwnerProducts;
