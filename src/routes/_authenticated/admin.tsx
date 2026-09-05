import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useProfile } from "@/hooks/use-profile";
import { listEmployees, createEmployee, deleteEmployee, grantAdmin, revokeAdmin, setEmployeePassword, setEmployeeStatus, setUserDepartments } from "@/lib/admin.functions";
import { DEPARTMENTS } from "@/lib/workflow";
import { listRecipients, addRecipient, deleteRecipient } from "@/lib/report-recipients.functions";
import {
  listAllMaintenanceTasks,
  setMaintenanceTaskStatus,
  deleteMaintenanceTask,
  listReminderEmails,
  addReminderEmail,
  deleteReminderEmail,
} from "@/lib/maintenance.functions";
import { listAllReports, spareParPartsReport } from "@/lib/reports.functions";
import { AppHeader } from "@/components/AppHeader";
import { ReportList } from "@/routes/_authenticated/dashboard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, UserPlus, Trash2, ShieldAlert, Mail, ShieldCheck, ShieldMinus, BellRing, CalendarClock, Package, KeyRound, CheckCircle2 } from "lucide-react";
import type { ReportRecord } from "@/lib/report-constants";
import { MaintenanceTaskList } from "@/components/MaintenanceTaskList";
import { SearchInput } from "@/components/SearchInput";
import { matchesQuery, TASK_SEARCH_FIELDS } from "@/lib/search";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: profile, isLoading } = useProfile();
  const [tab, setTab] = useState("employees");



  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile?.isAdmin) {
    return (
      <div className="min-h-screen bg-secondary/40">
        <AppHeader name={profile?.profile?.full_name} />
        <div className="mx-auto mt-20 max-w-md text-center">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground" />
          <h2 className="mt-4 text-lg font-semibold">Management access required</h2>
          <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="mb-5 text-2xl font-bold">Management</h1>
        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "employees", label: "Employees" },
            { value: "recipients", label: "Email Recipients" },
            { value: "maintenance", label: "Maintenance" },
            { value: "spares", label: "Spare Parts" },
            { value: "reports", label: "All Reports" },
          ]}
        />
        <div className="mt-5">
          {tab === "employees" && <Employees />}
          {tab === "recipients" && <Recipients />}
          {tab === "maintenance" && <Maintenance />}
          {tab === "spares" && <SpareParts />}
          {tab === "reports" && <AllReports />}
        </div>

      </main>
    </div>
  );
}

