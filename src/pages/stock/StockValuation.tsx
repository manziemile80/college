import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useStockData } from '@/hooks/useStockData';
import { daysUntil, expiryStatus, formatMoney, inventoryValue, lineTotal, unitCost } from '@/lib/stock';
import { Coins } from '@/lib/icons';

export default function StockValuation() {
  const { products, batches, loading } = useStockData();
  const rows = useMemo(() => products.map((product) => {
    const productBatches = batches.filter((b) => b.product_id === product.id);
    const sellableBatches = productBatches.filter((b) => {
      const status = expiryStatus(b.expiry_date);
      return status !== 'expired' && (daysUntil(b.expiry_date) ?? 0) >= 0;
    });
    return {
      product,
      batchValue: productBatches.reduce((sum, b) => sum + lineTotal(b.remaining_quantity, b.unit_cost), 0),
      sellableValue: sellableBatches.reduce((sum, b) => sum + lineTotal(b.remaining_quantity, b.unit_cost), 0),
      value: inventoryValue(product),
      cost: unitCost(product),
    };
  }), [products, batches]);

  const totalValue = rows.reduce((sum, r) => sum + r.value, 0);
  const sellableValue = rows.reduce((sum, r) => sum + r.sellableValue, 0);
  const categoryData = Object.entries(rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.product.category] = (acc[row.product.category] || 0) + row.value;
    return acc;
  }, {})).map(([category, value]) => ({ category, value: Math.round(value) }));

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Inventory Valuation" description="Weighted-average costing per product and actual remaining-batch cost. Expired stock is excluded from sellable value." />
        <StockTabs />

        <div className="row g-3">
          {[['Total inventory value', formatMoney(totalValue)], ['Sellable stock value', formatMoney(sellableValue)],
            ['Expired / restricted value', formatMoney(Math.max(0, totalValue - sellableValue))], ['Products valued', String(rows.length)]]
            .map(([label, value]) => <div className="col-6 col-lg-3" key={label}>
              <div className="card h-100"><div className="card-body p-3">
                <p className="text-secondary bd-fs-sm mb-1">{label}</p><p className="fs-5 fw-semibold text-main mb-0">{value}</p>
              </div></div>
            </div>)}
        </div>

        {categoryData.length > 0 && <div className="card"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">Inventory Value by Category</h5></div>
          <div className="card-body"><div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="category" /><YAxis />
              <Tooltip formatter={(value) => formatMoney(Number(value))} /><Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div></div>
        </div>}

        <div className="card">
          <div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><Coins className="text-success" /> Product & Batch Valuation</h5></div>
          <div className="card-body p-0">
            {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div>
              : <div className="table-responsive"><table className="table table-hover align-middle mb-0">
                <thead><tr className="border-bottom border-secondary-subtle"><th>Product</th><th>Code</th><th>Category</th><th className="text-end">Qty</th><th className="text-end">Avg cost</th><th className="text-end">Weighted value</th><th className="text-end">Batch cost value</th><th className="text-end">Sellable value</th></tr></thead>
                <tbody>{rows.map(({ product, value, cost, batchValue, sellableValue }) => (
                  <tr key={product.id} className="border-bottom border-secondary-subtle">
                    <td className="fw-medium text-main">{product.name}</td><td className="bd-fs-sm text-muted">{product.product_code}</td>
                    <td className="bd-fs-sm">{product.category}</td><td className="text-end">{product.quantity} {product.unit}</td>
                    <td className="text-end bd-fs-sm">{formatMoney(cost)}</td><td className="text-end fw-semibold">{formatMoney(value)}</td>
                    <td className="text-end">{formatMoney(batchValue)}</td><td className="text-end text-success">{formatMoney(sellableValue)}</td>
                  </tr>
                ))}</tbody>
              </table></div>}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
