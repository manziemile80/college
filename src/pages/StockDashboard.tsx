import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useStockData } from '@/hooks/useStockData';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { expiryLabel, expiryStatus, formatMoney, inventoryValue, periodKey, stockAlert } from '@/lib/stock';
import { canRecordStock } from '@/lib/stockRoles';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Boxes, CalendarCheck, Coins, Package } from '@/lib/icons';

const EXPIRY_COLORS: Record<string, string> = {
  expired: '#dc2626', today: '#ea580c', within7: '#f59e0b', within30: '#eab308', within60: '#0ea5e9', safe: '#10b981', none: '#94a3b8',
};

interface PurchaseOrder {
  id: string; item_id: string; supplier: string | null; quantity: number; unit_price: number;
  status: string; expected_date: string | null; notes: string | null; created_at: string;
}

export default function StockDashboard() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { products, batches, movements, loading, error, refresh } = useStockData();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [poForm, setPoForm] = useState({ item_id: '', supplier: '', quantity: '', unit_price: '', expected_date: '' });
  const today = new Date().toISOString().slice(0, 10);
  const canWrite = canRecordStock(role);

  const loadOrders = async () => {
    const { data } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false }).limit(100);
    setOrders((data as PurchaseOrder[]) || []);
  };
  useEffect(() => { loadOrders(); }, []);

  const createOrder = async () => {
    if (!poForm.item_id || !(Number(poForm.quantity) > 0)) {
      return toast({ title: 'Select a product and enter a quantity', variant: 'destructive' });
    }
    const { error: insertError } = await supabase.from('purchase_orders').insert({
      item_id: poForm.item_id, supplier: poForm.supplier.trim().slice(0, 150) || null,
      quantity: Number(poForm.quantity), unit_price: Math.max(0, Number(poForm.unit_price) || 0),
      expected_date: poForm.expected_date || null, notes: null, created_by: user!.id,
    });
    if (insertError) return toast({ title: 'Could not create order', description: insertError.message, variant: 'destructive' });
    toast({ title: 'Purchase order created' });
    setPoForm({ item_id: '', supplier: '', quantity: '', unit_price: '', expected_date: '' });
    loadOrders();
  };

  const setOrderStatus = async (order: PurchaseOrder, status: string) => {
    const { error: updateError } = await supabase.from('purchase_orders').update({ status }).eq('id', order.id);
    if (updateError) return toast({ title: 'Could not update order', description: updateError.message, variant: 'destructive' });
    if (status === 'received') {
      const { error: movementError } = await supabase.from('stock_movements').insert({
        item_id: order.item_id, movement_type: 'in', quantity: order.quantity,
        unit_price: order.unit_price, reason: `Purchase order received${order.supplier ? ` from ${order.supplier}` : ''}`,
        movement_date: today, recorded_by: user!.id,
      });
      if (movementError) return toast({ title: 'Order marked received but stock was not updated', description: movementError.message, variant: 'destructive' });
      refresh();
    }
    toast({ title: `Order ${status}` });
    loadOrders();
  };

  const stats = useMemo(() => {
    const todayIn = movements.filter((m) => m.movement_type === 'in' && m.movement_date === today);
    const todayOut = movements.filter((m) => m.movement_type === 'out' && m.movement_date === today);
    const sum = (rows: typeof movements, field: 'quantity' | 'total_price') => rows.reduce((s, m) => s + Number(m[field] || 0), 0);
    const expiring = batches.filter((b) => ['expired', 'today', 'within7', 'within30'].includes(expiryStatus(b.expiry_date)));
    return {
      uniqueProducts: products.length,
      totalQuantity: products.reduce((s, p) => s + Number(p.quantity || 0), 0),
      inToday: sum(todayIn, 'quantity'), outToday: sum(todayOut, 'quantity'),
      inValueToday: sum(todayIn, 'total_price'), outValueToday: sum(todayOut, 'total_price'),
      low: products.filter((p) => stockAlert(p).isLow).length,
      out: products.filter((p) => stockAlert(p).isOut).length,
      expired: batches.filter((b) => expiryStatus(b.expiry_date) === 'expired').length,
      expiring: expiring.length,
      totalValue: products.reduce((s, p) => s + inventoryValue(p), 0),
    };
  }, [products, batches, movements, today]);

  const charts = useMemo(() => {
    const bucket = (period: 'daily' | 'weekly' | 'monthly' | 'annual') => {
      const map = new Map<string, { label: string; in: number; out: number }>();
      movements.forEach((m) => {
        const key = periodKey(m.movement_date, period);
        const row = map.get(key) || { label: key, in: 0, out: 0 };
        row[m.movement_type === 'in' ? 'in' : 'out'] += Number(m.quantity || 0);
        map.set(key, row);
      });
      return [...map.values()].sort((a, b) => a.label.localeCompare(b.label)).slice(-12);
    };
    const top = (type: string) => {
      const map = new Map<string, number>();
      movements.filter((m) => m.movement_type === type).forEach((m) => {
        const name = products.find((p) => p.id === m.item_id)?.name || m.product_code || 'Unknown';
        map.set(name, (map.get(name) || 0) + Number(m.quantity || 0));
      });
      return [...map.entries()].map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 8);
    };
    const expiry = Object.entries(['expired', 'today', 'within7', 'within30', 'within60', 'safe', 'none']
      .reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: batches.filter((b) => expiryStatus(b.expiry_date) === key).length }), {}))
      .map(([key, value]) => ({ name: expiryLabel[key as keyof typeof expiryLabel], value, color: EXPIRY_COLORS[key] }));
    return { daily: bucket('daily'), weekly: bucket('weekly'), monthly: bucket('monthly'), annual: bucket('annual'),
      topIn: top('in'), topOut: top('out'), expiry };
  }, [movements, products, batches]);

  const cards = [
    ['Total Unique Products', stats.uniqueProducts, Package],
    ['Total Stock Quantity', stats.totalQuantity, Boxes],
    ['Stock-In Today', stats.inToday, ArrowDownCircle],
    ['Stock-Out Today', stats.outToday, ArrowUpCircle],
    ['Stock-In Value Today', formatMoney(stats.inValueToday), Coins],
    ['Stock-Out Value Today', formatMoney(stats.outValueToday), Coins],
    ['Low Stock Products', stats.low, AlertTriangle],
    ['Out-of-Stock Products', stats.out, AlertTriangle],
    ['Expired Batches', stats.expired, CalendarCheck],
    ['Expiring Soon', stats.expiring, CalendarCheck],
    ['Total Inventory Value', formatMoney(stats.totalValue), Coins],
  ] as const;

  if (loading) return <DashboardLayout><div className="d-flex justify-content-center py-12"><span className="spinner-border spinner-border-lg text-success" role="status" /></div></DashboardLayout>;

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock Dashboard" description="Live inventory statistics computed from stock transactions and batches."
          actions={<div className="d-flex gap-2"><Link to="/stock/in" className="btn btn-success d-inline-flex align-items-center gap-1"><ArrowDownCircle /> Stock In</Link><Link to="/stock/out" className="btn btn-outline-warning d-inline-flex align-items-center gap-1"><ArrowUpCircle /> Stock Out</Link></div>} />
        <StockTabs />
        {error && <div className="alert alert-danger mb-0">Could not load stock data: {error}</div>}

        <div className="row g-3 row-cols-2 row-cols-md-3 row-cols-xl-6">
          {cards.map(([label, value, Icon]) => (
            <div key={label}><div className="card h-100"><div className="card-body p-3">
              <div className="d-flex align-items-center gap-2 text-secondary bd-fs-sm"><Icon className="text-success" /> {label}</div>
              <p className="fs-5 fw-semibold text-main mb-0 mt-2">{value}</p>
            </div></div></div>
          ))}
        </div>

        <div className="row g-3">
          {([['Daily movement', charts.daily], ['Weekly movement', charts.weekly], ['Monthly movement', charts.monthly], ['Annual movement', charts.annual]] as const).map(([title, data]) => (
            <div className="col-md-6" key={title}><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">{title}</h5></div>
              <div className="card-body"><div style={{ height: 230 }}>
                <ResponsiveContainer width="100%" height="100%"><BarChart data={data as { label: string; in: number; out: number }[]}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis /><Tooltip />
                  <Legend /><Bar dataKey="in" name="Stock In" fill="#10b981" /><Bar dataKey="out" name="Stock Out" fill="#f59e0b" />
                </BarChart></ResponsiveContainer>
              </div></div></div></div>
          ))}
        </div>

        <div className="row g-3">
          <div className="col-md-6"><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Top Received Products</h5></div>
            <div className="card-body"><div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={charts.topIn}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={110} /><Tooltip />
              <Bar dataKey="qty" fill="#10b981" />
            </BarChart></ResponsiveContainer></div></div>
          </div></div>
          <div className="col-md-6"><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Top Issued Products</h5></div>
            <div className="card-body"><div style={{ height: 240 }}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={charts.topOut}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis type="number" /><YAxis type="category" dataKey="name" width={110} /><Tooltip />
              <Bar dataKey="qty" fill="#f59e0b" />
            </BarChart></ResponsiveContainer></div></div>
          </div></div>
        </div>

        <div className="row g-3">
          <div className="col-md-6"><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Expiry Status Overview</h5></div>
            <div className="card-body"><div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><PieChart>
              <Pie data={charts.expiry} dataKey="value" nameKey="name" outerRadius={85} label>
                {charts.expiry.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
              </Pie><Tooltip />
            </PieChart></ResponsiveContainer></div></div>
          </div></div>
          <div className="col-md-6"><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Products Needing Attention</h5></div>
            <div className="card-body"><div style={{ height: 260 }}><ResponsiveContainer width="100%" height="100%"><BarChart data={[
              { name: 'Low stock', value: stats.low }, { name: 'Out of stock', value: stats.out },
              { name: 'Expired', value: stats.expired }, { name: 'Expiring soon', value: stats.expiring },
            ]}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis allowDecimals={false} /><Tooltip />
              <Bar dataKey="value" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer></div></div>
          </div></div>
        </div>

        {canWrite && <div className="card"><div className="card-body d-flex flex-wrap align-items-end gap-3 py-3">
          <div><label className="form-label mb-1">Product</label><select className="form-select" value={poForm.item_id} onChange={(e) => setPoForm({ ...poForm, item_id: e.target.value })}>
            <option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
          </select></div>
          <div><label className="form-label mb-1">Supplier</label><input className="form-control" value={poForm.supplier} onChange={(e) => setPoForm({ ...poForm, supplier: e.target.value })} /></div>
          <div><label className="form-label mb-1">Quantity</label><input type="number" min={0.01} step="any" className="form-control" value={poForm.quantity} onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })} /></div>
          <div><label className="form-label mb-1">Unit price</label><input type="number" min={0} step="any" className="form-control" value={poForm.unit_price} onChange={(e) => setPoForm({ ...poForm, unit_price: e.target.value })} /></div>
          <div><label className="form-label mb-1">Expected date</label><input type="date" className="form-control" value={poForm.expected_date} onChange={(e) => setPoForm({ ...poForm, expected_date: e.target.value })} /></div>
          <button type="button" className="btn btn-success" onClick={createOrder}>Create Order</button>
        </div></div>}

        <div className="card">
          <div className="card-header py-3 d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-semibold text-main">Purchase Orders</h5>
            <span className="text-muted bd-fs-sm">{orders.filter((o) => ['pending', 'ordered'].includes(o.status)).length} open</span>
          </div>
          <div className="card-body p-0">
            {orders.length === 0 ? <p className="text-muted bd-fs-sm p-4 mb-0">No purchase orders yet. Create one from the Product Inventory page.</p>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Product</th><th>Supplier</th><th className="text-end">Qty</th><th className="text-end">Unit price</th><th>Expected</th><th>Status</th><th className="text-end">Actions</th></tr></thead>
                <tbody>{orders.map((order) => (
                  <tr key={order.id} className="border-bottom border-secondary-subtle">
                    <td className="text-main">{products.find((p) => p.id === order.item_id)?.name || 'Unknown item'}</td>
                    <td className="bd-fs-sm">{order.supplier || '—'}</td>
                    <td className="text-end">{order.quantity}</td>
                    <td className="text-end bd-fs-sm">{formatMoney(order.unit_price)}</td>
                    <td className="bd-fs-sm">{order.expected_date ? new Date(order.expected_date).toLocaleDateString() : '—'}</td>
                    <td><span className={`badge bd-fs-sm ${order.status === 'received' ? 'text-bg-success' : order.status === 'cancelled' ? 'text-bg-danger' : order.status === 'ordered' ? 'text-bg-info' : 'text-bg-secondary'}`}>{order.status}</span></td>
                    <td className="text-end">{canWrite && order.status !== 'received' && order.status !== 'cancelled' && (
                      <button type="button" className="btn btn-sm btn-outline-success" onClick={() => setOrderStatus(order, order.status === 'pending' ? 'ordered' : 'received')}>
                        {order.status === 'pending' ? 'Mark Ordered' : 'Receive'}
                      </button>
                    )}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
