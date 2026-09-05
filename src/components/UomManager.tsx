import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { listUoms, saveUom, deleteUom } from "@/lib/uom.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Project Manager's master unit list. Every quantity field in the app picks
 * from here — nothing else may be typed in.
 */
export function UomManager() {
  const qc = useQueryClient();
  const fetchUoms = useServerFn(listUoms);
  const persist = useServerFn(saveUom);
  const remove = useServerFn(deleteUom);

  const { data } = useQuery({ queryKey: ["uoms"], queryFn: () => fetchUoms() });
  const rows = (data as any[]) ?? [];

  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: ["uoms"] });

  const add = async () => {
    if (!code.trim()) return;
    try {
      await persist({ data: { code: code.trim(), name: name.trim(), active: true } });
      setCode("");
      setName("");
      toast.success("Unit added");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add the unit");
    }
  };

  const drop = async (id: string) => {
    try {
      await remove({ data: { id } });
      toast.success("Unit removed");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove the unit");
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-2 sm:grid-cols-12">
          <div className="sm:col-span-3">
            <Label className="text-xs">Code</Label>
            <Input className="mt-1" placeholder="e.g. pcs" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="sm:col-span-7">
            <Label className="text-xs">Description</Label>
            <Input className="mt-1" placeholder="e.g. Pieces" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button className="w-full" onClick={add}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
        </div>

        <div className="divide-y rounded-md border">
          {rows.map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{u.code}</span>
                {u.name ? <span className="text-muted-foreground"> — {u.name}</span> : null}
              </div>
              <Button variant="ghost" size="sm" onClick={() => drop(u.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No units yet — add the first one above.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
