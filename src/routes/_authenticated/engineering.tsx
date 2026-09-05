import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, Plus, Pencil, Trash2, ShieldCheck, Package, Send } from "lucide-react";
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
  listBoms, saveBom, deleteBom, setBomStage,
  listProjectTasks, saveProjectTask, deleteProjectTask,
} from "@/lib/engineering.functions";
import { submitApproval } from "@/lib/approvals.functions";
import { listStockItems } from "@/lib/inventory.functions";
import { UomSelect } from "@/components/UomSelect";
import { UomManager } from "@/components/UomManager";
import { can } from "@/lib/workflow";
import { humanize, statusBadgeClass } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/engineering")({
  component: EngineeringPage,
  head: () => ({
    meta: [
      { title: "Planning & BOM/BOS | SAMA Fire & Safety" },
      { name: "description", content: "Prepare costed bills of material and services, plan project tasks, and route BOM/BOS through the A3 management approval gate." },
      { property: "og:title", content: "Planning & BOM/BOS | SAMA Fire & Safety" },
      { property: "og:description", content: "Prepare costed bills of material and services, plan project tasks, and route BOM/BOS through the A3 management approval gate." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ItemRow = {
  stock_item_id: string;
  description: string; category: string; unit: string;
  quantity: string; unit_cost: string; remarks: string;
};

const emptyItem: ItemRow = { stock_item_id: "", description: "", category: "", unit: "pcs", quantity: "1", unit_cost: "0", remarks: "" };

const emptyBom = {
  project_id: "", customer_id: "", title: "",
  bom_type: "material", currency: "BHD", notes: "",
};

const emptyTask = {
  project_id: "", job_number_id: "", title: "", description: "",
  planned_start: "", planned_end: "", actual_start: "", actual_end: "",
  progress_percent: "0", priority: "normal", status: "planned", notes: "",
};

function EngineeringPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("boms");
  const [query, setQuery] = useState("");

  const fetchBoms = useServerFn(listBoms);
  const fetchTasks = useServerFn(listProjectTasks);
  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobNumbers);
  const fetchCustomers = useServerFn(listCustomers);
  const fetchStockItems = useServerFn(listStockItems);

  const { data: stockItems } = useQuery({
    queryKey: ["stock-items", "approved"],
    queryFn: () => fetchStockItems(),
    staleTime: 60_000,
  });
  /** Only item codes Management has approved may be pulled into a BOM. */
  const approvedItems = ((stockItems as any[]) ?? []).filter(
    (i) => (i.approval_status ?? "approved") === "approved",
  );
  const canManageUnits = can(profile?.roles, "uom.manage");
  const persistBom = useServerFn(saveBom);
  const removeBom = useServerFn(deleteBom);
  const moveBom = useServerFn(setBomStage);
  const persistTask = useServerFn(saveProjectTask);
  const removeTask = useServerFn(deleteProjectTask);
  const requestApproval = useServerFn(submitApproval);

  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: () => fetchBoms() });
  const { data: tasks } = useQuery({ queryKey: ["project-tasks"], queryFn: () => fetchTasks() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: jobs } = useQuery({ queryKey: ["job-numbers"], queryFn: () => fetchJobs() });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });

  const [bomOpen, setBomOpen] = useState(false);
  const [bomForm, setBomForm] = useState<any>(emptyBom);
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyItem }]);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState<any>(emptyTask);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["boms"] });
    qc.invalidateQueries({ queryKey: ["project-tasks"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const itemsTotal = useMemo(
    () => items.reduce((s, i) => s + Number(i.quantity || 0) * Number(i.unit_cost || 0), 0),
    [items],
  );

  const bomList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((boms as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((b) =>
      [b.reference, b.title, b.customers?.name, b.projects?.project_number].join(" ").toLowerCase().includes(q),
    );
  }, [boms, query]);

  const taskList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((tasks as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((t) =>
      [t.title, t.projects?.project_number, t.job_numbers?.job_number].join(" ").toLowerCase().includes(q),
    );
  }, [tasks, query]);

  const submitBom = async () => {
    try {
      const res: any = await persistBom({
        data: {
          ...bomForm,
          id: bomForm.id || undefined,
          project_id: bomForm.project_id || null,
          customer_id: bomForm.customer_id || null,
          items: items
            .filter((i) => i.description.trim())
            .map((i) => ({
              stock_item_id: i.stock_item_id || null,
              description: i.description,
              category: i.category,
              unit: i.unit,
              quantity: Number(i.quantity || 0),
              unit_cost: Number(i.unit_cost || 0),
              remarks: i.remarks,
            })),
        },
      });
      toast.success(bomForm.id ? "BOM updated" : `BOM ${res?.reference ?? ""} created`);
      setBomOpen(false);
      setBomForm(emptyBom);
      setItems([{ ...emptyItem }]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save BOM");
    }
  };

  const editBom = (b: any) => {
    setBomForm({
      ...emptyBom, ...b,
      project_id: b.project_id ?? "", customer_id: b.customer_id ?? "",
    });
    const rows = [...(b.bom_items ?? [])].sort((a: any, c: any) => a.sequence - c.sequence);
    setItems(
      rows.length
        ? rows.map((i: any) => ({
            stock_item_id: i.stock_item_id ?? "",
            description: i.description ?? "", category: i.category ?? "", unit: i.unit ?? "",
            quantity: String(i.quantity ?? 0), unit_cost: String(i.unit_cost ?? 0), remarks: i.remarks ?? "",
          }))
        : [{ ...emptyItem }],
    );
    setBomOpen(true);
  };

  const sendForApproval = async (b: any) => {
    try {
      await requestApproval({
        data: {
          approval_type: "bom_bos",
          title: `A3 — BOM/BOS ${b.reference}`,
          details: `${b.title || "BOM"} · estimated cost ${b.estimated_cost} ${b.currency}`,
          project_id: b.project_id ?? null,
          entity_table: "boms",
          entity_id: b.id,
          amount: Number(b.estimated_cost ?? 0),
        },
      });
      await moveBom({ data: { id: b.id, stage: "bom_bos_approval", notes: "" } });
      toast.success("Sent for A3 approval");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request approval");
    }
  };

  const releaseToMaterials = async (b: any) => {
    try {
      await moveBom({ data: { id: b.id, stage: "material_planning", notes: "" } });
      toast.success("Released to material planning");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not release BOM");
    }
  };

  const submitTask = async () => {
    try {
      await persistTask({
        data: {
          ...taskForm,
          id: taskForm.id || undefined,
          project_id: taskForm.project_id || null,
          job_number_id: taskForm.job_number_id || null,
          planned_start: taskForm.planned_start || null,
          planned_end: taskForm.planned_end || null,
          actual_start: taskForm.actual_start || null,
          actual_end: taskForm.actual_end || null,
          progress_percent: Number(taskForm.progress_percent || 0),
        },
      });
      toast.success(taskForm.id ? "Task updated" : "Task created");
      setTaskOpen(false);
      setTaskForm(emptyTask);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save task");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Planning & BOM / BOS</h1>
            <p className="text-sm text-muted-foreground">
              Engineering prepares the costed bill of material and services; nothing reaches the
              store until management clears the A3 gate.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {tab === "boms" ? (
              <Dialog
                open={bomOpen}
                onOpenChange={(o) => {
                  setBomOpen(o);
                  if (!o) { setBomForm(emptyBom); setItems([{ ...emptyItem }]); }
                }}
              >
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New BOM / BOS</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{bomForm.id ? "Edit BOM / BOS" : "New BOM / BOS"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" value={bomForm.title} onChange={(v) => setBomForm({ ...bomForm, title: v })} />
                    <Select label="Type" value={bomForm.bom_type} onChange={(v) => setBomForm({ ...bomForm, bom_type: v })}
                      options={[["material", "BOM — Material"], ["service", "BOS — Service"]]} />
                     <Select label="Project" value={bomForm.project_id} onChange={(v) => setBomForm({ ...bomForm, project_id: v })}
                       options={[["", "— none —"], ...((projects as any[]) ?? []).map((p) => [p.id, `${p.project_number} — ${p.name}`] as [string, string])]} />
                     <Select label="Customer" value={bomForm.customer_id} onChange={(v) => setBomForm({ ...bomForm, customer_id: v })}
                      options={[["", "— none —"], ...((customers as any[]) ?? []).map((c) => [c.id, c.name] as [string, string])]} />
                    <Field label="Currency" value={bomForm.currency} onChange={(v) => setBomForm({ ...bomForm, currency: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={bomForm.notes} onChange={(e) => setBomForm({ ...bomForm, notes: e.target.value })} />
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
                          <select
                            className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-3"
                            value={it.stock_item_id}
                            onChange={(e) => {
                              const picked = approvedItems.find((s: any) => s.id === e.target.value);
                              setItems(items.map((r, i) => (i === idx
                                ? {
                                    ...r,
                                    stock_item_id: e.target.value,
                                    description: picked ? picked.description : r.description,
                                    category: picked ? (picked.category ?? r.category) : r.category,
                                    unit: picked ? (picked.unit ?? r.unit) : r.unit,
                                    unit_cost: picked ? String(picked.unit_cost ?? r.unit_cost) : r.unit_cost,
                                  }
                                : r)));
                            }}
                          >
                            <option value="">— item code —</option>
                            {approvedItems.map((s: any) => (
                              <option key={s.id} value={s.id}>{s.item_code} — {s.description}</option>
                            ))}
                          </select>
                          <Input className="sm:col-span-3" placeholder="Description" value={it.description}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))} />
                          <div className="sm:col-span-2">
                            <UomSelect value={it.unit}
                              onChange={(v) => setItems(items.map((r, i) => (i === idx ? { ...r, unit: v } : r)))} />
                          </div>
                          <Input className="sm:col-span-1" placeholder="Qty" value={it.quantity}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
                          <Input className="sm:col-span-2" placeholder="Unit cost" value={it.unit_cost}
                            onChange={(e) => setItems(items.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r)))} />
                          <Button variant="ghost" size="sm" className="sm:col-span-1"
                            onClick={() => setItems(items.length > 1 ? items.filter((_, i) => i !== idx) : items)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-right text-sm">
                      Estimated cost: <span className="font-medium">{itemsTotal.toFixed(2)} {bomForm.currency}</span>
                    </p>
                  </div>

                  <DialogFooter>
                    <Button onClick={submitBom} disabled={!bomForm.title.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={taskOpen} onOpenChange={(o) => { setTaskOpen(o); if (!o) setTaskForm(emptyTask); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New task</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{taskForm.id ? "Edit task" : "New task"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Field label="Task title" value={taskForm.title} onChange={(v) => setTaskForm({ ...taskForm, title: v })} />
                    </div>
                    <Select label="Project" value={taskForm.project_id} onChange={(v) => setTaskForm({ ...taskForm, project_id: v })}
                      options={[["", "— none —"], ...((projects as any[]) ?? []).map((p) => [p.id, `${p.project_number} — ${p.name}`] as [string, string])]} />
                    <Select label="Job number" value={taskForm.job_number_id} onChange={(v) => setTaskForm({ ...taskForm, job_number_id: v })}
                      options={[["", "— none —"], ...((jobs as any[]) ?? []).map((j) => [j.id, j.job_number] as [string, string])]} />
                    <Field label="Planned start" type="date" value={taskForm.planned_start} onChange={(v) => setTaskForm({ ...taskForm, planned_start: v })} />
                    <Field label="Planned end" type="date" value={taskForm.planned_end} onChange={(v) => setTaskForm({ ...taskForm, planned_end: v })} />
                    <Field label="Actual start" type="date" value={taskForm.actual_start} onChange={(v) => setTaskForm({ ...taskForm, actual_start: v })} />
                    <Field label="Actual end" type="date" value={taskForm.actual_end} onChange={(v) => setTaskForm({ ...taskForm, actual_end: v })} />
                    <Select label="Priority" value={taskForm.priority} onChange={(v) => setTaskForm({ ...taskForm, priority: v })}
                      options={[["low", "Low"], ["normal", "Normal"], ["high", "High"], ["critical", "Critical"]]} />
                    <Select label="Status" value={taskForm.status} onChange={(v) => setTaskForm({ ...taskForm, status: v })}
                      options={[["planned", "Planned"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["completed", "Completed"]]} />
                    <Field label="Progress %" value={taskForm.progress_percent} onChange={(v) => setTaskForm({ ...taskForm, progress_percent: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Description</Label>
                      <Textarea rows={3} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitTask} disabled={!taskForm.title.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "boms", label: `BOM / BOS (${bomList.length})` },
            { value: "tasks", label: `Plan tasks (${taskList.length})` },
            ...(canManageUnits ? [{ value: "units", label: "Units of measure" }] : []),
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "units" && canManageUnits && <UomManager />}

          {tab === "boms" &&
            bomList.map((b: any) => (
              <Card key={b.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClipboardList className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{b.reference}</span>
                      {b.revision > 0 && <span className="text-xs text-muted-foreground">rev {b.revision}</span>}
                      <span className="text-sm">{b.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(b.stage)}`}>{humanize(b.stage)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(b.status)}`}>{humanize(b.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                       {[b.bom_type === "service" ? "BOS" : "BOM", b.projects?.project_number, b.customers?.name]
                         .filter(Boolean)
                         .join(" · ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(b.bom_items ?? []).length} line(s) · estimated {Number(b.estimated_cost ?? 0).toFixed(2)} {b.currency}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                     {b.stage === "bom_bos_preparation" && !profile?.isAdmin && (
                       <Button variant="outline" size="sm" onClick={() => sendForApproval(b)}>
                         <ShieldCheck className="mr-1 h-4 w-4" /> Request A3
                       </Button>
                     )}
                    {b.stage === "bom_bos_approval" && (
                      <Button variant="outline" size="sm" onClick={() => releaseToMaterials(b)}>
                        <Package className="mr-1 h-4 w-4" /> Release to store
                      </Button>
                    )}
                    {b.used_in_quotation ? (
                      <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        Locked — used in quotation {b.used_in_quotation}
                      </span>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => editBom(b)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await removeBom({ data: { id: b.id } });
                          toast.success("BOM deleted");
                          refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Could not delete");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "tasks" &&
            taskList.map((t: any) => (
              <Card key={t.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Send className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{t.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(t.status)}`}>{humanize(t.status)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(t.priority)}`}>{humanize(t.priority)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[t.projects?.project_number, t.job_numbers?.job_number].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.planned_start ?? "—"} → {t.planned_end ?? "—"} · progress {t.progress_percent ?? 0}%
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTaskForm({
                          ...emptyTask, ...t,
                          project_id: t.project_id ?? "", job_number_id: t.job_number_id ?? "",
                          planned_start: t.planned_start ?? "", planned_end: t.planned_end ?? "",
                          actual_start: t.actual_start ?? "", actual_end: t.actual_end ?? "",
                          progress_percent: String(t.progress_percent ?? 0),
                        });
                        setTaskOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          await removeTask({ data: { id: t.id } });
                          toast.success("Task deleted");
                          refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Could not delete");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {((tab === "boms" && bomList.length === 0) || (tab === "tasks" && taskList.length === 0)) && (
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
