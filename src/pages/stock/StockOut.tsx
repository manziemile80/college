import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useStockData } from '@/hooks/useStockData';
import { canRecordStock } from '@/lib/stockRoles';
import { expiryLabel, expiryStatus, formatMoney, lineTotal, reference, summarizeLines } from '@/lib/stock';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Send, Trash2, ArrowUpCircle } from '@/lib/icons';

const REASONS = ['sales', 'internal usage', 'damaged products', 'expired products', 'returned to supplier', 'other'];

interface Line {
  key: string; productId: string; code: string; name: string; unit: string;
  available: number; quantity: string; unitPrice: string; notes: string;
}
const blankLine = (): Line => ({
  key: Math.random().toString(36).slice(2), productId: '', code: '', name: '', unit: 'pcs',
  available: 0, quantity: '', unitPrice: '', notes: '',
});

export default function StockOut() {
  const { role } = useAuth();
  const { toast } = useToast();
  const { products, batches, stockOuts, loading, refresh } = useStockData();
  const [params] = useSearchParams();
  const canWrite = canRecordStock(role);

  const [lines, setLines] = useState<Line[]>(() => {
    const initial = blankLine();
    const preset = products.find((p) => p.id === params.get('product'));
    return [preset ? { ...initial, productId: preset.id, code: preset.product_code, name: preset.name, unit: preset.unit, available: preset.quantity, unitPrice: String(preset.average_unit_cost || preset.unit_price || '') } : initial];
  });
  const [reason, setReason] = useState('sales');
  const [recipient, setRecipient] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [ref, setRef] = useState(() => reference('OUT'));
  const [saving, setSaving] = useState(false);

  const restricted = ['expired products', 'damaged products', 'returned to supplier'].includes(reason);
  const totals = summarizeLines(lines.map((line) => ({
    quantity: Number(line.quantity) || 0, unitPrice: Number(line.unitPrice) || 0, unit: line.unit,
  })));

  const patch = (key: string, value: Partial<Line>) => setLines((current) => current.map((l) => (l.key === key ? { ...l, ...value } : l)));

  const selectProduct = (key: string, id: string) => {
    const product = products.find((p) => p.id === id);
    if (product) patch(key, {
      productId: product.id, code: product.product_code, name: product.name, unit: product.unit,
      available: product.quantity, unitPrice: String(product.average_unit_cost || product.unit_price || ''),
    });
  };

  const submit = async () => {
    if (!canWrite) return toast({ title: 'You are not allowed to record stock-out', variant: 'destructive' });
    if (!lines.length) return toast({ title: 'Add at least one product line', variant: 'destructive' });
    for (const line of lines) {
      if (!line.productId) return toast({ title: 'Select a product for every line', variant: 'destructive' });
      const qty = Number(line.quantity) || 0;
      if (!(qty > 0)) return toast({ title: 'Quantity must be greater than zero', variant: 'destructive' });
      if (qty > line.available) return toast({ title: `Insufficient stock for ${line.name}`, description: `Only ${line.available} ${line.unit} available.`, variant: 'destructive' });
    }
    if (restricted && !confirm(`Record this stock as "${reason}"? These quantities will not count as sales revenue.`)) return;

    setSaving(true);
    const { error } = await supabase.rpc('record_stock_out', {
      p_reference: ref, p_transaction_date: date, p_reason: reason,
      p_recipient: recipient.trim().slice(0, 150) || null,
      p_notes: notes.trim().slice(0, 500) || null,
      p_lines: lines.map((line) => ({
        product_id: line.productId, quantity: Number(line.quantity),
        unit_price: Number(line.unitPrice) || 0, notes: line.notes || null,
      })),
      p_allow_restricted: restricted,
    });
    setSaving(false);
    if (error) return toast({ title: 'Stock-out failed', description: error.message, variant: 'destructive' });
    toast({ title: 'Stock issued', description: `${totals.lines} line(s) · ${formatMoney(totals.totalAmount)}` });
    setLines([blankLine()]);
    setRecipient('');
    setNotes('');
    setRef(reference('OUT'));
    refresh();
  };

  const selectedBatches = batches.filter((b) => lines.some((l) => l.productId === b.product_id && b.remaining_quantity > 0))
    .sort((a, b) => (a.expiry_date || '9999').localeCompare(b.expiry_date || '9999'));

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock Out" description="Issue stock using FEFO (first expired, first out). Expired batches are blocked for normal sales." />
        <StockTabs />

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><ArrowUpCircle className="text-success" /> New Issue</h5></div>
          <div className="card-body d-flex flex-column gap-3">
            <div className="row g-3">
              <div className="col-md-3"><label className="form-label">Reference</label><input className="form-control" value={ref} onChange={(e) => setRef(e.target.value)} /></div>
              <div className="col-md-3"><label className="form-label">Transaction date</label><input type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div className="col-md-3"><label className="form-label">Reason</label><select className="form-select" value={reason} onChange={(e) => setReason(e.target.value)} disabled={!canWrite}>{REASONS.map((r) => <option key={r} value={r}>{r.replace(/^./, (c) => c.toUpperCase())}</option>)}</select></div>
              <div className="col-md-3"><label className="form-label">Recipient / destination</label><input className="form-control" value={recipient} onChange={(e) => setRecipient(e.target.value)} disabled={!canWrite} /></div>
            </div>

            {lines.map((line, index) => (
              <div key={line.key} className="rounded-3 border border-secondary-subtle p-3 d-flex flex-column gap-3">
                <div className="d-flex align-items-center justify-content-between">
                  <span className="fw-semibold text-main bd-fs-sm">Line {index + 1}</span>
                  {lines.length > 1 && <button type="button" className="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1" onClick={() => setLines(lines.filter((l) => l.key !== line.key))}><Trash2 /> Remove</button>}
                </div>
                <div className="row g-2">
                  <div className="col-md-4"><label className="form-label">Product</label>
                    <select className="form-select" value={line.productId} onChange={(e) => selectProduct(line.key, e.target.value)} disabled={!canWrite}>
                      <option value="">Select product</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name} ({p.quantity} {p.unit})</option>)}
                    </select>
                  </div>
                  <div className="col-md-2"><label className="form-label">Available</label><input className="form-control" value={`${line.available} ${line.unit}`} readOnly /></div>
                  <div className="col-md-2"><label className="form-label">Quantity issued</label><input type="number" min={0.01} step="any" max={line.available} className="form-control" value={line.quantity} onChange={(e) => patch(line.key, { quantity: e.target.value })} disabled={!canWrite} /></div>
                  <div className="col-md-2"><label className="form-label">Unit price</label><input type="number" min={0} step="any" className="form-control" value={line.unitPrice} onChange={(e) => patch(line.key, { unitPrice: e.target.value })} disabled={!canWrite} /></div>
                  <div className="col-md-2 d-flex align-items-end"><div className="w-100"><label className="form-label mb-1">Total price</label><p className="fw-semibold text-success mb-0">{formatMoney(lineTotal(Number(line.quantity) || 0, Number(line.unitPrice) || 0))}</p></div></div>
                  <div className="col-12"><label className="form-label">Notes</label><input className="form-control" value={line.notes} onChange={(e) => patch(line.key, { notes: e.target.value })} disabled={!canWrite} /></div>
                </div>
              </div>
            ))}

            {canWrite && <button type="button" className="btn btn-outline-success d-inline-flex align-items-center gap-1 align-self-start" onClick={() => setLines([...lines, blankLine()])}><Plus /> Add product line</button>}

            {selectedBatches.length > 0 && (
              <div className="rounded-3 bg-secondary-subtle p-3">
                <p className="fw-semibold text-main mb-2">FEFO batch allocation preview</p>
                <div className="d-flex flex-wrap gap-2">{selectedBatches.map((batch) => {
                  const status = expiryStatus(batch.expiry_date);
                  return <span key={batch.id} className={`badge ${expiryStatus(batch.expiry_date) === 'expired' ? 'text-bg-danger' : 'text-bg-success'} bd-fs-sm`}>
                    {batch.batch_number} · {batch.remaining_quantity} {batch.unit} · {expiryLabel[status]}
                  </span>;
                })}</div>
              </div>
            )}

            <div className="rounded-3 bg-secondary-subtle p-3">
              <p className="fw-semibold text-main mb-2">Stock-Out Summary</p>
              <div className="d-flex flex-wrap gap-4 bd-fs-sm">
                <span>Total product lines: <strong className="text-main">{totals.lines}</strong></span>
                <span>Total quantity: <strong className="text-main">{totals.totalQuantity}</strong>{Object.entries(totals.byUnit).map(([unit, qty]) => <span key={unit} className="ms-1 text-muted">({qty} {unit})</span>)}</span>
                <span>Total stock-out value: <strong className="text-success">{formatMoney(totals.totalAmount)}</strong></span>
              </div>
              {restricted && <p className="text-danger bd-fs-sm mb-0 mt-2">This issue is recorded as {reason} and will not be counted as sales revenue.</p>}
            </div>

            <div className="row g-3"><div className="col-md-8"><label className="form-label">Notes</label><textarea className="form-control" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canWrite} /></div></div>
            {canWrite && <div className="d-flex justify-content-end"><button type="button" className="btn btn-success d-inline-flex align-items-center gap-1" onClick={submit} disabled={saving}>{saving ? <><span className="spinner-border spinner-border-sm" /> Saving...</> : <><Send /> Issue Stock</>}</button></div>}
          </div>
        </div>

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Recent Issues</h5></div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-6"><span className="spinner-border spinner-border-lg text-success" /></div>
              : stockOuts.length === 0 ? <p className="text-muted bd-fs-sm p-4 mb-0">No issues recorded yet.</p>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Reference</th><th>Date</th><th>Reason</th><th>Recipient</th><th className="text-end">Quantity</th><th className="text-end">Value</th></tr></thead>
                <tbody>{stockOuts.map((txn) => <tr key={txn.id} className="border-bottom border-secondary-subtle">
                  <td className="fw-medium text-main">{txn.reference}</td><td>{new Date(txn.transaction_date).toLocaleDateString()}</td>
                  <td className="text-capitalize">{txn.reason}</td><td>{txn.recipient || '—'}</td>
                  <td className="text-end">{txn.total_quantity}</td><td className="text-end fw-semibold">{formatMoney(txn.total_amount)}</td>
                </tr>)}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
