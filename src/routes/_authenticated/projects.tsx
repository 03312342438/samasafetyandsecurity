import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderKanban, Plus, Pencil, Trash2, Hash, FileSearch } from "lucide-react";
import { JobItemsDialog } from "@/components/JobItemsDialog";

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
import {
  listProjects, saveProject, deleteProject,
  listJobNumbers, saveJobNumber, deleteJobNumber,
  listInstallationSteps, setInstallationStepStatus,
} from "@/lib/projects.functions";
import { listBoms } from "@/lib/engineering.functions";
import { listCustomerPos } from "@/lib/sales.functions";

import { LIFECYCLE_STAGES, humanize, statusBadgeClass, hasDept, CURRENCY } from "@/lib/workflow";
import { FilterTable } from "@/components/FilterTable";

export const Route = createFileRoute("/_authenticated/projects")({
  component: ProjectsPage,
  head: () => ({
    meta: [
      { title: "Projects & Job Numbers | SAMA Fire & Safety" },
      { name: "description", content: "Track SAMA fire-safety projects through every stage and control job numbers with management approval." },
      { property: "og:title", content: "Projects & Job Numbers | SAMA Fire & Safety" },
      { property: "og:description", content: "Track SAMA fire-safety projects through every stage and control job numbers with management approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyProject = {
  project_number: "", name: "", customer_id: "", site_location: "",
  project_type: "installation", stage: "project_initiated", status: "active",
  contract_value: "", currency: "BHD", estimated_cost: "", start_date: "",
  target_date: "", progress_percent: "0", notes: "",
};

const emptyJob = {
  project_id: "", job_kind: "installation", scope_type: "installation", description: "",
  site_location: "", start_date: "", target_date: "",
  maintenance_interval_months: "", bom_id: "", customer_po_id: "",
  steps: [] as { title: string; expected_date: string }[],
};


function ProjectsPage() {
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState("projects");
  const [query, setQuery] = useState("");
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  // Sales staff never see job numbers — that is a PM / site responsibility.
  const salesOnly =
    !profile?.isAdmin &&
    hasDept(profile?.roles, "sales") &&
    !hasDept(profile?.roles, "project_manager") &&
    !hasDept(profile?.roles, "technician");
  // Store staff may read the project list, but never change it.
  const storeOnly =
    !profile?.isAdmin &&
    hasDept(profile?.roles, "inventory") &&
    !hasDept(profile?.roles, "project_manager") &&
    !hasDept(profile?.roles, "technician") &&
    !hasDept(profile?.roles, "sales") &&
    !hasDept(profile?.roles, "accounts");
  const activeTab = salesOnly ? "projects" : tab;



  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobNumbers);
  const fetchCustomers = useServerFn(listCustomers);
  const save = useServerFn(saveProject);
  const remove = useServerFn(deleteProject);
  const saveJob = useServerFn(saveJobNumber);
  const removeJob = useServerFn(deleteJobNumber);
  const fetchBoms = useServerFn(listBoms);
  const fetchPos = useServerFn(listCustomerPos);
  const fetchSteps = useServerFn(listInstallationSteps);


  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: jobs } = useQuery({ queryKey: ["job-numbers"], queryFn: () => fetchJobs() });
  const { data: customers } = useQuery({ queryKey: ["customers"], queryFn: () => fetchCustomers() });
  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: () => fetchBoms() });
  const { data: customerPos } = useQuery({ queryKey: ["customer-pos"], queryFn: () => fetchPos() });


  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(emptyProject);
  const [jobOpen, setJobOpen] = useState(false);
  const [jobForm, setJobForm] = useState<any>(emptyJob);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["job-numbers"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const submitProject = async () => {
    try {
      await save({
        data: {
          ...form,
          id: form.id || undefined,
          customer_id: form.customer_id || null,
          contract_value: Number(form.contract_value || 0),
          estimated_cost: Number(form.estimated_cost || 0),
          progress_percent: Number(form.progress_percent || 0),
        },
      });
      toast.success(form.id ? "Project updated" : "Project created");
      setOpen(false);
      setForm(emptyProject);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save project");
    }
  };



  const canCreateJob = !profile?.isAdmin && hasDept(profile?.roles, "project_manager");

  const submitJob = async () => {
    try {
      await saveJob({
        data: {
          ...jobForm,
          id: jobForm.id || undefined,
          project_id: jobForm.project_id,
          bom_id: jobForm.bom_id,
          customer_po_id: jobForm.customer_po_id,
          maintenance_interval_months: jobForm.maintenance_interval_months
            ? Number(jobForm.maintenance_interval_months)
            : null,
          start_date: jobForm.start_date || null,
          target_date: jobForm.target_date || null,
          steps: jobForm.steps.map((step: { title: string; expected_date: string }) => ({
            title: step.title,
            expected_date: step.expected_date || null,
          })),
        },
      });
      toast.success(jobForm.id ? "Job number updated" : "Job number sent to Management for approval");
      setJobOpen(false);
      setJobForm(emptyJob);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save job number");
    }
  };

  const q = query.trim().toLowerCase();
  const projectList = ((projects as any[]) ?? []).filter(
    (p) => !q || [p.project_number, p.name, p.customers?.name, p.site_location].join(" ").toLowerCase().includes(q),
  );
  const jobList = ((jobs as any[]) ?? []).filter(
    (j) => !q || [j.job_number, j.projects?.project_number, j.description, j.site_location].join(" ").toLowerCase().includes(q),
  );

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{salesOnly ? "Projects" : "Projects & Job Numbers"}</h1>
            <p className="text-sm text-muted-foreground">
              {salesOnly
                ? "Every project is linked to a customer number and carries its own cost and price."
                : "Every job number is unique, approved by management, and the only key materials and costs can be booked against."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />
            {activeTab === "projects" && !storeOnly ? (
              <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(emptyProject); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Add project</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{form.id ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Project name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
                     <div>
                       <Label className="text-xs">Customer (customer number)</Label>
                       <select
                         className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                         value={form.customer_id}
                         onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                       >
                         <option value="">— none —</option>
                         {((customers as any[]) ?? []).map((c) => (
                           <option key={c.id} value={c.id}>
                             {c.customer_number ? `${c.customer_number} — ` : ""}{c.name}
                           </option>
                         ))}
                       </select>
                     </div>
                    <Field label="Site location" value={form.site_location} onChange={(v) => setForm({ ...form, site_location: v })} />
                    <div>
                      <Label className="text-xs">Type</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.project_type}
                        onChange={(e) => setForm({ ...form, project_type: e.target.value })}
                      >
                        <option value="installation">Installation</option>
                        <option value="maintenance">Maintenance</option>
                        <option value="both">Installation + Maintenance</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Stage</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.stage}
                        onChange={(e) => setForm({ ...form, stage: e.target.value })}
                      >
                        {LIFECYCLE_STAGES.map((s) => (
                          <option key={s} value={s}>{humanize(s)}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <select
                        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                        value={form.status}
                        onChange={(e) => setForm({ ...form, status: e.target.value })}
                      >
                        <option value="active">Active</option>
                        <option value="on_hold">On hold</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                      Price and cost are calculated automatically from the quotation raised against this project.
                    </div>

                    <Field label="Start date" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
                    <Field label="Target date" type="date" value={form.target_date} onChange={(v) => setForm({ ...form, target_date: v })} />
                    <Field label="Progress %" value={form.progress_percent} onChange={(v) => setForm({ ...form, progress_percent: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitProject} disabled={!form.name.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : null}
            {canCreateJob && (
              <Dialog open={jobOpen} onOpenChange={(o) => { setJobOpen(o); if (!o) setJobForm(emptyJob); }}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline"><Plus className="mr-1 h-4 w-4" /> New job number</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{jobForm.id ? "Edit job number" : "New job number"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Project</Label>
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobForm.project_id}
                        onChange={(e) => setJobForm({ ...jobForm, project_id: e.target.value, bom_id: "", customer_po_id: "" })}>
                        <option value="">— select project —</option>
                        {((projects as any[]) ?? []).map((p) => <option key={p.id} value={p.id}>{p.project_number} — {p.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Approved BOM / BOS</Label>
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobForm.bom_id}
                        onChange={(e) => setJobForm({ ...jobForm, bom_id: e.target.value })}>
                        <option value="">— select approved BOM / BOS —</option>
                        {((boms as any[]) ?? []).filter((b) => b.status === "approved" && (!jobForm.project_id || b.project_id === jobForm.project_id)).map((b) => (
                          <option key={b.id} value={b.id}>{b.reference} — {b.title}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Verified customer PO</Label>
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobForm.customer_po_id}
                        onChange={(e) => setJobForm({ ...jobForm, customer_po_id: e.target.value })}>
                        <option value="">— select verified PO —</option>
                        {((customerPos as any[]) ?? []).filter((po) => po.verification_status === "verified" && (!jobForm.project_id || po.project_id === jobForm.project_id)).map((po) => (
                          <option key={po.id} value={po.id}>{po.po_number || po.reference} — {po.customers?.name ?? "Customer"}</option>
                        ))}
                      </select>
                    </div>
                    <Field label="Description" value={jobForm.description} onChange={(v) => setJobForm({ ...jobForm, description: v })} />
                    <Field label="Site location" value={jobForm.site_location} onChange={(v) => setJobForm({ ...jobForm, site_location: v })} />
                    <div>
                      <Label className="text-xs">Job type</Label>
                      <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={jobForm.job_kind}
                        onChange={(e) => setJobForm({ ...jobForm, job_kind: e.target.value, scope_type: e.target.value })}>
                        <option value="installation">Installation</option><option value="maintenance">Maintenance</option>
                      </select>
                    </div>
                    <Field label="Start date" type="date" value={jobForm.start_date} onChange={(v) => setJobForm({ ...jobForm, start_date: v })} />
                    <Field label="Target date" type="date" value={jobForm.target_date} onChange={(v) => setJobForm({ ...jobForm, target_date: v })} />
                    {jobForm.job_kind === "maintenance" && <Field label="Maintenance interval (months)" value={jobForm.maintenance_interval_months} onChange={(v) => setJobForm({ ...jobForm, maintenance_interval_months: v })} />}
                  </div>
                  {jobForm.job_kind === "installation" && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between"><Label className="text-xs">Project steps</Label><Button type="button" variant="outline" size="sm" onClick={() => setJobForm({ ...jobForm, steps: [...jobForm.steps, { title: "", expected_date: "" }] })}><Plus className="mr-1 h-3.5 w-3.5" /> Add step</Button></div>
                      {jobForm.steps.map((step: { title: string; expected_date: string }, index: number) => (
                        <div key={index} className="grid gap-2 sm:grid-cols-[auto_1fr_10rem_auto]">
                          <span className="self-center text-sm text-muted-foreground">{index + 1}.</span>
                          <Input placeholder="Step description" value={step.title} onChange={(e) => setJobForm({ ...jobForm, steps: jobForm.steps.map((item: any, i: number) => i === index ? { ...item, title: e.target.value } : item) })} />
                          <Input type="date" value={step.expected_date} onChange={(e) => setJobForm({ ...jobForm, steps: jobForm.steps.map((item: any, i: number) => i === index ? { ...item, expected_date: e.target.value } : item) })} />
                          <Button type="button" variant="ghost" size="sm" onClick={() => setJobForm({ ...jobForm, steps: jobForm.steps.filter((_: any, i: number) => i !== index) })}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      {jobForm.steps.length === 0 && <p className="text-xs text-muted-foreground">Add the work steps that Installation & Maintenance or Project Management will tick off as completed.</p>}
                    </div>
                  )}
                  <DialogFooter><Button onClick={submitJob} disabled={!jobForm.project_id || !jobForm.bom_id || !jobForm.customer_po_id || (jobForm.job_kind === "installation" && jobForm.steps.length === 0)}>Send to Management</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {!salesOnly && (
          <SegmentedTabs
            value={activeTab}
            onChange={setTab}
            tabs={[
              { value: "projects", label: `Projects (${projectList.length})` },
              { value: "jobs", label: `Job numbers (${jobList.length})` },
            ]}
          />
        )}

        <div className="mt-4 space-y-3">
          {activeTab === "projects" && (
            <FilterTable
              rows={projectList}
              empty="No projects yet."
              columns={[
                { key: "project_number", header: "Project no.", value: (p: any) => p.project_number },
                { key: "name", header: "Project name", value: (p: any) => p.name },
                { key: "customer_number", header: "Customer no.", value: (p: any) => p.customers?.customer_number ?? "" },
                { key: "customer", header: "Customer", value: (p: any) => p.customers?.name ?? "" },
                { key: "site_location", header: "Site location", value: (p: any) => p.site_location },
                { key: "project_type", header: "Type", value: (p: any) => humanize(p.project_type ?? "") },
                { key: "start_date", header: "Start", value: (p: any) => p.start_date ?? "" },
                { key: "target_date", header: "Target", value: (p: any) => p.target_date ?? "" },
                { key: "estimated_cost", header: `Cost (${CURRENCY})`, value: (p: any) => Number(p.estimated_cost ?? 0), className: "text-right" },
                { key: "contract_value", header: `Price (${CURRENCY})`, value: (p: any) => Number(p.contract_value ?? 0), className: "text-right" },
                {
                  key: "stage", header: "Stage", value: (p: any) => humanize(p.stage),
                  cell: (p: any) => (
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(p.stage)}`}>{humanize(p.stage)}</span>
                  ),
                },
              ]}
              actions={(p: any) => (
                <div className="flex justify-end gap-2">
                  {storeOnly ? (
                    <span className="text-xs text-muted-foreground">View only</span>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={() => { setForm({ ...emptyProject, ...p, customer_id: p.customer_id ?? "", contract_value: p.contract_value ?? "", estimated_cost: p.estimated_cost ?? "", start_date: p.start_date ?? "", target_date: p.target_date ?? "", progress_percent: String(p.progress_percent ?? 0) }); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try { await remove({ data: { id: p.id } }); refresh(); toast.success("Project deleted"); }
                          catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              )}

            />
          )}


          {activeTab === "jobs" &&
            jobList.map((j) => (
              <Card key={j.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Hash className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{j.job_number}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(j.status)}`}>{humanize(j.status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[j.projects?.project_number, j.customers?.name, j.scope_type, j.site_location].filter(Boolean).join(" · ")}
                    </p>
                    {j.description && <p className="text-xs text-muted-foreground">{j.description}</p>}
                    <p className="text-xs text-muted-foreground">
                      {j.job_kind === "maintenance"
                        ? `Maintenance · every ${j.maintenance_interval_months ?? "—"} month(s)`
                        : `Installation · progress ${j.progress_percent ?? 0}%`}
                    </p>
                    {j.job_kind !== "maintenance" && <JobSteps jobId={j.id} onChanged={refresh} />}

                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setOpenJobId(j.id)}>
                      <FileSearch className="mr-1 h-4 w-4" /> Open
                    </Button>
                    {!storeOnly && (j.status !== "approved" || profile?.isAdmin) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try { await removeJob({ data: { id: j.id } }); refresh(); toast.success("Job number deleted"); }
                          catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                </CardContent>
              </Card>
            ))}

          {activeTab === "jobs" && jobList.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>

        <JobItemsDialog
          jobId={openJobId}
          open={!!openJobId}
          onClose={() => setOpenJobId(null)}
          canEdit={hasDept(profile?.roles, "inventory") || !!profile?.isAdmin}
          canApprove={hasDept(profile?.roles, "project_manager") || !!profile?.isAdmin}
        />
      </main>

    </div>
  );
}

function JobSteps({ jobId, onChanged }: { jobId: string; onChanged: () => void }) {
  const fetchSteps = useServerFn(listInstallationSteps);
  const setStatus = useServerFn(setInstallationStepStatus);
  const { data, refetch } = useQuery({
    queryKey: ["job-steps", jobId],
    queryFn: () => fetchSteps({ data: { job_number_id: jobId } }),
  });
  const steps = ((data as any[]) ?? []);
  if (steps.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1">
      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 ${statusBadgeClass(s.status)}`}>{humanize(s.status)}</span>
          <span className="font-medium">{s.sequence}. {s.title}</span>
          <span className="text-muted-foreground">
            {s.expected_date ? `due ${s.expected_date}` : "no date"}
            {s.completed_date ? ` · done ${s.completed_date}` : ""}
          </span>
          {s.status !== "completed" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={async () => {
                try {
                  await setStatus({ data: { id: s.id, status: "completed", completed_date: null } });
                  await refetch();
                  onChanged();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not update step");
                }
              }}
            >
              Mark done
            </Button>
          )}
        </li>
      ))}
    </ul>
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
