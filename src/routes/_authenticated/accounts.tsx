import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Receipt, Plus, Pencil, Trash2, Send, Wallet, ShieldCheck, Lock } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listCustomers } from "@/lib/crm.functions";
import { listProjects, listJobNumbers } from "@/lib/projects.functions";
import {
  listInvoices, saveInvoice, deleteInvoice, setInvoiceStage,
  listPayments, recordPayment, deletePayment,
} from "@/lib/accounts.functions";
import { submitApproval } from "@/lib/approvals.functions";
import { UomSelect } from "@/components/UomSelect";
import { can, humanize, statusBadgeClass } from "@/lib/workflow";
import {
  FinanceDashboard, SuppliersTab, PayablesTab, CostsTab, CreditNotesTab,
} from "@/components/AccountsFinance";


export const Route = createFileRoute("/_authenticated/accounts")({
  component: AccountsPage,
  head: () => ({
    meta: [
      { title: "Accounts & Closure | SAMA Fire & Safety" },
      { name: "description", content: "Raise project invoices with VAT, record customer payments, and close jobs through the A6 final management review." },
      { property: "og:title", content: "Accounts & Closure | SAMA Fire & Safety" },
      { property: "og:description", content: "Raise project invoices with VAT, record customer payments, and close jobs through the A6 final management review." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

type ItemRow = { description: string; unit: string; quantity: string; unit_price: string };
const emptyItem: ItemRow = { description: "", unit: "", quantity: "1", unit_price: "0" };

const emptyInvoice = {
  invoice_number: "", customer_id: "", project_id: "", job_number_id: "", title: "",
  invoice_type: "final", invoice_date: today(), due_date: "", currency: "BHD",
  discount_amount: "0", vat_percent: "15", payment_terms: "", notes: "",
};

const emptyPayment = {
  invoice_id: "", payment_date: today(), amount: "0", method: "bank_transfer",
  reference: "", remarks: "",
};

function AccountsPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("dashboard");
  const [query, setQuery] = useState("");

  const fetchInvoices = useServerFn(listInvoices);
  const fetchPayments = useServerFn(listPayments);
  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobNumbers);
  const fetchCustomers = useServerFn(listCustomers);
  const persistInvoice = useServerFn(saveInvoice);
  const removeInvoice = useServerFn(deleteInvoice);
  const moveInvoice = useServerFn(setInvoiceStage);
  const persistPayment = useServerFn(recordPayment);
  const removePayment = useServerFn(deletePayment);
  const requestApproval = useServerFn(submitApproval);

  /** Management reviews the books but never raises an invoice itself. */
  const canRaiseInvoice = can(profile?.roles, "invoice.create");

  const { data: invoices } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });
  const { data: payments } = useQuery({ queryKey: ["payments"], queryFn: () => fetchPayments() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: jobs } = useQuery({ queryKey: ["job-numbers"], queryFn: () => fetchJobs() });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });

  const [invOpen, setInvOpen] = useState(false);
  const [invForm, setInvForm] = useState<any>(emptyInvoice);
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState<any>(emptyPayment);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["invoices"] });
    qc.invalidateQueries({ queryKey: ["payments"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const itemsTotal = useMemo(() => {
    const sub = items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_price || 0), 0);
    const net = Math.max(0, sub - Number(invForm.discount_amount || 0));
    return net + (net * Number(invForm.vat_percent || 0)) / 100;
  }, [items, invForm.discount_amount, invForm.vat_percent]);

  const invoiceList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((invoices as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((i) =>
      [i.reference, i.invoice_number, i.title, i.customers?.name, i.projects?.project_number]
        .join(" ").toLowerCase().includes(q),
    );
  }, [invoices, query]);

  const paymentList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((payments as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((p) =>
      [p.reference, p.method, p.invoices?.reference, p.customers?.name].join(" ").toLowerCase().includes(q),
    );
  }, [payments, query]);

  const submitInvoice = async () => {
    try {
      await persistInvoice({
        data: {
          ...invForm,
          id: invForm.id || undefined,
          customer_id: invForm.customer_id || null,
          project_id: invForm.project_id || null,
          job_number_id: invForm.job_number_id || null,
          quotation_id: null,
          invoice_date: invForm.invoice_date || null,
          due_date: invForm.due_date || null,
          discount_amount: Number(invForm.discount_amount || 0),
          vat_percent: Number(invForm.vat_percent || 0),
          items: items
            .filter((i) => i.description.trim())
            .map((i) => ({
              description: i.description,
              unit: i.unit,
              quantity: Number(i.quantity || 0),
              unit_price: Number(i.unit_price || 0),
            })),
        },
      });
      toast.success(invForm.id ? "Invoice updated" : "Invoice created");
      setInvOpen(false);
      setInvForm(emptyInvoice);
      setItems([{ ...emptyItem }]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save invoice");
    }
  };

  const editInvoice = (i: any) => {
    setInvForm({
      ...emptyInvoice, ...i,
      customer_id: i.customer_id ?? "", project_id: i.project_id ?? "", job_number_id: i.job_number_id ?? "",
      invoice_date: i.invoice_date ?? "", due_date: i.due_date ?? "",
      discount_amount: String(i.discount_amount ?? 0), vat_percent: String(i.vat_percent ?? 15),
    });
    const rows = [...(i.invoice_items ?? [])].sort((a: any, b: any) => a.sequence - b.sequence);
    setItems(
      rows.length
        ? rows.map((r: any) => ({
            description: r.description ?? "", unit: r.unit ?? "",
            quantity: String(r.quantity ?? 0), unit_price: String(r.unit_price ?? 0),
          }))
        : [{ ...emptyItem }],
    );
    setInvOpen(true);
  };

  const advance = async (i: any, stage: "payment" | "final_review" | "closed") => {
    try {
      await moveInvoice({ data: { id: i.id, stage, notes: "" } });
      toast.success(`Moved to ${humanize(stage)}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update invoice");
    }
  };

  const sendFinalReview = async (i: any) => {
    try {
      await requestApproval({
        data: {
          approval_type: "final_review",
          title: `A6 — Final review ${i.reference}`,
          details: `${i.title || "Invoice"} · ${i.total_amount} ${i.currency} · paid ${i.amount_paid}`,
          project_id: i.project_id ?? null,
          job_number_id: i.job_number_id ?? null,
          entity_table: "invoices",
          entity_id: i.id,
          amount: Number(i.total_amount ?? 0),
        },
      });
      await moveInvoice({ data: { id: i.id, stage: "final_review", notes: "" } });
      toast.success("Sent for A6 final review");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request approval");
    }
  };

  const submitPayment = async () => {
    try {
      const res: any = await persistPayment({
        data: {
          invoice_id: payForm.invoice_id,
          payment_date: payForm.payment_date,
          amount: Number(payForm.amount || 0),
          method: payForm.method,
          reference: payForm.reference,
          remarks: payForm.remarks,
        },
      });
      toast.success(res?.settled ? "Payment recorded — invoice fully paid" : "Payment recorded");
      setPayOpen(false);
      setPayForm(emptyPayment);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record payment");
    }
  };

  const customerOptions: [string, string][] = [
    ["", "— none —"],
    ...((customers as any[]) ?? []).map((c) => [c.id, c.name] as [string, string]),
  ];
  const projectOptions: [string, string][] = [
    ["", "— none —"],
    ...((projects as any[]) ?? []).map((p) => [p.id, `${p.project_number} — ${p.name}`] as [string, string]),
  ];
  const jobOptions: [string, string][] = [
    ["", "— none —"],
    ...((jobs as any[]) ?? []).map((j) => [j.id, j.job_number] as [string, string]),
  ];
  const invoiceOptions: [string, string][] = [
    ["", "— select invoice —"],
    ...((invoices as any[]) ?? []).map(
      (i) => [i.id, `${i.invoice_number || i.reference} — ${i.total_amount} ${i.currency}`] as [string, string],
    ),
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Accounts & Closure</h1>
            <p className="text-sm text-muted-foreground">
              Billing follows the confirmed completion record; a project only closes after payment
              and the A6 final management review.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {tab === "invoices" && canRaiseInvoice ? (
              <Dialog open={invOpen} onOpenChange={(o) => { setInvOpen(o); if (!o) { setInvForm(emptyInvoice); setItems([{ ...emptyItem }]); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New invoice</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{invForm.id ? "Edit invoice" : "New invoice"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" value={invForm.title} onChange={(v) => setInvForm({ ...invForm, title: v })} />
                    <Field label="Invoice number (blank = auto)" value={invForm.invoice_number} onChange={(v) => setInvForm({ ...invForm, invoice_number: v })} />
                    <Select label="Type" value={invForm.invoice_type} onChange={(v) => setInvForm({ ...invForm, invoice_type: v })}
                      options={[["advance", "Advance"], ["progress", "Progress"], ["final", "Final"], ["amc", "AMC / Maintenance"]]} />
                    <Select label="Customer" value={invForm.customer_id} onChange={(v) => setInvForm({ ...invForm, customer_id: v })} options={customerOptions} />
                    <Select label="Project" value={invForm.project_id} onChange={(v) => setInvForm({ ...invForm, project_id: v })} options={projectOptions} />
                    <Select label="Job number" value={invForm.job_number_id} onChange={(v) => setInvForm({ ...invForm, job_number_id: v })} options={jobOptions} />
                    <Field label="Invoice date" type="date" value={invForm.invoice_date} onChange={(v) => setInvForm({ ...invForm, invoice_date: v })} />
                    <Field label="Due date" type="date" value={invForm.due_date} onChange={(v) => setInvForm({ ...invForm, due_date: v })} />
                    <Field label="Currency" value={invForm.currency} onChange={(v) => setInvForm({ ...invForm, currency: v })} />
                    <Field label="Discount" value={invForm.discount_amount} onChange={(v) => setInvForm({ ...invForm, discount_amount: v })} />
                    <Field label="VAT %" value={invForm.vat_percent} onChange={(v) => setInvForm({ ...invForm, vat_percent: v })} />
                    <Field label="Payment terms" value={invForm.payment_terms} onChange={(v) => setInvForm({ ...invForm, payment_terms: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={invForm.notes} onChange={(e) => setInvForm({ ...invForm, notes: e.target.value })} />
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs">Line items</Label>
                      <Button variant="outline" size="sm" onClick={() => setItems([...items, { ...emptyItem }])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add line
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {items.map((it, idx) => (
                        <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                          <Input className="sm:col-span-5" placeholder="Description" value={it.description}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))} />
                          <div className="sm:col-span-2">
                            <UomSelect value={it.unit}
                              onChange={(v) => setItems(items.map((r, i) => (i === idx ? { ...r, unit: v } : r)))} />
                          </div>
                          <Input className="sm:col-span-2" placeholder="Qty" value={it.quantity}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
                          <Input className="sm:col-span-2" placeholder="Unit price" value={it.unit_price}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, unit_price: e.target.value } : r)))} />
                          <Button variant="ghost" size="sm" className="sm:col-span-1"
                            onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-right text-sm">
                      Total incl. VAT: <span className="font-medium">{itemsTotal.toFixed(2)} {invForm.currency}</span>
                    </p>
                  </div>

                  <DialogFooter>
                    <Button onClick={submitInvoice}>Save invoice</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : tab === "payments" ? (
              <Dialog open={payOpen} onOpenChange={(o) => { setPayOpen(o); if (!o) setPayForm(emptyPayment); }}>

                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Record payment</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Record payment</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Select label="Invoice" value={payForm.invoice_id} onChange={(v) => setPayForm({ ...payForm, invoice_id: v })} options={invoiceOptions} />
                    </div>
                    <Field label="Payment date" type="date" value={payForm.payment_date} onChange={(v) => setPayForm({ ...payForm, payment_date: v })} />
                    <Field label="Amount" value={payForm.amount} onChange={(v) => setPayForm({ ...payForm, amount: v })} />
                    <Select label="Method" value={payForm.method} onChange={(v) => setPayForm({ ...payForm, method: v })}
                      options={[["bank_transfer", "Bank transfer"], ["cheque", "Cheque"], ["cash", "Cash"], ["card", "Card"], ["other", "Other"]]} />
                    <Field label="Reference" value={payForm.reference} onChange={(v) => setPayForm({ ...payForm, reference: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Remarks</Label>
                      <Textarea rows={2} value={payForm.remarks} onChange={(e) => setPayForm({ ...payForm, remarks: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitPayment} disabled={!payForm.invoice_id}>Save payment</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}

          </div>
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "dashboard", label: "Dashboard" },
            { value: "invoices", label: "Invoices" },
            { value: "payments", label: "Payments" },
            { value: "suppliers", label: "Suppliers" },
            { value: "payables", label: "Payables" },
            { value: "costs", label: "Project costs" },
            { value: "notes", label: "Credit / debit notes" },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "dashboard" && <FinanceDashboard />}
          {tab === "suppliers" && <SuppliersTab />}
          {tab === "payables" && (
            <PayablesTab projectOptions={projectOptions} jobOptions={jobOptions} isAdmin={profile?.isAdmin} />
          )}
          {tab === "costs" && <CostsTab projectOptions={projectOptions} jobOptions={jobOptions} />}
          {tab === "notes" && (
            <CreditNotesTab
              invoiceOptions={invoiceOptions}
              customerOptions={customerOptions}
              isAdmin={profile?.isAdmin}
            />
          )}

          {tab === "invoices" &&
            invoiceList.map((i: any) => {
              const balance = Number(i.total_amount ?? 0) - Number(i.amount_paid ?? 0);
              return (
                <Card key={i.id}>
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{i.invoice_number || i.reference}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(i.status)}`}>
                          {humanize(i.status)}
                        </span>
                        <span className="text-xs text-muted-foreground">{humanize(i.stage)}</span>
                      </div>
                      <p className="mt-1 text-sm">{i.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[i.customers?.name, i.projects?.project_number, i.job_numbers?.job_number, i.invoice_date]
                          .filter(Boolean).join(" · ") || "—"}
                      </p>
                      <p className="mt-1 text-xs">
                        Total {Number(i.total_amount ?? 0).toFixed(2)} {i.currency} · paid{" "}
                        {Number(i.amount_paid ?? 0).toFixed(2)} · balance {balance.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {i.stage === "billing" && (
                        <Button size="sm" onClick={() => advance(i, "payment")}>
                          <Send className="mr-1 h-4 w-4" /> Issue to customer
                        </Button>
                      )}
                      {i.stage === "payment" && (
                        <Button size="sm" variant="outline" onClick={() => { setPayForm({ ...emptyPayment, invoice_id: i.id, amount: String(balance) }); setPayOpen(true); setTab("payments"); }}>
                          <Wallet className="mr-1 h-4 w-4" /> Record payment
                        </Button>
                      )}
                      {(i.stage === "payment" || i.stage === "final_review") && i.status !== "closed" && (
                        <Button size="sm" onClick={() => sendFinalReview(i)}>
                          <ShieldCheck className="mr-1 h-4 w-4" /> A6 review
                        </Button>
                      )}
                      {i.stage === "final_review" && (
                        <Button size="sm" variant="outline" onClick={() => advance(i, "closed")}>
                          <Lock className="mr-1 h-4 w-4" /> Close project
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => editInvoice(i)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        try {
                          await removeInvoice({ data: { id: i.id } });
                          toast.success("Invoice deleted");
                          refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Could not delete");
                        }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

          {tab === "payments" &&
            paymentList.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Wallet className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {Number(p.amount ?? 0).toFixed(2)} {p.currency}
                      </span>
                      <span className="text-xs text-muted-foreground">{humanize(p.method)}</span>
                      <span className="text-xs text-muted-foreground">{p.payment_date}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[p.invoices?.invoice_number || p.invoices?.reference, p.customers?.name, p.reference]
                        .filter(Boolean).join(" · ") || "—"}
                    </p>
                    {p.remarks && <p className="mt-1 text-xs text-muted-foreground">{p.remarks}</p>}
                  </div>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try {
                      await removePayment({ data: { id: p.id } });
                      toast.success("Payment removed");
                      refresh();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not delete");
                    }
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}

          {((tab === "invoices" && invoiceList.length === 0) || (tab === "payments" && paymentList.length === 0)) && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

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

function Select({
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
