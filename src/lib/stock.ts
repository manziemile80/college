/** Pure stock/inventory calculations shared by the stock pages. */

export type ExpiryStatus =
  | 'expired'
  | 'today'
  | 'within7'
  | 'within30'
  | 'within60'
  | 'safe'
  | 'none';

export interface StockLine {
  quantity: number;
  unitPrice: number;
  unit: string;
}

export const lineTotal = (quantity: number, unitPrice: number): number =>
  Math.round((Math.max(0, quantity) * Math.max(0, unitPrice)) * 100) / 100;

export const formatMoney = (amount: number): string =>
  `${Math.round(amount).toLocaleString('en-RW')} RWF`;

/** Totals for a multi-line document. Quantities are grouped by unit. */
export function summarizeLines(lines: StockLine[]) {
  const byUnit: Record<string, number> = {};
  let totalQuantity = 0;
  let totalAmount = 0;
  for (const line of lines) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const unit = line.unit || 'pcs';
    byUnit[unit] = (byUnit[unit] || 0) + qty;
    totalQuantity += qty;
    totalAmount += lineTotal(qty, Number(line.unitPrice) || 0);
  }
  return {
    lines: lines.length,
    totalQuantity,
    byUnit,
    totalAmount: Math.round(totalAmount * 100) / 100,
  };
}

export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

export function expiryStatus(date: string | null | undefined, today = new Date()): ExpiryStatus {
  const days = daysUntil(date, today);
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  if (days <= 7) return 'within7';
  if (days <= 30) return 'within30';
  if (days <= 60) return 'within60';
  return 'safe';
}

export const expiryLabel: Record<ExpiryStatus, string> = {
  expired: 'Expired',
  today: 'Expiring Today',
  within7: 'Expiring in 7 Days',
  within30: 'Expiring in 30 Days',
  within60: 'Approaching Expiry',
  safe: 'Safe Stock',
  none: 'No Expiry',
};

export const expiryBadge: Record<ExpiryStatus, string> = {
  expired: 'text-bg-danger',
  today: 'text-bg-danger',
  within7: 'text-bg-warning',
  within30: 'text-bg-warning',
  within60: 'text-bg-info',
  safe: 'text-bg-success',
  none: 'text-bg-secondary',
};

export interface StockProduct {
  quantity: number;
  min_quantity?: number;
  average_unit_cost?: number;
  unit_price?: number;
}

/** Weighted-average unit cost is stored on the product; fall back to unit price. */
export const unitCost = (product: StockProduct): number =>
  Number(product.average_unit_cost || product.unit_price || 0);

export const inventoryValue = (product: StockProduct): number =>
  lineTotal(Math.max(0, product.quantity), unitCost(product));

export function stockAlert(product: StockProduct) {
  const qty = Number(product.quantity) || 0;
  const min = Number(product.min_quantity) || 0;
  const isOut = qty <= 0;
  const isLow = !isOut && min > 0 && qty <= min;
  return {
    isOut,
    isLow,
    reorderQuantity: isOut || isLow ? Math.max(min * 2 - qty, min || 1) : 0,
  };
}

/** Report period key used to bucket movements. */
export function periodKey(date: string | Date, period: 'daily' | 'weekly' | 'monthly' | 'annual'): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (period === 'annual') return String(year);
  if (period === 'monthly') return month;
  const day = `${month}-${String(d.getDate()).padStart(2, '0')}`;
  if (period === 'daily') return day;
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

export interface MovementRow {
  movement_type: string;
  quantity: number;
  total_price: number;
  reason: string | null;
  movement_date: string;
}

/** Opening + in - out = closing, with sales-only revenue tracking. */
export function movementSummary(rows: MovementRow[], openingQuantity = 0) {
  let stockIn = 0;
  let stockOut = 0;
  let inValue = 0;
  let outValue = 0;
  let salesRevenue = 0;
  let expired = 0;
  let damaged = 0;
  for (const row of rows) {
    const qty = Number(row.quantity) || 0;
    const value = Number(row.total_price) || 0;
    if (row.movement_type === 'in') {
      stockIn += qty;
      inValue += value;
    } else {
      stockOut += qty;
      outValue += value;
      const reason = (row.reason || '').toLowerCase();
      if (reason.includes('expired')) expired += qty;
      else if (reason.includes('damaged')) damaged += qty;
      else if (reason.includes('sales')) salesRevenue += value;
    }
  }
  return {
    openingQuantity,
    stockIn,
    stockOut,
    inValue: Math.round(inValue * 100) / 100,
    outValue: Math.round(outValue * 100) / 100,
    closingQuantity: openingQuantity + stockIn - stockOut,
    salesRevenue: Math.round(salesRevenue * 100) / 100,
    expired,
    damaged,
  };
}

export function reference(prefix: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}-${stamp}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
