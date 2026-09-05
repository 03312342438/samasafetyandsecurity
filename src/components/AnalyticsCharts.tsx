import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getAnalytics } from "@/lib/analytics.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENCY } from "@/lib/workflow";

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const fmt = (n: number) =>
  Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const money = (n: number) => `${CURRENCY} ${fmt(n)}`;

function Panel({
  title, description, children,
}: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="h-72 pt-2">{children}</CardContent>
    </Card>
  );
}

function SlicePie({ data, valueFormatter }: { data: { name: string; value: number }[]; valueFormatter: (n: number) => string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data recorded for this month yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={45}
          outerRadius={85}
          paddingAngle={2}
          label={(e: any) => valueFormatter(e.value)}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v: any) => valueFormatter(Number(v))} />
        <Legend verticalAlign="bottom" height={36} iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function AnalyticsCharts() {
  const fetchAnalytics = useServerFn(getAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["analytics"],
    queryFn: () => fetchAnalytics(),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading charts…</p>;
  }
  if (error) {
    return (
      <p className="py-10 text-center text-sm text-destructive">
        {error instanceof Error ? error.message : "Could not load charts."}
      </p>
    );
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="This month by project count"
          description={`${data.month} — quotations sent, work in progress and completed`}
        >
          <SlicePie data={data.currentMonthCounts} valueFormatter={fmt} />
        </Panel>
        <Panel
          title="This month by value"
          description={`${data.month} — value quoted, in progress and completed (${CURRENCY})`}
        >
          <SlicePie data={data.currentMonthValues} valueFormatter={money} />
        </Panel>
      </div>

      <Panel
        title="Last 12 months — volume"
        description="Quotations submitted vs projects completed each month"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
            <Legend iconSize={10} />
            <Bar dataKey="quotations" name="Quotations submitted" fill={SLICE_COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="completed" name="Projects completed" fill={SLICE_COLORS[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel
        title={`Last 12 months — value (${CURRENCY})`}
        description="Quoted value, completed project value and gross margin per month"
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => fmt(Number(v))} />
            <Tooltip formatter={(v: any) => money(Number(v))} />
            <Legend iconSize={10} />
            <Bar dataKey="quotedValue" name="Quoted value" fill={SLICE_COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="completedValue" name="Completed value" fill={SLICE_COLORS[2]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="grossMargin" name="Gross margin" fill={SLICE_COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
