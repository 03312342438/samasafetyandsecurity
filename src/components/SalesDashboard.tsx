import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { getSalesAnalytics } from "@/lib/sales-analytics.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CURRENCY } from "@/lib/workflow";
import { TrendingUp } from "lucide-react";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)"];

const fmt = (n: number) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const money = (n: number) => `${CURRENCY} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Panel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
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

function Slice({ data, valueFormatter }: { data: { name: string; value: number }[]; valueFormatter: (n: number) => string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No activity in the last 30 days.</div>;
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}
          label={(e: any) => valueFormatter(e.value)}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v: any) => valueFormatter(Number(v))} />
        <Legend verticalAlign="bottom" height={36} iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SalesDashboard() {
  const [months, setMonths] = useState(6);
  const fetchAnalytics = useServerFn(getSalesAnalytics);
  const { data, isLoading, error } = useQuery({
    queryKey: ["sales-analytics", months],
    queryFn: () => fetchAnalytics({ data: { potentialMonths: months } }),
    staleTime: 60_000,
  });

  if (isLoading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading dashboard…</p>;
  if (error) {
    return <p className="py-10 text-center text-sm text-destructive">{error instanceof Error ? error.message : "Could not load dashboard."}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="h-4 w-4 text-primary" /> Performance
          </CardTitle>
          <CardDescription className="text-xs">
            Purchase orders received vs quotations submitted — {data.performance.month}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-3xl font-semibold text-primary">{data.performance.percent}%</p>
            <p className="text-xs text-muted-foreground">
              {data.performance.poCount} PO(s) out of {data.performance.quotedCount} quotation(s)
            </p>
          </div>
          <div>
            <p className="text-xl font-semibold">{money(data.performance.quotedValue)}</p>
            <p className="text-xs text-muted-foreground">Total quoted this month</p>
          </div>
          <div>
            <p className="text-xl font-semibold">{money(data.performance.poValue)}</p>
            <p className="text-xs text-muted-foreground">Total purchase orders received</p>
          </div>
        </CardContent>
      </Card>

      <Panel title="Performance — last 12 months" description="Quotations submitted, POs received and conversion %">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v: any, n: any) => (n === "Performance %" ? `${fmt(Number(v))}%` : fmt(Number(v)))} />
            <Legend iconSize={10} />
            <Bar dataKey="quotations" name="Quotations submitted" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pos" name="POs received" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="performance" name="Performance %" fill={COLORS[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Last 30 days — count" description="Quotations sent vs customer POs received">
          <Slice data={data.last30Counts} valueFormatter={fmt} />
        </Panel>
        <Panel title="Last 30 days — value" description={`Quotation value vs PO value (${CURRENCY})`}>
          <Slice data={data.last30Values} valueFormatter={money} />
        </Panel>
      </div>


      <Panel title="Last 12 months — count" description="Quotations sent vs POs received each month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip formatter={(v: any) => fmt(Number(v))} />
            <Legend iconSize={10} />
            <Bar dataKey="quotations" name="Quotations sent" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pos" name="POs received" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title={`Last 12 months — value (${CURRENCY})`} description="Value quoted vs value ordered each month">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthly} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={70} tickFormatter={(v) => fmt(Number(v))} />
            <Tooltip formatter={(v: any) => money(Number(v))} />
            <Legend iconSize={10} />
            <Bar dataKey="quotedValue" name="Quotation value" fill={COLORS[0]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="poValue" name="PO value" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-primary" /> Potential business
              </CardTitle>
              <CardDescription className="text-xs">
                Value of quotations sent with no customer PO received yet.
              </CardDescription>
            </div>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {[1, 2, 3, 6, 9, 12, 18, 24].map((m) => (
                <option key={m} value={m}>Last {m} month{m > 1 ? "s" : ""}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">{money(data.potential.value)}</p>
          <p className="text-xs text-muted-foreground">
            {data.potential.count} open quotation(s) in the last {data.potential.months} month(s)
          </p>
          {data.potential.items.length > 0 && (
            <ul className="mt-3 space-y-1 border-t pt-3 text-sm">
              {data.potential.items.map((i) => (
                <li key={i.id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-muted-foreground">
                    {i.reference}{i.title ? ` — ${i.title}` : ""} · sent {i.sent_on || "—"}
                  </span>
                  <span className="font-medium">{money(i.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
