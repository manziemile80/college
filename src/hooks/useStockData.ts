import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Product {
  id: string; name: string; product_code: string; category: string; unit: string;
  description: string | null; quantity: number; min_quantity: number; unit_price: number;
  average_unit_cost: number; status: string; location: string | null;
  notes: string | null; created_at: string;
}
export interface Batch {
  id: string; product_id: string; batch_number: string; supplier_id: string | null;
  manufacturing_date: string | null; expiry_date: string | null; quantity_received: number;
  remaining_quantity: number; unit_cost: number; unit: string; created_at: string;
}
export interface Movement {
  id: string; item_id: string; movement_type: string; quantity: number; reason: string | null;
  movement_date: string; created_at: string; previous_quantity: number; new_quantity: number;
  unit_price: number; total_price: number; batch_id: string | null; reference: string | null;
  supplier: string | null; recipient: string | null; product_code: string | null; recorded_by: string;
}
export interface Supplier {
  id: string; name: string; contact_person: string | null; phone: string | null; email: string | null;
}
export interface StockInRow {
  id: string; reference: string; transaction_date: string; supplier_id: string | null;
  total_lines: number; total_quantity: number; total_amount: number; notes: string | null; recorded_by: string;
}
export interface StockOutRow {
  id: string; reference: string; transaction_date: string; reason: string; recipient: string | null;
  total_lines: number; total_quantity: number; total_amount: number; notes: string | null; recorded_by: string;
}

interface StockData {
  products: Product[];
  batches: Batch[];
  movements: Movement[];
  suppliers: Supplier[];
  stockIns: StockInRow[];
  stockOuts: StockOutRow[];
}

const empty: StockData = { products: [], batches: [], movements: [], suppliers: [], stockIns: [], stockOuts: [] };

export function useStockData() {
  const [data, setData] = useState<StockData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, b, m, s, si, so] = await Promise.all([
      supabase.from('stock_items').select('*').order('name'),
      supabase.from('stock_batches').select('*').order('created_at', { ascending: false }),
      supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(1000),
      supabase.from('suppliers').select('id, name, contact_person, phone, email').order('name'),
      supabase.from('stock_in_transactions').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('stock_out_transactions').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    const results = [p, b, m, s, si, so];
    const isSchemaError = (message?: string) =>
      !!message && /schema cache|could not find the table/i.test(message);
    const schemaMissing = results.some((r) => isSchemaError(r.error?.message));
    const otherError = results.find((r) => r.error && !isSchemaError(r.error?.message))?.error;
    setError(
      schemaMissing
        ? 'Stock tables are not available in the API schema yet. Apply the stock migration (supabase/migrations/20261125020000_stock_module.sql) in the Supabase SQL Editor, then reload this page.'
        : otherError?.message || null,
    );
    setData({
      products: (p.data as Product[]) || [],
      batches: (b.data as Batch[]) || [],
      movements: (m.data as Movement[]) || [],
      suppliers: (s.data as Supplier[]) || [],
      stockIns: (si.data as StockInRow[]) || [],
      stockOuts: (so.data as StockOutRow[]) || [],
    });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return { ...data, loading, error, refresh: load };
}
