-- ======================= Phase 6: Accounts & Closure =======================

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL DEFAULT '',
  invoice_number text NOT NULL DEFAULT '',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_number_id uuid REFERENCES public.job_numbers(id) ON DELETE SET NULL,
  quotation_id uuid REFERENCES public.quotations(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  invoice_type text NOT NULL DEFAULT 'final',
  invoice_date date,
  due_date date,
  currency text NOT NULL DEFAULT 'SAR',
  subtotal numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  vat_percent numeric NOT NULL DEFAULT 15,
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  payment_terms text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'billing',
  status text NOT NULL DEFAULT 'draft',
  notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert invoices" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update invoices" ON public.invoices
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete invoices" ON public.invoices
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  sequence integer NOT NULL DEFAULT 1,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'pcs',
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_items TO authenticated;
GRANT ALL ON public.invoice_items TO service_role;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view invoice items" ON public.invoice_items
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert invoice items" ON public.invoice_items
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update invoice items" ON public.invoice_items
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete invoice items" ON public.invoice_items
  FOR DELETE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );

CREATE TRIGGER invoice_items_updated_at BEFORE UPDATE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  method text NOT NULL DEFAULT 'bank_transfer',
  reference text NOT NULL DEFAULT '',
  remarks text NOT NULL DEFAULT '',
  recorded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff view payments" ON public.payments
  FOR SELECT TO authenticated USING (private.is_staff(auth.uid()));
CREATE POLICY "accounts insert payments" ON public.payments
  FOR INSERT TO authenticated WITH CHECK (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "accounts update payments" ON public.payments
  FOR UPDATE TO authenticated USING (
    private.has_dept(auth.uid(), 'accounts') OR private.is_mgmt(auth.uid())
  );
CREATE POLICY "mgmt delete payments" ON public.payments
  FOR DELETE TO authenticated USING (private.is_mgmt(auth.uid()));

CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX idx_invoices_project ON public.invoices(project_id);
