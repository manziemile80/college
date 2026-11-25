import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { StockTabs } from '@/components/stock/StockTabs';
import { useAuth } from '@/contexts/AuthContext';
import { useStockData } from '@/hooks/useStockData';
import { expiryStatus, formatMoney, inventoryValue, movementSummary, periodKey, stockAlert } from '@/lib/stock';
import { exportCsv, exportPdf } from '@/lib/stockExport';
import { Download, FileText, BarChart3 } from '@/lib/icons';

type Period = 'daily' | 'weekly' | 'monthly' | 'annual' | 'custom';

export default function StockReports() {
  const { user } = useAuth();
  const { products, batches, movements, loading } = useStockData();
  const [period, setPeriod] = useState<Period>('daily');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const range = useMemo(() => {
    if (period === 'custom') return { from, to };
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(end);
    if (period === 'daily') start.setDate(end.getDate());
    else if (period === 'weekly') start.setDate(end.getDate() - 6);
    else if (period === 'monthly') start.setMonth(end.getMonth(), 1);
    else start.setMonth(0, 1);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }, [period, from, to]);

  const inRange = movements.filter((m) => m.movement_date >= range.from && m.movement_date <= range.to);

  const report = useMemo(() => {
    const net = inRange.reduce((sum, m) => sum + (m.movement_type === 'in' ? 1 : -1) * Number(m.quantity || 0), 0);
    const currentQty = products.reduce((sum, p) => sum + Number(p.quantity || 0), 0);
    const summary = movementSummary(inRange, Math.max(0, currentQty - net));
    const buckets = new Map<string, { period: string; stockIn: number; stockOut: number }>();
    inRange.forEach((m) => {
      const key = periodKey(m.movement_date, period === 'custom' ? 'daily' : period);
      const entry = buckets.get(key) || { period: key, stockIn: 0, stockOut: 0 };
      entry[m.movement_type === 'in' ? 'stockIn' : 'stockOut'] += Number(m.quantity || 0);
      buckets.set(key, entry);
    });
    const byProduct = new Map<string, { name: string; received: number; issued: number }>();
    inRange.forEach((m) => {
      const product = products.find((p) => p.id === m.item_id);
      const key = m.item_id;
      const row = byProduct.get(key) || { name: product?.name || m.product_code || 'Unknown', received: 0, issued: 0 };
      if (m.movement_type === 'in') row.received += Number(m.quantity || 0);
      else row.issued += Number(m.quantity || 0);
      byProduct.set(key, row);
    });
    return {
      summary,
      chart: [...buckets.values()].sort((a, b) => a.period.localeCompare(b.period)),
      topReceived: [...byProduct.values()].sort((a, b) => b.received - a.received).slice(0, 8),
      topIssued: [...byProduct.values()].sort((a, b) => b.issued - a.issued).slice(0, 8),
      lowStock: products.filter((p) => stockAlert(p).isLow || stockAlert(p).isOut),
      expiring: batches.filter((b) => ['expired', 'today', 'within7', 'within30'].includes(expiryStatus(b.expiry_date))),
      valuation: products.reduce((sum, p) => sum + inventoryValue(p), 0),
    };
  }, [inRange, products, batches, period]);

  const card = (label: string, value: string | number, tone = 'text-main') => (
    <div className="card h-100"><div className="card-body p-3">
      <p className="text-secondary bd-fs-sm mb-1">{label}</p><p className={`fs-5 fw-semibold mb-0 ${tone}`}>{value}</p>
    </div></div>
  );

  const exportRows = inRange.map((m) => ({
    ref: m.reference || '—', date: m.movement_date, type: m.movement_type === 'in' ? 'Stock In' : 'Stock Out',
    product: products.find((p) => p.id === m.item_id)?.name || '—', code: m.product_code || '—',
    batch: m.batch_id || '—', quantity: m.quantity, unit: products.find((p) => p.id === m.item_id)?.unit || '',
    unitPrice: formatMoney(m.unit_price), total: formatMoney(m.total_price), reason: m.reason || '—',
  }));
  const columns = [
    { header: 'Ref', key: 'ref' }, { header: 'Date', key: 'date' }, { header: 'Type', key: 'type' },
    { header: 'Product', key: 'product' }, { header: 'Code', key: 'code' }, { header: 'Batch', key: 'batch' },
    { header: 'Qty', key: 'quantity' }, { header: 'Unit', key: 'unit' },
    { header: 'Unit price', key: 'unitPrice' }, { header: 'Total', key: 'total' }, { header: 'Reason', key: 'reason' },
  ];
  const meta = {
    title: `${period.charAt(0).toUpperCase() + period.slice(1)} Stock Report`,
    period: `${range.from} to ${range.to}`,
    generatedBy: user?.email || 'System',
    summary: `Opening: ${report.summary.openingQuantity} · In: ${report.summary.stockIn} (${formatMoney(report.summary.inValue)}) · Out: ${report.summary.stockOut} (${formatMoney(report.summary.outValue)}) · Closing: ${report.summary.closingQuantity} · Valuation: ${formatMoney(report.valuation)}`,
  };

  return (
    <DashboardLayout>
      <div className="d-flex flex-column gap-4">
        <PageHeader eyebrow="Operations" title="Stock Reports" description="Daily, weekly, monthly and annual movement and valuation reports built from real transactions."
          actions={<div className="d-flex gap-2">
            <button type="button" className="btn btn-outline-secondary d-inline-flex align-items-center gap-1" onClick={() => exportCsv(exportRows, columns, meta)}><Download /> Excel (CSV)</button>
            <button type="button" className="btn btn-outline-primary d-inline-flex align-items-center gap-1" onClick={() => exportPdf(exportRows, columns, meta)}><FileText /> PDF / Print</button>
          </div>} />
        <StockTabs />

        <div className="card"><div className="card-body d-flex flex-wrap align-items-end gap-3 py-3">
          <div><label className="form-label mb-1">Report type</label><select className="form-select" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="annual">Annual</option><option value="custom">Custom range</option>
          </select></div>
          <div><label className="form-label mb-1">From</label><input type="date" className="form-control" value={range.from} onChange={(e) => { setFrom(e.target.value); setPeriod('custom'); }} /></div>
          <div><label className="form-label mb-1">To</label><input type="date" className="form-control" value={range.to} onChange={(e) => { setTo(e.target.value); setPeriod('custom'); }} /></div>
          <span className="text-muted bd-fs-sm ms-auto">{inRange.length} transaction(s) in range</span>
        </div></div>

        {loading ? <div className="d-flex justify-content-center py-8"><span className="spinner-border spinner-border-lg text-success" /></div> : <>
          <div className="row g-3 row-cols-2 row-cols-md-4 row-cols-xl-6">
            {[
              ['Opening stock', report.summary.openingQuantity, 'text-main'],
              ['Stock in', report.summary.stockIn, 'text-success'],
              ['Stock-in value', formatMoney(report.summary.inValue), 'text-success'],
              ['Stock out', report.summary.stockOut, 'text-warning'],
              ['Stock-out value', formatMoney(report.summary.outValue), 'text-warning'],
              ['Closing stock', report.summary.closingQuantity, 'text-main'],
              ['Sales revenue', formatMoney(report.summary.salesRevenue), 'text-success'],
              ['Expired stock', report.summary.expired, 'text-danger'],
              ['Damaged stock', report.summary.damaged, 'text-danger'],
              ['Low-stock products', report.lowStock.length, 'text-warning'],
              ['Expiring batches', report.expiring.length, 'text-warning'],
              ['Inventory value', formatMoney(report.valuation), 'text-main'],
            ].map(([label, value, tone]) => <div key={label as string}>{card(label as string, value as string | number, tone as string)}</div>)}
          </div>

          <div className="card"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main d-flex align-items-center gap-2"><BarChart3 className="text-success" /> Stock-In vs Stock-Out</h5></div>
            <div className="card-body"><div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%"><BarChart data={report.chart}>
                <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis /><Tooltip />
                <Legend /><Bar dataKey="stockIn" name="Stock In" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="stockOut" name="Stock Out" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart></ResponsiveContainer>
            </div></div>
          </div>

          <div className="row g-3">
            {[['Top Received Products', report.topReceived, 'received'], ['Top Issued Products', report.topIssued, 'issued']].map(([title, rows, key]) => (
              <div className="col-md-6" key={title as string}><div className="card h-100"><div className="card-header py-3"><h5 className="mb-0 fw-semibold text-main">{title as string}</h5></div>
                <div className="card-body p-0">{(rows as { name: string; received: number; issued: number }[]).length === 0 ? <p className="text-muted bd-fs-sm p-3 mb-0">No movements in this period</p>
                  : <table className="table align-middle mb-0"><tbody>{(rows as { name: string; received: number; issued: number }[]).map((row) => (
                    <tr key={row.name} className="border-bottom border-secondary-subtle"><td className="text-main">{row.name}</td><td className="text-end fw-semibold">{row[key as 'received' | 'issued']}</td></tr>
                  ))}</tbody></table>}
                </div>
              </div></div>
            ))}
          </div>
        </>}
      </div>
    </DashboardLayout>
  );
}
