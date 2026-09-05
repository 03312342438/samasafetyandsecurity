import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lock, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getJobItems, saveJobRemarks, decideJobRemarks } from "@/lib/lots.functions";
import { humanize, statusBadgeClass } from "@/lib/workflow";

type Row = {
  bom_item_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  remarks: string;
};

/**
 * Job number detail. The Store writes a remark against every item and sends it
 * to the Project Manager; once approved the remarks are locked.
 */
export function JobItemsDialog({
  jobId,
  open,
  onClose,
  canEdit,
  canApprove,
}: {
  jobId: string | null;
  open: boolean;
  onClose: () => void;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const qc = useQueryClient();
  const fetchItems = useServerFn(getJobItems);
  const save = useServerFn(saveJobRemarks);
  const decide = useServerFn(decideJobRemarks);

  const { data } = useQuery({
    queryKey: ["job-items", jobId],
    queryFn: () => fetchItems({ data: { job_number_id: jobId as string } }),
    enabled: !!jobId && open,
  });

  const [rows, setRows] = useState<Row[]>([]);
  const detail = data as any;
  const status: string = detail?.remarks?.[0]?.status ?? "draft";
  const locked = status === "approved" || status === "pending";

  useEffect(() => {
    if (!detail) return;
    const saved: any[] = detail.remarks ?? [];
    if (saved.length > 0) {
      setRows(
        saved.map((r) => ({
          bom_item_id: r.bom_item_id,
          description: r.description,
          unit: r.unit,
          quantity: Number(r.quantity ?? 0),
          remarks: r.remarks ?? "",
        })),
      );
    } else {
      setRows(
        (detail.bomItems ?? []).map((b: any) => ({
          bom_item_id: b.id,
          description: b.stock_items?.description || b.description,
          unit: b.unit,
          quantity: Number(b.quantity ?? 0),
          remarks: "",
        })),
      );
    }
  }, [detail]);

  const persist = async (submit: boolean) => {
    try {
      await save({ data: { job_number_id: jobId as string, submit, items: rows } });
      toast.success(submit ? "Remarks sent to the Project Manager" : "Remarks saved");
      qc.invalidateQueries({ queryKey: ["job-items", jobId] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the remarks");
    }
  };

  const act = async (decision: "approved" | "rejected") => {
    try {
      await decide({ data: { job_number_id: jobId as string, decision } });
      toast.success(`Remarks ${decision}`);
      qc.invalidateQueries({ queryKey: ["job-items", jobId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record the decision");
    }
  };

  const job = detail?.job;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Job number {job?.job_number ?? ""}</DialogTitle>
        </DialogHeader>

        {job && (
          <div className="grid gap-2 rounded-md border p-3 text-sm sm:grid-cols-2">
            <Info label="Project" value={[job.projects?.project_number, job.projects?.name].filter(Boolean).join(" — ")} />
            <Info label="Customer" value={job.customers?.name} />
            <Info label="Scope" value={humanize(job.scope_type)} />
            <Info label="Site" value={job.site_location} />
            <Info label="BOM / BOS" value={[job.boms?.reference, job.boms?.title].filter(Boolean).join(" — ")} />
            <Info label="Target date" value={job.target_date} />
            <div className="sm:col-span-2 flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(job.status)}`}>
                Job {humanize(job.status)}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(status)}`}>
                Remarks {status === "pending" ? "under approval" : humanize(status)}
              </span>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Item</th>
                <th className="whitespace-nowrap px-2 py-1.5 text-right">Qty</th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Unit</th>
                <th className="whitespace-nowrap px-2 py-1.5 text-left">Store remarks</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-t">
                  <td className="px-2 py-1.5">{r.description || "—"}</td>
                  <td className="px-2 py-1.5 text-right">{r.quantity}</td>
                  <td className="px-2 py-1.5">{r.unit}</td>
                  <td className="px-2 py-1.5">
                    {canEdit && !locked ? (
                      <Input
                        className="h-8"
                        value={r.remarks}
                        placeholder="Remark for this item"
                        onChange={(e) =>
                          setRows(rows.map((x, i) => (i === idx ? { ...x, remarks: e.target.value } : x)))
                        }
                      />
                    ) : (
                      <span className="text-muted-foreground">{r.remarks || "—"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                    This job number has no BOM / BOS items linked to it yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {locked && (
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {status === "approved"
              ? "Approved by the Project Manager — these remarks can no longer be changed and only Management can delete this job number."
              : "Waiting for the Project Manager's approval."}
          </p>
        )}

        <DialogFooter>
          {canEdit && !locked && rows.length > 0 && (
            <>
              <Button variant="outline" onClick={() => persist(false)}>
                <Save className="mr-1 h-4 w-4" /> Save draft
              </Button>
              <Button onClick={() => persist(true)}>
                <Send className="mr-1 h-4 w-4" /> Send for approval
              </Button>
            </>
          )}
          {canApprove && status === "pending" && (
            <>
              <Button variant="destructive" onClick={() => act("rejected")}>Reject</Button>
              <Button onClick={() => act("approved")}>Approve remarks</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <p>
      <span className="text-xs text-muted-foreground">{label}: </span>
      <span>{value || "—"}</span>
    </p>
  );
}
