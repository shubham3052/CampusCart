import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  ShoppingBag,
  DollarSign,
  Calendar,
  Eye,
  RefreshCw,
  Mail,
  Phone,
  CheckCircle2,
  Package,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import Modal from '../../components/common/Modal';
import { Spinner } from '../../components/common/Loader';
import orderService from '../../services/orderService';

export default function ShopOwnerCustomers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const fetchShopCustomers = async () => {
    try {
      setLoading(true);
      const ordersRes = await orderService.getOrders();
      const ordersList = ordersRes.results || ordersRes || [];

      // Aggregate orders by student customer
      const customerMap = {};
      ordersList.forEach((order) => {
        const cust = order.customer;
        if (!cust) return;
        const custId = cust.id || cust.username || order.customer_name;
        if (!customerMap[custId]) {
          customerMap[custId] = {
            id: cust.id || custId,
            name: cust.name || cust.first_name ? `${cust.first_name || ''} ${cust.last_name || ''}`.trim() : (order.customer_name || 'Student Customer'),
            email: cust.email || order.customer_email || '—',
            phone: cust.phone_number || order.delivery_phone || '—',
            ordersCount: 0,
            totalSpent: 0,
            latestOrderDate: order.created_at,
            orders: [],
          };
        }
        customerMap[custId].ordersCount += 1;
        customerMap[custId].totalSpent += parseFloat(order.total_amount || 0);
        customerMap[custId].orders.push(order);
      });

      setCustomers(Object.values(customerMap));
    } catch (err) {
      console.error('Failed to load shop customers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShopCustomers();
  }, []);

  const filtered = customers.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      const matchPhone = (c.phone || '').includes(q);
      return matchName || matchEmail || matchPhone;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <PageHeader
          title="Customer Directory"
          subtitle="View repeat student customers, order histories, and purchase values from your store"
        />
        <Button variant="outline" size="sm" onClick={fetchShopCustomers} icon={RefreshCw}>
          Refresh
        </Button>
      </div>

      {/* Search Bar */}
      <Card style={{ padding: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '12px' }} />
          <input
            type="text"
            placeholder="Search student customers by name, email, or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.25rem',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-light)',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </Card>

      {/* Customers Table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center' }}>
          <Spinner size="lg" message="Aggregating student customers..." />
        </div>
      ) : filtered.length === 0 ? (
        <Card style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
          <Users size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
            No student customers found
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Customers who place orders with your shop will be listed here.
          </p>
        </Card>
      ) : (
        <Card style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Student Customer</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Contact Info</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Orders</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Spend</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Recent Purchase</th>
                  <th style={{ padding: '0.85rem 1rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    style={{
                      borderBottom: '1px solid var(--border-light)',
                      transition: 'background-color 120ms ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-surface-secondary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: '#eef2ff',
                            color: 'var(--primary-600)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            flexShrink: 0,
                          }}
                        >
                          {(c.name?.[0] || 'S').toUpperCase()}
                        </div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {c.name}
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)' }}>
                      <div>{c.email}</div>
                      {c.phone && c.phone !== '—' && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{c.phone}</div>
                      )}
                    </td>

                    <td style={{ padding: '0.85rem 1rem' }}>
                      <Badge variant="primary">{c.ordersCount} Orders</Badge>
                    </td>

                    <td style={{ padding: '0.85rem 1rem', fontWeight: 700, color: '#059669' }}>
                      ${c.totalSpent.toFixed(2)}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                      {c.latestOrderDate ? new Date(c.latestOrderDate).toLocaleDateString() : '—'}
                    </td>

                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Eye}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setDetailModalOpen(true);
                        }}
                      >
                        Orders
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Customer Detail Modal */}
      {detailModalOpen && selectedCustomer && (
        <Modal
          isOpen={detailModalOpen}
          onClose={() => setDetailModalOpen(false)}
          title={`Customer: ${selectedCustomer.name}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '1rem', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{selectedCustomer.name}</h4>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{selectedCustomer.email}</p>
                {selectedCustomer.phone && <p style={{ margin: '0.1rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{selectedCustomer.phone}</p>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Purchases</span>
                <p style={{ margin: '0.2rem 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#059669' }}>
                  ${selectedCustomer.totalSpent.toFixed(2)}
                </p>
              </div>
            </div>

            <h5 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', fontWeight: 700 }}>
              Order History with Your Store ({selectedCustomer.orders.length})
            </h5>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '300px', overflowY: 'auto' }}>
              {selectedCustomer.orders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-surface-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
                      Order #{String(o.order_number || o.id).slice(0, 8)}
                    </span>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                      {new Date(o.created_at).toLocaleDateString()} &bull; {o.items?.length || 1} item(s)
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Badge variant={o.status === 'COMPLETED' || o.status === 'DELIVERED' ? 'success' : 'primary'} size="sm">
                      {o.status}
                    </Badge>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      ${parseFloat(o.total_amount || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
