import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getManagementOverview } from "@/lib/overview.functions";
import { AnalyticsCharts } from "@/components/AnalyticsCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { humanize, statusBadgeClass } from "@/lib/workflow";
import { cn } from "@/lib/utils";
import {
  TrendingUp, FileSignature, ShoppingCart, Wallet, PiggyBank, HardHat,
  CheckSquare, Boxes, Users, Clock,
} from "lucide-react";

function money(value: number, currency: string) {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

function Metric({
  label, value, hint, icon: Icon,
}: { label: string; value: string; hint?: string; icon: typeof TrendingUp }) {
  return (
    <Card className="shadow-[var(--shadow-card)]">
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate text-xl font-bold">{value}</p>
          {hint && <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className="rounded-lg bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </CardContent>
    </Card>
  );
}

function StageList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-muted-foreground">Nothing yet.</p>}
        {rows.slice(0, 8).map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-3 text-sm">
            <span className={cn("rounded-md px-2 py-0.5 text-xs", statusBadgeClass(r.label))}>
              {humanize(r.label)}
            </span>
            <span className="font-semibold">{r.count}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function ManagementOverview() {
  const fetchOverview = useServerFn(getManagementOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["management-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading overview…</p>;
  }
  if (error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load the overview."}
      </p>
    );
  }
  if (!data) return null;

  const k = data.kpis;
  const c = data.currency;

  return (
    <div className="space-y-6">
      <AnalyticsCharts />

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sales &amp; pipeline
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Open quotations" value={money(k.openQuotationValue, c)} hint={`${k.openQuotationCount} live`} icon={FileSignature} />
          <Metric label="Won value" value={money(k.wonQuotationValue, c)} hint={`Win rate ${k.winRate}%`} icon={TrendingUp} />
          <Metric label="Order intake (PO)" value={money(k.orderIntake, c)} hint={`${k.orderCount} customer POs`} icon={ShoppingCart} />
          <Metric label="Inquiries" value={String(k.inquiries)} hint={`${k.customers} customers`} icon={Users} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Costing &amp; margin
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Contract value" value={money(k.contractValue, c)} hint={`${k.totalProjects} projects`} icon={Wallet} />
          <Metric label="Estimated cost" value={money(k.estimatedCost, c)} icon={PiggyBank} />
          <Metric label="Gross margin" value={money(k.grossMargin, c)} hint={`${k.marginPercent}% of contract`} icon={TrendingUp} />
          <Metric label="Outstanding" value={money(k.outstanding, c)} hint={`Invoiced ${money(k.invoicedTotal, c)}`} icon={Clock} />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Execution &amp; cash
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Active projects" value={String(k.activeProjects)} hint={`Avg progress ${k.avgProgress}%`} icon={HardHat} />
          <Metric label="Collected" value={money(k.collectedTotal, c)} hint={`Payments ${money(k.paymentsReceived, c)}`} icon={Wallet} />
          <Metric label="Pending approvals" value={String(k.pendingApprovals)} icon={CheckSquare} />
          <Metric label="Open material requests" value={String(k.openMaterialRequests)} hint={`${k.hoursLogged} site hours logged`} icon={Boxes} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StageList title="Quotation pipeline" rows={data.pipelineByStage} />
        <StageList title="Projects by stage" rows={data.projectsByStage} />
        <StageList title="Pending approvals by gate" rows={data.approvalsByType} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Project progress, value &amp; payments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.projectProgress.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects yet.</p>
          )}
          {data.projectProgress.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium">
                  {p.project_number} · {p.name}
                  <span className="ml-1 text-muted-foreground">· {p.customer}</span>
                </span>
                <span className="text-muted-foreground">
                  Value {money(p.contract_value, c)} · paid {money(p.paid, c)} · outstanding{" "}
                  {money(p.outstanding, c)}
                </span>
              </div>
              <Progress value={p.progress_percent} />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className={cn("rounded-md px-2 py-0.5", statusBadgeClass(p.stage))}>
                  {humanize(p.stage)}
                </span>
                <span>{p.progress_percent}% complete</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>


      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent invoices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentInvoices.length === 0 && (
              <p className="text-sm text-muted-foreground">No invoices yet.</p>
            )}
            {data.recentInvoices.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {i.invoice_number} · {i.title || "—"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {money(i.total_amount, c)} · paid {money(i.amount_paid, c)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent quotations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentQuotations.length === 0 && (
              <p className="text-sm text-muted-foreground">No quotations yet.</p>
            )}
            {data.recentQuotations.map((q) => (
              <div key={q.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  {q.reference} · {q.title || "—"}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {money(q.total_amount, c)} · {humanize(q.stage)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
