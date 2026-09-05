import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Truck, FileMinus, Coins, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  financeSummary,
  listSuppliers, saveSupplier,
  listSupplierInvoices, saveSupplierInvoice, recordSupplierPayment,
  listSupplierPayments, approveSupplierPayment,
  listCreditNotes, saveCreditNote, decideCreditNote,
  listProjectCosts, addProjectCost,
} from "@/lib/finance.functions";
import { CURRENCY, humanize, statusBadgeClass } from "@/lib/workflow";

const today = () => new Date().toISOString().slice(0, 10);
const money = (n: unknown) => `${Number(n ?? 0).toFixed(2)} ${CURRENCY}`;

function Field({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Picker({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : ""}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================== dashboard ===

export function FinanceDashboard() {
  const fetchSummary = useServerFn(financeSummary);
  const { data } = useQuery({ queryKey: ["finance-summary"], queryFn: () => fetchSummary() });
  const s = data as any;
  if (!s) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;

  const agingRows: [string, number][] = [
    ["Current", s.aging.current], ["1–30", s.aging.d1_30], ["31–60", s.aging.d31_60],
    ["61–90", s.aging.d61_90], ["91–120", s.aging.d91_120], ["120+", s.aging.d120_plus],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Invoiced" value={money(s.kpis.invoiced)} />
        <Kpi label="Collected" value={money(s.kpis.collected)} tone="good" />
        <Kpi label="Outstanding receivables" value={money(s.kpis.outstanding)} />
        <Kpi label="Overdue" value={money(s.kpis.overdue)} tone="bad" />
        <Kpi label="Payables" value={money(s.kpis.payables)} />
        <Kpi label="Project cost" value={money(s.kpis.projectCost)} />
        <Kpi label="Profit / margin" value={`${money(s.kpis.profit)} · ${s.kpis.margin}%`} />
        <Kpi label="Cash flow" value={money(s.kpis.cashFlow)} />
        <Kpi label="Pending approvals" value={String(s.kpis.pendingApprovals)} />
        <Kpi label="Ready for billing" value={String(s.kpis.readyForBilling)} />
      </div>

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">Receivables aging</p>
          <div className="grid gap-2 sm:grid-cols-6">
            {agingRows.map(([label, v]) => (
              <div key={label} className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{money(v)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">Customer accounts</p>
          {s.customerBalances.length === 0 && <p className="text-xs text-muted-foreground">No invoices yet.</p>}
          <div className="space-y-1">
            {s.customerBalances.map((c: any) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span className="font-medium">{c.name}</span>
                <span className="text-muted-foreground">
                  invoiced {money(c.invoiced)} · paid {money(c.paid)} · outstanding {money(c.outstanding)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">Project profitability (budget vs actual)</p>
          {s.projectProfitability.length === 0 && <p className="text-xs text-muted-foreground">No projects yet.</p>}
          <div className="space-y-1">
            {s.projectProfitability.map((p: any) => (
              <div key={p.id} className="rounded-md border p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.project_number} — {p.name}</span>
                  <span className={p.profit >= 0 ? "text-primary" : "text-destructive"}>
                    profit {money(p.profit)} · {p.margin}%
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  value {money(p.revenue)} · budget {money(p.budget)} · actual cost {money(p.cost)} ·
                  variance {money(p.budget_variance)} · collected {money(p.collected)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================== suppliers ===

const emptySupplier = {
  name: "", contact_person: "", email: "", phone: "", address: "",
  payment_terms: "", status: "active", notes: "",
};

export function SuppliersTab() {
  const qc = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const persist = useServerFn(saveSupplier);
  const { data } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptySupplier);

  const submit = async () => {
    try {
      await persist({ data: { ...form, id: form.id || undefined } });
      toast.success("Supplier saved");
      setOpen(false);
      setForm(emptySupplier);
      qc.invalidateQueries({ queryKey: ["suppliers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save supplier");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptySupplier); }}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New supplier</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <Field label="Contact person" value={form.contact_person} onChange={(v) => setForm({ ...form, contact_person: v })} />
            <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Field label="Payment terms" value={form.payment_terms} onChange={(v) => setForm({ ...form, payment_terms: v })} />
            <Picker label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })}
              options={[["active", "Active"], ["inactive", "Inactive"]]} />
            <div className="sm:col-span-2">
              <Label className="text-xs">Address</Label>
              <Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={submit} disabled={!form.name.trim()}>Save supplier</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {((data as any[]) ?? []).map((s) => (
        <Card key={s.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{s.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(s.status)}`}>{humanize(s.status)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[s.contact_person, s.email, s.phone, s.payment_terms].filter(Boolean).join(" · ") || "—"}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setForm({ ...emptySupplier, ...s }); setOpen(true); }}>
              Edit
            </Button>
          </CardContent>
        </Card>
      ))}
      {((data as any[]) ?? []).length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No suppliers yet.</p>
      )}
    </div>
  );
}

// =============================================================== payables ===

const emptySupplierInvoice = {
  supplier_id: "", project_id: "", job_number_id: "", invoice_number: "",
  invoice_date: today(), due_date: "", currency: CURRENCY, amount: "0", notes: "",
};

export function PayablesTab({
  projectOptions, jobOptions, isAdmin,
}: { projectOptions: [string, string][]; jobOptions: [string, string][]; isAdmin?: boolean }) {
  const qc = useQueryClient();
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchInvoices = useServerFn(listSupplierInvoices);
  const fetchPayments = useServerFn(listSupplierPayments);
  const persist = useServerFn(saveSupplierInvoice);
  const pay = useServerFn(recordSupplierPayment);
  const approve = useServerFn(approveSupplierPayment);

  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const { data: invoices } = useQuery({ queryKey: ["supplier-invoices"], queryFn: () => fetchInvoices() });
  const { data: payments } = useQuery({ queryKey: ["supplier-payments"], queryFn: () => fetchPayments() });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptySupplierInvoice);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["supplier-invoices"] });
    qc.invalidateQueries({ queryKey: ["supplier-payments"] });
    qc.invalidateQueries({ queryKey: ["finance-summary"] });
  };

  const supplierOptions: [string, string][] = [
    ["", "— select supplier —"],
    ...((suppliers as any[]) ?? []).map((s) => [s.id, s.name] as [string, string]),
  ];

  const submit = async () => {
    try {
      await persist({
        data: {
          ...form,
          supplier_id: form.supplier_id || null,
          project_id: form.project_id || null,
          job_number_id: form.job_number_id || null,
          due_date: form.due_date || null,
          invoice_date: form.invoice_date || null,
          amount: Number(form.amount || 0),
        },
      });
      toast.success("Supplier invoice saved");
      setOpen(false);
      setForm(emptySupplierInvoice);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const payInvoice = async (inv: any) => {
    const balance = Number(inv.amount ?? 0) - Number(inv.amount_paid ?? 0);
    try {
      await pay({
        data: {
          supplier_invoice_id: inv.id,
          payment_date: today(),
          amount: Math.max(0.01, Number(balance.toFixed(2))),
          method: "bank_transfer",
          reference: inv.invoice_number || inv.reference,
          remarks: "",
        },
      });
      toast.success("Payment logged — awaiting Management approval");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record payment");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptySupplierInvoice); }}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New supplier invoice</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>New supplier invoice</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker label="Supplier" value={form.supplier_id} onChange={(v) => setForm({ ...form, supplier_id: v })} options={supplierOptions} />
            <Field label="Invoice number" value={form.invoice_number} onChange={(v) => setForm({ ...form, invoice_number: v })} />
            <Picker label="Project" value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={projectOptions} />
            <Picker label="Job number" value={form.job_number_id} onChange={(v) => setForm({ ...form, job_number_id: v })} options={jobOptions} />
            <Field label="Invoice date" type="date" value={form.invoice_date} onChange={(v) => setForm({ ...form, invoice_date: v })} />
            <Field label="Due date" type="date" value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            <Field label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
            <div className="sm:col-span-2">
              <Label className="text-xs">Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={submit}>Save invoice</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {((invoices as any[]) ?? []).map((i) => {
        const balance = Number(i.amount ?? 0) - Number(i.amount_paid ?? 0);
        return (
          <Card key={i.id}>
            <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.invoice_number || i.reference}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(i.status)}`}>{humanize(i.status)}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[i.suppliers?.name, i.projects?.project_number, i.job_numbers?.job_number, i.due_date && `due ${i.due_date}`]
                    .filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="mt-1 text-xs">
                  {money(i.amount)} · paid {money(i.amount_paid)} · balance {money(balance)}
                </p>
              </div>
              {balance > 0.009 && (
                <Button size="sm" variant="outline" onClick={() => payInvoice(i)}>Pay balance</Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-medium">Supplier payments</p>
          {((payments as any[]) ?? []).length === 0 && (
            <p className="text-xs text-muted-foreground">No supplier payments yet.</p>
          )}
          <div className="space-y-1">
            {((payments as any[]) ?? []).map((p) => (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                <span>
                  {money(p.amount)} · {p.suppliers?.name ?? "—"} ·{" "}
                  {p.supplier_invoices?.invoice_number || p.supplier_invoices?.reference} · {p.payment_date}
                </span>
                {p.approved ? (
                  <span className={`rounded-full px-2 py-0.5 ${statusBadgeClass("approved")}`}>Approved</span>
                ) : isAdmin ? (
                  <Button size="sm" variant="outline" className="h-7"
                    onClick={async () => {
                      try {
                        await approve({ data: { id: p.id } });
                        toast.success("Payment approved");
                        refresh();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Could not approve");
                      }
                    }}>
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Approve
                  </Button>
                ) : (
                  <span className={`rounded-full px-2 py-0.5 ${statusBadgeClass("pending")}`}>Awaiting Management</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================ credit notes ===

const emptyNote = {
  note_type: "credit", invoice_id: "", customer_id: "", amount: "0",
  currency: CURRENCY, reason: "", note_date: today(),
};

export function CreditNotesTab({
  invoiceOptions, customerOptions, isAdmin,
}: { invoiceOptions: [string, string][]; customerOptions: [string, string][]; isAdmin?: boolean }) {
  const qc = useQueryClient();
  const fetchNotes = useServerFn(listCreditNotes);
  const persist = useServerFn(saveCreditNote);
  const decide = useServerFn(decideCreditNote);
  const { data } = useQuery({ queryKey: ["credit-notes"], queryFn: () => fetchNotes() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyNote);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-notes"] });
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["finance-summary"] });
  };

  const submit = async () => {
    try {
      await persist({
        data: {
          note_type: form.note_type,
          invoice_id: form.invoice_id || null,
          customer_id: form.customer_id || null,
          amount: Number(form.amount || 0),
          currency: form.currency,
          reason: form.reason,
          note_date: form.note_date,
        },
      });
      toast.success("Note raised — awaiting Management approval");
      setOpen(false);
      setForm(emptyNote);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save note");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyNote); }}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New credit / debit note</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>New credit / debit note</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker label="Type" value={form.note_type} onChange={(v) => setForm({ ...form, note_type: v })}
              options={[["credit", "Credit note"], ["debit", "Debit note"]]} />
            <Field label="Date" type="date" value={form.note_date} onChange={(v) => setForm({ ...form, note_date: v })} />
            <Picker label="Invoice" value={form.invoice_id} onChange={(v) => setForm({ ...form, invoice_id: v })} options={invoiceOptions} />
            <Picker label="Customer" value={form.customer_id} onChange={(v) => setForm({ ...form, customer_id: v })} options={customerOptions} />
            <Field label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <Field label="Currency" value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} />
            <div className="sm:col-span-2">
              <Label className="text-xs">Reason</Label>
              <Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submit} disabled={!form.reason.trim() || Number(form.amount) <= 0}>Raise note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {((data as any[]) ?? []).map((n) => (
        <Card key={n.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <FileMinus className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{n.reference}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(n.status)}`}>{humanize(n.status)}</span>
                <span className="text-xs text-muted-foreground">{humanize(n.note_type)}</span>
              </div>
              <p className="mt-1 text-xs">
                {money(n.amount)} · {[n.customers?.name, n.invoices?.invoice_number || n.invoices?.reference, n.note_date]
                  .filter(Boolean).join(" · ")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{n.reason}</p>
            </div>
            {isAdmin && n.status === "pending" && (
              <div className="flex gap-2">
                <Button size="sm" onClick={async () => {
                  try { await decide({ data: { id: n.id, status: "approved" } }); toast.success("Approved"); refresh(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Could not approve"); }
                }}>Approve</Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try { await decide({ data: { id: n.id, status: "rejected" } }); toast.success("Rejected"); refresh(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Could not reject"); }
                }}>Reject</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {((data as any[]) ?? []).length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No notes raised.</p>
      )}
    </div>
  );
}

// ========================================================= project costing ===

const emptyCost = {
  project_id: "", job_number_id: "", cost_type: "labour", description: "",
  amount: "0", currency: CURRENCY, reference: "", incurred_on: today(),
};

export function CostsTab({
  projectOptions, jobOptions,
}: { projectOptions: [string, string][]; jobOptions: [string, string][] }) {
  const qc = useQueryClient();
  const fetchCosts = useServerFn(listProjectCosts);
  const persist = useServerFn(addProjectCost);
  const { data } = useQuery({ queryKey: ["project-costs"], queryFn: () => fetchCosts() });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyCost);

  const submit = async () => {
    try {
      await persist({
        data: {
          ...form,
          project_id: form.project_id || null,
          job_number_id: form.job_number_id || null,
          amount: Number(form.amount || 0),
        },
      });
      toast.success("Cost booked");
      setOpen(false);
      setForm(emptyCost);
      qc.invalidateQueries({ queryKey: ["project-costs"] });
      qc.invalidateQueries({ queryKey: ["finance-summary"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not book cost");
    }
  };

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyCost); }}>
        <DialogTrigger asChild>
          <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Book cost</Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>Book project cost</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Picker label="Project" value={form.project_id} onChange={(v) => setForm({ ...form, project_id: v })} options={projectOptions} />
            <Picker label="Job number" value={form.job_number_id} onChange={(v) => setForm({ ...form, job_number_id: v })} options={jobOptions} />
            <Picker label="Cost type" value={form.cost_type} onChange={(v) => setForm({ ...form, cost_type: v })}
              options={[["material", "Material"], ["labour", "Labour"], ["subcontract", "Subcontract"], ["transport", "Transport"], ["other", "Other"]]} />
            <Field label="Date" type="date" value={form.incurred_on} onChange={(v) => setForm({ ...form, incurred_on: v })} />
            <Field label="Amount" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
            <Field label="Reference" value={form.reference} onChange={(v) => setForm({ ...form, reference: v })} />
            <div className="sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={submit} disabled={Number(form.amount) <= 0}>Book cost</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {((data as any[]) ?? []).map((c) => (
        <Card key={c.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{money(c.amount)}</span>
                <span className="text-xs text-muted-foreground">{humanize(c.cost_type)}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[c.projects?.project_number, c.job_numbers?.job_number, c.incurred_on, c.reference, c.source]
                  .filter(Boolean).join(" · ")}
              </p>
              {c.description && <p className="mt-1 text-xs">{c.description}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
      {((data as any[]) ?? []).length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">No costs booked.</p>
      )}
    </div>
  );
}
