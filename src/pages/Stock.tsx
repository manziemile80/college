import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Search, Package, ArrowDownCircle, ArrowUpCircle, History } from '@/lib/icons';

interface StockItem {
  id: string;
  name: string;
  category: string;
  unit: string;
  quantity: number;
  min_quantity: number;
  unit_price: number;
  location: string | null;
  notes: string | null;
}

interface Movement {
  id: string;
  item_id: string;
  movement_type: string;
  quantity: number;
  reason: string | null;
  movement_date: string;
}

const emptyItem = {
  name: '',
  category: 'general',
  unit: 'pcs',
  quantity: '0',
  min_quantity: '0',
  unit_price: '0',
  location: '',
  notes: '',
};

const categories = ['general', 'stationery', 'furniture', 'ict', 'kitchen', 'cleaning', 'sports', 'lab'];

export default function Stock() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const canManage = role === 'stock_manager';

  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyItem);

  const [moveItem, setMoveItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'in' | 'out'>('in');
  const [moveQty, setMoveQty] = useState('1');
  const [moveReason, setMoveReason] = useState('');

  const [historyItem, setHistoryItem] = useState<StockItem | null>(null);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [i, m] = await Promise.all([
      supabase.from('stock_items').select('*').order('name'),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(300),
    ]);
    setItems((i.data as StockItem[]) || []);
    setMovements((m.data as Movement[]) || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditingId(null);
    setForm(emptyItem);
    setOpen(true);
  };

  const openEdit = (item: StockItem) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      unit: item.unit,
      quantity: String(item.quantity),
      min_quantity: String(item.min_quantity),
      unit_price: String(item.unit_price ?? 0),
      location: item.location || '',
      notes: item.notes || '',
    });
    setOpen(true);
  };

  const saveItem = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Item name is required', variant: 'destructive' });
      return;
    }
    const payload = {
      name: form.name.trim().slice(0, 150),
      category: form.category,
      unit: form.unit.trim().slice(0, 30) || 'pcs',
      quantity: Math.max(Number(form.quantity) || 0, 0),
      min_quantity: Math.max(Number(form.min_quantity) || 0, 0),
      unit_price: Math.max(Number(form.unit_price) || 0, 0),
      location: form.location.trim().slice(0, 150) || null,
      notes: form.notes.trim().slice(0, 500) || null,
    };
    if (!editingId) {
      const existing = items.find((i) => i.name.trim().toLowerCase() === payload.name.toLowerCase());
      if (existing) {
        const addQty = payload.quantity;
        if (addQty > 0) {
          const { error: mErr } = await supabase.from('stock_movements').insert({
            item_id: existing.id, movement_type: 'in', quantity: addQty, reason: 'Added stock', recorded_by: user!.id,
          });
          if (mErr) return toast({ title: 'Could not add stock', description: mErr.message, variant: 'destructive' });
        }
        if (payload.unit_price > 0) await supabase.from('stock_items').update({ unit_price: payload.unit_price }).eq('id', existing.id);
        toast({ title: 'Stock updated', description: `${existing.name}: ${Number(existing.quantity)} + ${addQty} = ${Number(existing.quantity) + addQty} ${existing.unit}` });
        setOpen(false);
        fetchAll();
        return;
      }
    }
    const { error } = editingId
      ? await supabase.from('stock_items').update(payload).eq('id', editingId)
      : await supabase.from('stock_items').insert({ ...payload, created_by: user!.id });
    if (error) {
      toast({ title: 'Could not save item', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: editingId ? 'Item updated' : 'Item added' });
    setOpen(false);
    fetchAll();
  };

  const removeItem = async (id: string) => {
    const { error } = await supabase.from('stock_items').delete().eq('id', id);
    if (error) {
      toast({ title: 'Could not delete item', description: error.message, variant: 'destructive' });
      return;
    }
    fetchAll();
  };

  const openMove = (item: StockItem, type: 'in' | 'out') => {
    setMoveItem(item);
    setMoveType(type);
    setMoveQty('1');
    setMoveReason('');
  };

  const saveMovement = async () => {
    if (!moveItem) return;
    const qty = Number(moveQty);
    if (!qty || qty <= 0) {
      toast({ title: 'Enter an amount greater than zero', variant: 'destructive' });
      return;
    }
    if (moveType === 'out' && qty > Number(moveItem.quantity)) {
      toast({
        title: 'Not enough in stock',
        description: `Only ${moveItem.quantity} ${moveItem.unit} available.`,
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('stock_movements').insert({
      item_id: moveItem.id,
      movement_type: moveType,
      quantity: qty,
      reason: moveReason.trim().slice(0, 300) || null,
      recorded_by: user!.id,
    });
    if (error) {
      toast({ title: 'Could not record movement', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: moveType === 'in' ? 'Stock received' : 'Stock issued' });
    setMoveItem(null);
    fetchAll();
  };

  const filtered = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()),
  );
  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.min_quantity));
  const totalValue = items.reduce((s, i) => s + Number(i.unit_price || 0) * Number(i.quantity || 0), 0);

  const stockCard = (item: StockItem) => {
    const low = Number(item.quantity) <= Number(item.min_quantity);
    return (
      <div className="card h-100 d-flex flex-column">
        <div className="card-body d-flex flex-column gap-3 p-4">
          <div className="d-flex align-items-start justify-content-between gap-2">
            <span className="d-inline-flex align-items-center justify-content-center rounded-3 bg-success-subtle text-success p-2"><Package className="fs-5" /></span>
            <span className={`badge bd-fs-xs ${low ? 'text-bg-danger bg-danger-subtle' : 'text-bg-secondary bg-secondary-subtle'}`}>
              {item.quantity} {item.unit}
            </span>
          </div>
          <div className="min-w-0">
            <h3 className="fw-semibold text-main mb-1 text-truncate">{item.name}</h3>
            <p className="text-muted bd-fs-sm mb-0 text-truncate">{item.category}{item.location ? ` · ${item.location}` : ''}</p>
            <p className="text-muted bd-fs-sm mt-2 mb-0">
              Unit price: {Number(item.unit_price || 0).toLocaleString()} RWF · Total:{' '}
              <span className="fw-semibold text-main">{(Number(item.unit_price || 0) * Number(item.quantity)).toLocaleString()} RWF</span>
            </p>
            {low && (
              <p className="mt-2 bd-fs-sm fw-medium text-danger mb-0">
                At or below minimum level ({item.min_quantity} {item.unit})
              </p>
            )}
          </div>
          <div className="d-flex flex-wrap align-items-center gap-2 mt-auto">
            {canManage && (
              <>
                <button type="button" className="btn btn-outline-success btn-sm d-inline-flex align-items-center gap-1" onClick={() => openMove(item, 'in')}>
                  <ArrowDownCircle /> Stock In
                </button>
                <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1" onClick={() => openMove(item, 'out')}>
                  <ArrowUpCircle /> Stock Out
                </button>
              </>
            )}
            <button type="button" className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1" onClick={() => setHistoryItem(item)}><History /> History</button>
            {canManage && (
              <>
                <button type="button" className="btn btn-outline-primary btn-sm d-inline-flex align-items-center" aria-label="Edit item" onClick={() => openEdit(item)}><Pencil /></button>
                <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center" aria-label="Delete item" onClick={() => removeItem(item.id)}><Trash2 /></button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Operations"
          title="Stock Management"
          description={canManage ? 'Track school supplies, record what comes in and what is issued out.' : 'View the school stock list and current quantities.'}
          actions={canManage ? (
            <button type="button" className="btn btn-primary d-inline-flex align-items-center gap-1" onClick={openNew}><Plus /> New Item</button>
          ) : undefined}
        />

        <div className="row g-3">
          <div className="col-6 col-md-6 col-xl-4">
            <div className="card h-100 d-flex align-items-center gap-3 p-4">
              <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-3 text-success"><Package className="fs-5" /></div>
              <div>
                <p className="text-muted bd-fs-sm mb-0">Items tracked</p>
                <p className="fw-bold text-main bd-fs-lg mb-0">{items.length}</p>
              </div>
            </div>
          </div>
          <div className="col-6 col-md-6 col-xl-4">
            <div className={`card h-100 d-flex align-items-center gap-3 p-4 ${lowStock.length > 0 ? 'text-danger' : ''}`}>
              <div className={`d-inline-flex align-items-center justify-content-center rounded-circle p-3 ${lowStock.length > 0 ? 'bg-danger-subtle text-danger' : 'bg-secondary-subtle text-secondary'}`}><Package className="fs-5" /></div>
              <div>
                <p className="text-muted bd-fs-sm mb-0">Low or out of stock</p>
                <p className={`fw-bold bd-fs-lg mb-0 ${lowStock.length > 0 ? 'text-danger' : 'text-main'}`}>{lowStock.length}</p>
              </div>
            </div>
          </div>
          <div className="col-12 col-xl-4">
            <div className="card h-100 d-flex align-items-center gap-3 p-4">
              <div className="d-inline-flex align-items-center justify-content-center rounded-circle bg-success-subtle p-3 text-success"><Package className="fs-5" /></div>
              <div>
                <p className="text-muted bd-fs-sm mb-0">Total value (RWF)</p>
                <p className="fw-bold text-main bd-fs-lg mb-0">{totalValue.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="input-group w-100 w-md-auto flex-grow-1">
          <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
          <input type="search" className="form-control border-secondary-subtle" placeholder="Search item or category" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search stock" />
        </div>

        {loading ? (
          <div className="d-flex justify-content-center py-8">
            <span className="spinner-border spinner-border-lg text-success" role="status" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="card-body d-flex flex-column align-items-center py-12 text-center">
              <Package className="fs-3 mb-3 text-secondary" />
              <p className="fw-semibold text-main mb-2">No stock items yet</p>
            </div>
          </div>
        ) : (
          <div className="row g-3 row-cols-1 row-cols-md-2 row-cols-lg-3">
            {filtered.map((item) => <div key={item.id} className="col">{stockCard(item)}</div>)}
          </div>
        )}

        {/* ── Add / edit item modal ── */}
        {open && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{editingId ? 'Edit Item' : 'New Item'}</h5>
                    <button type="button" className="btn-close" onClick={() => setOpen(false)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Item name</label>
                      <input className="form-control" value={form.name} maxLength={150} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="row g-3">
                      <div className="col-6 col-md-4">
                        <label className="form-label">Category</label>
                        <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                          {categories.map((c) => <option key={c} value={c} className="text-capitalize">{c}</option>)}
                        </select>
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Unit</label>
                        <input className="form-control" value={form.unit} maxLength={30} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Unit price (RWF)</label>
                        <input type="number" min={0} className="form-control" value={form.unit_price} onChange={(e) => setForm({ ...form, unit_price: e.target.value })} />
                      </div>
                    </div>
                    <div className="row g-3">
                      <div className="col-6 col-md-4">
                        <label className="form-label">Quantity in stock</label>
                        <input type="number" min={0} className="form-control" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Minimum level</label>
                        <input type="number" min={0} className="form-control" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">Storage location</label>
                        <input className="form-control" value={form.location} maxLength={150} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Room, shelf..." />
                      </div>
                    </div>
                    {!editingId && items.some((i) => i.name.trim().toLowerCase() === form.name.trim().toLowerCase()) && (
                      <p className="text-success bd-fs-sm">This item already exists — the quantity will be added to the current total.</p>
                    )}
                    <div className="d-flex justify-content-end gap-2 pt-2">
                      <button type="button" className="btn btn-outline-secondary" onClick={() => setOpen(false)}>Cancel</button>
                      <button type="button" className="btn btn-success" onClick={saveItem}>{editingId ? 'Save Changes' : 'Add Item'}</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Receive / issue modal ── */}
        {moveItem && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{moveType === 'in' ? 'Stock in' : 'Stock out'} — {moveItem.name}</h5>
                    <button type="button" className="btn-close" onClick={() => setMoveItem(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body d-flex flex-column gap-3">
                    <p className="text-muted bd-fs-sm mb-0">Currently in stock: {moveItem.quantity} {moveItem.unit}</p>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Amount</label>
                      <input type="number" className="form-control" min={1} value={moveQty} onChange={(e) => setMoveQty(e.target.value)} />
                    </div>
                    <div className="d-flex flex-column gap-2">
                      <label className="form-label">Reason / reference</label>
                      <input className="form-control" value={moveReason} maxLength={300} placeholder={moveType === 'in' ? 'Purchase, donation...' : 'Given to class, repair...'} onChange={(e) => setMoveReason(e.target.value)} />
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-end gap-2">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setMoveItem(null)}>Cancel</button>
                    <button type="button" className="btn btn-success" onClick={saveMovement}>Record</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── History modal ── */}
        {historyItem && (
          <>
            <div className="bd-modal-backdrop" />
            <div className="bd-modal show">
              <div className="modal-dialog modal-dialog-scrollable modal-dialog-centered">
                <div className="modal-content">
                  <div className="modal-header d-flex justify-content-between align-items-center border-bottom border-secondary-subtle py-3">
                    <h5 className="modal-title fw-semibold text-main mb-0">{historyItem.name} — Movements</h5>
                    <button type="button" className="btn-close" onClick={() => setHistoryItem(null)} aria-label="Close" />
                  </div>
                  <div className="modal-body">
                    {(() => {
                      const rows = movements.filter((m) => m.item_id === historyItem?.id);
                      if (rows.length === 0) return <p className="text-muted bd-fs-sm mb-0">No movements recorded yet.</p>;
                      return (
                        <div className="d-flex flex-column gap-2">
                          {rows.map((m) => (
                            <div key={m.id} className="d-flex align-items-center justify-content-between gap-3 rounded-3 border border-secondary-subtle p-3">
                              <div>
                                <p className="fw-semibold text-main mb-0">
                                  {m.movement_type === 'in' ? 'Received' : 'Issued'} {m.quantity} {historyItem?.unit}
                                </p>
                                <p className="text-muted bd-fs-sm mb-0 mt-1">
                                  {new Date(m.movement_date).toLocaleDateString()}
                                  {m.reason ? ` · ${m.reason}` : ''}
                                </p>
                              </div>
                              <span className={`badge bd-fs-sm ${m.movement_type === 'in' ? 'text-bg-success' : 'text-bg-danger'}`}>
                                {m.movement_type === 'in' ? '+' : '−'}{m.quantity}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
