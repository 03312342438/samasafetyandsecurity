import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Boxes, PackageCheck, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listStockItems, listStockMovements } from "@/lib/inventory.functions";
import { listStockLots } from "@/lib/lots.functions";
import { CURRENCY } from "@/lib/workflow";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const fmt = (n: number) => Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

/** Store-only visual aids: stock value, low stock, categories and movement flow. */
export function InventoryDashboard() {
  const fetchStock = useServerFn(listStockItems);
  const fetchMovements = useServerFn(listStockMovements);
  const fetchLots = useServerFn(listStockLots);

  const { data: stock } = useQuery({ queryKey: ["stock-items"], queryFn: () => fetchStock() });
  const { data: movements } = useQuery({ queryKey: ["stock-movements"], queryFn: () => fetchMovements() });
  const { data: lots } = useQuery({ queryKey: ["stock-lots"], queryFn: () => fetchLots() });

  const items = (stock as any[]) ?? [];
  const moves = (movements as any[]) ?? [];
  const lotRows = (lots as any[]) ?? [];

  const stockValue = items.reduce(
    (s, i) => s + Number(i.quantity_on_hand ?? 0) * Number(i.unit_cost ?? 0),
    0,
  );
  const lowStock = items.filter((i) => Number(i.quantity_on_hand ?? 0) <= Number(i.reorder_level ?? 0));
  const pendingLots = lotRows.filter((l) => l.status === "pending");

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => {
      const key = i.category || "Uncategorised";
      map.set(key, (map.get(key) ?? 0) + Number(i.quantity_on_hand ?? 0) * Number(i.unit_cost ?? 0));
    });
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [items]);

  const flow = useMemo(() => {
    const months: { key: string; label: string; in: number; out: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleString(undefined, { month: "short" }),
        in: 0,
        out: 0,
      });
    }
    moves.forEach((m) => {
      const d = new Date(m.created_at);
      const row = months.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
      if (!row) return;
      const qty = Number(m.quantity ?? 0);
      if (m.movement_type === "issue") row.out += qty;
      else row.in += qty;
    });
    return months;
  }, [moves]);

  const topStock = useMemo(
    () =>
      [...items]
        .sort((a, b) => Number(b.quantity_on_hand ?? 0) - Number(a.quantity_on_hand ?? 0))
        .slice(0, 6)
        .map((i) => ({ name: i.item_code, value: Number(i.quantity_on_hand ?? 0) })),
    [items],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Boxes} label="Items in store" value={fmt(items.length)} />
        <Kpi icon={Wallet} label={`Stock value (${CURRENCY})`} value={fmt(stockValue)} />
        <Kpi icon={AlertTriangle} label="At / below reorder" value={fmt(lowStock.length)} tone="warn" />
        <Kpi icon={PackageCheck} label="Lots awaiting approval" value={fmt(pendingLots.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Stock value by category" description="Where the money sits in the store">
          {byCategory.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85} paddingAngle={2}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => `${CURRENCY} ${fmt(Number(v))}`} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Material in vs out" description="Receipts and returns against material issued, last 6 months">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip />
              <Legend />
              <Bar name="In" dataKey="in" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              <Bar name="Out" dataKey="out" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Highest quantities on hand" description="Top items by stock quantity">
          {topStock.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topStock} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" fontSize={11} />
                <YAxis type="category" dataKey="name" width={90} fontSize={11} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        <Panel title="Items needing a restock" description="At or below their reorder level">
          <div className="h-full overflow-y-auto pr-1">
            {lowStock.length === 0 ? (
              <Empty text="Every item is above its reorder level." />
            ) : (
              <ul className="space-y-2">
                {lowStock.map((i) => (
                  <li key={i.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{i.item_code}</span>{" "}
                      <span className="text-muted-foreground">{i.description}</span>
                    </span>
                    <span className="shrink-0 text-destructive">
                      {i.quantity_on_hand} {i.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: string; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className={`rounded-lg p-2 ${tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
          <Icon className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-xs text-muted-foreground">{label}</span>
          <span className="block text-lg font-semibold">{value}</span>
        </span>
      </CardContent>
    </Card>
  );
}

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

function Empty({ text = "Nothing recorded yet." }: { text?: string }) {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div>;
}
