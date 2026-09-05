ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS cr_cpr_number text NOT NULL DEFAULT '';

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS bom_id uuid REFERENCES public.boms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labour_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inland_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inland_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS margin_percent numeric NOT NULL DEFAULT 0;