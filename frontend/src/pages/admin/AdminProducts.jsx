import React, { useState, useEffect } from 'react';
import {
  Package,
  Search,
  Filter,
  Eye,
  RefreshCw,
  Power,
  Store,
  Layers,
  Tag,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Building2,
  DollarSign,
  Boxes,
} from 'lucide-react';
import productService from '../../services/productService';
import categoryService from '../../services/categoryService';
import shopService from '../../services/shopService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const AdminProducts = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toastMsg, setToastMsg] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedShop, setSelectedShop] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL');

  // Detail Modal
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Load filter options
  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const [catsData, shopsData] = await Promise.all([
          categoryService.getCategories(),
          shopService.getShops(),
        ]);
        setCategories(Array.isArray(catsData) ? catsData : catsData.results || []);
        setShops(Array.isArray(shopsData) ? shopsData : shopsData.results || []);
      } catch (err) {
        console.error('Failed to load filter metadata:', err);
      }
    };
    fetchMetadata();
  }, []);

  const loadProducts = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (selectedCategory) params.category = selectedCategory;
      if (selectedShop) params.shop = selectedShop;
      if (statusFilter === 'ACTIVE') params.is_active = 'true';
      if (statusFilter === 'INACTIVE') params.is_active = 'false';
      if (stockFilter === 'IN_STOCK') params.in_stock = 'true';
      if (stockFilter === 'OUT_OF_STOCK') params.in_stock = 'false';

      const data = await productService.getProducts(params);
      setProducts(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load products:', err);
      setError('Unable to load master products catalog.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [selectedCategory, selectedShop, statusFilter, stockFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadProducts();
  };

  const handleToggleActive = async (product) => {
    try {
      setActionLoading(true);
      const updatedStatus = !product.is_active;
      await productService.updateProduct(product.id, { is_active: updatedStatus });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, is_active: updatedStatus } : p))
      );
      if (selectedProduct && selectedProduct.id === product.id) {
        setSelectedProduct((prev) => ({ ...prev, is_active: updatedStatus }));
      }
      setToastMsg(`Product "${product.name}" is now ${updatedStatus ? 'Active' : 'Inactive'}.`);
      setTimeout(() => setToastMsg(''), 3500);
    } catch (err) {
      console.error('Failed to toggle product status:', err);
      alert('Failed to update product status.');
    } finally {
      setActionLoading(false);
    }
  };

  const openDetails = (product) => {
    setSelectedProduct(product);
    setDetailModalOpen(true);
  };

  const activeCount = products.filter((p) => p.is_active).length;
  const inactiveCount = products.length - activeCount;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <PageHeader
          title="Master Product Catalog"
          subtitle="Campus-wide directory of stationery, notebooks, textbooks, drawing tools, and exam essentials"
        />
        <Button variant="outline" size="sm" onClick={loadProducts} icon={RefreshCw}>
          Refresh
        </Button>
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
            <Package size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Total Products</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary, #111827)' }}>{products.length}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#ecfdf5', borderRadius: '10px', color: '#059669' }}>
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Active Listings</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669' }}>{activeCount}</div>
          </div>
        </Card>

        <Card style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', background: '#fef2f2', borderRadius: '10px', color: '#dc2626' }}>
            <XCircle size={24} />
          </div>
          <div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #6b7280)', fontWeight: 500 }}>Inactive / Hidden</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626' }}>{inactiveCount}</div>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card padding="1.25rem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 280px', display: 'flex', gap: '0.5rem' }}>
              <div style={{ flex: 1 }}>
                <Input
                  type="text"
                  placeholder="Search products by name, brand, SKU..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  leftIcon={Search}
                />
              </div>
              <Button type="submit" variant="primary">
                Search
              </Button>
            </form>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: '2 1 400px' }}>
              {/* Category Filter */}
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* Shop Filter */}
              <select
                value={selectedShop}
                onChange={(e) => setSelectedShop(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '150px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="">All Campus Shops</option>
                {shops.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Only</option>
                <option value="INACTIVE">Inactive Only</option>
              </select>

              {/* Stock Filter */}
              <select
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color, #e5e7eb)',
                  background: 'var(--bg-primary, #fff)',
                  color: 'var(--text-primary, #111827)',
                  fontSize: '0.875rem',
                }}
              >
                <option value="ALL">All Inventory</option>
                <option value="IN_STOCK">In Stock</option>
                <option value="OUT_OF_STOCK">Out of Stock</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Product List Table / Grid */}
      <Card padding="0">
        {loading ? (
          <div style={{ padding: '4rem', display: 'flex', justifyContent: 'center' }}>
            <Spinner size="lg" message="Loading global product directory..." />
          </div>
        ) : products.length === 0 ? (
          <div style={{ padding: '4rem 1rem', textAlign: 'center' }}>
            <div style={{ margin: '0 auto 1rem', width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-secondary, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #9ca3af)' }}>
              <Package size={24} />
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text-primary, #111827)', marginBottom: '0.5rem' }}>
              No Products Found
            </h3>
            <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: '0.875rem', maxWidth: '400px', margin: '0 auto' }}>
              No items match the specified filters. Try searching for a different keyword or resetting filters.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color, #e5e7eb)', background: 'var(--bg-secondary, #f9fafb)' }}>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Product</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Shop</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Category</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Price / Unit</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)' }}>Status</th>
                  <th style={{ padding: '0.875rem 1rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ divideY: '1px solid var(--border-color, #e5e7eb)' }}>
                {products.map((p) => {
                  const shopName = p.shop_name || p.shop?.name || `Shop #${p.shop}`;
                  const categoryName = p.category_details?.name || (typeof p.category === 'object' ? p.category?.name : `Cat #${p.category}`);

                  return (
                    <tr
                      key={p.id}
                      style={{
                        borderBottom: '1px solid var(--border-color, #f3f4f6)',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover, #f9fafb)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          {p.image ? (
                            <img
                              src={p.image}
                              alt={p.name}
                              style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color, #e5e7eb)' }}
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--bg-secondary, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #9ca3af)' }}>
                              <Package size={20} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary, #111827)' }}>{p.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', display: 'flex', gap: '0.5rem', marginTop: '0.125rem' }}>
                              {p.brand && <span>Brand: {p.brand}</span>}
                              {p.sku && <span>SKU: {p.sku}</span>}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', color: 'var(--text-primary, #111827)' }}>
                          <Store size={14} color="var(--primary-600, #2563eb)" />
                          <span style={{ fontWeight: 500 }}>{shopName}</span>
                        </div>
                        {p.shop_location && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)', marginLeft: '1.25rem' }}>
                            {p.shop_location}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <span style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', background: 'var(--bg-secondary, #f3f4f6)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary, #4b5563)' }}>
                          {categoryName}
                        </span>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary, #111827)' }}>
                          ₹{Number(p.price).toFixed(2)}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #6b7280)' }}>
                          per {p.unit_display || p.unit || 'unit'}
                        </div>
                      </td>
                      <td style={{ padding: '0.875rem 1rem' }}>
                        <Badge variant={p.is_active ? 'success' : 'danger'}>
                          {p.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td style={{ padding: '0.875rem 1rem', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetails(p)}
                            title="View Product Details"
                          >
                            <Eye size={16} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleActive(p)}
                            disabled={actionLoading}
                            style={{
                              color: p.is_active ? '#dc2626' : '#059669',
                              borderColor: p.is_active ? '#fca5a5' : '#86efac',
                            }}
                            title={p.is_active ? 'Deactivate Product' : 'Activate Product'}
                          >
                            <Power size={14} style={{ marginRight: '4px' }} />
                            {p.is_active ? 'Hide' : 'Publish'}
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

      {/* Product Detail Modal */}
      {detailModalOpen && selectedProduct && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title="Product Specifications"
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {selectedProduct.image ? (
                <img
                  src={selectedProduct.image}
                  alt={selectedProduct.name}
                  style={{ width: '160px', height: '160px', borderRadius: '8px', objectFit: 'cover', border: '1px solid var(--border-color, #e5e7eb)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ) : (
                <div style={{ width: '160px', height: '160px', borderRadius: '8px', background: 'var(--bg-secondary, #f3f4f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted, #9ca3af)' }}>
                  <Package size={48} />
                </div>
              )}

              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary, #111827)' }}>
                    {selectedProduct.name}
                  </h3>
                  <Badge variant={selectedProduct.is_active ? 'success' : 'danger'}>
                    {selectedProduct.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--primary-600, #2563eb)', marginBottom: '1rem' }}>
                  ₹{Number(selectedProduct.price).toFixed(2)}
                  <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--text-muted, #6b7280)', marginLeft: '0.375rem' }}>
                    / {selectedProduct.unit_display || selectedProduct.unit || 'unit'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', fontSize: '0.8125rem' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Brand</span>
                    <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedProduct.brand || 'Unbranded'}</strong>
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>SKU</span>
                    <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedProduct.sku || 'N/A'}</strong>
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Shop</span>
                    <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedProduct.shop_name || `Shop #${selectedProduct.shop}`}</strong>
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '6px' }}>
                    <span style={{ color: 'var(--text-muted, #6b7280)', display: 'block' }}>Category</span>
                    <strong style={{ color: 'var(--text-primary, #111827)' }}>{selectedProduct.category_details?.name || 'General'}</strong>
                  </div>
                </div>
              </div>
            </div>

            {selectedProduct.description && (
              <div style={{ padding: '0.875rem', background: 'var(--bg-secondary, #f9fafb)', borderRadius: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Description
                </span>
                <p style={{ marginTop: '0.375rem', fontSize: '0.875rem', color: 'var(--text-primary, #111827)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {selectedProduct.description}
                </p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <Button
                variant={selectedProduct.is_active ? 'outline' : 'primary'}
                onClick={() => handleToggleActive(selectedProduct)}
                disabled={actionLoading}
              >
                <Power size={16} style={{ marginRight: '6px' }} />
                {selectedProduct.is_active ? 'Deactivate Listing' : 'Activate Listing'}
              </Button>
              <Button variant="secondary" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default AdminProducts;
