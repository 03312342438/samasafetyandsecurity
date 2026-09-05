import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/use-profile";
import { listMyReports, listAllReports, deleteReport } from "@/lib/reports.functions";
import {
  listMyMaintenanceTasks,
  listAllMaintenanceTasks,
  setMaintenanceTaskStatus,
} from "@/lib/maintenance.functions";
import { MaintenanceTaskList } from "@/components/MaintenanceTaskList";
import { ReportForm } from "@/components/ReportForm";
import { ReportDownloadButton } from "@/components/ReportDownloadButton";
import { AppHeader } from "@/components/AppHeader";
import { ManagementOverview } from "@/components/ManagementOverview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { FileText, Plus, Pencil, Trash2, CalendarClock, FileSpreadsheet, LayoutDashboard } from "lucide-react";
import type { ReportRecord } from "@/lib/report-constants";
import { SearchInput } from "@/components/SearchInput";
import { matchesQuery, REPORT_SEARCH_FIELDS, TASK_SEARCH_FIELDS } from "@/lib/search";
import { downloadReportsExcel } from "@/lib/export-reports-excel";
import { can, hasDept, isStoreOnly } from "@/lib/workflow";
import { SalesDashboard } from "@/components/SalesDashboard";


export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: (search: Record<string, unknown>): { view?: string } =>
    typeof search.view === "string" ? { view: search.view } : {},
  component: Dashboard,
});

