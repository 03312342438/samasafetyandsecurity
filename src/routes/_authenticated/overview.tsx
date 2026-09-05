import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { getProjectDashboard } from "@/lib/pm-dashboard.functions";
import { humanize, statusBadgeClass } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import { FolderKanban, CheckCircle2, Receipt, Wallet, HardHat, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/_authenticated/overview")({
  component: ProjectDashboard,
  head: () => ({
    meta: [
      { title: "Project Dashboard | SAMA Fire & Safety" },
      { name: "description", content: "Live delivery dashboard: ongoing project progress, completed projects by month, invoicing and payments." },
      { property: "og:title", content: "Project Dashboard | SAMA Fire & Safety" },
      { property: "og:description", content: "Live delivery dashboard: ongoing project progress, completed projects by month, invoicing and payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const money = (v: number, c: string) =>
  `${c} ${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const PIE_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9"];

function Metric({
  label, value, hint, icon: Icon, tone,
}: { label: string; value: string; hint?: string; icon: typeof FolderKanban; tone: string }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={cn("rounded-lg p-2", tone)}>
          <Icon className="h-5 w-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function ProjectDashboard() {
  const { data: profile } = useProfile();
  const fetchDashboard = useServerFn(getProjectDashboard);
  const { data, isLoading } = useQuery({
    queryKey: ["project-dashboard"],
    queryFn: () => fetchDashboard(),
  });
  const [months, setMonths] = useState("1");

  const currency = (data as any)?.currency ?? "BHD";
  const totals = (data as any)?.totals;
  const ongoing: any[] = (data as any)?.ongoing ?? [];
  const completed: any[] = (data as any)?.completed ?? [];
  const monthly: any[] = (data as any)?.monthlyCompleted ?? [];

  const window = Number(months);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - window);
  const completedInWindow = completed.filter(
    (p) => p.completed_at && new Date(p.completed_at) >= cutoff,
  );

  const stagePie = Object.entries(
    ongoing.reduce((acc: Record<string, number>, p) => {
      const k = humanize(p.stage);
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([name, value]) => ({ name, value: value as number }));

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Project Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Ongoing projects with live progress, completed projects by period, and how much is
            invoiced against how much is collected.
          </p>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading dashboard…</p>}

        {totals && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric
                label="Ongoing projects" value={String(totals.ongoing)}
                hint={`${totals.activeJobs} active job numbers`}
                icon={FolderKanban} tone="bg-primary/10 text-primary"
              />
              <Metric
                label={`Completed (last ${window} month${window > 1 ? "s" : ""})`}
                value={String(completedInWindow.length)}
                hint={`${totals.completed} completed overall`}
                icon={CheckCircle2} tone="bg-emerald-500/10 text-emerald-600"
              />
              <Metric
                label="Invoiced" value={money(totals.invoiced, currency)}
                hint={`Contract value ${money(totals.contractValue, currency)}`}
                icon={Receipt} tone="bg-amber-500/10 text-amber-600"
              />
              <Metric
                label="Payment received" value={money(totals.paid, currency)}
                hint={`Outstanding ${money(totals.outstanding, currency)}`}
                icon={Wallet} tone="bg-sky-500/10 text-sky-600"
              />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="shadow-[var(--shadow-card)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Projects completed per month</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="label" fontSize={11} />
                      <YAxis allowDecimals={false} fontSize={11} />
                      <Tooltip />
                      <Bar dataKey="count" name="Completed" fill="#16a34a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-[var(--shadow-card)]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Ongoing projects by stage</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  {stagePie.length === 0 ? (
                    <p className="pt-16 text-center text-sm text-muted-foreground">
                      No ongoing projects yet.
                    </p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stagePie} dataKey="value" nameKey="name" outerRadius={90} label>
                          {stagePie.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend />
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  <HardHat className="mr-1 inline h-4 w-4" /> Ongoing projects ({ongoing.length})
                </h2>
              </div>
              <div className="space-y-3">
                {ongoing.length === 0 && (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No ongoing projects.
                  </CardContent></Card>
                )}
                {ongoing.map((p) => (
                  <Card key={p.id} className="shadow-[var(--shadow-card)]">
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {p.project_number} · {p.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.customer} · {p.site_location || "—"}
                            {p.target_date ? ` · target ${p.target_date}` : ""}
                          </p>
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusBadgeClass(p.stage))}>
                          {humanize(p.stage)}
                        </span>
                      </div>
                      <div>
                        <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>Progress ({p.jobs} job{p.jobs === 1 ? "" : "s"})</span>
                          <span className="font-semibold text-foreground">{p.progress}%</span>
                        </div>
                        <Progress value={p.progress} />
                      </div>
                      <div className="grid gap-2 text-xs sm:grid-cols-4">
                        <div><span className="text-muted-foreground">Contract</span><p className="font-semibold">{money(p.contract_value, currency)}</p></div>
                        <div><span className="text-muted-foreground">Invoiced</span><p className="font-semibold">{money(p.invoiced, currency)}</p></div>
                        <div><span className="text-muted-foreground">Payment received</span><p className="font-semibold text-emerald-600">{money(p.paid, currency)}</p></div>
                        <div><span className="text-muted-foreground">Outstanding</span><p className="font-semibold text-amber-600">{money(p.outstanding, currency)}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-base font-semibold">
                  <TrendingUp className="mr-1 inline h-4 w-4" /> Completed projects
                </h2>
              </div>
              <SegmentedTabs
                value={months}
                onChange={setMonths}
                tabs={[
                  { value: "1", label: "Last 1 month" },
                  { value: "2", label: "Last 2 months" },
                  { value: "3", label: "Last 3 months" },
                  { value: "6", label: "Last 6 months" },
                  { value: "12", label: "Last 12 months" },
                ]}
              />
              <div className="mt-3 space-y-2">
                {completedInWindow.length === 0 && (
                  <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
                    No projects completed in this period.
                  </CardContent></Card>
                )}
                {completedInWindow.map((p) => (
                  <Card key={p.id}>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-semibold">{p.project_number} · {p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.customer} · completed {p.completed_date ?? "—"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-4 text-xs">
                        <span>Contract <b>{money(p.contract_value, currency)}</b></span>
                        <span>Invoiced <b>{money(p.invoiced, currency)}</b></span>
                        <span className="text-emerald-600">Paid <b>{money(p.paid, currency)}</b></span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
