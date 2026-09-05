import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutGrid, List, MapPin, PackageSearch, Truck } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { ItemImage } from "@/components/ItemImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listStockItems } from "@/lib/inventory.functions";
import { CURRENCY, statusBadgeClass } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/stock")({
  component: StockPage,
  head: () => ({
    meta: [
      { title: "Stock Lookup | SAMA Fire & Safety" },
      { name: "description", content: "Browse the SAMA store catalogue with pictures, supplier, store location, unit price and live available stock for every item." },
      { property: "og:title", content: "Stock Lookup | SAMA Fire & Safety" },
      { property: "og:description", content: "Browse the SAMA store catalogue with pictures, supplier, store location, unit price and live available stock for every item." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const money = (n: any) =>
  `${CURRENCY} ${Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;

function StockPage() {
  const { data: profile } = useProfile();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [active, setActive] = useState<any | null>(null);
  const fetchStock = useServerFn(listStockItems);
  const { data: stock } = useQuery({ queryKey: ["stock-items"], queryFn: () => fetchStock() });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = ((stock as any[]) ?? []);
    if (!q) return all;
    return all.filter((s) =>
      [s.item_code, s.description, s.category, s.store_location, s.supplier]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [stock, query]);

  return (
    <div className="min-h-screen bg-secondary/40">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold">Stock Lookup</h1>
          <p className="text-sm text-muted-foreground">
            Search the store catalogue and open any item for pictures, location, supplier and price.
          </p>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 sm:max-w-xl">
            <SearchInput value={query} onChange={setQuery} placeholder="Enter your text to search…" />
          </div>
          <div className="flex items-center gap-1">
            <Button variant={view === "list" ? "default" : "outline"} size="icon" aria-label="List view" onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === "grid" ? "default" : "outline"} size="icon" aria-label="Grid view" onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {view === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((s: any) => {
              const onHand = Number(s.quantity_on_hand ?? 0);
              const available = Math.round((onHand - Number(s.quantity_reserved ?? 0)) * 100) / 100;
              return (
                <Card
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setActive(s)}
                  onKeyDown={(e) => e.key === "Enter" && setActive(s)}
                  className="cursor-pointer transition hover:shadow-[var(--shadow-elegant)]"
                >
                  <CardContent className="space-y-2 p-4 text-center">
                    <ItemImage path={s.image_url} alt={s.description} className="mx-auto h-40 w-full max-w-[220px] object-contain" />
                    <p className="text-sm font-semibold text-primary uppercase">{s.item_code}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.category || "—"}</p>
                    <p className="text-base font-semibold">{money(s.unit_cost)}</p>
                    <p className="text-xs text-muted-foreground">Supplier: {s.supplier || "—"}</p>
                    <p className="text-xs text-muted-foreground">UOM: {s.unit}</p>
                    <p className="text-xs">
                      Available Stock: <span className={available > 0 ? "font-semibold" : "font-semibold text-destructive"}>{available}</span>
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((s: any) => {
              const onHand = Number(s.quantity_on_hand ?? 0);
              const reserved = Number(s.quantity_reserved ?? 0);
              const available = Math.round((onHand - reserved) * 100) / 100;
              const low = onHand <= Number(s.reorder_level ?? 0);
              return (
                <Card key={s.id} role="button" tabIndex={0} onClick={() => setActive(s)} className="cursor-pointer">
                  <CardContent className="flex flex-wrap items-center gap-4 p-4">
                    <ItemImage path={s.image_url} alt={s.description} className="h-16 w-16" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.item_code}</span>
                        <span className="text-sm text-muted-foreground">{s.description}</span>
                        {low && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass("shortage")}`}>Low stock</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[s.category, s.store_location, s.supplier].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      <Stat label="On hand" value={`${onHand} ${s.unit}`} />
                      <Stat label="Reserved" value={`${reserved}`} />
                      <Stat label="Available" value={`${available}`} strong />
                      <Stat label="Unit price" value={money(s.unit_cost)} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {rows.length === 0 && (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <PackageSearch className="mx-auto mb-2 h-8 w-8" />
            No item matches this search.
          </div>
        )}
      </main>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>{active.item_code}</DialogTitle>
                <DialogDescription>{active.description}</DialogDescription>
              </DialogHeader>
              <div className="grid gap-5 md:grid-cols-2">
                <ItemImage path={active.image_url} alt={active.description} className="h-64 w-full object-contain" />
                <div className="space-y-3 text-sm">
                  <Detail icon={MapPin} label="Store location" value={active.store_location || "—"} />
                  <Detail icon={Truck} label="Supplier" value={active.supplier || "—"} />
                  <div className="grid grid-cols-2 gap-3">
                    <Stat label="Unit price" value={money(active.unit_cost)} strong />
                    <Stat label="UOM" value={active.unit} />
                    <Stat label="On hand" value={`${Number(active.quantity_on_hand ?? 0)}`} />
                    <Stat label="Reserved" value={`${Number(active.quantity_reserved ?? 0)}`} />
                    <Stat
                      label="Available"
                      value={`${Math.round((Number(active.quantity_on_hand ?? 0) - Number(active.quantity_reserved ?? 0)) * 100) / 100}`}
                      strong
                    />
                    <Stat label="Reorder level" value={`${Number(active.reorder_level ?? 0)}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">Category: {active.category || "—"}</p>
                  {active.notes && <p className="text-xs text-muted-foreground">{active.notes}</p>}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <span>
        <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block font-medium">{value}</span>
      </span>
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={strong ? "text-base font-semibold text-primary" : "text-base font-medium"}>{value}</p>
    </div>
  );
}
