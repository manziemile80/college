import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useStockData } from '@/hooks/useStockData';
import { daysUntil, expiryBadge, expiryLabel, expiryStatus, ExpiryStatus } from '@/lib/stock';
import { CalendarCheck } from '@/lib/icons';

const ORDER: ExpiryStatus[] = ['expired', 'today', 'within7', 'within30', 'within60', 'safe', 'none'];

export default function StockExpiry() {
  const { batches, products, suppliers, loading } = useStockData();
  const [filter, setFilter] = useState<ExpiryStatus | 'all'>('all');

  const rows = useMemo(() => batches.filter((b) => b.remaining_quantity > 0).map((batch) => ({
    batch,
    product: products.find((p) => p.id === batch.product_id),
    supplier: suppliers.find((s) => s.id === batch.supplier_id),
    status: expiryStatus(batch.expiry_date),
    days: daysUntil(batch.expiry_date),
  })).sort((a, b) => (a.days ?? 99999) - (b.days ?? 99999)), [batches, products, suppliers]);

  const counts = ORDER.reduce((acc, key) => ({ ...acc, [key]: rows.filter((r) => r.status === key).length }), {} as Record<ExpiryStatus, number>);
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Expiry Management" description="Expiry is tracked per batch. Expired batches cannot be issued for normal sales or usage."
          actions={<Link to="/stock/out" className="btn btn-outline-danger d-inline-flex align-items-center gap-1">Record Expired Removal</Link>} />
        <StockTabs />

        <div className="row g-3 row-cols-2 row-cols-md-4 row-cols-xl-7">
          {ORDER.map((status) => (
            <button type="button" key={status} className={`card h-100 text-start ${filter === status ? 'border-success border-2' : ''}`} onClick={() => setFilter(filter === status ? 'all' : status)}>
              <div className="card-body p-3">
                <span className={`badge ${expiryBadge[status]} bd-fs-xs`}>{expiryLabel[status]}</span>
                <p className="fs-4 fw-semibold text-main mb-0 mt-2">{counts[status]}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-header py-3 d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-semibold text-main">{filter === 'all' ? 'All batches' : expiryLabel[filter]}</h5>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setFilter('all')}>Show all</button>
          </div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div>
              : visible.length === 0 ? <div className="empty-state"><CalendarCheck className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">No batches in this category</p></div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Product</th><th>Code</th><th>Batch</th><th className="text-end">Qty</th><th>Unit</th><th>Manufactured</th><th>Expiry</th><th className="text-end">Days left</th><th>Supplier</th><th>Status</th></tr></thead>
                <tbody>{visible.map(({ batch, product, supplier, status, days }) => (
                  <tr key={batch.id} className="border-bottom border-secondary-subtle">
                    <td className="fw-medium text-main">{product?.name || '—'}</td>
                    <td className="bd-fs-sm text-muted">{product?.product_code}</td>
                    <td>{batch.batch_number}</td>
                    <td className="text-end fw-semibold">{batch.remaining_quantity}</td>
                    <td className="bd-fs-sm">{batch.unit}</td>
                    <td className="bd-fs-sm">{batch.manufacturing_date ? new Date(batch.manufacturing_date).toLocaleDateString() : '—'}</td>
                    <td className="bd-fs-sm">{batch.expiry_date ? new Date(batch.expiry_date).toLocaleDateString() : '—'}</td>
                    <td className="text-end">{days ?? '—'}</td>
                    <td className="bd-fs-sm">{supplier?.name || '—'}</td>
                    <td><span className={`badge ${expiryBadge[status]} bd-fs-sm`}>{expiryLabel[status]}</span></td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
