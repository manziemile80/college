import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  Package, AlertTriangle, ClipboardList, Loader2, ArrowRight,
  CheckCircle2, Truck, Coins,
} from '@/lib/icons';

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
  pending: 'bg-amber-100 text-amber-800',
  ordered: 'bg-emerald-100 text-emerald-700',
  received: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-red-100 text-red-800',
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
    { icon: Package, label: 'Items tracked', value: items.length, cls: 'bg-emerald-50 text-emerald-600' },
    { icon: AlertTriangle, label: 'Need reordering', value: lowStock.length, cls: 'bg-red-50 text-red-600' },
    { icon: ClipboardList, label: 'Open orders', value: openOrders.length, cls: 'bg-amber-50 text-amber-600' },
    { icon: Coins, label: 'Open order value', value: openValue.toLocaleString() + ' RWF', cls: 'bg-emerald-50 text-emerald-600' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <PageHeader
          eyebrow="Operations"
          title="Stock Dashboard"
          description="Inventory levels, reorder alerts and purchase orders."
          actions={
            <Button variant="outline" className="g-2" asChild>
              <Link to="/stock">
                Stock items <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />

        {/* Stats */}
        <div className="row g-2 col-md-6 xl:col-3">
          {stats.map((s) => (
            <Card key={s.label}>
              <CardContent className="d-flex align-items-center g-3 p-4">
                <div className={`d-flex h-10 w-10 align-items-center justify-content-center rounded-[10px] ${s.cls}`}>
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="fs-12.5 text-slate-500">{s.label}</p>
                  <p className="fs-30 fw-bold text-slate-900">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>
        ) : (
          <div className="row g-4 col-lg-3">
            <div className="space-y-5 col-lg-6">
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-4 fw-semibold text-slate-900">Inventory levels</h2>
                  {items.length === 0 ? (
                    <p className="py-8 text-center fs-13 text-slate-500">No stock items yet. Add items on the stock page first.</p>
                  ) : (
                    <div className="space-y-4">
                      {items.map((it) => {
                        const min = Number(it.min_quantity) || 0;
                        const target = Math.max(min * 2, Number(it.quantity), 1);
                        const pct = Math.min((Number(it.quantity) / target) * 100, 100);
                        const low = Number(it.quantity) <= min;
                        return (
                          <div key={it.id}>
                            <div className="mb-1 d-flex align-items-center justify-content-between g-3 fs-13">
                              <span className="fw-medium text-slate-900">{it.name}</span>
                              <span className={low ? 'text-red-600' : 'text-slate-500'}>
                                {it.quantity} {it.unit} Â· min {min}
                              </span>
                            </div>
                            <Progress value={pct} className={low ? '[&>div]:bg-red-600' : ''} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-4 fw-semibold text-slate-900">Purchase orders</h2>
                  {orders.length === 0 ? (
                    <p className="py-8 text-center fs-13 text-slate-500">No purchase orders yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((o) => (
                        <div key={o.id} className="d-flex flex-wrap align-items-center justify-content-between g-3 rounded-[10px] border border-slate-200 p-3">
                          <div className="min-w-[180px]">
                            <p className="fw-medium text-slate-900">{itemName(o.item_id)}</p>
                            <p className="fs-12.5 text-slate-500">
                              {o.quantity} {itemUnit(o.item_id)}
                              {o.supplier ? ` Â· ${o.supplier}` : ''}
                              {o.expected_date ? ` Â· expected ${o.expected_date}` : ''}
                            </p>
                          </div>
                          <div className="d-flex align-items-center g-2">
                            <Badge className={statusStyles[o.status] || ''}>{o.status}</Badge>
                            {canManage && o.status === 'pending' && (
                              <Button size="sm" variant="outline" className="g-1" onClick={() => updateStatus(o, 'ordered')}>
                                <Truck className="h-3.5 w-3.5" />Mark ordered
                              </Button>
                            )}
                            {canManage && (o.status === 'pending' || o.status === 'ordered') && (
                              <>
                                <Button size="sm" className="g-1" onClick={() => updateStatus(o, 'received')}>
                                  <CheckCircle2 className="h-3.5 w-3.5" />Received
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => updateStatus(o, 'cancelled')}>Cancel</Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-5">
              <Card>
                <CardContent className="p-5">
                  <h2 className="mb-3 fw-semibold text-slate-900">Reorder alerts</h2>
                  {lowStock.length === 0 ? (
                    <p className="py-6 text-center fs-13 text-slate-500">All items are above their minimum level.</p>
                  ) : (
                    <div className="space-y-2">
                      {lowStock.map((it) => (
                        <div key={it.id} className="d-flex align-items-center justify-content-between g-2 rounded-[10px] border border-red-200 bg-red-50 p-3">
                          <div>
                            <p className="fs-13.5 fw-medium text-red-700">{it.name}</p>
                            <p className="fs-12.5 text-red-600">
                              {it.quantity} {it.unit} left (min {it.min_quantity})
                            </p>
                          </div>
                          {canManage && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setForm((f) => ({
                                  ...f,
                                  item_id: it.id,
                                  quantity: String(Math.max(Number(it.min_quantity) * 2 - Number(it.quantity), 1)),
                                }))
                              }
                            >
                              Order
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {canManage && (
                <Card>
                  <CardContent className="space-y-3 p-5">
                    <h2 className="fw-semibold text-slate-900">New purchase order</h2>
                    <div><Label>Item</Label>
                      <Select value={form.item_id} onValueChange={(v) => setForm({ ...form, item_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {items.map((it) => (
                            <SelectItem key={it.id} value={it.id}>{it.name} ({it.quantity} {it.unit})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Supplier</Label>
                      <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} placeholder="e.g. Rebero Suppliers Ltd" />
                    </div>
                    <div className="row col-6 g-3">
                      <div><Label>Quantity</Label>
                        <Input type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                      </div>
                      <div><Label>Unit price (RWF)</Label>
                        <Input type="number" min="0" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                      </div>
                    </div>
                    <div><Label>Expected delivery</Label>
                      <Input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} />
                    </div>
                    <div><Label>Notes</Label>
                      <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                    <Button className="w-100" onClick={submitOrder} disabled={saving}>
                      {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Create order
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}





