import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useStockData } from '@/hooks/useStockData';
import { canRecordStock } from '@/lib/stockRoles';
import { formatMoney, lineTotal, reference, summarizeLines } from '@/lib/stock';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Send, Trash2, ArrowDownCircle } from '@/lib/icons';

interface Line {
  key: string;
  productId: string;
  code: string;
  name: string;
  category: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  batchNumber: string;
  manufacturingDate: string;
  expiryDate: string;
  notes: string;
}

const blankLine = (): Line => ({
  key: Math.random().toString(36).slice(2), productId: '', code: '', name: '', category: 'general',
  unit: 'pcs', quantity: '', unitPrice: '', batchNumber: '', manufacturingDate: '', expiryDate: '', notes: '',
});

export default function StockIn() {
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { products, suppliers, stockIns, loading, refresh } = useStockData();
  const [params] = useSearchParams();
  const canWrite = canRecordStock(role);

  const [lines, setLines] = useState<Line[]>(() => {
    const initial = blankLine();
    const preset = products.find((p) => p.id === params.get('product'));
    return [preset ? { ...initial, productId: preset.id, code: preset.product_code, name: preset.name, category: preset.category, unit: preset.unit, unitPrice: String(preset.average_unit_cost || preset.unit_price || '') } : initial];
  });
  const [supplierId, setSupplierId] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [ref, setRef] = useState(() => reference('IN'));
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(() => lines.map((line) => ({
    quantity: Number(line.quantity) || 0,
    unitPrice: Number(line.unitPrice) || 0,
    unit: line.unit,
  })), [lines]);
  const totals = summarizeLines(parsed);

  const patchLine = (key: string, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const selectProduct = (key: string, id: string) => {
    if (id === '__new__') {
      patchLine(key, { productId: '', code: '', name: '', category: 'general', unit: 'pcs', unitPrice: '' });
      return;
    }
    const product = products.find((p) => p.id === id);
    if (product) patchLine(key, {
      productId: product.id, code: product.product_code, name: product.name,
      category: product.category, unit: product.unit,
      unitPrice: String(product.average_unit_cost || product.unit_price || ''),
    });
  };

  const submit = async () => {
    if (!canWrite) return toast({ title: 'You are not allowed to record stock-in', variant: 'destructive' });
    if (!lines.length) return toast({ title: 'Add at least one product line', variant: 'destructive' });
    for (const line of lines) {
      if (!line.productId && (!line.name.trim() || !line.code.trim())) {
        return toast({ title: 'Each new product needs a name and code', variant: 'destructive' });
      }
      if (!(Number(line.quantity) > 0)) return toast({ title: 'Quantity must be greater than zero', variant: 'destructive' });
      if (Number(line.unitPrice) < 0) return toast({ title: 'Unit price cannot be negative', variant: 'destructive' });
    }

    setSaving(true);
    let supplier = supplierId || null;
    if (!supplier && newSupplier.trim()) {
      const { data, error } = await supabase.from('suppliers')
        .insert({ name: newSupplier.trim().slice(0, 120), created_by: user!.id })
        .select('id').single();
      if (error) { setSaving(false); return toast({ title: 'Could not add supplier', description: error.message, variant: 'destructive' }); }
      supplier = data.id;
    }

    const { error } = await supabase.rpc('record_stock_in', {
      p_reference: ref,
      p_supplier_id: supplier,
      p_transaction_date: date,
      p_notes: notes.trim().slice(0, 500) || null,
      p_lines: lines.map((line) => ({
        product_id: line.productId || null,
        product_code: line.code || null,
        name: line.name || null,
        category: line.category,
        unit: line.unit,
        quantity: Number(line.quantity),
        unit_cost: Number(line.unitPrice) || 0,
        batch_number: line.batchNumber || null,
        manufacturing_date: line.manufacturingDate || null,
        expiry_date: line.expiryDate || null,
        notes: line.notes || null,
      })),
    });
    setSaving(false);
    if (error) return toast({ title: 'Stock-in failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Stock received', description: `${totals.lines} line(s) · ${formatMoney(totals.totalAmount)}` });
    setLines([blankLine()]);
    setNotes('');
    setRef(reference('IN'));
    refresh();
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock In" description="Receive one or more products. Existing SKUs are reused — no duplicate products are created." />
        <StockTabs />

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><ArrowDownCircle className="text-success" /> New Receipt</h5></div>
          <div className="card-body d-flex flex-column gap-3">
            <div className="row g-3">
              <div className="col-md-3"><label className="form-label">Reference</label><input className="form-control" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
              <div className="col-md-3"><label className="form-label">Date received</label><input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="col-md-3"><label className="form-label">Supplier</label>
                <select className="form-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} disabled={!canWrite}>
                  <option value="">Select supplier</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="col-md-3"><label className="form-label">Or new supplier</label><input className="form-control" value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} disabled={!!supplierId || !canWrite} placeholder="Supplier name" /></div>
            </div>

            <div className="d-flex flex-column gap-3">
              {lines.map((line, index) => (
                <div key={line.key} className="rounded-3 border border-secondary-subtle p-3 d-flex flex-column gap-3">
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-semibold text-main bd-fs-sm">Line {index + 1}</span>
                    {lines.length > 1 && <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1" onClick={() => setLines(lines.filter((l) => l.key !== line.key))}><Trash2 /> Remove</button>}
                  </div>
                  <div className="row g-2">
                    <div className="col-md-4"><label className="form-label">Product</label>
                      <select className="form-select" value={line.productId || '__new__'} onChange={(e) => selectProduct(line.key, e.target.value)} disabled={!canWrite}>
                        <option value="__new__">+ New product</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
                      </select>
                    </div>
                    <div className="col-md-4"><label className="form-label">Product code / SKU</label><input className="form-control" value={line.code} onChange={(e) => patchLine(line.key, { code: e.target.value.toUpperCase() })} placeholder="Auto-filled for existing products" disabled={!!line.productId || !canWrite} /></div>
                    <div className="col-md-4"><label className="form-label">Product name</label><input className="form-control" value={line.name} onChange={(e) => patchLine(line.key, { name: e.target.value })} disabled={!!line.productId || !canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Category</label><input className="form-control" value={line.category} onChange={(e) => patchLine(line.key, { category: e.target.value })} disabled={!!line.productId || !canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Unit</label><input className="form-control" value={line.unit} onChange={(e) => patchLine(line.key, { unit: e.target.value })} disabled={!!line.productId || !canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Quantity received</label><input type="number" min={0.01} step="any" className="form-control" value={line.quantity} onChange={(e) => patchLine(line.key, { quantity: e.target.value })} disabled={!canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Unit purchase price</label><input type="number" min={0} step="any" className="form-control" value={line.unitPrice} onChange={(e) => patchLine(line.key, { unitPrice: e.target.value })} disabled={!canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Batch number</label><input className="form-control" value={line.batchNumber} onChange={(e) => patchLine(line.key, { batchNumber: e.target.value })} disabled={!canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Manufacturing date</label><input type="date" className="form-control" value={line.manufacturingDate} onChange={(e) => patchLine(line.key, { manufacturingDate: e.target.value })} disabled={!canWrite} /></div>
                    <div className="col-md-3"><label className="form-label">Expiry date</label><input type="date" className="form-control" value={line.expiryDate} onChange={(e) => patchLine(line.key, { expiryDate: e.target.value })} disabled={!canWrite} /></div>
                    <div className="col-md-3 d-flex align-items-end"><div className="w-100"><label className="form-label mb-1">Total price</label><p className="fw-semibold text-success mb-0">{formatMoney(lineTotal(Number(line.quantity) || 0, Number(line.unitPrice) || 0))}</p></div></div>
                    <div className="col-12"><label className="form-label">Notes</label><input className="form-control" value={line.notes} onChange={(e) => patchLine(line.key, { notes: e.target.value })} disabled={!canWrite} /></div>
                  </div>
                </div>
              ))}
            </div>

            {canWrite && <button type="button" className="btn btn-outline-success d-inline-flex align-items-center gap-1 align-self-start" onClick={() => setLines([...lines, blankLine()])}><Plus /> Add product line</button>}

            <div className="rounded-3 bg-secondary-subtle p-3">
              <p className="fw-semibold text-main mb-2">Stock-In Summary</p>
              <div className="d-flex flex-wrap gap-4 bd-fs-sm">
                <span>Total product lines: <strong className="text-main">{totals.lines}</strong></span>
                <span>Total quantity: <strong className="text-main">{totals.totalQuantity}</strong>{Object.entries(totals.byUnit).map(([unit, qty]) => <span key={unit} className="ms-1 text-muted">({qty} {unit})</span>)}</span>
                <span>Total stock-in value: <strong className="text-success">{formatMoney(totals.totalAmount)}</strong></span>
              </div>
            </div>

            <div className="row g-3"><div className="col-md-8"><label className="form-label">Notes</label><textarea className="form-control" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} /></div></div>

            {canWrite && <div className="d-flex justify-content-end"><button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={submit} disabled={saving}>{saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : <><Send /> Receive Stock</>}</button></div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Recent Receipts</h5></div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-6"><span className="spinner-border spinner-border-lg text-success" /></div>
              : stockIns.length === 0 ? <p className="text-muted bd-fs-sm p-4 mb-0">No receipts recorded yet.</p>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Reference</th><th>Date</th><th className="text-end">Lines</th><th className="text-end">Quantity</th><th className="text-end">Value</th><th>Notes</th></tr></thead>
                <tbody>{stockIns.map((txn) => <tr key={txn.id} className="border-bottom border-secondary-subtle">
                  <td className="fw-medium text-main">{txn.reference}</td><td>{new Date(txn.transaction_date).toLocaleDateString()}</td>
                  <td className="text-end">{txn.total_lines}</td><td className="text-end">{txn.total_quantity}</td>
                  <td className="text-end fw-semibold">{formatMoney(txn.total_amount)}</td><td className="text-muted bd-fs-sm">{txn.notes || '—'}</td>
                </tr>)}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
