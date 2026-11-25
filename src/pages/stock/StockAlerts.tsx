import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useStockData } from '@/hooks/useStockData';
import { formatMoney, stockAlert, unitCost } from '@/lib/stock';
import { AlertTriangle, Package } from '@/lib/icons';

export default function StockAlerts() {
  const { products, loading } = useStockData();
  const alerts = products.map((product) => ({ product, ...stockAlert(product), value: unitCost(product) * Math.max(0, product.quantity) }))
    .filter((row) => row.isLow || row.isOut)
    .sort((a, b) => a.product.quantity - b.product.quantity);
  const out = alerts.filter((row) => row.isOut).length;
  const low = alerts.filter((row) => row.isLow).length;

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Low Stock & Out-of-Stock Alerts" description="Reorder suggestions are calculated from each product's minimum stock level."
          actions={<Link to="/stock/in" className="btn btn-success d-inline-flex align-items-center gap-1"><Package /> Receive Stock</Link>} />
        <StockTabs />

        <div className="row g-3">
          <div className="col-md-6"><div className="card border-danger border-2"><div className="card-body p-4">
            <p className="text-danger fw-semibold mb-1">Out of stock</p><p className="fs-2 fw-semibold text-main mb-0">{out}</p>
          </div></div></div>
          <div className="col-md-6"><div className="card border-warning border-2"><div className="card-body p-4">
            <p className="text-warning fw-semibold mb-1">Low stock</p><p className="fs-2 fw-semibold text-main mb-0">{low}</p>
          </div></div></div>
        </div>

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Reorder List</h5></div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div>
              : alerts.length === 0 ? <div className="empty-state"><AlertTriangle className="empty-state-icon text-secondary" /><p className="text-secondary mb-0">All products are above their minimum level</p></div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Product</th><th>Code</th><th>Unit</th><th className="text-end">Current</th><th className="text-end">Minimum</th><th className="text-end">Reorder qty</th><th className="text-end">Est. cost</th><th>Status</th></tr></thead>
                <tbody>{alerts.map(({ product, isOut, reorderQuantity, value }) => (
                  <tr key={product.id} className="border-bottom border-secondary-subtle">
                    <td className="fw-medium text-main">{product.name}</td>
                    <td className="bd-fs-sm text-muted">{product.product_code}</td>
                    <td>{product.unit}</td>
                    <td className="text-end fw-semibold">{product.quantity}</td>
                    <td className="text-end">{product.min_quantity}</td>
                    <td className="text-end fw-semibold text-success">{reorderQuantity}</td>
                    <td className="text-end bd-fs-sm">{formatMoney(value)}</td>
                    <td><span className={`badge ${isOut ? 'text-bg-danger' : 'text-bg-warning'} bd-fs-sm`}>{isOut ? 'Out of stock' : 'Low stock'}</span></td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