function Employees() {
  const fetchEmployees = useServerFn(listEmployees);
  const create = useServerFn(createEmployee);
  const remove = useServerFn(deleteEmployee);
  const makeAdmin = useServerFn(grantAdmin);
  const dropAdmin = useServerFn(revokeAdmin);
  const resetPassword = useServerFn(setEmployeePassword);
  const setStatus = useServerFn(setEmployeeStatus);
  const { data: profile } = useProfile();
  const currentUserId = profile?.profile?.id;
  const qc = useQueryClient();
  const { data: employees } = useQuery({
    queryKey: ["employees"],
    queryFn: () => fetchEmployees(),
  });

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ full_name: "", designation: "", email: "", password: "" });

  const [resetFor, setResetFor] = useState<{ id: string; name: string } | null>(null);
  const [newPwd, setNewPwd] = useState("");
  const [resetting, setResetting] = useState(false);

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetFor) return;
    if (newPwd.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setResetting(true);
    try {
      await resetPassword({ data: { id: resetFor.id, password: newPwd } });
      toast.success("Password reset");
      setResetFor(null);
      setNewPwd("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setResetting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await create({ data: f });
      toast.success("Employee created");
      setF({ full_name: "", designation: "", email: "", password: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create employee");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      toast.success("Employee removed");
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  };

  const toggleAdmin = async (id: string, isAdmin: boolean) => {
    try {
      if (isAdmin) {
        await dropAdmin({ data: { id } });
        toast.success("Management rights removed");
      } else {
        await makeAdmin({ data: { id } });
        toast.success("Management rights granted");
      }
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update admin rights");
    }
  };

  const approve = async (id: string) => {
    try {
      await setStatus({ data: { id, status: "approved" } });
      toast.success("Account approved");
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    }
  };



  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" /> Add Employee
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Employee</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input required value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input value={f.designation} onChange={(e) => setF({ ...f, designation: e.target.value })} placeholder="e.g. Technician" />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Temporary Password</Label>
                <Input type="text" required minLength={6} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
              </div>
              <DialogFooter>
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {(employees ?? []).map((emp: any) => (
          <Card key={emp.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">
                  {emp.full_name || "—"}{" "}
                  {emp.roles?.includes("admin") && (
                    <span className="ml-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Manager
                    </span>
                  )}
                  {emp.status === "pending" && (
                    <span className="ml-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Pending approval
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">
                  {emp.email} {emp.designation && `· ${emp.designation}`}
                </p>
                <DepartmentChips userId={emp.id} roles={emp.roles ?? []} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(() => {
                  const isAdmin = !!emp.roles?.includes("admin");
                  const isSelf = emp.id === currentUserId;
                  return (
                    <>
                      {emp.status === "pending" && (
                        <Button size="sm" onClick={() => approve(emp.id)}>
                          <CheckCircle2 className="mr-1 h-4 w-4" /> Approve
                        </Button>
                      )}

                      {!isSelf && (
                        <Button
                          variant={isAdmin ? "outline" : "secondary"}
                          size="sm"
                          onClick={() => toggleAdmin(emp.id, isAdmin)}
                        >
                          {isAdmin ? (
                            <>
                              <ShieldMinus className="mr-1 h-4 w-4" /> Remove Manager
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-1 h-4 w-4" /> Make Manager
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetFor({ id: emp.id, name: emp.full_name || emp.email });
                          setNewPwd("");
                        }}
                      >
                        <KeyRound className="mr-1 h-4 w-4" /> Reset Password
                      </Button>
                      {!isAdmin && (
                        <Button variant="ghost" size="sm" onClick={() => del(emp.id)}>
                          <Trash2 className="mr-1 h-4 w-4" /> Remove
                        </Button>
                      )}
                    </>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        ))}
        {employees && employees.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No employees yet.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password{resetFor ? ` — ${resetFor.name}` : ""}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="text"
                required
                minLength={6}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="At least 6 characters"
              />
              <p className="text-xs text-muted-foreground">
                Share this new password with the employee. They can change it again from their portal.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetting}>
                {resetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Reset Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Recipients() {
  const fetchRecipients = useServerFn(listRecipients);
  const add = useServerFn(addRecipient);
  const remove = useServerFn(deleteRecipient);
  const qc = useQueryClient();
  const { data: recipients } = useQuery({
    queryKey: ["recipients"],
    queryFn: () => fetchRecipients(),
  });

  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ email: "", label: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await add({ data: f });
      toast.success("Recipient added");
      setF({ email: "", label: "" });
      qc.invalidateQueries({ queryKey: ["recipients"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add recipient");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    try {
      await remove({ data: { id } });
      toast.success("Recipient removed");
      qc.invalidateQueries({ queryKey: ["recipients"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" /> Report Email Recipients
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Every submitted report is automatically emailed (with the PDF attached) to the addresses below.
          </p>
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              required
              placeholder="name@example.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
            <Input
              placeholder="Label (optional)"
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
              className="sm:max-w-[200px]"
            />
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {(recipients ?? []).map((r: any) => (
          <Card key={r.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">{r.email}</p>
                {r.label && <p className="text-sm text-muted-foreground">{r.label}</p>}
              </div>
              <Button variant="ghost" size="sm" onClick={() => del(r.id)}>
                <Trash2 className="mr-1 h-4 w-4" /> Remove
              </Button>
            </CardContent>
          </Card>
        ))}
        {recipients && recipients.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No recipients yet. Add an email above to start receiving reports.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Maintenance() {
  const fetchTasks = useServerFn(listAllMaintenanceTasks);
  const fetchEmails = useServerFn(listReminderEmails);
  const addEmail = useServerFn(addReminderEmail);
  const removeEmail = useServerFn(deleteReminderEmail);
  const setStatus = useServerFn(setMaintenanceTaskStatus);
  const removeTask = useServerFn(deleteMaintenanceTask);
  const qc = useQueryClient();

  const { data: tasks } = useQuery({
    queryKey: ["all-maintenance-tasks"],
    queryFn: () => fetchTasks(),
  });
  const { data: emails } = useQuery({
    queryKey: ["reminder-emails"],
    queryFn: () => fetchEmails(),
  });

  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ email: "", label: "" });
  const [taskQuery, setTaskQuery] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addEmail({ data: f });
      toast.success("Reminder email added");
      setF({ email: "", label: "" });
      qc.invalidateQueries({ queryKey: ["reminder-emails"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add");
    } finally {
      setSaving(false);
    }
  };

  const delEmail = async (id: string) => {
    try {
      await removeEmail({ data: { id } });
      toast.success("Removed");
      qc.invalidateQueries({ queryKey: ["reminder-emails"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    }
  };

  const toggle = async (id: string, status: "pending" | "completed") => {
    try {
      await setStatus({ data: { id, status } });
      qc.invalidateQueries({ queryKey: ["all-maintenance-tasks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  };

  const del = async (id: string) => {
    if (!window.confirm("Delete this maintenance task? This cannot be undone.")) return;
    try {
      await removeTask({ data: { id } });
      toast.success("Maintenance task deleted");
      qc.invalidateQueries({ queryKey: ["all-maintenance-tasks"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  };

  const list = ((tasks as any[]) ?? []).filter((t) =>
    matchesQuery(t, TASK_SEARCH_FIELDS, taskQuery),
  );
  const pending = list.filter((t) => t.status === "pending");
  const done = list.filter((t) => t.status === "completed");


  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-primary" /> Maintenance Reminder Email List
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            These addresses are emailed for every scheduled maintenance — 2 days before (orange notice)
            and again on the due date (green notice).
          </p>
          <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              required
              placeholder="name@example.com"
              value={f.email}
              onChange={(e) => setF({ ...f, email: e.target.value })}
            />
            <Input
              placeholder="Label (optional)"
              value={f.label}
              onChange={(e) => setF({ ...f, label: e.target.value })}
              className="sm:max-w-[200px]"
            />
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add
            </Button>
          </form>
          <div className="mt-4 space-y-2">
            {((emails as any[]) ?? []).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{r.email}</p>
                  {r.label && <p className="text-xs text-muted-foreground">{r.label}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => delEmail(r.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {emails && (emails as any[]).length === 0 && (
              <p className="text-sm text-muted-foreground">No reminder emails added yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div>
        <SearchInput
          value={taskQuery}
          onChange={setTaskQuery}
          placeholder="Search client, contract, order no, project, site, MSR no, our ref, date…"
        />
        <h2 className="mb-3 mt-4 flex items-center gap-2 text-base font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Pending Maintenance ({pending.length})
        </h2>
        <MaintenanceTaskList tasks={pending} showEmployee onToggle={toggle} onDelete={del} />
      </div>


      {done.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-muted-foreground">
            Completed ({done.length})
          </h2>
          <MaintenanceTaskList tasks={done} showEmployee onToggle={toggle} onDelete={del} />
        </div>
      )}
    </div>
  );
}

function AllReports() {
  const fetchAll = useServerFn(listAllReports);
  const { data: reports } = useQuery({
    queryKey: ["all-reports"],
    queryFn: () => fetchAll(),
  });
  return <ReportList reports={(reports as unknown as ReportRecord[]) ?? []} />;
}


function SpareParts() {
  const fetchReport = useServerFn(spareParPartsReport);
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [start, setStart] = useState(firstOfMonth);
  const [end, setEnd] = useState(today);
  const [query, setQuery] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["spare-parts-report", start, end],
    queryFn: () => fetchReport({ data: { start, end } }),
  });

  const rows = ((data as any)?.rows ?? []).filter((r: any) =>
    matchesQuery(r, ["spare_no", "description", "msr_no", "order_no", "performed_by"], query),
  );

  const filteredQty = rows.reduce((s: number, r: any) => s + (r.qty || 0), 0);
  const filteredAmount = rows.reduce((s: number, r: any) => s + (r.total || 0), 0);
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4 text-primary" /> Spare Parts Sold
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Shows every spare part sold across reports dated between the two dates,
            with the MSR no, order no, the employee who recorded it, and totals.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label>Search</Label>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Spare no, description, MSR, order no, employee…"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <div className="rounded-lg border bg-secondary/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">Line items</p>
              <p className="text-lg font-bold">{rows.length}</p>
            </div>
            <div className="rounded-lg border bg-secondary/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">Total quantity</p>
              <p className="text-lg font-bold">{fmt(filteredQty)}</p>
            </div>
            <div className="rounded-lg border bg-primary/10 px-4 py-3">
              <p className="text-xs text-muted-foreground">Total amount</p>
              <p className="text-lg font-bold text-primary">{fmt(filteredAmount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Spare No</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>MSR No</TableHead>
                  <TableHead>Order No</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Bought By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isFetching && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                    </TableCell>
                  </TableRow>
                )}
                {!isFetching && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                      No spare parts sold in this period.
                    </TableCell>
                  </TableRow>
                )}
                {!isFetching &&
                  rows.map((r: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{r.spare_no || "—"}</TableCell>
                      <TableCell>{r.description || "—"}</TableCell>
                      <TableCell className="text-right">{r.qty || 0}</TableCell>
                      <TableCell className="text-right">{fmt(r.unit_price || 0)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.total || 0)}</TableCell>
                      <TableCell>{r.msr_no || "—"}</TableCell>
                      <TableCell>{r.order_no || "—"}</TableCell>
                      <TableCell>{r.report_date || "—"}</TableCell>
                      <TableCell>{r.performed_by || "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Department assignment — controls which workflow modules a user can reach.
function DepartmentChips({ userId, roles }: { userId: string; roles: string[] }) {
  const qc = useQueryClient();
  const setDepartments = useServerFn(setUserDepartments);
  const [busy, setBusy] = useState(false);

  const current = new Set(roles.filter((r) => r !== "admin" && r !== "employee"));

  const toggle = async (dept: string) => {
    const next = new Set(current);
    if (next.has(dept)) next.delete(dept);
    else next.add(dept);
    setBusy(true);
    try {
      await setDepartments({ data: { id: userId, departments: [...next] as any } });
      qc.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Departments updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update departments");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {DEPARTMENTS.filter((d) => d.value !== "admin").map((d) => {
        const on = current.has(d.value);
        return (
          <button
            key={d.value}
            type="button"
            disabled={busy}
            onClick={() => toggle(d.value)}
            title={d.description}
            className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors disabled:opacity-50 ${
              on
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-muted/50 text-muted-foreground hover:text-foreground"
            }`}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}
