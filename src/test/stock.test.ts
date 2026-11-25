import { describe, expect, it } from 'vitest';
import {
  expiryStatus,
  inventoryValue,
  lineTotal,
  movementSummary,
  periodKey,
  stockAlert,
  summarizeLines,
} from '@/lib/stock';

describe('stock calculations', () => {
  it('calculates line totals as quantity × unit price', () => {
    expect(lineTotal(100, 1500)).toBe(150000);
    expect(lineTotal(20, 1500)).toBe(30000);
  });

  it('summarizes multiple lines and groups by unit', () => {
    const result = summarizeLines([
      { quantity: 100, unitPrice: 1500, unit: 'kg' },
      { quantity: 50, unitPrice: 2000, unit: 'kg' },
      { quantity: 20, unitPrice: 3500, unit: 'litres' },
    ]);
    expect(result.lines).toBe(3);
    expect(result.byUnit).toEqual({ kg: 150, litres: 20 });
    expect(result.totalAmount).toBe(320000);
  });

  it('classifies expiry by days remaining', () => {
    const today = new Date('2026-11-25T12:00:00');
    expect(expiryStatus('2026-11-24', today)).toBe('expired');
    expect(expiryStatus('2026-11-25', today)).toBe('today');
    expect(expiryStatus('2026-11-30', today)).toBe('within7');
    expect(expiryStatus('2026-12-20', today)).toBe('within30');
    expect(expiryStatus('2027-01-20', today)).toBe('within60');
    expect(expiryStatus(null, today)).toBe('none');
  });

  it('uses weighted average cost for valuation', () => {
    expect(inventoryValue({ quantity: 225, average_unit_cost: 1600 })).toBe(360000);
    expect(inventoryValue({ quantity: 10, unit_price: 500 })).toBe(5000);
  });

  it('detects low and out of stock with reorder quantity', () => {
    expect(stockAlert({ quantity: 0, min_quantity: 20 })).toMatchObject({ isOut: true });
    expect(stockAlert({ quantity: 15, min_quantity: 20 })).toMatchObject({ isLow: true, reorderQuantity: 25 });
    expect(stockAlert({ quantity: 50, min_quantity: 20 })).toMatchObject({ isLow: false, isOut: false });
  });

  it('computes movement totals and excludes non-sales from revenue', () => {
    const result = movementSummary([
      { movement_type: 'in', quantity: 100, total_price: 150000, reason: 'received', movement_date: '2026-11-25' },
      { movement_type: 'out', quantity: 20, total_price: 30000, reason: 'sales', movement_date: '2026-11-25' },
      { movement_type: 'out', quantity: 5, total_price: 7500, reason: 'damaged products', movement_date: '2026-11-25' },
    ]);
    expect(result.closingQuantity).toBe(75);
    expect(result.stockIn).toBe(100);
    expect(result.stockOut).toBe(25);
    expect(result.salesRevenue).toBe(30000);
    expect(result.damaged).toBe(5);
  });

  it('buckets dates into report periods', () => {
    const date = '2026-11-25T10:00:00';
    expect(periodKey(date, 'daily')).toBe('2026-11-25');
    expect(periodKey(date, 'weekly')).toBe('2026-11-23');
    expect(periodKey(date, 'monthly')).toBe('2026-11');
    expect(periodKey(date, 'annual')).toBe('2026');
  });
});
