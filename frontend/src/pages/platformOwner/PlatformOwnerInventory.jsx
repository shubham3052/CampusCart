import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Search,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Package,
} from 'lucide-react';
import platformOwnerService from '../../services/platformOwnerService';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Input from '../../components/common/Input';
import { Spinner } from '../../components/common/Loader';
import ErrorMessage from '../../components/common/ErrorMessage';

const PlatformOwnerInventory = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(true);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (lowStockOnly) params.low_stock = 'true';

      const data = await platformOwnerService.getInventory(params);
      setInventory(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error('Failed to load inventory health:', err);
      setError('Unable to load campus inventory records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, [lowStockOnly]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadInventory();
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <PageHeader
        title="Campus Inventory Health & Low-Stock Alerts"
        subtitle="System-level oversight of store stock levels, replenishment thresholds, and impending stockouts"
      />

      {error && <ErrorMessage message={error} onDismiss={() => setError(null)} />}

      <Card>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1, minWidth: '260px' }}>
            <div style={{ flex: 1 }}>
              <Input
                type="text"
                placeholder="Search inventory by product name, SKU, store name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={Search}
              />
            </div>
            <Button type="submit" variant="outline" size="md">
              Search
            </Button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: 'var(--primary-600)' }}
              />
              Show Low-Stock Only (≤ Reorder Level)
            </label>
            <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={loadInventory}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title={`Inventory Records (${inventory.length})`}>
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <Spinner size="md" message="Scanning campus inventory..." />
          </div>
        ) : inventory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)' }}>
            {lowStockOnly
              ? 'Excellent! No low-stock items detected across campus stores.'
              : 'No inventory records found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th>Product & Category</th>
                  <th>SKU</th>
                  <th>Store</th>
                  <th>Current Stock</th>
                  <th>Reorder Level</th>
                  <th>Safety Min</th>
                  <th>Unit Cost</th>
                  <th>Stock Health</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((inv) => (
                  <tr key={inv.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inv.product_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{inv.category_name}</div>
                    </td>
                    <td>{inv.product_sku || 'N/A'}</td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{inv.shop_name}</span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontWeight: 800,
                          fontSize: '0.95rem',
                          color: inv.current_stock === 0 ? 'var(--danger-600)' : inv.is_low_stock ? 'var(--warning-600)' : 'var(--text-primary)',
                        }}
                      >
                        {inv.current_stock}
                      </span>
                    </td>
                    <td>{inv.reorder_level} units</td>
                    <td>{inv.minimum_stock} units</td>
                    <td>₹{inv.unit_cost}</td>
                    <td>
                      {inv.current_stock === 0 ? (
                        <Badge variant="danger" icon={AlertTriangle}>
                          Out of Stock
                        </Badge>
                      ) : inv.is_low_stock ? (
                        <Badge variant="warning" icon={AlertTriangle}>
                          Low Stock Alert
                        </Badge>
                      ) : (
                        <Badge variant="success">Sufficient</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default PlatformOwnerInventory;
