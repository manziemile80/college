import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Package, AlertTriangle, ClipboardList, Loader2, ArrowRight, CheckCircle2, Truck, Coins } from '@/lib/icons';

interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  location: string | null;
}

interface PurchaseOrder {
  id: string;
  item_id: string;
  supplier: string | null;
  quantity: number;
  unit_price: number;
  status: string;
  expected_date: string | null;
  notes: string | null;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  pending: 'text-bg-warning bg-warning-subtle',
  ordered: 'text-bg-success bg-success-subtle',
  received: 'text-bg-info bg-info-subtle',
  cancelled: 'text-bg-danger bg-danger-subtle',
};

export default function StockDashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'stock_manager';

  const [items, setItems] = useState<StockItem[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    item_id: '',
    supplier: '',
    quantity: '',
    unit_price: '',
    expected_date: '',
    notes: '',
  });

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [i, o] = await Promise.all([
      supabase.from('stock_items').select('*').order('name'),
      supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setItems((i.data as StockItem[]) || []);
    setOrders((o.data as PurchaseOrder[]) || []);
    setLoading(false);
  };

  const lowStock = useMemo(
    () => items.filter((it) => Number(it.quantity) <= Number(it.min_quantity)),
    [items],
  );
  const outOfStock = useMemo(() => items.filter((it) => Number(it.quantity) <= 0), [items]);
  const openOrders = useMemo(
    () => orders.filter((o) => o.status === 'pending' || o.status === 'ordered'),
    [orders],
  );
  const openValue = useMemo(
    () => openOrders.reduce((sum, o) => sum + Number(o.quantity) * Number(o.unit_price), 0),
    [openOrders],
  );

  const itemName = (id: string) => items.find((it) => it.id === id)?.name || 'Unknown item';
  const itemUnit = (id: string) => items.find((it) => it.id === id)?.unit || '';

  const submitOrder = async () => {
    if (!form.item_id) {
      toast({ title: 'Choose an item to order', variant: 'destructive' });
      return;
    }
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) {
      toast({ title: 'Enter a quantity greater than zero', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('purchase_orders').insert({
      item_id: form.item_id,
      supplier: form.supplier.trim().slice(0, 150) || null,
      quantity: qty,
      unit_price: Math.max(Number(form.unit_price) || 0, 0),
      expected_date: form.expected_date || null,
      notes: form.notes.trim().slice(0, 500) || null,
      created_by: user!.id,
    });
    setSaving(false);
    if (error) {
      toast({ title: 'Could not save the order', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Purchase order created' });
    setForm({ item_id: '', supplier: '', quantity: '', unit_price: '', expected_date: '', notes: '' });
    fetchAll();
  };

  const updateStatus = async (order: PurchaseOrder, status: string) => {
    const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', order.id);
    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
      return;
    }
    if (status === 'received') {
      await supabase.from('stock_movements').insert({
        item_id: order.item_id,
        movement_type: 'in',
        quantity: order.quantity,
        reason: `Purchase order received${order.supplier ? ` from ${order.supplier}` : ''}`,
        movement_date: new Date().toISOString().slice(0, 10),
        recorded_by: user!.id,
      });
      toast({ title: 'Delivery received', description: 'Stock levels have been updated.' });
    } else {
      toast({ title: 'Order updated' });
    }
    fetchAll();
  };

  const stats = [
    { icon: Package, label: 'Items tracked', value: items.length, cls: 'bg-success-subtle text-success' },
    { icon: AlertTriangle, label: 'Need reordering', value: lowStock.length, cls: 'bg-danger-subtle text-danger' },
    { icon: ClipboardList, label: 'Open orders', value: openOrders.length, cls: 'bg-warning-subtle text-warning' },
    { icon: Coins, label: 'Open order value', value: openValue.toLocaleString() + ' RWF', cls: 'bg-success-subtle text-success' },
  ];

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Operations"
          title="Stock Dashboard"
          description="Inventory levels, reorder alerts and purchase orders."
          actions={
            <Link to="/stock" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1">
              Stock items <ArrowRight />
            </Link>
          }
        />

        {/* Stats */}
        <div className="row g-3">
          {stats.map((s) => (
            <div className="col-6 col-sm-6 col-lg-3" key={s.label}>
              <div className="card h-100 d-flex align-items-center gap-3 p-4">
                <div className={`d-inline-flex align-items-center justify-content-center rounded-3 p-2 ${s.cls}`}>
                  <s.icon className="fs-5" />
                </div>
                <div>
                  <p className="text-muted bd-fs-sm mb-0">{s.label}</p>
                  <p className="fw-bold text-main bd-fs-lg mb-0">{s.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : (
          <div className="row g-3">
            <div className="col-12 col-lg-6">
              <div className="card h-100 d-flex flex-column p-4">
                <h2 className="fw-semibold text-main mb-3">Inventory levels</h2>
                {items.length === 0 ? (
                  <p className="py-8 text-center text-muted bd-fs-sm mb-0">No stock items yet. Add items on the stock page first.</p>
                ) : (
                  <div className="d-flex flex-column gap-4">
                    {items.map((it) => {
                      const min = Number(it.min_quantity) || 0;
                      const target = Math.max(min * 2, Number(it.quantity), 1);
                      const pct = Math.min((Number(it.quantity) / target) * 100, 100);
                      const low = Number(it.quantity) <= min;
                      return (
                        <div key={it.id}>
                          <div className="d-flex align-items-center justify-content-between gap-3 mb-1">
                            <span className="fw-medium text-main">{it.name}</span>
                            <span className={low ? 'text-danger' : 'text-muted'}>
                              {it.quantity} {it.unit} · min {min}
                            </span>
                          </div>
                          <div className="progress h-3">
                            <div className={`progress-bar ${low ? 'bg-danger' : 'bg-success'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="col-12 col-lg-6">
              <div className="d-flex flex-column gap-3">
                <div className="card h-100 d-flex flex-column p-4">
                  <h2 className="fw-semibold text-main mb-3">Purchase orders</h2>
                  {orders.length === 0 ? (
                    <p className="py-8 text-center text-muted bd-fs-sm mb-0">No purchase orders yet.</p>
                  ) : (
                    <div className="d-flex flex-column gap-3">
                      {orders.map((o) => (
                        <div key={o.id} className="d-flex flex-wrap align-items-center justify-content-between gap-3 rounded-3 border border-secondary-subtle p-3">
                          <div className="min-w-0">
                            <p className="fw-medium text-main mb-0">{itemName(o.item_id)}</p>
                            <p className="text-muted bd-fs-sm mb-0 mt-1">
                              {o.quantity} {itemUnit(o.item_id)}
                              {o.supplier ? ` · ${o.supplier}` : ''}
                              {o.expected_date ? ` · expected ${o.expected_date}` : ''}
                            </p>
                          </div>
                          <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            <span className={`badge bd-fs-sm ${statusStyles[o.status] || 'text-bg-secondary'}`}>{o.status}</span>
                            {canManage && o.status === 'pending' && (
                              <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1" onClick={() => updateStatus(o, 'ordered')}>
                                <Truck /> Mark ordered
                              </button>
                            )}
                            {canManage && (o.status === 'pending' || o.status === 'ordered') && (
                              <>
                                <button type="button" className="btn btn-success btn-sm d-inline-flex align-items-center gap-1" onClick={() => updateStatus(o, 'received')}>
                                  <CheckCircle2 /> Received
                                </button>
                                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => updateStatus(o, 'cancelled')}>Cancel</button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card h-100 d-flex flex-column p-4">
                  <h2 className="fw-semibold text-main mb-3">Reorder alerts</h2>
                  {lowStock.length === 0 ? (
                    <p className="py-6 text-center text-muted bd-fs-sm mb-0">All items are above their minimum level.</p>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {lowStock.map((it) => (
                        <div key={it.id} className="d-flex align-items-center justify-content-between gap-3 rounded-3 border border-danger-subtle bg-danger-subtle p-3">
                          <div className="min-w-0">
                            <p className="fw-semibold text-danger mb-0">{it.name}</p>
                            <p className="text-danger bd-fs-sm mb-0 mt-1">{it.quantity} {it.unit} left (min {it.min_quantity})</p>
                          </div>
                          {canManage && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm flex-shrink-0"
                              onClick={() => setForm((f) => ({
                                ...f,
                                item_id: it.id,
                                quantity: String(Math.max(Number(it.min_quantity) * 2 - Number(it.quantity), 1)),
                              }))}
                            >
                              Order
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {canManage && (
          <div className="card">
            <div className="card-header d-flex align-items-center justify-content-between py-3 border-bottom border-secondary-subtle">
              <h5 className="mb-0 fw-semibold text-main">New purchase order</h5>
            </div>
            <div className="card-body d-flex flex-column gap-3">
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Item</label>
                <select className="form-select" value={form.item_id} onChange={(e) => setForm({ ...form, item_id: e.target.value })}>
                  <option value="">Select item</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>{it.name} ({it.quantity} {it.unit})</option>
                  ))}
                </select>
              </div>
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Supplier</label>
                <input className="form-control" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Rebero Suppliers Ltd" />
              </div>
              <div className="row g-3">
                <div className="col-6 col-sm-4">
                  <label className="form-label">Quantity</label>
                  <input type="number" className="form-control" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                </div>
                <div className="col-6 col-sm-4">
                  <label className="form-label">Unit price (RWF)</label>
                  <input type="number" className="form-control" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                </div>
              </div>
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Expected delivery</label>
                <input type="date" className="form-control" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
              </div>
              <div className="d-flex flex-column gap-2">
                <label className="form-label">Notes</label>
                <textarea className="form-control" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <div>
                <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={submitOrder} disabled={saving}>
                  {saving && <span className="spinner-border spinner-border-sm" />}Create order
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
