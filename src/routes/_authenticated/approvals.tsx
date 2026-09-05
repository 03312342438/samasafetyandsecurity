import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, Plus, History, FileSearch, Trash2, Lock } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  listApprovals, submitApproval, decideApproval, deleteApproval, getApprovalEntity,
} from "@/lib/approvals.functions";
import { listActivity } from "@/lib/notifications.functions";
import { listProjects } from "@/lib/projects.functions";
import { listQuotations, listCustomerPos } from "@/lib/sales.functions";
import { APPROVAL_TYPE_LABELS, humanize, statusBadgeClass, hasDept } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/approvals")({
  component: ApprovalsPage,
  head: () => ({
    meta: [
      { title: "Approvals & Activity | SAMA Fire & Safety" },
      { name: "description", content: "Management approval gates A1-A6 and the full append-only activity trail for SAMA operations." },
      { property: "og:title", content: "Approvals & Activity | SAMA Fire & Safety" },
      { property: "og:description", content: "Management approval gates A1-A6 and the full append-only activity trail for SAMA operations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyRequest = {
  approval_type: "quotation_commercial",
  title: "",
  details: "",
  project_id: "",
  amount: "",
  quotation_id: "",
  customer_po_id: "",
};

/** Sales may only raise these three requests. */
const SALES_GATES: Record<string, string> = {
  quotation_commercial: "Quotation approval",
  customer_po: "Purchase Order approval",
  commercial_review: "Commercial review",
};

const money = (v: unknown) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3 });

function ApprovalsPage() {
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.isAdmin;
  const isSales = hasDept(profile?.roles, "sales");
  const qc = useQueryClient();
  const [tab, setTab] = useState("pending");

  const fetchApprovals = useServerFn(listApprovals);
  const fetchActivity = useServerFn(listActivity);
  const fetchProjects = useServerFn(listProjects);
  const fetchQuotations = useServerFn(listQuotations);
  const fetchPos = useServerFn(listCustomerPos);
  const fetchEntity = useServerFn(getApprovalEntity);
  const submit = useServerFn(submitApproval);
  const decide = useServerFn(decideApproval);
  const remove = useServerFn(deleteApproval);

  const { data: approvals } = useQuery({ queryKey: ["approvals"], queryFn: () => fetchApprovals() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: quotations } = useQuery({
    queryKey: ["quotations"], queryFn: () => fetchQuotations(), enabled: isSales,
  });
  const { data: pos } = useQuery({
    queryKey: ["customer-pos"], queryFn: () => fetchPos(), enabled: isSales,
  });

  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: () => fetchActivity(),
    enabled: tab === "activity",
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyRequest);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail } = useQuery({
    queryKey: ["approval-entity", detailId],
    queryFn: () => fetchEntity({ data: { id: detailId as string } }),
    enabled: !!detailId,
  });

  const gates = isSales ? SALES_GATES : APPROVAL_TYPE_LABELS;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["job-numbers"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };

  const send = async () => {
    try {
      const quotation = ((quotations as any[]) ?? []).find((q) => q.id === form.quotation_id);
      const po = ((pos as any[]) ?? []).find((p) => p.id === form.customer_po_id);
      let entity_table: string | undefined;
      let entity_id: string | null | undefined;
      let title = form.title;

      if (form.approval_type === "quotation_commercial" && quotation) {
        entity_table = "quotations";
        entity_id = quotation.id;
        title = title || `Quotation ${quotation.reference}`;
      }
      if (form.approval_type === "customer_po" && po) {
        entity_table = "customer_pos";
        entity_id = po.id;
        title = title || `Purchase order ${po.po_number || po.reference}`;
      }

      await submit({
        data: {
          approval_type: form.approval_type,
          title,
          details: form.details,
          project_id: form.project_id || null,
          job_number_id: null,
          amount: Number(form.amount || 0),
          ...(entity_table ? { entity_table, entity_id } : {}),
        },
      });
      toast.success("Approval request sent to management");
      setOpen(false);
      setForm(emptyRequest);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit request");
    }
  };

  const act = async (id: string, decision: "approved" | "rejected" | "revision_requested") => {
    try {
      await decide({ data: { id, decision, decision_notes: notes[id] ?? "" } });
      toast.success(`Request ${decision.replace("_", " ")}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record decision");
    }
  };

  const drop = async (id: string) => {
    try {
      await remove({ data: { id } });
      toast.success("Record deleted");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete record");
    }
  };

  // The Store only ever deals with restock lot and release approvals.
  const isStoreOnly =
    !isAdmin &&
    hasDept(profile?.roles, "inventory") &&
    !hasDept(profile?.roles, "project_manager") &&
    !isSales &&
    !hasDept(profile?.roles, "accounts");
  const all = ((approvals as any[]) ?? []).filter((a) =>
    isStoreOnly ? a.entity_table === "stock_lots" || a.entity_table === "stock_releases" : true,
  );
  const pending = all.filter((a) => a.decision === "pending");
  const decided = all.filter((a) => a.decision !== "pending");
  const needsQuotation = isSales && form.approval_type === "quotation_commercial";
  const needsPo = isSales && form.approval_type === "customer_po";


  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Approvals</h1>
            <p className="text-sm text-muted-foreground">
              {isAdmin
                ? "Every request raised by the departments lands here for your decision."
                : isSales
                  ? "Send quotations, purchase orders and commercial reviews to management for approval."
                  : "Approval gates A1–A6. Nothing downstream may proceed until management decides."}
            </p>
          </div>
          {/* Management decides on requests — it never raises them.
              Store lots are submitted from the Store screen, not here. */}
          {!isAdmin && !isStoreOnly && (

          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyRequest); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Request approval</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Request management approval</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label className="text-xs">Approval gate</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={form.approval_type}
                    onChange={(e) => setForm({ ...form, approval_type: e.target.value, quotation_id: "", customer_po_id: "" })}
                  >
                    {Object.entries(gates).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                {needsQuotation && (
                  <div>
                    <Label className="text-xs">Quotation number</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={form.quotation_id}
                      onChange={(e) => setForm({ ...form, quotation_id: e.target.value })}
                    >
                      <option value="">— select quotation —</option>
                      {((quotations as any[]) ?? []).map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.reference} — {q.customers?.name ?? "—"} ({money(q.total_amount)} {q.currency})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {needsPo && (
                  <div>
                    <Label className="text-xs">Purchase order number</Label>
                    <select
                      className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                      value={form.customer_po_id}
                      onChange={(e) => setForm({ ...form, customer_po_id: e.target.value })}
                    >
                      <option value="">— select purchase order —</option>
                      {((pos as any[]) ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.po_number || p.reference} — {p.customers?.name ?? "—"} ({money(p.po_value)} {p.currency})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <Label className="text-xs">Project (optional)</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={form.project_id}
                    onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                  >
                    <option value="">— none —</option>
                    {((projects as any[]) ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input className="mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Amount (if commercial)</Label>
                  <Input className="mt-1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Details / justification</Label>
                  <Textarea rows={3} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={send}
                  disabled={
                    (needsQuotation && !form.quotation_id) ||
                    (needsPo && !form.customer_po_id) ||
                    (!form.title.trim() && !needsQuotation && !needsPo)
                  }
                >
                  Send request
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          )}
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "pending", label: `Pending (${pending.length})` },
            { value: "decided", label: `Record (${decided.length})` },
            { value: "activity", label: "Activity log" },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab !== "activity" &&
            (tab === "pending" ? pending : decided).map((a) => (
              <Card key={a.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{a.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(a.decision)}`}>
                      {humanize(a.decision)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {APPROVAL_TYPE_LABELS[a.approval_type] ?? a.approval_type}
                    {a.projects?.project_number ? ` · ${a.projects.project_number}` : ""}
                    {a.job_numbers?.job_number ? ` · ${a.job_numbers.job_number}` : ""}
                    {Number(a.amount) > 0 ? ` · ${a.amount}` : ""}
                  </p>
                  {a.details && <p className="text-sm">{a.details}</p>}
                  {a.decision_comments && (
                    <p className="text-xs text-muted-foreground">Decision note: {a.decision_comments}</p>
                  )}
                  <p className="text-[11px] text-muted-foreground">
                    Submitted {new Date(a.submitted_at).toLocaleString()}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {(a.entity_table === "quotations" ||
                      a.entity_table === "customer_pos" ||
                      a.entity_table === "stock_lots" ||
                      a.entity_table === "stock_releases") && (
                      <Button size="sm" variant="outline" onClick={() => setDetailId(a.id)}>
                        <FileSearch className="mr-1 h-4 w-4" />
                        {a.entity_table === "quotations"
                          ? "Open quotation"
                          : a.entity_table === "stock_lots"
                            ? "Open lot"
                            : a.entity_table === "stock_releases"
                              ? "Open release"
                              : "Open purchase order"}
                      </Button>
                    )}

                    {a.decision !== "pending" && !isAdmin && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Lock className="h-3 w-3" /> Locked record — only Management can remove it
                      </span>
                    )}
                    {a.decision !== "pending" && isAdmin && (
                      <Button size="sm" variant="destructive" onClick={() => drop(a.id)}>
                        <Trash2 className="mr-1 h-4 w-4" /> Delete record
                      </Button>
                    )}
                  </div>

                  {isAdmin && a.decision === "pending" && (
                    <div className="space-y-2 pt-1">
                      <Textarea
                        rows={2}
                        placeholder="Decision note (optional)"
                        value={notes[a.id] ?? ""}
                        onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => act(a.id, "approved")}>Approve</Button>
                        <Button size="sm" variant="secondary" onClick={() => act(a.id, "revision_requested")}>
                          Request revision
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => act(a.id, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

          {tab === "activity" &&
            ((activity as any[]) ?? []).map((e) => (
              <Card key={e.id}>
                <CardContent className="flex items-start gap-3 p-3">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-medium">{e.user_name || "Someone"}</span>{" "}
                      {humanize(e.action).toLowerCase()}{" "}
                      {e.entity_label ? <span className="font-medium">{e.entity_label}</span> : e.entity_table}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                      {e.department ? ` · ${e.department}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "pending" && pending.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No approvals waiting.</p>
          )}
        </div>
      </main>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[92vh] w-full max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>Request details</DialogTitle></DialogHeader>
          {(detail as any)?.kind === "quotation" && (() => {
            const q = (detail as any).quotation ?? {};
            const bomItems = (detail as any).bomItems ?? [];
            const miscItems = (detail as any).items ?? [];
            const project = (detail as any).project;
            const bom = (detail as any).bom;
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <p><span className="text-muted-foreground">Quotation</span><br />{q.reference}</p>
                  <p><span className="text-muted-foreground">Customer</span><br />{q.customers?.name ?? "—"}</p>
                  <p><span className="text-muted-foreground">Project</span><br />{project ? `${project.project_number} — ${project.name}` : "—"}</p>
                  <p><span className="text-muted-foreground">Site</span><br />{q.site_location || project?.site_location || "—"}</p>
                  <p><span className="text-muted-foreground">Title</span><br />{q.title || "—"}</p>
                  <p><span className="text-muted-foreground">Preliminary BOM/BOS</span><br />{bom ? `${bom.reference}${bom.title ? ` — ${bom.title}` : ""}` : "—"}</p>
                </div>

                {bomItems.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Preliminary BOM/BOS items</p>
                    <div className="rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-left">
                          <tr>
                            <th className="whitespace-nowrap p-2">Item code</th>
                            <th className="p-2">Description</th>
                            <th className="p-2">Qty</th>
                            <th className="p-2">UOM</th>
                            <th className="whitespace-nowrap p-2 text-right">Unit cost</th>
                            <th className="p-2 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bomItems.map((i: any) => (
                            <tr key={i.id} className="border-t">
                              <td className="whitespace-nowrap p-2">{i.stock_items?.item_code ?? "—"}</td>
                              <td className="p-2">{i.description}</td>
                              <td className="p-2">{i.quantity}</td>
                              <td className="p-2">{i.unit}</td>
                              <td className="p-2 text-right">{money(i.unit_cost)}</td>
                              <td className="p-2 text-right">{money(i.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-3 sm:grid-cols-3">
                  <p><span className="text-muted-foreground">Material cost</span><br />{money(q.material_cost)}</p>
                  <p><span className="text-muted-foreground">Labour cost</span><br />{money(q.labour_cost)}</p>
                  <p><span className="text-muted-foreground">Inland ({q.inland_percent}%)</span><br />{money(q.inland_cost)}</p>
                  <p><span className="text-muted-foreground">Transport cost</span><br />{money(q.transport_cost)}</p>
                  <p><span className="text-muted-foreground">G-Margin</span><br />{q.margin_percent}%</p>
                  <p><span className="text-muted-foreground">Estimated cost</span><br />{money(q.estimated_cost)}</p>
                </div>

                {miscItems.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Miscellaneous items</p>
                    <div className="rounded-md border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-left">
                          <tr><th className="p-2">Description</th><th className="p-2">Qty</th><th className="p-2">Unit</th><th className="p-2 text-right">Amount</th></tr>
                        </thead>
                        <tbody>
                          {miscItems.map((i: any) => (
                            <tr key={i.id} className="border-t">
                              <td className="p-2">{i.description}</td>
                              <td className="p-2">{i.quantity}</td>
                              <td className="p-2">{i.unit}</td>
                              <td className="p-2 text-right">{money(i.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="space-y-1 text-right">
                  <p className="text-muted-foreground">Subtotal: {money(q.subtotal)}</p>
                  {Number(q.discount_amount) > 0 && (
                    <p className="text-muted-foreground">Discount: {money(q.discount_amount)}</p>
                  )}
                  <p className="text-muted-foreground">VAT: {q.vat_percent}%</p>
                  <p className="font-medium">Total price: {money(q.total_amount)} {q.currency}</p>
                </div>
              </div>
            );
          })()}
          {(detail as any)?.kind === "customer_po" && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p><span className="text-muted-foreground">PO number</span><br />{(detail as any).po?.po_number || "—"}</p>
              <p><span className="text-muted-foreground">PO date</span><br />{(detail as any).po?.po_date || "—"}</p>
              <p><span className="text-muted-foreground">Customer</span><br />{(detail as any).po?.customers?.name ?? "—"}</p>
              <p><span className="text-muted-foreground">Value</span><br />{money((detail as any).po?.po_value)} {(detail as any).po?.currency}</p>
              <p><span className="text-muted-foreground">Against quotation</span><br />{(detail as any).po?.quotations?.reference ?? "—"}</p>
              <p><span className="text-muted-foreground">Verification</span><br />{humanize((detail as any).po?.verification_status ?? "")}</p>
              <p className="col-span-2"><span className="text-muted-foreground">Notes</span><br />{(detail as any).po?.notes || "—"}</p>
            </div>
          )}
          {(detail as any)?.kind === "stock_lot" && (() => {
            const lot = (detail as any).lot;
            const lines = lot?.stock_lot_items ?? [];
            const total = lines.reduce(
              (s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0),
              0,
            );
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p><span className="text-muted-foreground">Lot number</span><br />{lot?.lot_number || "—"}</p>
                  <p><span className="text-muted-foreground">Received</span><br />{lot?.received_at || "—"}</p>
                  <p><span className="text-muted-foreground">Status</span><br />{humanize(lot?.status ?? "")}</p>
                  <p><span className="text-muted-foreground">Lot value</span><br />{money(total)} {lot?.currency || "BHD"}</p>
                  <p className="col-span-2"><span className="text-muted-foreground">Notes</span><br />{lot?.notes || "—"}</p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="whitespace-nowrap p-2">Item code</th>
                        <th className="whitespace-nowrap p-2">Description</th>
                        <th className="whitespace-nowrap p-2">Supplier</th>
                        <th className="whitespace-nowrap p-2">Store location</th>
                        <th className="whitespace-nowrap p-2 text-right">Restock qty</th>
                        <th className="whitespace-nowrap p-2 text-right">Unit price</th>
                        <th className="whitespace-nowrap p-2 text-right">Amount</th>
                        <th className="whitespace-nowrap p-2 text-right">On hand now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l: any) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-2">{l.stock_items?.item_code ?? "—"}</td>
                          <td className="p-2">{l.stock_items?.description ?? l.description}</td>
                          <td className="p-2">{l.supplier || "—"}</td>
                          <td className="p-2">{l.store_location || "—"}</td>
                          <td className="p-2 text-right">{l.quantity} {l.stock_items?.unit ?? ""}</td>
                          <td className="p-2 text-right">{money(l.unit_cost)}</td>
                          <td className="p-2 text-right">{money(Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0))}</td>
                          <td className="p-2 text-right">{l.stock_items?.quantity_on_hand ?? "—"}</td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No items in this lot.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-right font-medium">Total lot value: {money(total)} {lot?.currency || "BHD"}</p>
              </div>
            );
          })()}

          {(detail as any)?.kind === "stock_release" && (() => {
            const rel = (detail as any).release;
            const lines = rel?.stock_release_items ?? [];
            const total = lines.reduce(
              (s: number, l: any) => s + Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0),
              0,
            );
            return (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <p><span className="text-muted-foreground">Release no.</span><br />{rel?.reference || "—"}</p>
                  <p><span className="text-muted-foreground">Job number</span><br />No job number</p>
                  <p><span className="text-muted-foreground">Released to</span><br />{rel?.released_to || "—"}</p>
                  <p><span className="text-muted-foreground">Status</span><br />{humanize(rel?.status ?? "")}</p>
                  <p className="col-span-2"><span className="text-muted-foreground">Purpose</span><br />{rel?.purpose || "—"}</p>
                  <p className="col-span-2"><span className="text-muted-foreground">Notes</span><br />{rel?.notes || "—"}</p>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-left">
                      <tr>
                        <th className="whitespace-nowrap p-2">Item code</th>
                        <th className="whitespace-nowrap p-2">Description</th>
                        <th className="whitespace-nowrap p-2 text-right">Release qty</th>
                        <th className="whitespace-nowrap p-2 text-right">Unit cost</th>
                        <th className="whitespace-nowrap p-2 text-right">Amount</th>
                        <th className="whitespace-nowrap p-2 text-right">On hand now</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l: any) => (
                        <tr key={l.id} className="border-t">
                          <td className="p-2">{l.stock_items?.item_code ?? "—"}</td>
                          <td className="p-2">{l.stock_items?.description ?? l.description}</td>
                          <td className="p-2 text-right">{l.quantity} {l.unit}</td>
                          <td className="p-2 text-right">{money(l.unit_cost)}</td>
                          <td className="p-2 text-right">{money(Number(l.quantity ?? 0) * Number(l.unit_cost ?? 0))}</td>
                          <td className="p-2 text-right">{l.stock_items?.quantity_on_hand ?? "—"}</td>
                        </tr>
                      ))}
                      {lines.length === 0 && (
                        <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No items in this release.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="text-right font-medium">Total value: {money(total)} BHD</p>
                <p className="text-xs text-muted-foreground">
                  Approving this request deducts these quantities from live stock.
                </p>
              </div>
            );
          })()}

          {(detail as any)?.kind === "none" && (
            <p className="text-sm text-muted-foreground">
              {(detail as any)?.approval?.details || "No linked record — see the request details above."}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
