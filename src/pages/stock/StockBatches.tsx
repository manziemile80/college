import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useStockData } from '@/hooks/useStockData';
import { expiryBadge, expiryLabel, expiryStatus, formatMoney } from '@/lib/stock';
import { Boxes, Search } from '@/lib/icons';

export default function StockBatches() {
  const { batches, products, suppliers, loading, error } = useStockData();
  const [search, setSearch] = useState('');
  const rows = useMemo(() => batches.map((batch) => ({
    batch,
    product: products.find((p) => p.id === batch.product_id),
    supplier: suppliers.find((s) => s.id === batch.supplier_id),
  })).filter((row) => `${row.batch.batch_number} ${row.product?.name || ''} ${row.product?.product_code || ''} ${row.supplier?.name || ''}`
    .toLowerCase().includes(search.toLowerCase())), [batches, products, suppliers, search]);

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock Batches" description="Each receipt can create a batch with its own expiry date. Issuing always consumes the earliest expiring batch first (FEFO)."
          actions={<Link to="/stock/in" className="btn btn-success d-inline-flex align-items-center gap-1"><Boxes /> Receive Stock</Link>} />
        <StockTabs />
        {error && <div className="alert alert-danger mb-0">{error}</div>}
        <div className="card">
          <div className="card-header py-3 d-flex flex-wrap gap-3 align-items-center justify-content-between">
            <h5 className="mb-0 fw-semibold text-main">{rows.length} batch(es)</h5>
            <div className="input-group" style={{ maxWidth: 320 }}><span className="input-group-text bg-white border-secondary-subtle"><Search className="text-secondary" /></span>
              <input className="form-control border-secondary-subtle" placeholder="Search batch, product, supplier..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
          </div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div>
              : rows.length === 0 ? <div className="empty-state"><Boxes className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">No batches yet. Add a batch number when receiving stock.</p></div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Product</th><th>Batch</th><th>Supplier</th><th className="text-end">Received</th><th className="text-end">Remaining</th><th className="text-end">Unit cost</th><th>Expiry</th><th>Status</th></tr></thead>
                <tbody>{rows.map(({ batch, product, supplier }) => {
                  const status = expiryStatus(batch.expiry_date);
                  return <tr key={batch.id} className="border-bottom border-secondary-subtle">
                    <td><span className="fw-medium text-main">{product?.name || 'Unknown product'}</span><span className="d-block text-muted bd-fs-xs">{product?.product_code}</span></td>
                    <td className="fw-medium text-main">{batch.batch_number}</td>
                    <td className="bd-fs-sm">{supplier?.name || '—'}</td>
                    <td className="text-end">{batch.quantity_received} {batch.unit}</td>
                    <td className="text-end fw-semibold">{batch.remaining_quantity} {batch.unit}</td>
                    <td className="text-end bd-fs-sm">{formatMoney(batch.unit_cost)}</td>
                    <td className="bd-fs-sm">{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : '—'}</td>
                    <td><span className={`badge ${expiryBadge[status]} bd-fs-xs`}>{expiryLabel[status]}</span>
                      {status === 'expired' && <span className="d-block text-danger bd-fs-xs">Blocked from normal issue</span>}
                    </td>
                  </tr>;
                })}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
