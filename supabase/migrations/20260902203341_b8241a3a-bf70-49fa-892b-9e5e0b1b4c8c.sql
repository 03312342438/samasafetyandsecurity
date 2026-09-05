ALTER TABLE public.job_numbers
  ADD COLUMN IF NOT EXISTS customer_po_id uuid;

ALTER TABLE public.job_numbers
  DROP CONSTRAINT IF EXISTS job_numbers_customer_po_id_fkey;

ALTER TABLE public.job_numbers
  ADD CONSTRAINT job_numbers_customer_po_id_fkey
  FOREIGN KEY (customer_po_id) REFERENCES public.customer_pos(id);