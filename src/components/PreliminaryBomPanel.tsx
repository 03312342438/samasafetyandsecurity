import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { listProjects } from "@/lib/projects.functions";
import { listStockItems } from "@/lib/inventory.functions";
import { listBoms, saveBom, deleteBom } from "@/lib/engineering.functions";
import { CURRENCY, humanize, statusBadgeClass } from "@/lib/workflow";
import { cn } from "@/lib/utils";

type Line = {
  stock_item_id: string;
  description: string;
  unit: string;
  quantity: string;
  unit_cost: string;
};

const emptyLine: Line = { stock_item_id: "", description: "", unit: "", quantity: "1", unit_cost: "0" };

const num = (v: unknown) => Number(v ?? 0) || 0;
const money = (v: unknown) => `${CURRENCY} ${num(v).toFixed(3)}`;

/**
 * Sales-side preliminary BOM/BOS: a costed material list raised against a
 * project, built only from inventory items management has approved.
 */
export function PreliminaryBomPanel() {
  const qc = useQueryClient();
  const fetchProjects = useServerFn(listProjects);
  const fetchStock = useServerFn(listStockItems);
  const fetchBoms = useServerFn(listBoms);
  const save = useServerFn(saveBom);
  const remove = useServerFn(deleteBom);

  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: stock } = useQuery({ queryKey: ["stock-items"], queryFn: () => fetchStock() });
  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: () => fetchBoms() });

  const projectList = (projects as any[]) ?? [];
  const approvedStock = ((stock as any[]) ?? []).filter((s) => s.approval_status === "approved");
  const bomList = (boms as any[]) ?? [];

  const [open, setOpen] = useState(false);
  const [id, setId] = useState<string | undefined>(undefined);
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [lines, setLines] = useState<Line[]>([{ ...emptyLine }]);

  const total = useMemo(
    () => lines.reduce((s, l) => s + num(l.quantity) * num(l.unit_cost), 0),
    [lines],
  );

  const reset = () => {
    setId(undefined); setProjectId(""); setTitle(""); setLines([{ ...emptyLine }]);
  };

  const patch = (idx: number, next: Partial<Line>) =>
    setLines(lines.map((l, i) => (i === idx ? { ...l, ...next } : l)));

  const pickItem = (idx: number, stockItemId: string) => {
    const item = approvedStock.find((s) => s.id === stockItemId);
    patch(idx, {
      stock_item_id: stockItemId,
      description: item?.description ?? "",
      unit: item?.unit ?? "",
      unit_cost: item ? String(item.unit_cost ?? 0) : lines[idx].unit_cost,
    });
  };

  const stockOnHand = (stockItemId: string) => {
    const item = approvedStock.find((s) => s.id === stockItemId);
    if (!item) return null;
    return num(item.quantity_on_hand) - num(item.quantity_reserved);
  };

  const submit = async () => {
    const project = projectList.find((p) => p.id === projectId);
    try {
      await save({
        data: {
          id,
          project_id: projectId || null,
          customer_id: project?.customer_id ?? null,
          title: title || project?.name || "Preliminary BOM/BOS",
          bom_type: "material",
          currency: CURRENCY,
          items: lines
            .filter((l) => l.stock_item_id || l.description.trim())
            .map((l) => ({
              stock_item_id: l.stock_item_id || null,
              description: l.description,
              unit: l.unit || "pcs",
              quantity: num(l.quantity),
              unit_cost: num(l.unit_cost),
            })),
        } as any,
      });
      toast.success(id ? "Preliminary BOM updated" : "Preliminary BOM created");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["boms"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the BOM");
    }
  };

  const edit = (b: any) => {
    setId(b.id);
    setProjectId(b.project_id ?? "");
    setTitle(b.title ?? "");
    setLines(
      ((b.bom_items ?? []) as any[])
        .slice()
        .sort((a, z) => a.sequence - z.sequence)
        .map((it) => ({
          stock_item_id: it.stock_item_id ?? "",
          description: it.description ?? "",
          unit: it.unit ?? "",
          quantity: String(it.quantity ?? 1),
          unit_cost: String(it.unit_cost ?? 0),
        })),
    );
    setOpen(true);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => { reset(); setOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Preliminary BOM/BOS
        </Button>
      </div>

      {bomList.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          No preliminary BOM/BOS raised yet.
        </CardContent></Card>
      )}

      {bomList.map((b: any) => (
        <Card key={b.id}>
          <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{b.reference}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(b.status)}`}>
                  {humanize(b.status)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {[b.projects?.project_number, b.title].filter(Boolean).join(" · ") || "—"}
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">{money(b.estimated_cost)}</span>
                <span className="text-muted-foreground"> · {(b.bom_items ?? []).length} line(s)</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => edit(b)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await remove({ data: { id: b.id } });
                    qc.invalidateQueries({ queryKey: ["boms"] });
                    toast.success("Deleted");
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Could not delete");
                  }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{id ? "Edit preliminary BOM/BOS" : "New preliminary BOM/BOS"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Project number</Label>
              <select
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">— select project —</option>
                {projectList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.project_number} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs">Title</Label>
              <Input className="mt-1" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs">Material list</Label>
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ...emptyLine }])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, idx) => {
                const available = stockOnHand(l.stock_item_id);
                const short = available !== null && num(l.quantity) > available;
                return (
                  <div key={idx} className="grid grid-cols-12 items-center gap-2">
                    <select
                      className="col-span-3 h-9 rounded-md border bg-background px-2 text-sm"
                      value={l.stock_item_id}
                      onChange={(e) => pickItem(idx, e.target.value)}
                    >
                      <option value="">— item code —</option>
                      {approvedStock.map((s) => (
                        <option key={s.id} value={s.id}>{s.item_code}</option>
                      ))}
                    </select>
                    <Input className="col-span-3" readOnly placeholder="Description" value={l.description} />
                    <Input className="col-span-1" readOnly placeholder="UOM" value={l.unit} />
                    <Input
                      className={cn("col-span-1", short && "border-orange-500 bg-orange-50 text-orange-700")}
                      placeholder="Qty"
                      value={l.quantity}
                      onChange={(e) => patch(idx, { quantity: e.target.value })}
                      title={short ? `Only ${available} available in stock` : undefined}
                    />
                    <Input
                      className="col-span-2"
                      placeholder="Unit price"
                      value={l.unit_cost}
                      onChange={(e) => patch(idx, { unit_cost: e.target.value })}
                    />
                    <div className="col-span-1 text-right text-xs tabular-nums">
                      {(num(l.quantity) * num(l.unit_cost)).toFixed(3)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="col-span-1"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-right text-sm">
              Total material cost <span className="font-semibold">{money(total)}</span>
            </p>
            <p className="text-right text-xs text-muted-foreground">
              An orange quantity means it exceeds the free stock on hand.
            </p>
          </div>

          <DialogFooter>
            <Button onClick={submit} disabled={!projectId}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
