import { useMemo, useState, type ElementType } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useStockData, Product } from '@/hooks/useStockData';
import { canManageStockSettings } from '@/lib/stockRoles';
import { expiryBadge, expiryLabel, expiryStatus, formatMoney, inventoryValue, stockAlert, unitCost } from '@/lib/stock';
import { exportCsv, exportPdf } from '@/lib/stockExport';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Download, FileText, Package, Pencil, Plus, Search, Boxes } from '@/lib/icons';

const emptyForm = {
  name: '', product_code: '', category: 'general', unit: 'pcs', description: '',
  min_quantity: '0', location: '', notes: '',
};
const PAGE_SIZE = 12;

export default function Stock() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { products, batches, movements, loading, error, refresh } = useStockData();
  const canManage = canManageStockSettings(role);

  const [search, setSearch] = useState(params.get('search') || '');
  const [filter, setFilter] = useState<'all' | 'low' | 'out' | 'expiring'>('all');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const rows = useMemo(() => products.map((product) => {
    const productMovements = movements.filter((m) => m.item_id === product.id);
    const productBatches = batches.filter((b) => b.product_id === product.id);
    const received = productMovements.filter((m) => m.movement_type === 'in');
    const issued = productMovements.filter((m) => m.movement_type === 'out');
    const earliest = productBatches
      .filter((b) => b.remaining_quantity > 0 && b.expiry_date)
      .sort((a, b) => (a.expiry_date || '').localeCompare(b.expiry_date || ''))[0];
    return {
      product,
      stockIn: received.reduce((sum, m) => sum + Number(m.quantity || 0), 0),
      stockOut: issued.reduce((sum, m) => sum + Number(m.quantity || 0), 0),
      value: inventoryValue(product),
      expiry: earliest ? expiryStatus(earliest.expiry_date) : 'none',
      batches: productBatches.length,
      ...stockAlert(product),
    };
  }), [products, batches, movements]);

  const filtered = rows.filter((row) => {
    const q = search.toLowerCase();
    const matches = `${row.product.name} ${row.product.product_code} ${row.product.category}`.toLowerCase().includes(q);
    if (!matches) return false;
    if (filter === 'low') return row.isLow;
    if (filter === 'out') return row.isOut;
    if (filter === 'expiring') return ['expired', 'today', 'within7', 'within30'].includes(row.expiry);
    return row.product.status === 'active';
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(Math.min(page, totalPages - 1) * PAGE_SIZE, (Math.min(page, totalPages - 1) + 1) * PAGE_SIZE);

  const totals = useMemo(() => ({
    value: rows.reduce((sum, r) => sum + r.value, 0),
    quantity: rows.reduce((sum, r) => sum + Number(r.product.quantity || 0), 0),
    low: rows.filter((r) => r.isLow).length,
    out: rows.filter((r) => r.isOut).length,
  }), [rows]);

  const openEditor = (product: Product | 'new') => {
    setEditing(product);
    setForm(product === 'new' ? emptyForm : {
      name: product.name,
      product_code: product.product_code,
      category: product.category,
      unit: product.unit,
      description: product.description || '',
      min_quantity: String(product.min_quantity),
      location: product.location || '',
      notes: product.notes || '',
    });
  };

  const saveProduct = async () => {
    const name = form.name.trim();
    const code = form.product_code.trim().toUpperCase();
    if (!name || !code) {
      toast({ title: 'Name and product code are required', variant: 'destructive' });
      return;
    }
    const duplicate = products.find((p) => p.id !== (editing === 'new' ? null : (editing as Product).id)
      && p.product_code.trim().toUpperCase() === code);
    if (duplicate) {
      toast({ title: 'Product code already exists', description: 'Use the existing product for new stock instead.', variant: 'destructive' });
      return;
    }
    const similar = products.find((p) => p.id !== (editing === 'new' ? null : (editing as Product).id)
      && p.name.trim().toLowerCase() === name.toLowerCase());
    if (similar && !confirm(`A product named "${similar.name}" already exists (${similar.product_code}). Create another product anyway?`)) return;

    setSaving(true);
    const payload = {
      name: name.slice(0, 150),
      product_code: code.slice(0, 50),
      category: form.category || 'general',
      unit: form.unit || 'pcs',
      description: form.description.trim().slice(0, 500) || null,
      min_quantity: Math.max(0, Number(form.min_quantity) || 0),
      location: form.location.trim().slice(0, 150) || null,
      notes: form.notes.trim().slice(0, 500) || null,
    };
    const { error: saveError } = editing === 'new'
      ? await supabase.from('stock_items').insert({ ...payload, created_by: user!.id })
      : await supabase.from('stock_items').update(payload).eq('id', (editing as Product).id);
    setSaving(false);
    if (saveError) {
      toast({ title: 'Could not save product', description: saveError.message, variant: 'destructive' });
      return;
    }
    toast({ title: editing === 'new' ? 'Product created' : 'Product updated' });
    setEditing(null);
    refresh();
  };

  const toggleStatus = async (product: Product) => {
    const { error: updateError } = await supabase.from('stock_items')
      .update({ status: product.status === 'active' ? 'inactive' : 'active' })
      .eq('id', product.id);
    if (updateError) return toast({ title: 'Could not update status', description: updateError.message, variant: 'destructive' });
    toast({ title: 'Product status updated' });
    refresh();
  };

  const exportRows = filtered.map((r) => ({
    code: r.product.product_code,
    name: r.product.name,
    category: r.product.category,
    unit: r.product.unit,
    stockIn: r.stockIn,
    stockOut: r.stockOut,
    available: r.product.quantity,
    cost: unitCost(r.product),
    value: r.value,
    min: r.product.min_quantity,
    expiry: expiryLabel[r.expiry],
  }));
  const columns = [
    { header: 'Code', key: 'code' }, { header: 'Product', key: 'name' }, { header: 'Category', key: 'category' },
    { header: 'Unit', key: 'unit' }, { header: 'Stock In', key: 'stockIn' }, { header: 'Stock Out', key: 'stockOut' },
    { header: 'Available', key: 'available' }, { header: 'Avg Cost', key: 'cost' }, { header: 'Value', key: 'value' },
    { header: 'Min', key: 'min' }, { header: 'Expiry', key: 'expiry' },
  ];
  const meta = {
    title: 'Product Inventory',
    period: new Date().toLocaleDateString(),
    generatedBy: user?.email || 'System',
    summary: `Unique products: ${filtered.length} · Total quantity: ${totals.quantity} · Inventory value: ${formatMoney(totals.value)}`,
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader
          eyebrow="Operations"
          title="Product Inventory"
          description="One row per unique product. All receipts and issues are kept in the movement history."
          actions={
            <div className="d-flex flex-wrap gap-2">
              <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => exportCsv(exportRows, columns, meta)}><Download /> Excel (CSV)</button>
              <button type="button" className="btn btn-outline-primary d-inline-flex align-items-center gap-1" onClick={() => exportPdf(exportRows, columns, meta)}><FileText /> PDF / Print</button>
              {canManage && <button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={() => openEditor('new')}><Plus /> New Product</button>}
            </div>
          }
        />
        <StockTabs />

        <div className="row g-3">
          {([
            ['Unique products', rows.length, Package],
            ['Total quantity', totals.quantity, Boxes],
            ['Inventory value', formatMoney(totals.value), FileText],
            ['Low / out of stock', `${totals.low} / ${totals.out}`, Package],
          ] as [string, string | number, ElementType][]).map(([label, value, Icon]) => (
            <div className="col-6 col-lg-3" key={label as string}>
              <div className="card h-100"><div className="card-body p-3">
                <div className="d-flex align-items-center gap-2 text-secondary bd-fs-sm"><Icon className="text-success" /> {label as string}</div>
                <p className="fs-5 fw-semibold text-main mb-0 mt-2">{value as string}</p>
              </div></div>
            </div>
          ))}
        </div>

        {error && <div className="alert alert-danger mb-0">Could not load stock data: {error}</div>}

        <div className="card">
          <div className="card-header d-flex flex-wrap align-items-center gap-3 py-3">
            <div className="input-group flex-grow-1" style={{ maxWidth: 360 }}>
              <span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
              <input className="form-control border-secondary-subtle" placeholder="Search name, code or category..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            </div>
            <select className="form-select w-auto" value={filter} onChange={(e) => { setFilter(e.target.value as typeof filter); setPage(0); }}>
              <option value="all">All active products</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="expiring">Expiring soon</option>
            </select>
          </div>
          <div className="card-body p-0">
            {loading ? (
              <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" role="status" /></div>
            ) : visible.length === 0 ? (
              <div className="empty-state"><Package className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">No products found</p></div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead><tr className="border-bottom border-secondary-subtle">
                    <th>Code</th><th>Product</th><th>Unit</th><th className="text-end">Stock In</th>
                    <th className="text-end">Stock Out</th><th className="text-end">Available</th>
                    <th className="text-end">Avg Cost</th><th className="text-end">Value</th>
                    <th>Expiry</th><th className="text-end">Actions</th>
                  </tr></thead>
                  <tbody>
                    {visible.map((row) => (
                      <tr key={row.product.id} className="border-bottom border-secondary-subtle">
                        <td className="text-muted bd-fs-sm">{row.product.product_code}</td>
                        <td>
                          <span className="fw-medium text-main">{row.product.name}</span>
                          <span className="d-block text-muted bd-fs-xs">{row.product.category}{row.batches ? ` · ${row.batches} batch(es)` : ''}</span>
                          {(row.isOut || row.isLow) && <span className={`badge ${row.isOut ? 'text-bg-danger' : 'text-bg-warning'} bd-fs-xs ms-1`}>{row.isOut ? 'Out of stock' : `Low (min ${row.product.min_quantity})`}</span>}
                        </td>
                        <td className="bd-fs-sm">{row.product.unit}</td>
                        <td className="text-end">{row.stockIn}</td>
                        <td className="text-end">{row.stockOut}</td>
                        <td className="text-end fw-semibold">{row.product.quantity}</td>
                        <td className="text-end bd-fs-sm">{formatMoney(unitCost(row.product))}</td>
                        <td className="text-end fw-semibold">{formatMoney(row.value)}</td>
                        <td><span className={`badge ${expiryBadge[row.expiry]} bd-fs-xs`}>{expiryLabel[row.expiry]}</span></td>
                        <td className="text-end">
                          <div className="d-flex justify-content-end gap-1">
                            <button type="button" className="btn btn-outline-success btn-sm" title="Receive stock" onClick={() => navigate(`/stock/in?product=${row.product.id}`)}>In</button>
                            <button type="button" className="btn btn-outline-warning btn-sm" title="Issue stock" onClick={() => navigate(`/stock/out?product=${row.product.id}`)}>Out</button>
                            {canManage && <>
                              <button type="button" className="btn btn-outline-primary btn-sm" aria-label="Edit product" onClick={() => openEditor(row.product)}><Pencil /></button>
                              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => toggleStatus(row.product)}>{row.product.status === 'active' ? 'Disable' : 'Enable'}</button>
                            </>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {totalPages > 1 && <div className="card-footer d-flex justify-content-between align-items-center">
            <span className="text-muted bd-fs-sm">Page {Math.min(page, totalPages - 1) + 1} of {totalPages}</span>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page <= 0} onClick={() => setPage(page - 1)}>Previous</button>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>}
        </div>
      </div>

      {editing && (
        <>
          <div className="bd-modal-backdrop" />
          <div className="bd-modal show"><div className="modal-dialog modal-dialog-scrollable modal-dialog-centered"><div className="modal-content">
            <div className="modal-header d-flex justify-content-between py-3"><h5 className="modal-title fw-semibold text-main mb-0">{editing === 'new' ? 'New Product' : 'Edit Product'}</h5>
              <button type="button" className="btn-close" onClick={() => setEditing(null)} aria-label="Close" /></div>
            <div className="modal-body d-flex flex-column gap-3">
              <div className="row g-3">
                <div className="col-md-6"><label className="form-label">Product name</label><input className="form-control" maxLength={150} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="col-md-6"><label className="form-label">Product code / SKU</label><input className="form-control" maxLength={50} value={form.product_code} onChange={(e) => setForm({ ...form, product_code: e.target.value })} /></div>
                <div className="col-md-4"><label className="form-label">Category</label><input className="form-control" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
                <div className="col-md-4"><label className="form-label">Unit</label><input className="form-control" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="pcs, kg, litres..." /></div>
                <div className="col-md-4"><label className="form-label">Minimum stock level</label><input type="number" min={0} className="form-control" value={form.min_quantity} onChange={(e) => setForm({ ...form, min_quantity: e.target.value })} /></div>
                <div className="col-12"><label className="form-label">Description</label><textarea className="form-control" maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                <div className="col-md-6"><label className="form-label">Location</label><input className="form-control" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
                <div className="col-md-6"><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              </div>
              <p className="text-muted bd-fs-sm mb-0">A product is never duplicated by a stock receipt: if the code already exists, the stock is added to that product.</p>
            </div>
            <div className="modal-footer d-flex justify-content-end gap-2"><button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="btn btn-success" onClick={saveProduct} disabled={saving}>{saving ? 'Saving...' : 'Save Product'}</button></div>
          </div></div></div>
        </>
      )}
    </DashboardLayout>
  );
}
