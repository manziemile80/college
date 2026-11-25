import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useStockData } from '@/hooks/useStockData';
import { formatMoney } from '@/lib/stock';
import { exportCsv, exportPdf } from '@/lib/stockExport';
import { Download, FileText, History } from '@/lib/icons';

export default function StockMovements() {
  const { user } = useAuth();
  const { movements, products, loading, error } = useStockData();
  const [productId, setProductId] = useState('');
  const [type, setType] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  const rows = useMemo(() => movements.map((m) => ({
    ...m,
    product: products.find((p) => p.id === m.item_id),
  })).filter((m) => {
    if (productId && m.item_id !== productId) return false;
    if (type !== 'all' && m.movement_type !== type) return false;
    if (from && m.movement_date < from) return false;
    if (to && m.movement_date > to) return false;
    const q = query.toLowerCase();
    return !q || `${m.product?.name || ''} ${m.product_code || ''} ${m.reference || ''} ${m.batch_id || ''} ${m.reason || ''} ${m.supplier || ''} ${m.recipient || ''}`.toLowerCase().includes(q);
  }), [movements, products, productId, type, from, to, query]);

  const columns = [
    { header: 'Reference', key: 'reference' }, { header: 'Product', key: 'name' }, { header: 'Code', key: 'code' },
    { header: 'Type', key: 'type' }, { header: 'Batch', key: 'batch' }, { header: 'Qty', key: 'quantity' },
    { header: 'Unit', key: 'unit' }, { header: 'Unit price', key: 'unitPrice' }, { header: 'Total', key: 'total' },
    { header: 'Previous', key: 'previous' }, { header: 'New', key: 'new' }, { header: 'Reason', key: 'reason' },
    { header: 'Date', key: 'date' }, { header: 'Performed by', key: 'performedBy' },
  ];
  const exportRows = rows.map((m) => ({
    reference: m.reference || '—', name: m.product?.name || '—', code: m.product_code || m.product?.product_code || '—',
    type: m.movement_type === 'in' ? 'Stock In' : 'Stock Out', batch: m.batch_id || '—',
    quantity: m.quantity, unit: m.product?.unit || '', unitPrice: formatMoney(m.unit_price), total: formatMoney(m.total_price),
    previous: m.previous_quantity, new: m.new_quantity, reason: m.reason || '—',
    date: new Date(m.created_at).toLocaleString(), performedBy: m.recorded_by,
  }));
  const meta = {
    title: 'Stock Movement History',
    period: from || to ? `${from || 'Start'} to ${to || 'Today'}` : 'All records',
    generatedBy: user?.email || 'System',
    summary: `Transactions: ${rows.length} · Stock in: ${rows.filter((r) => r.movement_type === 'in').reduce((s, r) => s + Number(r.quantity), 0)} · Stock out: ${rows.filter((r) => r.movement_type === 'out').reduce((s, r) => s + Number(r.quantity), 0)}`,
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock Movement History" description="Permanent ledger of every receipt and issue with previous and new balances."
          actions={<div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => exportCsv(exportRows, columns, meta)}><Download /> Excel (CSV)</button>
            <button type="button" className="btn btn-outline-primary d-inline-flex align-items-center gap-1" onClick={() => exportPdf(exportRows, columns, meta)}><FileText /> PDF</button>
          </div>} />
        <StockTabs />
        {error && <div className="alert alert-danger mb-0">{error}</div>}

        <div className="card">
          <div className="card-header d-flex flex-wrap gap-3 py-3">
            <select className="form-select w-auto" value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.product_code} — {p.name}</option>)}
            </select>
            <select className="form-select w-auto" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">In and out</option><option value="in">Stock In</option><option value="out">Stock Out</option>
            </select>
            <input type="date" className="form-control w-auto" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <input type="date" className="form-control w-auto" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            <input className="form-control flex-grow-1" style={{ maxWidth: 280 }} placeholder="Search reference, batch, reason..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div>
              : rows.length === 0 ? <div className="empty-state"><History className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">No movements match your filters</p></div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle">
                  <th>Ref</th><th>Product</th><th>Type</th><th>Batch</th><th className="text-end">Qty</th><th className="text-end">Unit price</th>
                  <th className="text-end">Total</th><th className="text-end">Prev → New</th><th>Reason</th><th>Date</th><th>By</th>
                </tr></thead>
                <tbody>{rows.slice(0, 300).map((m) => (
                  <tr key={m.id} className="border-bottom border-secondary-subtle">
                    <td className="bd-fs-sm text-muted">{m.reference || '—'}</td>
                    <td><span className="text-main">{m.product?.name || '—'}</span><span className="d-block bd-fs-xs text-muted">{m.product_code || ''}</span></td>
                    <td><span className={`badge ${m.movement_type === 'in' ? 'text-bg-success' : 'text-bg-warning'} bd-fs-xs`}>{m.movement_type === 'in' ? 'In' : 'Out'}</span></td>
                    <td className="bd-fs-sm">{m.batch_id?.slice(0, 8) || '—'}</td>
                    <td className="text-end">{m.quantity} {m.product?.unit || ''}</td>
                    <td className="text-end bd-fs-sm">{formatMoney(m.unit_price)}</td>
                    <td className="text-end fw-semibold">{formatMoney(m.total_price)}</td>
                    <td className="text-end bd-fs-sm">{m.previous_quantity} → {m.new_quantity}</td>
                    <td className="bd-fs-sm text-capitalize">{m.reason || '—'}</td>
                    <td className="bd-fs-sm">{new Date(m.created_at).toLocaleString()}</td>
                    <td className="bd-fs-sm text-muted">{m.recorded_by.slice(0, 8)}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </div>
          {rows.length > 300 && <div className="card-footer text-muted bd-fs-sm">Showing the 300 most recent of {rows.length} transactions. Use filters or export to see all.</div>}
        </div>
      </div>
    </DashboardLayout>
  );
}
