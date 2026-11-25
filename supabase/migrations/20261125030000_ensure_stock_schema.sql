-- Safety migration: guarantees the stock tables exist and refreshes the
-- PostgREST schema cache. Safe to run even if 20261125020000 already applied.

ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS product_code text;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.stock_items ADD COLUMN IF NOT EXISTS average_unit_cost numeric NOT NULL DEFAULT 0;
UPDATE public.stock_items
   SET product_code = 'SKU-' || upper(substr(md5(id::text), 1, 8))
 WHERE product_code IS NULL OR btrim(product_code) = '';
UPDATE public.stock_items SET average_unit_cost = unit_price WHERE average_unit_cost = 0;
ALTER TABLE public.stock_items ALTER COLUMN product_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_product_code_key ON public.stock_items (upper(btrim(product_code)));

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS new_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS total_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS batch_id uuid;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_code text;

CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text, phone text, email text, address text, notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_key ON public.suppliers (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.stock_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  batch_number text NOT NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  manufacturing_date date, expiry_date date,
  quantity_received numeric NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  remaining_quantity numeric NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit text NOT NULL DEFAULT 'pcs', notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_stock_batches_fefo ON public.stock_batches (product_id, expiry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON public.stock_batches (expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements (batch_id);

CREATE TABLE IF NOT EXISTS public.stock_in_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  total_lines integer NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text, recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stock_in_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.stock_in_transactions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'pcs',
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_price numeric NOT NULL DEFAULT 0,
  manufacturing_date date, expiry_date date, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stock_out_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT 'sales'
    CHECK (reason IN ('sales','internal usage','damaged products','expired products','returned to supplier','other')),
  recipient text,
  total_lines integer NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text, recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stock_out_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.stock_out_transactions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'pcs',
  unit_price numeric NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price numeric NOT NULL DEFAULT 0,
  notes text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('increase','decrease')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  reason text NOT NULL, notes text,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_product ON public.stock_in_items (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_transaction ON public.stock_in_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_product ON public.stock_out_items (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_transaction ON public.stock_out_items (transaction_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_date ON public.stock_movements (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements (movement_date DESC);

-- PostgREST caches the schema; force a reload so the client sees new tables.
NOTIFY pgrst, 'reload schema';
