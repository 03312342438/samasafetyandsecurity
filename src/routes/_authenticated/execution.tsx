import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HardHat, Plus, Pencil, Trash2, CheckCircle2, Send, Receipt } from "lucide-react";
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
  listDailyProgress, saveDailyProgress, deleteDailyProgress,
  listWorkCompletions, saveWorkCompletion, deleteWorkCompletion, setCompletionStage,
} from "@/lib/execution.functions";
import { humanize, statusBadgeClass } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/execution")({
  component: ExecutionPage,
  head: () => ({
    meta: [
      { title: "Site Execution | SAMA Fire & Safety" },
      { name: "description", content: "Record daily site progress, manpower and issues, then close out jobs with customer-confirmed work completion records ready for billing." },
      { property: "og:title", content: "Site Execution | SAMA Fire & Safety" },
      { property: "og:description", content: "Record daily site progress, manpower and issues, then close out jobs with customer-confirmed work completion records ready for billing." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const today = () => new Date().toISOString().slice(0, 10);

const emptyLog = {
  project_id: "", job_number_id: "", customer_id: "", log_date: today(),
  site_location: "", work_description: "", manpower_count: "0", hours_worked: "0",
  equipment_used: "", materials_consumed: "", progress_percent: "0",
  issues: "", weather: "", supervisor: "", status: "submitted", notes: "",
};

const emptyCompletion = {
  project_id: "", job_number_id: "", customer_id: "", title: "", site_location: "",
  completion_date: today(), scope_completed: "", snag_list: "", remarks: "",
  customer_name: "", customer_designation: "",
};

function ExecutionPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("progress");
  const [query, setQuery] = useState("");

  const fetchLogs = useServerFn(listDailyProgress);
  const fetchCompletions = useServerFn(listWorkCompletions);
  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobNumbers);
  const fetchCustomers = useServerFn(listCustomers);
  const persistLog = useServerFn(saveDailyProgress);
  const removeLog = useServerFn(deleteDailyProgress);
  const persistCompletion = useServerFn(saveWorkCompletion);
  const removeCompletion = useServerFn(deleteWorkCompletion);
  const moveCompletion = useServerFn(setCompletionStage);

  const { data: logs } = useQuery({ queryKey: ["daily-progress"], queryFn: () => fetchLogs() });
  const { data: completions } = useQuery({ queryKey: ["work-completions"], queryFn: () => fetchCompletions() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: jobs } = useQuery({ queryKey: ["job-numbers"], queryFn: () => fetchJobs() });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });

  const [logOpen, setLogOpen] = useState(false);
  const [logForm, setLogForm] = useState<any>(emptyLog);
  const [compOpen, setCompOpen] = useState(false);
  const [compForm, setCompForm] = useState<any>(emptyCompletion);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["daily-progress"] });
    qc.invalidateQueries({ queryKey: ["work-completions"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["job-numbers"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const logList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((logs as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((l) =>
      [l.reference, l.work_description, l.site_location, l.projects?.project_number, l.job_numbers?.job_number]
        .join(" ").toLowerCase().includes(q),
    );
  }, [logs, query]);

  const compList = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = ((completions as any[]) ?? []);
    if (!q) return rows;
    return rows.filter((c) =>
      [c.reference, c.title, c.site_location, c.projects?.project_number, c.job_numbers?.job_number]
        .join(" ").toLowerCase().includes(q),
    );
  }, [completions, query]);

  const submitLog = async () => {
    try {
      const res: any = await persistLog({
        data: {
          ...logForm,
          id: logForm.id || undefined,
          project_id: logForm.project_id || null,
          job_number_id: logForm.job_number_id || null,
          customer_id: logForm.customer_id || null,
          manpower_count: Number(logForm.manpower_count || 0),
          hours_worked: Number(logForm.hours_worked || 0),
          progress_percent: Number(logForm.progress_percent || 0),
        },
      });
      toast.success(logForm.id ? "Progress log updated" : `Progress log ${res?.reference ?? ""} saved`);
      setLogOpen(false);
      setLogForm(emptyLog);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save progress log");
    }
  };

  const submitCompletion = async () => {
    try {
      const res: any = await persistCompletion({
        data: {
          ...compForm,
          id: compForm.id || undefined,
          project_id: compForm.project_id || null,
          job_number_id: compForm.job_number_id || null,
          customer_id: compForm.customer_id || null,
          completion_date: compForm.completion_date || null,
        },
      });
      toast.success(compForm.id ? "Completion updated" : `Completion ${res?.reference ?? ""} created`);
      setCompOpen(false);
      setCompForm(emptyCompletion);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save completion record");
    }
  };

  const advance = async (c: any, stage: "customer_confirmation" | "pm_review" | "billing") => {
    try {
      await moveCompletion({
        data: { id: c.id, stage, customer_confirmed: stage === "customer_confirmation", notes: "" },
      });
      toast.success(`Moved to ${humanize(stage)}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update stage");
    }
  };

  const projectOptions: [string, string][] = [
    ["", "— none —"],
    ...((projects as any[]) ?? []).map((p) => [p.id, `${p.project_number} — ${p.name}`] as [string, string]),
  ];
  const jobOptions: [string, string][] = [
    ["", "— none —"],
    ...((jobs as any[]) ?? []).map((j) => [j.id, j.job_number] as [string, string]),
  ];
  const customerOptions: [string, string][] = [
    ["", "— none —"],
    ...((customers as any[]) ?? []).map((c) => [c.id, c.name] as [string, string]),
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Site Execution</h1>
            <p className="text-sm text-muted-foreground">
              Technicians log daily progress against the job number; completion records carry the
              customer confirmation that unlocks billing.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {tab === "progress" ? (
              <Dialog open={logOpen} onOpenChange={(o) => { setLogOpen(o); if (!o) setLogForm(emptyLog); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Daily progress</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{logForm.id ? "Edit progress log" : "New daily progress log"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Date" type="date" value={logForm.log_date} onChange={(v) => setLogForm({ ...logForm, log_date: v })} />
                    <Field label="Site location" value={logForm.site_location} onChange={(v) => setLogForm({ ...logForm, site_location: v })} />
                    <Select label="Project" value={logForm.project_id} onChange={(v) => setLogForm({ ...logForm, project_id: v })} options={projectOptions} />
                    <Select label="Job number" value={logForm.job_number_id} onChange={(v) => setLogForm({ ...logForm, job_number_id: v })} options={jobOptions} />
                    <Select label="Customer" value={logForm.customer_id} onChange={(v) => setLogForm({ ...logForm, customer_id: v })} options={customerOptions} />
                    <Field label="Supervisor" value={logForm.supervisor} onChange={(v) => setLogForm({ ...logForm, supervisor: v })} />
                    <Field label="Manpower" value={logForm.manpower_count} onChange={(v) => setLogForm({ ...logForm, manpower_count: v })} />
                    <Field label="Hours worked" value={logForm.hours_worked} onChange={(v) => setLogForm({ ...logForm, hours_worked: v })} />
                    <Field label="Progress %" value={logForm.progress_percent} onChange={(v) => setLogForm({ ...logForm, progress_percent: v })} />
                    <Field label="Weather / site condition" value={logForm.weather} onChange={(v) => setLogForm({ ...logForm, weather: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Work carried out</Label>
                      <Textarea rows={3} value={logForm.work_description} onChange={(e) => setLogForm({ ...logForm, work_description: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Equipment used</Label>
                      <Textarea rows={2} value={logForm.equipment_used} onChange={(e) => setLogForm({ ...logForm, equipment_used: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Materials consumed</Label>
                      <Textarea rows={2} value={logForm.materials_consumed} onChange={(e) => setLogForm({ ...logForm, materials_consumed: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Issues / delays (notifies the project manager)</Label>
                      <Textarea rows={2} value={logForm.issues} onChange={(e) => setLogForm({ ...logForm, issues: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitLog}>Save log</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={compOpen} onOpenChange={(o) => { setCompOpen(o); if (!o) setCompForm(emptyCompletion); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Completion record</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{compForm.id ? "Edit completion record" : "New work completion"}</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" value={compForm.title} onChange={(v) => setCompForm({ ...compForm, title: v })} />
                    <Field label="Completion date" type="date" value={compForm.completion_date} onChange={(v) => setCompForm({ ...compForm, completion_date: v })} />
                    <Select label="Project" value={compForm.project_id} onChange={(v) => setCompForm({ ...compForm, project_id: v })} options={projectOptions} />
                    <Select label="Job number" value={compForm.job_number_id} onChange={(v) => setCompForm({ ...compForm, job_number_id: v })} options={jobOptions} />
                    <Select label="Customer" value={compForm.customer_id} onChange={(v) => setCompForm({ ...compForm, customer_id: v })} options={customerOptions} />
                    <Field label="Site location" value={compForm.site_location} onChange={(v) => setCompForm({ ...compForm, site_location: v })} />
                    <Field label="Customer representative" value={compForm.customer_name} onChange={(v) => setCompForm({ ...compForm, customer_name: v })} />
                    <Field label="Designation" value={compForm.customer_designation} onChange={(v) => setCompForm({ ...compForm, customer_designation: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Scope completed</Label>
                      <Textarea rows={3} value={compForm.scope_completed} onChange={(e) => setCompForm({ ...compForm, scope_completed: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Snag list / pending items</Label>
                      <Textarea rows={2} value={compForm.snag_list} onChange={(e) => setCompForm({ ...compForm, snag_list: e.target.value })} />
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Remarks</Label>
                      <Textarea rows={2} value={compForm.remarks} onChange={(e) => setCompForm({ ...compForm, remarks: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitCompletion}>Save completion</Button>
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
            { value: "progress", label: "Daily Progress" },
            { value: "completions", label: "Work Completion" },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "progress" &&
            logList.map((l: any) => (
              <Card key={l.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{l.reference}</span>
                      <span className="text-sm text-muted-foreground">{l.log_date}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(l.status)}`}>
                        {humanize(l.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">{l.progress_percent}% complete</span>
                    </div>
                    <p className="mt-1 text-sm">{l.work_description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[l.projects?.project_number, l.job_numbers?.job_number, l.site_location]
                        .filter(Boolean).join(" · ") || "—"}
                      {" · "}{l.manpower_count} men · {l.hours_worked} h
                    </p>
                    {l.issues && <p className="mt-1 text-xs text-destructive">Issue: {l.issues}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      setLogForm({
                        ...emptyLog, ...l,
                        project_id: l.project_id ?? "", job_number_id: l.job_number_id ?? "", customer_id: l.customer_id ?? "",
                        manpower_count: String(l.manpower_count ?? 0), hours_worked: String(l.hours_worked ?? 0),
                        progress_percent: String(l.progress_percent ?? 0),
                      });
                      setLogOpen(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await removeLog({ data: { id: l.id } });
                        toast.success("Log deleted");
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
            ))}

          {tab === "completions" &&
            compList.map((c: any) => (
              <Card key={c.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{c.reference}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadgeClass(c.stage)}`}>
                        {humanize(c.stage)}
                      </span>
                      {c.customer_confirmed && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary ring-1 ring-primary/20">
                          Customer confirmed
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{c.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[c.projects?.project_number, c.job_numbers?.job_number, c.customers?.name, c.completion_date]
                        .filter(Boolean).join(" · ") || "—"}
                    </p>
                    {c.snag_list && <p className="mt-1 text-xs text-muted-foreground">Snags: {c.snag_list}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.stage === "service_report" && (
                      <Button size="sm" onClick={() => advance(c, "customer_confirmation")}>
                        <Send className="mr-1 h-4 w-4" /> Customer confirmed
                      </Button>
                    )}
                    {c.stage === "customer_confirmation" && (
                      <Button size="sm" onClick={() => advance(c, "pm_review")}>
                        <Send className="mr-1 h-4 w-4" /> Send for PM review
                      </Button>
                    )}
                    {c.stage === "pm_review" && (
                      <Button size="sm" onClick={() => advance(c, "billing")}>
                        <Receipt className="mr-1 h-4 w-4" /> Release to billing
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => {
                      setCompForm({
                        ...emptyCompletion, ...c,
                        project_id: c.project_id ?? "", job_number_id: c.job_number_id ?? "", customer_id: c.customer_id ?? "",
                        completion_date: c.completion_date ?? "",
                      });
                      setCompOpen(true);
                    }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      try {
                        await removeCompletion({ data: { id: c.id } });
                        toast.success("Completion deleted");
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
            ))}

          {((tab === "progress" && logList.length === 0) || (tab === "completions" && compList.length === 0)) && (
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
