import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Inbox, Plus, Receipt, Trash2, Pencil, ShieldCheck, ArrowRight } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listCustomers } from "@/lib/crm.functions";
import { submitApproval, listApprovals } from "@/lib/approvals.functions";
import {
  listInquiries, saveInquiry, deleteInquiry,
  listQuotations, saveQuotation, setQuotationStage, deleteQuotation,
  listCustomerPos, saveCustomerPo, verifyCustomerPo, convertPoToProject,
} from "@/lib/sales.functions";
import { humanize, statusBadgeClass, CURRENCY } from "@/lib/workflow";
import { listBoms } from "@/lib/engineering.functions";
import { QuotationPdfButton } from "@/components/QuotationPdfButton";
import { PreliminaryBomPanel } from "@/components/PreliminaryBomPanel";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
  head: () => ({
    meta: [
      { title: "Sales Chain | SAMA Fire & Safety" },
      { name: "description", content: "Track fire-safety inquiries, priced quotations and customer purchase order verification in one controlled sales chain." },
      { property: "og:title", content: "Sales Chain | SAMA Fire & Safety" },
      { property: "og:description", content: "Track fire-safety inquiries, priced quotations and customer purchase order verification in one controlled sales chain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyInquiry = {
  customer_id: "", contact_person: "", contact_email: "", contact_phone: "",
  site_location: "", scope_type: "installation", requirement_details: "",
  source: "direct", received_date: "", target_date: "", stage: "inquiry",
  status: "open", notes: "",
};

type ItemRow = { description: string; unit: string; quantity: string; unit_price: string };

const emptyQuotation = {
  inquiry_id: "", customer_id: "", title: "", site_location: "", currency: "BHD",
  discount_amount: "0", vat_percent: "15", estimated_cost: "0", validity_days: "30",
  payment_terms: "", delivery_terms: "", scope_notes: "",
  // Sales cost build-up: material comes from the preliminary BOM, the rest is typed in.
  bom_id: "", material_cost: "0", labour_cost: "0", inland_percent: "0",
  transport_cost: "0", margin_percent: "0",
};

const emptyItem: ItemRow = { description: "", unit: "nos", quantity: "1", unit_price: "0" };

const emptyPo = {
  po_number: "", po_date: "", po_value: "0", currency: "BHD",
  quotation_id: "", customer_id: "", document_url: "", notes: "",
};

const QUOTATION_STAGES = [
  "quotation_draft", "technical_review", "quotation_approval", "quotation_sent",
  "follow_up", "negotiation", "customer_accepted",
] as const;

function SalesPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("inquiries");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("all");


  const fetchCustomers = useServerFn(listCustomers);
  const fetchInquiries = useServerFn(listInquiries);
  const fetchQuotations = useServerFn(listQuotations);
  const fetchPos = useServerFn(listCustomerPos);
  const saveInquiryFn = useServerFn(saveInquiry);
  const removeInquiry = useServerFn(deleteInquiry);
  const saveQuotationFn = useServerFn(saveQuotation);
  const stageFn = useServerFn(setQuotationStage);
  const removeQuotation = useServerFn(deleteQuotation);
  const savePoFn = useServerFn(saveCustomerPo);
  const verifyPo = useServerFn(verifyCustomerPo);
  const convertPo = useServerFn(convertPoToProject);
  const requestApproval = useServerFn(submitApproval);

  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });
  const { data: inquiries } = useQuery({ queryKey: ["inquiries"], queryFn: () => fetchInquiries() });
  const { data: quotations } = useQuery({ queryKey: ["quotations"], queryFn: () => fetchQuotations() });
  const { data: pos } = useQuery({ queryKey: ["customer-pos"], queryFn: () => fetchPos() });
  const fetchBoms = useServerFn(listBoms);
  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: () => fetchBoms() });
  const bomList = (boms as any[]) ?? [];
  const fetchApprovals = useServerFn(listApprovals);
  const { data: approvals } = useQuery({ queryKey: ["approvals"], queryFn: () => fetchApprovals() });

  /** Latest approval decision per record, so Sales can see where a request stands. */
  const approvalByEntity = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of ((approvals as any[]) ?? []).slice().reverse()) {
      if (a.entity_id) map.set(a.entity_id, a.decision);
    }
    return map;
  }, [approvals]);

  const approvalState = (id: string) => {
    const d = approvalByEntity.get(id);
    if (!d) return null;
    if (d === "approved") return { label: "Approved", cls: "bg-emerald-100 text-emerald-700" };
    if (d === "rejected") return { label: "Rejected", cls: "bg-destructive/10 text-destructive" };
    return { label: "Under Approval", cls: "bg-amber-100 text-amber-700" };
  };


  const [inqOpen, setInqOpen] = useState(false);
  const [inqForm, setInqForm] = useState<any>(emptyInquiry);
  const [qtnOpen, setQtnOpen] = useState(false);
  const [qtnForm, setQtnForm] = useState<any>(emptyQuotation);
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [poOpen, setPoOpen] = useState(false);
  const [poForm, setPoForm] = useState<any>(emptyPo);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["quotations"] });
    qc.invalidateQueries({ queryKey: ["customer-pos"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
  };

  const customerList = (customers as any[]) ?? [];

  const preview = useMemo(() => {
    const material = num(qtnForm.material_cost);
    const inlandCost = (material * num(qtnForm.inland_percent)) / 100;
    const costBase = material + num(qtnForm.labour_cost) + inlandCost + num(qtnForm.transport_cost);
    const buildUp = costBase > 0;
    const lineSubtotal = items.reduce((s, i) => s + num(i.quantity) * num(i.unit_price), 0);
    const subtotal = buildUp
      ? costBase * (1 + num(qtnForm.margin_percent) / 100) + lineSubtotal
      : lineSubtotal;
    const net = Math.max(subtotal - num(qtnForm.discount_amount), 0);
    const total = net + (net * num(qtnForm.vat_percent)) / 100;
    return { subtotal, total, inlandCost, costBase, estimatedCost: costBase + lineSubtotal };
  }, [
    items, qtnForm.discount_amount, qtnForm.vat_percent, qtnForm.material_cost,
    qtnForm.labour_cost, qtnForm.inland_percent, qtnForm.transport_cost, qtnForm.margin_percent,
  ]);


  const submitInquiry = async () => {
    try {
      await saveInquiryFn({
        data: {
          ...inqForm,
          id: inqForm.id || undefined,
          customer_id: inqForm.customer_id || null,
          target_date: inqForm.target_date || null,
        },
      });
      toast.success(inqForm.id ? "Inquiry updated" : "Inquiry logged");
      setInqOpen(false);
      setInqForm(emptyInquiry);
      refresh();
    } catch (e) {
      toast.error(msg(e, "Could not save inquiry"));
    }
  };

  const submitQuotation = async () => {
    try {
      await saveQuotationFn({
        data: {
          ...qtnForm,
          id: qtnForm.id || undefined,
          inquiry_id: qtnForm.inquiry_id || null,
          customer_id: qtnForm.customer_id || null,
          bom_id: qtnForm.bom_id || null,
          material_cost: num(qtnForm.material_cost),
          labour_cost: num(qtnForm.labour_cost),
          inland_percent: num(qtnForm.inland_percent),
          transport_cost: num(qtnForm.transport_cost),
          margin_percent: num(qtnForm.margin_percent),
          discount_amount: num(qtnForm.discount_amount),
          vat_percent: num(qtnForm.vat_percent),
          estimated_cost: num(qtnForm.estimated_cost),
          validity_days: Math.round(num(qtnForm.validity_days)),
          items: items
            .filter((i) => i.description.trim())
            .map((i) => ({
              description: i.description,
              unit: i.unit,
              quantity: num(i.quantity),
              unit_price: num(i.unit_price),
            })),
        },
      });
      toast.success(qtnForm.id ? "Quotation updated" : "Quotation created");
      setQtnOpen(false);
      setQtnForm(emptyQuotation);
      setItems([{ ...emptyItem }]);
      refresh();
    } catch (e) {
      toast.error(msg(e, "Could not save quotation"));
    }
  };

  const submitPo = async () => {
    try {
      await savePoFn({
        data: {
          ...poForm,
          id: poForm.id || undefined,
          quotation_id: poForm.quotation_id || null,
          customer_id: poForm.customer_id || null,
          po_date: poForm.po_date || null,
          po_value: num(poForm.po_value),
        },
      });
      toast.success(poForm.id ? "Customer PO updated" : "Customer PO recorded");
      setPoOpen(false);
      setPoForm(emptyPo);
      refresh();
    } catch (e) {
      toast.error(msg(e, "Could not save customer PO"));
    }
  };

  const moveStage = async (id: string, stage: string) => {
    try {
      await stageFn({ data: { id, stage: stage as any, notes: "" } });
      toast.success(`Moved to ${humanize(stage)}`);
      refresh();
    } catch (e) {
      toast.error(msg(e, "Could not update stage"));
    }
  };

  const askApproval = async (
    approval_type: "quotation_commercial" | "project_initiation",
    title: string,
    details: string,
    amount: number,
    entity_table: string,
    entity_id: string,
  ) => {
    try {
      await requestApproval({
        data: { approval_type, title, details, amount, entity_table, entity_id, project_id: null, job_number_id: null },
      });
      toast.success("Sent to management for approval");
      refresh();
    } catch (e) {
      toast.error(msg(e, "Could not request approval"));
    }
  };

  const q = query.trim().toLowerCase();
  const inquiryList = ((inquiries as any[]) ?? []).filter(
    (i) => !q || [i.reference, i.customers?.name, i.site_location, i.scope_type].join(" ").toLowerCase().includes(q),
  );
  const quotationList = ((quotations as any[]) ?? []).filter(
    (x) =>
      (!q || [x.reference, x.title, x.customers?.name, x.site_location].join(" ").toLowerCase().includes(q)) &&
      (stageFilter === "all" || x.stage === stageFilter),
  );

  const poList = ((pos as any[]) ?? []).filter(
    (p) => !q || [p.reference, p.po_number, p.customers?.name, p.quotations?.reference].join(" ").toLowerCase().includes(q),
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Sales Chain</h1>
            <p className="text-sm text-muted-foreground">
              Inquiry → quotation → customer PO verification. Projects only start from a verified, approved PO.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {tab === "inquiries" && (
              <Dialog open={inqOpen} onOpenChange={(o) => { setInqOpen(o); if (!o) setInqForm(emptyInquiry); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New inquiry</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{inqForm.id ? "Edit inquiry" : "New inquiry"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Customer" value={inqForm.customer_id} onChange={(v) => setInqForm({ ...inqForm, customer_id: v })}
                      options={customerList.map((c) => ({ value: c.id, label: c.name }))} />
                    <Field label="Contact person" value={inqForm.contact_person} onChange={(v) => setInqForm({ ...inqForm, contact_person: v })} />
                    <Field label="Contact email" value={inqForm.contact_email} onChange={(v) => setInqForm({ ...inqForm, contact_email: v })} />
                    <Field label="Contact phone" value={inqForm.contact_phone} onChange={(v) => setInqForm({ ...inqForm, contact_phone: v })} />
                    <Field label="Site location" value={inqForm.site_location} onChange={(v) => setInqForm({ ...inqForm, site_location: v })} />
                    <Select label="Scope" value={inqForm.scope_type} onChange={(v) => setInqForm({ ...inqForm, scope_type: v })}
                      allowEmpty={false}
                      options={["installation", "maintenance", "supply", "inspection", "modification"].map((s) => ({ value: s, label: humanize(s) }))} />
                    <Select label="Source" value={inqForm.source} onChange={(v) => setInqForm({ ...inqForm, source: v })}
                      allowEmpty={false}
                      options={["direct", "email", "phone", "tender", "referral", "walk_in"].map((s) => ({ value: s, label: humanize(s) }))} />
                    <Field label="Required by" type="date" value={inqForm.target_date} onChange={(v) => setInqForm({ ...inqForm, target_date: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Requirement details</Label>
                      <Textarea rows={3} value={inqForm.requirement_details} onChange={(e) => setInqForm({ ...inqForm, requirement_details: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter><Button onClick={submitInquiry}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {tab === "quotations" && (
              <Dialog open={qtnOpen} onOpenChange={(o) => { setQtnOpen(o); if (!o) { setQtnForm(emptyQuotation); setItems([{ ...emptyItem }]); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New quotation</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{qtnForm.id ? "Edit quotation" : "New quotation"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Customer" value={qtnForm.customer_id} onChange={(v) => setQtnForm({ ...qtnForm, customer_id: v })}
                      options={customerList.map((c) => ({ value: c.id, label: c.name }))} />
                    <Select label="Against inquiry" value={qtnForm.inquiry_id} onChange={(v) => setQtnForm({ ...qtnForm, inquiry_id: v })}
                      options={((inquiries as any[]) ?? []).map((i) => ({ value: i.id, label: `${i.reference} — ${i.customers?.name ?? ""}` }))} />
                    <Field label="Title" value={qtnForm.title} onChange={(v) => setQtnForm({ ...qtnForm, title: v })} />
                    <Field label="Site location" value={qtnForm.site_location} onChange={(v) => setQtnForm({ ...qtnForm, site_location: v })} />
                    <Field label="Discount amount" value={qtnForm.discount_amount} onChange={(v) => setQtnForm({ ...qtnForm, discount_amount: v })} />
                    <Field label="VAT %" value={qtnForm.vat_percent} onChange={(v) => setQtnForm({ ...qtnForm, vat_percent: v })} />
                    
                    <Field label="Validity (days)" value={qtnForm.validity_days} onChange={(v) => setQtnForm({ ...qtnForm, validity_days: v })} />
                    <Field label="Payment terms" value={qtnForm.payment_terms} onChange={(v) => setQtnForm({ ...qtnForm, payment_terms: v })} />
                    <Field label="Delivery terms" value={qtnForm.delivery_terms} onChange={(v) => setQtnForm({ ...qtnForm, delivery_terms: v })} />
                  </div>

                  <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                    <Label className="text-xs font-semibold">Cost build-up</Label>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <Select
                        label="Preliminary BOM/BOS"
                        value={qtnForm.bom_id}
                        onChange={(v) => {
                          const bom = bomList.find((b: any) => b.id === v);
                          setQtnForm({
                            ...qtnForm,
                            bom_id: v,
                            material_cost: bom ? String(bom.estimated_cost ?? 0) : qtnForm.material_cost,
                          });
                        }}
                        options={bomList.map((b: any) => ({
                          value: b.id,
                          label: `${b.reference} — ${b.title || b.projects?.project_number || ""}`,
                        }))}
                      />
                      <div>
                        <Label className="text-xs">Total material cost ({CURRENCY})</Label>
                        <Input className="mt-1" readOnly value={num(qtnForm.material_cost).toFixed(2)} />
                      </div>
                      <Field label={`Total labour cost (${CURRENCY})`} value={qtnForm.labour_cost} onChange={(v) => setQtnForm({ ...qtnForm, labour_cost: v })} />
                      <Field label="Inland %" value={qtnForm.inland_percent} onChange={(v) => setQtnForm({ ...qtnForm, inland_percent: v })} />
                      <div>
                        <Label className="text-xs">Inland cost ({CURRENCY})</Label>
                        <Input className="mt-1" readOnly value={preview.inlandCost.toFixed(2)} />
                      </div>
                      <Field label={`Transport cost (${CURRENCY})`} value={qtnForm.transport_cost} onChange={(v) => setQtnForm({ ...qtnForm, transport_cost: v })} />
                      <Field label="G-Margin %" value={qtnForm.margin_percent} onChange={(v) => setQtnForm({ ...qtnForm, margin_percent: v })} />
                      <div>
                        <Label className="text-xs">Estimated cost ({CURRENCY})</Label>
                        <Input className="mt-1" readOnly value={preview.estimatedCost.toFixed(2)} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-xs">Total price ({CURRENCY})</Label>
                        <Input className="mt-1 font-semibold" readOnly value={preview.subtotal.toFixed(2)} />
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Material cost comes from the selected preliminary BOM/BOS; inland cost, estimated cost
                      and total price are calculated automatically.
                    </p>
                  </div>




                  <div className="mt-3">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs">Miscellaneous Items</Label>
                      <Button variant="outline" size="sm" onClick={() => setItems([...items, { ...emptyItem }])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add line
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {items.map((it, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2">
                          <Input className="col-span-5" placeholder="Description" value={it.description}
                            onChange={(e) => patchItem(items, setItems, idx, { description: e.target.value })} />
                          <Input className="col-span-2" placeholder="Unit" value={it.unit}
                            onChange={(e) => patchItem(items, setItems, idx, { unit: e.target.value })} />
                          <Input className="col-span-2" placeholder="Qty" value={it.quantity}
                            onChange={(e) => patchItem(items, setItems, idx, { quantity: e.target.value })} />
                          <Input className="col-span-2" placeholder="Rate" value={it.unit_price}
                            onChange={(e) => patchItem(items, setItems, idx, { unit_price: e.target.value })} />
                          <Button variant="ghost" size="sm" className="col-span-1"
                            onClick={() => setItems(items.filter((_, i) => i !== idx))}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-right text-sm text-muted-foreground">
                      Subtotal {money(preview.subtotal)} · <span className="font-medium text-foreground">Total {money(preview.total)} {qtnForm.currency}</span>
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs">Scope notes</Label>
                    <Textarea rows={3} value={qtnForm.scope_notes} onChange={(e) => setQtnForm({ ...qtnForm, scope_notes: e.target.value })} />
                  </div>
                  <DialogFooter><Button onClick={submitQuotation}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {tab === "orders" && (
              <Dialog open={poOpen} onOpenChange={(o) => { setPoOpen(o); if (!o) setPoForm(emptyPo); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Record PO</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{poForm.id ? "Edit customer PO" : "Record customer PO"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="PO number" value={poForm.po_number} onChange={(v) => setPoForm({ ...poForm, po_number: v })} />
                    <Field label="PO date" type="date" value={poForm.po_date} onChange={(v) => setPoForm({ ...poForm, po_date: v })} />
                    <Field label="PO value" value={poForm.po_value} onChange={(v) => setPoForm({ ...poForm, po_value: v })} />
                    <Select label="Customer" value={poForm.customer_id} onChange={(v) => setPoForm({ ...poForm, customer_id: v })}
                      options={customerList.map((c) => ({ value: c.id, label: c.name }))} />
                    <Select
                      label="Against quotation"
                      value={poForm.quotation_id}
                      onChange={(v) => {
                        const q = ((quotations as any[]) ?? []).find((x) => x.id === v);
                        setPoForm({
                          ...poForm,
                          quotation_id: v,
                          customer_id: q?.customer_id ?? poForm.customer_id,
                          po_value: q ? String(q.total_amount ?? 0) : poForm.po_value,
                          currency: q?.currency ?? poForm.currency,
                        });
                      }}
                      options={((quotations as any[]) ?? [])
                        .filter((x) => ["approved", "accepted", "won"].includes(x.status))
                        .map((x) => ({ value: x.id, label: `${x.reference} — ${money(x.total_amount)}` }))}
                    />
                    <Field label="Document link" value={poForm.document_url} onChange={(v) => setPoForm({ ...poForm, document_url: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={poForm.notes} onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter><Button onClick={submitPo}>Save</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "inquiries", label: `Inquiries (${inquiryList.length})` },
            { value: "bom", label: `Preliminary BOM/BOS (${bomList.length})` },
            { value: "quotations", label: `Quotations (${quotationList.length})` },
            { value: "orders", label: `Customer POs (${poList.length})` },
            { value: "analytics", label: "Analytics" },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "analytics" && <AnalyticsCharts />}
          {tab === "bom" && <PreliminaryBomPanel />}
          {tab === "inquiries" && inquiryList.map((i) => (
            <Card key={i.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Inbox className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{i.reference}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(i.stage)}`}>{humanize(i.stage)}</span>
                    {approvalState(i.id) && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${approvalState(i.id)!.cls}`}>
                        {approvalState(i.id)!.label}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {[i.customers?.name, humanize(i.scope_type), i.site_location].filter(Boolean).join(" · ") || "—"}
                  </p>
                  {i.requirement_details && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{i.requirement_details}</p>}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setQtnForm({ ...emptyQuotation, inquiry_id: i.id, customer_id: i.customer_id ?? "", site_location: i.site_location ?? "", title: i.requirement_details?.slice(0, 80) ?? "" });
                    setItems([{ ...emptyItem }]);
                    setTab("quotations");
                    setQtnOpen(true);
                  }}>
                    <FileText className="mr-1 h-4 w-4" /> Quote
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setInqForm({ ...emptyInquiry, ...i, customer_id: i.customer_id ?? "", target_date: i.target_date ?? "" }); setInqOpen(true); }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => {
                    try { await removeInquiry({ data: { id: i.id } }); refresh(); toast.success("Inquiry deleted"); }
                    catch (e) { toast.error(msg(e, "Could not delete")); }
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {tab === "quotations" && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filter:</span>
              {[
                { value: "all", label: "All" },
                { value: "quotation_sent", label: "Quotation sent" },
                { value: "follow_up", label: "Follow up" },
                { value: "negotiation", label: "Negotiation / Revision" },
                { value: "customer_accepted", label: "Customer accepted" },
              ].map((f) => (
                <Button key={f.value} size="sm" className="h-7 text-xs"
                  variant={stageFilter === f.value ? "default" : "outline"}
                  onClick={() => setStageFilter(f.value)}>
                  {f.label}
                </Button>
              ))}
            </div>
          )}
          {tab === "quotations" && quotationList.map((x) => {
            const appr = approvalState(x.id);
            const isApproved = appr?.label === "Approved";
            const stages = isApproved
              ? QUOTATION_STAGES.filter(
                  (s) => !["quotation_draft", "technical_review", "quotation_approval"].includes(s),
                )
              : QUOTATION_STAGES;
            return (
            <Card key={x.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{x.reference}{x.revision ? ` R${x.revision}` : ""}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(x.stage)}`}>{humanize(x.stage)}</span>
                      {appr && <span className={`rounded-full px-2 py-0.5 text-[11px] ${appr.cls}`}>{appr.label}</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[x.customers?.name, x.title, x.site_location].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">{money(x.total_amount)} {x.currency}</span>
                      <span className="text-muted-foreground"> · {(x.quotation_items ?? []).length} line(s) · valid {x.validity_days} days</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <QuotationPdfButton quotation={x} customerName={x.customers?.name} />
                    {!appr && (
                      <Button variant="outline" size="sm" onClick={() => askApproval(
                        "quotation_commercial",
                        `A1 — ${x.reference}`,
                        `${x.customers?.name ?? ""} · ${x.title ?? ""} · total ${money(x.total_amount)} ${x.currency}`,
                        Number(x.total_amount ?? 0),
                        "quotations",
                        x.id,
                      )}>
                        <ShieldCheck className="mr-1 h-4 w-4" /> Request A1
                      </Button>
                    )}
                    {!isApproved && (
                    <Button variant="outline" size="sm" onClick={() => {
                      setQtnForm({
                        ...emptyQuotation, ...x,
                        customer_id: x.customer_id ?? "", inquiry_id: x.inquiry_id ?? "",
                        discount_amount: String(x.discount_amount ?? 0), vat_percent: String(x.vat_percent ?? 15),
                        estimated_cost: String(x.estimated_cost ?? 0), validity_days: String(x.validity_days ?? 30),
                        bom_id: x.bom_id ?? "",
                        material_cost: String(x.material_cost ?? 0), labour_cost: String(x.labour_cost ?? 0),
                        inland_percent: String(x.inland_percent ?? 0), transport_cost: String(x.transport_cost ?? 0),
                        margin_percent: String(x.margin_percent ?? 0),
                      });
                      setItems(((x.quotation_items ?? []) as any[])
                        .sort((a, b) => a.sequence - b.sequence)
                        .map((it) => ({ description: it.description, unit: it.unit, quantity: String(it.quantity), unit_price: String(it.unit_price) }))
                        .concat([]) as ItemRow[]);
                      setQtnOpen(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    )}
                    {(!isApproved || profile?.isAdmin) && (
                    <Button variant="outline" size="sm" onClick={async () => {
                      try { await removeQuotation({ data: { id: x.id } }); refresh(); toast.success("Quotation deleted"); }
                      catch (e) { toast.error(msg(e, "Could not delete")); }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 border-t pt-3">
                  {stages.map((s) => (
                    <Button key={s} size="sm" variant={x.stage === s ? "default" : "ghost"}
                      className="h-7 text-xs" onClick={() => moveStage(x.id, s)}>
                      {humanize(s)}
                    </Button>
                  ))}
                </div>

              </CardContent>
            </Card>
            );
          })}


          {tab === "orders" && poList.map((p) => (
            <Card key={p.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Receipt className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{p.po_number || p.reference}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(p.verification_status)}`}>
                        {humanize(p.verification_status)}
                      </span>
                    </div>

                    <p className="mt-1 text-sm text-muted-foreground">
                      {[p.customers?.name, p.quotations?.reference, p.po_date].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="mt-1 text-sm font-medium">{money(p.po_value)} {p.currency}</p>
                    {p.quotations && Number(p.po_value) !== Number(p.quotations.total_amount) && (
                      <p className="text-xs text-destructive">
                        PO value differs from quotation total ({money(p.quotations.total_amount)}).
                      </p>
                    )}
                    {p.discrepancy_notes && <p className="mt-1 text-xs text-muted-foreground">{p.discrepancy_notes}</p>}
                    {p.projects?.project_number && (
                      <p className="mt-1 text-xs text-primary">Project {p.projects.project_number}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setPoForm({ ...emptyPo, ...p, customer_id: p.customer_id ?? "", quotation_id: p.quotation_id ?? "", po_date: p.po_date ?? "", po_value: String(p.po_value ?? 0) }); setPoOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  {!approvalState(p.id) && (
                    <>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={async () => {
                      try { await verifyPo({ data: { id: p.id, verification_status: "verified", discrepancy_notes: "" } }); refresh(); toast.success("PO verified"); }
                      catch (e) { toast.error(msg(e, "Could not verify")); }
                    }}>
                    Verify
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                    onClick={async () => {
                      const notes = window.prompt("What needs clarification from the customer?") ?? "";
                      if (!notes.trim()) return;
                      try { await verifyPo({ data: { id: p.id, verification_status: "clarification_required", discrepancy_notes: notes } }); refresh(); toast.success("Clarification requested"); }
                      catch (e) { toast.error(msg(e, "Could not update")); }
                    }}>
                    Clarification
                  </Button>
                    </>
                  )}

                  {!p.project_id && (
                    <Button size="sm" className="h-7 text-xs"
                      onClick={async () => {
                        const name = window.prompt("Project name", p.quotations?.boms?.title ?? p.quotations?.title ?? p.quotations?.reference ?? p.po_number ?? "") ?? "";
                        if (!name.trim()) return;
                        try {
                          const res: any = await convertPo({ data: { id: p.id, name } });
                          refresh();
                          toast.success(`Project ${res.project_number} initiated`);
                        } catch (e) { toast.error(msg(e, "Could not initiate project")); }
                      }}>
                      <ArrowRight className="mr-1 h-3.5 w-3.5" /> Initiate project
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {((tab === "inquiries" && inquiryList.length === 0) ||
            (tab === "quotations" && quotationList.length === 0) ||
            (tab === "orders" && poList.length === 0)) && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>
      </main>
    </div>
  );
}

function patchItem(items: ItemRow[], setItems: (v: ItemRow[]) => void, index: number, patch: Partial<ItemRow>) {
  setItems(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function money(v: unknown): string {
  return num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function msg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
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
  label, value, onChange, options, allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      >
        {allowEmpty && <option value="">— none —</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}