function Dashboard() {
  const { data: profile, error: profileError } = useProfile();
  const { view } = Route.useSearch();
  const isAdmin = !!profile?.isAdmin;
  const fetchMyReports = useServerFn(listMyReports);
  const fetchAllReports = useServerFn(listAllReports);
  const fetchMyTasks = useServerFn(listMyMaintenanceTasks);
  const fetchAllTasks = useServerFn(listAllMaintenanceTasks);
  const setStatus = useServerFn(setMaintenanceTaskStatus);
  const qc = useQueryClient();
  const { data: reports } = useQuery({
    queryKey: isAdmin ? ["all-reports"] : ["my-reports"],
    queryFn: () => (isAdmin ? fetchAllReports() : fetchMyReports()),
  });
  const { data: tasks } = useQuery({
    queryKey: isAdmin ? ["all-maintenance-tasks"] : ["my-maintenance-tasks"],
    queryFn: () => (isAdmin ? fetchAllTasks() : fetchMyTasks()),
  });
  // Only Installation & Maintenance / Technician staff may fill service reports.
  const canFillReport = can(profile?.roles, "report.fill");
  const isSalesOnly = !isAdmin && hasDept(profile?.roles, "sales");
  const isInventoryOnly = isStoreOnly(profile?.roles, isAdmin);
    !hasDept(profile?.roles, "accounts");

  const [tab, setTab] = useState(isAdmin ? "overview" : "new");
  const [taskQuery, setTaskQuery] = useState("");
  const fallbackTab = isAdmin ? "overview" : canFillReport ? "new" : "history";
  const activeTab =
    (tab === "overview" && !isAdmin) || (tab === "new" && !canFillReport) ? fallbackTab : tab;

  const taskList = ((tasks as any[]) ?? []).filter((t) =>
    matchesQuery(t, TASK_SEARCH_FIELDS, taskQuery),
  );
  const pending = taskList.filter((t) => t.status === "pending");
  const done = taskList.filter((t) => t.status === "completed");


  const toggle = async (id: string, status: "pending" | "completed") => {
    try {
      await setStatus({ data: { id, status } });
      qc.invalidateQueries({ queryKey: ["my-maintenance-tasks"] });
      qc.invalidateQueries({ queryKey: ["all-maintenance-tasks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  };

  // Self-registered employees must be approved by an admin before using the app.
  if (profile && profile.isApproved === false) {
    return (
      <div className="min-h-screen bg-secondary/40">
        <AppHeader name={profile?.profile?.full_name} />
        <div className="mx-auto mt-24 max-w-md px-4 text-center">
          <CalendarClock className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Account pending approval</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks for signing up, {profile?.profile?.full_name || "there"}. A manager
            needs to approve your account before you can start creating reports. You'll be able
            to sign in normally once it's approved.
          </p>
        </div>
      </div>
    );
  }

  // Sales staff get a pure sales dashboard — no maintenance reports at all.
  if (isSalesOnly) {
    return (
      <div className="min-h-screen bg-secondary/40">
        <AppHeader name={profile?.profile?.full_name} roles={profile?.roles} />
        <main className="mx-auto max-w-[1400px] px-4 py-6">
          <div className="mb-5">
            <h1 className="text-2xl font-bold">Sales Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Quotations sent versus customer POs received, and the business still on the table.
            </p>
          </div>
          <SalesDashboard />
        </main>
      </div>
    );
  }

  // Store staff have no dashboard section — send them straight to the Store.
  if (isInventoryOnly) {
    return <Navigate to="/stock" replace />;
  }

  // Project managers land on the delivery dashboard; this page is their
  // "Maintenance" section, reached from the sidebar with ?view=maintenance.
  if (!isAdmin && hasDept(profile?.roles, "project_manager") && view !== "maintenance") {
    return <Navigate to="/overview" replace />;
  }





  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />

      <main className={isAdmin ? "mx-auto max-w-7xl px-4 py-6" : "mx-auto max-w-5xl px-4 py-6"}>
        {profileError && (
          <div className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Server configuration problem</p>
            <p className="mt-1">
              Your account loaded, but the server couldn't read your role or data. On a custom
              deployment this almost always means the <code>SUPABASE_URL</code> and{" "}
              <code>SUPABASE_PUBLISHABLE_KEY</code> secrets aren't set on the server. See
              CLOUDFLARE_DEPLOY.md.
            </p>
          </div>
        )}
        <div className="mb-5">
          <h1 className="text-2xl font-bold">
            {isAdmin ? "Management Dashboard" : "Maintenance Service Reports"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Live view of sales, costing, billing and project progress."
              : "Fill in a new report or download a previous one as PDF."}
          </p>
        </div>

        <SegmentedTabs
          value={activeTab}
          onChange={setTab}
          tabs={[
            ...(isAdmin
              ? [{ value: "overview", label: (<><LayoutDashboard className="mr-1 h-4 w-4" /> Overview</>) }]
              : []),
            ...(canFillReport
              ? [{ value: "new", label: (<><Plus className="mr-1 h-4 w-4" /> New Report</>) }]
              : []),
            { value: "history", label: <><FileText className="mr-1 h-4 w-4" /> History ({reports?.length ?? 0})</> },
            { value: "maintenance", label: <><CalendarClock className="mr-1 h-4 w-4" /> Maintenance ({pending.length})</> },
          ]}
        />

        {activeTab === "overview" && isAdmin && (
          <div className="mt-5">
            <ManagementOverview />
          </div>
        )}
        {activeTab === "new" && canFillReport && (
          <div className="mt-5">
            <ReportForm
              defaultPerformedBy={profile?.profile?.full_name || profile?.profile?.email || ""}
              onSaved={() => setTab("history")}
            />
          </div>
        )}
        {activeTab === "history" && (
          <div className="mt-5">
            <ReportList reports={(reports as unknown as ReportRecord[]) ?? []} />
          </div>
        )}

        {activeTab === "maintenance" && (
          <div className="mt-5 space-y-6">
            <SearchInput
              value={taskQuery}
              onChange={setTaskQuery}
              placeholder="Search client, contract, order no, project, site, MSR no, our ref, date…"
            />
            <div>
              <h2 className="mb-3 text-base font-semibold">Pending ({pending.length})</h2>
              <MaintenanceTaskList tasks={pending} onToggle={toggle} />
            </div>

            {done.length > 0 && (
              <div>
                <h2 className="mb-3 text-base font-semibold text-muted-foreground">
                  Completed ({done.length})
                </h2>
                <MaintenanceTaskList tasks={done} onToggle={toggle} />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}


export function ReportList({ reports }: { reports: ReportRecord[] }) {
  const [editing, setEditing] = useState<ReportRecord | null>(null);
  const [query, setQuery] = useState("");
  const qc = useQueryClient();
  const remove = useServerFn(deleteReport);

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      qc.invalidateQueries({ queryKey: ["my-reports"] });
      qc.invalidateQueries({ queryKey: ["all-reports"] });
      toast.success("Report deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete report");
    }
  };

  const exportExcel = async () => {
    try {
      await downloadReportsExcel(filtered.length ? filtered : reports);
      toast.success("Excel file downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export Excel");
    }
  };

  if (editing) {
    return (
      <ReportForm
        initial={editing}
        onSaved={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const filtered = reports.filter((r) =>
    matchesQuery(r as any, REPORT_SEARCH_FIELDS, query),
  );


  if (!reports.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No reports yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search client, contract, order no, project, site, MSR no, our ref, date…"
          />
        </div>
        <Button variant="outline" onClick={exportExcel} className="shrink-0">
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel
        </Button>
      </div>
      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No reports match “{query}”.
          </CardContent>
        </Card>
      )}
      {filtered.map((r) => (

        <Card key={r.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-semibold">
                {r.client_name || "Untitled"}{" "}
                {r.msr_no && <span className="text-muted-foreground">· MSR {r.msr_no}</span>}
              </p>
              <p className="text-sm text-muted-foreground">
                {r.project || r.site_location || "—"} ·{" "}
                {new Date(r.created_at).toLocaleString()}
                {(r as any).employee_name && (
                  <span className="ml-1">· by {(r as any).employee_name}</span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ReportDownloadButton
                data={r}
                fileLabel={r.msr_no || r.client_name}
                variant="outline"
                size="sm"
              />
              <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                <Pencil className="mr-1 h-4 w-4" /> Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the report
                      {r.msr_no ? ` (MSR ${r.msr_no})` : ""}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => del(r.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
