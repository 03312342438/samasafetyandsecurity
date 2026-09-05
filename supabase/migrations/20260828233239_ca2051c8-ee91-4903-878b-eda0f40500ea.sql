CREATE TABLE public.units_of_measure (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default '',
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.units_of_measure TO authenticated;
GRANT ALL ON public.units_of_measure TO service_role;

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uom_select" ON public.units_of_measure FOR SELECT TO authenticated USING (true);
CREATE POLICY "uom_insert" ON public.units_of_measure FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "uom_update" ON public.units_of_measure FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin')) WITH CHECK (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY "uom_delete" ON public.units_of_measure FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'project_manager') OR private.has_role(auth.uid(), 'admin'));

CREATE TRIGGER units_of_measure_updated_at BEFORE UPDATE ON public.units_of_measure FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_items
  ADD COLUMN IF NOT EXISTS approval_status text not null default 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.stock_items SET approval_status = 'approved' WHERE approval_status = 'pending';

ALTER TABLE public.bom_items
  ADD COLUMN IF NOT EXISTS stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL;

INSERT INTO public.units_of_measure (code, name) VALUES
  ('pcs','Piece'),
  ('m','Meter'),
  ('kg','Kilogram'),
  ('set','Set'),
  ('box','Box'),
  ('ltr','Litre'),
  ('roll','Roll'),
  ('hr','Hour'),
  ('lot','Lot')
ON CONFLICT (code) DO NOTHING;