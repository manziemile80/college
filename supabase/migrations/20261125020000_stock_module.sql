-- ============================================================================
-- Complete stock management module.
-- stock_items remains the canonical product master (one row per product) so
-- existing pages keep working; all new tables reference it as product_id.
-- ============================================================================

-- Storekeeper role (read/manage stock but no wider admin access).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin','teacher','parent','student','viewer','stock_manager','dos','dod');
  END IF;
END $$;
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'storekeeper';

CREATE OR REPLACE FUNCTION public.can_record_stock(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_stock(_user_id) OR public.has_role(_user_id, 'storekeeper');
$$;
REVOKE EXECUTE ON FUNCTION public.can_record_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_stock(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Product master additions (duplicate prevention lives in the database).
-- ---------------------------------------------------------------------------
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
CREATE INDEX IF NOT EXISTS idx_stock_items_name ON public.stock_items (lower(name));

-- ---------------------------------------------------------------------------
-- Suppliers, batches and transaction headers/lines.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
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
  manufacturing_date date,
  expiry_date date,
  quantity_received numeric NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  remaining_quantity numeric NOT NULL DEFAULT 0 CHECK (remaining_quantity >= 0),
  unit_cost numeric NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit text NOT NULL DEFAULT 'pcs',
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_number)
);
CREATE INDEX IF NOT EXISTS idx_stock_batches_fefo ON public.stock_batches (product_id, expiry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON public.stock_batches (expiry_date);

CREATE TABLE IF NOT EXISTS public.stock_in_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  total_lines integer NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  recorded_by uuid NOT NULL,
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
  manufacturing_date date,
  expiry_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_product ON public.stock_in_items (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_in_items_transaction ON public.stock_in_items (transaction_id);

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
  notes text,
  recorded_by uuid NOT NULL,
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
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_product ON public.stock_out_items (product_id);
CREATE INDEX IF NOT EXISTS idx_stock_out_items_transaction ON public.stock_out_items (transaction_id);

CREATE TABLE IF NOT EXISTS public.stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.stock_items(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('increase','decrease')),
  quantity numeric NOT NULL CHECK (quantity > 0),
  reason text NOT NULL,
  notes text,
  performed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enrich the movement ledger.
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS new_quantity numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS total_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES public.stock_batches(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS recipient text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_code text;
CREATE INDEX IF NOT EXISTS idx_stock_movements_item_date ON public.stock_movements (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements (movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_batch ON public.stock_movements (batch_id);

-- ---------------------------------------------------------------------------
-- RLS: managers/storekeepers write, staff and viewers read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_view_stock(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_manage_stock(_user_id) OR public.has_role(_user_id, 'storekeeper')
    OR public.has_role(_user_id, 'viewer') OR public.is_staff(_user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.can_view_stock(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_stock(uuid) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','stock_batches','stock_in_transactions','stock_in_items',
                           'stock_out_transactions','stock_out_items','stock_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('DROP POLICY IF EXISTS "Stock staff view %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Stock staff view %I" ON public.%I FOR SELECT TO authenticated USING (public.can_view_stock(auth.uid()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Stock managers manage %I" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "Stock managers manage %I" ON public.%I FOR ALL TO authenticated USING (public.can_record_stock(auth.uid())) WITH CHECK (public.can_record_stock(auth.uid()))', t, t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Stock viewers view items" ON public.stock_items;
CREATE POLICY "Stock viewers view items" ON public.stock_items FOR SELECT TO authenticated
  USING (public.can_view_stock(auth.uid()));
DROP POLICY IF EXISTS "Stock viewers view movements" ON public.stock_movements;
CREATE POLICY "Stock viewers view movements" ON public.stock_movements FOR SELECT TO authenticated
  USING (public.can_view_stock(auth.uid()));

-- ---------------------------------------------------------------------------
-- Atomic, audited movement application (replaces the silent clamp).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_qty numeric;
  current_avg numeric;
  new_avg numeric;
BEGIN
  SELECT quantity, average_unit_cost INTO current_qty, current_avg
    FROM public.stock_items WHERE id = NEW.item_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found for this movement';
  END IF;

  NEW.previous_quantity := current_qty;

  IF NEW.movement_type = 'in' THEN
    NEW.new_quantity := current_qty + NEW.quantity;
    IF NEW.unit_price > 0 THEN
      new_avg := (current_qty * current_avg + NEW.quantity * NEW.unit_price)
                 / NULLIF(current_qty + NEW.quantity, 0);
      UPDATE public.stock_items
         SET quantity = NEW.new_quantity,
             average_unit_cost = new_avg,
             unit_price = round(new_avg, 2)
       WHERE id = NEW.item_id;
    ELSE
      UPDATE public.stock_items SET quantity = NEW.new_quantity WHERE id = NEW.item_id;
    END IF;
  ELSIF NEW.movement_type = 'out' THEN
    IF NEW.quantity > current_qty THEN
      RAISE EXCEPTION 'Insufficient stock: requested % but only % available', NEW.quantity, current_qty
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.new_quantity := current_qty - NEW.quantity;
    UPDATE public.stock_items SET quantity = NEW.new_quantity WHERE id = NEW.item_id;
  ELSE
    RAISE EXCEPTION 'Invalid movement type';
  END IF;

  IF NEW.total_price = 0 AND NEW.unit_price > 0 THEN
    NEW.total_price := round(NEW.quantity * NEW.unit_price, 2);
  END IF;
  IF NEW.product_code IS NULL THEN
    SELECT product_code INTO NEW.product_code FROM public.stock_items WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS stock_movements_apply ON public.stock_movements;
CREATE TRIGGER stock_movements_apply
  BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- Low-stock notification for the people who can reorder.
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE recipient uuid;
BEGIN
  IF NEW.quantity <= NEW.min_quantity AND (TG_OP = 'INSERT' OR OLD.quantity > NEW.min_quantity) THEN
    FOR recipient IN
      SELECT ur.user_id FROM public.user_roles ur
      WHERE ur.role IN ('admin','stock_manager','storekeeper') AND ur.user_id IS NOT NULL
    LOOP
      PERFORM public.insert_notification(
        recipient,
        'Low stock alert',
        format('%s (%s) is down to %s %s (minimum %s).', NEW.name, NEW.product_code, NEW.quantity, NEW.unit, NEW.min_quantity),
        'warning',
        '/stock'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS stock_items_low_stock_notify ON public.stock_items;
CREATE TRIGGER stock_items_low_stock_notify
  AFTER INSERT OR UPDATE OF quantity ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();

-- ===========================================================================
-- RPCs: all stock writes go through these so behaviour is consistent.
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.record_stock_in(
  p_reference text, p_supplier_id uuid, p_transaction_date date,
  p_notes text, p_lines jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  line jsonb;
  product uuid;
  code text;
  pname text;
  pcategory text;
  punit text;
  qty numeric;
  cost numeric;
  batch_no text;
  mfg date;
  exp date;
  batch uuid;
  txn uuid;
  total_qty numeric := 0;
  total_amt numeric := 0;
  line_count integer := 0;
BEGIN
  IF NOT public.can_record_stock(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record stock-in';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one product line is required';
  END IF;

  INSERT INTO public.stock_in_transactions
    (reference, supplier_id, transaction_date, notes, recorded_by)
  VALUES (p_reference, p_supplier_id, COALESCE(p_transaction_date, CURRENT_DATE), p_notes, auth.uid())
  RETURNING id INTO txn;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    qty := (line->>'quantity')::numeric;
    cost := COALESCE((line->>'unit_cost')::numeric, 0);
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
    IF cost < 0 THEN RAISE EXCEPTION 'Unit cost cannot be negative'; END IF;

    code := NULLIF(btrim(line->>'product_code'), '');
    product := NULLIF(line->>'product_id', '')::uuid;

    -- Duplicate prevention: reuse the existing product by SKU / id.
    IF product IS NULL AND code IS NOT NULL THEN
      SELECT id INTO product FROM public.stock_items WHERE upper(btrim(product_code)) = upper(code);
    END IF;

    pname := NULLIF(btrim(line->>'name'), '');
    IF product IS NULL THEN
      IF pname IS NULL THEN RAISE EXCEPTION 'New product lines require a name'; END IF;
      INSERT INTO public.stock_items
        (name, product_code, category, unit, description, min_quantity, unit_price,
         average_unit_cost, location, created_by)
      VALUES
        (pname,
         COALESCE(code, 'SKU-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
         COALESCE(NULLIF(line->>'category', ''), 'general'),
         COALESCE(NULLIF(line->>'unit', ''), 'pcs'),
         NULLIF(line->>'description', ''),
         COALESCE((line->>'min_quantity')::numeric, 0),
         cost, cost, NULLIF(line->>'location', ''), auth.uid())
      RETURNING id INTO product;
    END IF;

    batch_no := NULLIF(btrim(line->>'batch_number'), '');
    mfg := NULLIF(line->>'manufacturing_date', '')::date;
    exp := NULLIF(line->>'expiry_date', '')::date;

    IF batch_no IS NOT NULL THEN
      INSERT INTO public.stock_batches
        (product_id, batch_number, supplier_id, manufacturing_date, expiry_date,
         quantity_received, remaining_quantity, unit_cost, unit, notes, created_by)
      VALUES
        (product, batch_no, p_supplier_id, mfg, exp, qty, qty, cost,
         COALESCE(NULLIF(line->>'unit', ''), (SELECT unit FROM public.stock_items WHERE id = product)),
         NULLIF(line->>'notes', ''), auth.uid())
      ON CONFLICT (product_id, batch_number) DO UPDATE SET
        quantity_received = public.stock_batches.quantity_received + EXCLUDED.quantity_received,
        remaining_quantity = public.stock_batches.remaining_quantity + EXCLUDED.remaining_quantity,
        unit_cost = CASE WHEN public.stock_batches.quantity_received + EXCLUDED.quantity_received > 0
          THEN (public.stock_batches.quantity_received * public.stock_batches.unit_cost
                + EXCLUDED.quantity_received * EXCLUDED.unit_cost)
               / (public.stock_batches.quantity_received + EXCLUDED.quantity_received)
          ELSE EXCLUDED.unit_cost END,
        expiry_date = COALESCE(EXCLUDED.expiry_date, public.stock_batches.expiry_date),
        manufacturing_date = COALESCE(EXCLUDED.manufacturing_date, public.stock_batches.manufacturing_date),
        supplier_id = COALESCE(EXCLUDED.supplier_id, public.stock_batches.supplier_id),
        updated_at = now()
      RETURNING id INTO batch;
    END IF;

    INSERT INTO public.stock_in_items
      (transaction_id, product_id, batch_id, quantity, unit, unit_cost, total_price,
       manufacturing_date, expiry_date, notes)
    VALUES
      (txn, product, batch, qty,
       COALESCE(NULLIF(line->>'unit', ''), (SELECT unit FROM public.stock_items WHERE id = product)),
       cost, round(qty * cost, 2), mfg, exp, NULLIF(line->>'notes', ''));

    INSERT INTO public.stock_movements
      (item_id, movement_type, quantity, unit_price, total_price, reason, movement_date,
       recorded_by, batch_id, reference, supplier, product_code)
    VALUES
      (product, 'in', qty, cost, round(qty * cost, 2), 'Stock received',
       COALESCE(p_transaction_date, CURRENT_DATE), auth.uid(), batch, p_reference,
       (SELECT name FROM public.suppliers WHERE id = p_supplier_id),
       (SELECT product_code FROM public.stock_items WHERE id = product));

    total_qty := total_qty + qty;
    total_amt := total_amt + round(qty * cost, 2);
    line_count := line_count + 1;
  END LOOP;

  UPDATE public.stock_in_transactions
     SET total_lines = line_count, total_quantity = total_qty, total_amount = round(total_amt, 2)
   WHERE id = txn;
  RETURN txn;
END; $$;

CREATE OR REPLACE FUNCTION public.record_stock_out(
  p_reference text, p_transaction_date date, p_reason text, p_recipient text,
  p_notes text, p_lines jsonb, p_allow_restricted boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  line jsonb;
  product uuid;
  available numeric;
  qty numeric;
  unit_cost numeric;
  unit_name text;
  need numeric;
  take numeric;
  b record;
  batch uuid;
  txn uuid;
  total_qty numeric := 0;
  total_amt numeric := 0;
  line_count integer := 0;
  restricted boolean;
BEGIN
  IF NOT public.can_record_stock(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed to record stock-out';
  END IF;
  IF p_lines IS NULL OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one product line is required';
  END IF;

  restricted := p_reason IN ('expired products', 'damaged products', 'returned to supplier');

  INSERT INTO public.stock_out_transactions
    (reference, transaction_date, reason, recipient, notes, recorded_by)
  VALUES
    (p_reference, COALESCE(p_transaction_date, CURRENT_DATE), p_reason, p_recipient, p_notes, auth.uid())
  RETURNING id INTO txn;

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    qty := (line->>'quantity')::numeric;
    IF qty IS NULL OR qty <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;

    product := NULLIF(line->>'product_id', '')::uuid;
    IF product IS NULL AND NULLIF(line->>'product_code', '') IS NOT NULL THEN
      SELECT id INTO product FROM public.stock_items
       WHERE upper(btrim(product_code)) = upper(btrim(line->>'product_code'));
    END IF;

    SELECT quantity, average_unit_cost, unit INTO available, unit_cost, unit_name
      FROM public.stock_items WHERE id = product FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF qty > available THEN
      RAISE EXCEPTION 'Insufficient stock for %: requested % but only % available',
        (SELECT name FROM public.stock_items WHERE id = product), qty, available
        USING ERRCODE = 'check_violation';
    END IF;

    need := qty;
    -- FEFO: consume the earliest-expiring usable batch first.
    FOR b IN
      SELECT id, remaining_quantity, expiry_date
        FROM public.stock_batches
       WHERE product_id = product AND remaining_quantity > 0
         AND (restricted OR p_allow_restricted OR expiry_date IS NULL OR expiry_date > CURRENT_DATE)
       ORDER BY expiry_date ASC NULLS LAST, created_at ASC
    LOOP
      EXIT WHEN need <= 0;
      take := LEAST(need, b.remaining_quantity);
      UPDATE public.stock_batches
         SET remaining_quantity = remaining_quantity - take, updated_at = now()
       WHERE id = b.id;
      INSERT INTO public.stock_out_items
        (transaction_id, product_id, batch_id, quantity, unit, unit_price, total_price, notes)
      VALUES
        (txn, product, b.id, take, unit_name, unit_cost, round(take * unit_cost, 2), NULLIF(line->>'notes', ''));
      INSERT INTO public.stock_movements
        (item_id, movement_type, quantity, unit_price, total_price, reason, movement_date,
         recorded_by, batch_id, reference, recipient, product_code)
      VALUES
        (product, 'out', take, unit_cost, round(take * unit_cost, 2), p_reason,
         COALESCE(p_transaction_date, CURRENT_DATE), auth.uid(), b.id, p_reference, p_recipient,
         (SELECT product_code FROM public.stock_items WHERE id = product));
      total_qty := total_qty + take;
      total_amt := total_amt + round(take * unit_cost, 2);
      need := need - take;
    END LOOP;

    -- Legacy/unbatched stock: still record the movement so balances stay correct.
    IF need > 0 THEN
      batch := NULL;
      INSERT INTO public.stock_out_items
        (transaction_id, product_id, batch_id, quantity, unit, unit_price, total_price, notes)
      VALUES
        (txn, product, NULL, need, unit_name, unit_cost, round(need * unit_cost, 2), NULLIF(line->>'notes', ''));
      INSERT INTO public.stock_movements
        (item_id, movement_type, quantity, unit_price, total_price, reason, movement_date,
         recorded_by, reference, recipient, product_code)
      VALUES
        (product, 'out', need, unit_cost, round(need * unit_cost, 2), p_reason,
         COALESCE(p_transaction_date, CURRENT_DATE), auth.uid(), p_reference, p_recipient,
         (SELECT product_code FROM public.stock_items WHERE id = product));
      total_qty := total_qty + need;
      total_amt := total_amt + round(need * unit_cost, 2);
    END IF;
    line_count := line_count + 1;
  END LOOP;

  UPDATE public.stock_out_transactions
     SET total_lines = line_count, total_quantity = total_qty, total_amount = round(total_amt, 2)
   WHERE id = txn;
  RETURN txn;
END; $$;

REVOKE EXECUTE ON FUNCTION public.record_stock_in(text, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_in(text, uuid, date, text, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.record_stock_out(text, date, text, text, text, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_out(text, date, text, text, text, jsonb, boolean) TO authenticated;

-- Keep updated_at on new tables.
CREATE OR REPLACE TRIGGER set_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE OR REPLACE TRIGGER set_stock_batches_updated_at BEFORE UPDATE ON public.stock_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Make the new tables visible to the API immediately.
NOTIFY pgrst, 'reload schema';
