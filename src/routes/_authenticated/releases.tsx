import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PackageMinus, Plus, Trash2, Send, HardHat, Boxes } from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listStockItems } from "@/lib/inventory.functions";
import {
  listStockReleases, listReleasableJobs, getJobReleasableItems,
  createStockRelease, deleteStockRelease,
} from "@/lib/releases.functions";
import { hasDept, humanize, statusBadgeClass, CURRENCY } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/releases")({
  component: ReleasesPage,
  head: () => ({
    meta: [
      { title: "Release Items | SAMA Fire & Safety" },
      { name: "description", content: "Release store material against an approved job number, or without a job number with management approval." },
      { property: "og:title", content: "Release Items | SAMA Fire & Safety" },
      { property: "og:description", content: "Release store material against an approved job number, or without a job number with management approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type FreeRow = { stock_item_id: string; quantity: string; remarks: string };
const emptyFreeRow: FreeRow = { stock_item_id: "", quantity: "1", remarks: "" };

function ReleasesPage() {
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.isAdmin;
  const canRelease = isAdmin || hasDept(profile?.roles, "inventory");

  const qc = useQueryClient();
  const [tab, setTab] = useState("job");
  const [query, setQuery] = useState("");

  const fetchReleases = useServerFn(listStockReleases);
  const fetchJobs = useServerFn(listReleasableJobs);
  const fetchJobItems = useServerFn(getJobReleasableItems);
  const fetchStock = useServerFn(listStockItems);
  const create = useServerFn(createStockRelease);
  const remove = useServerFn(deleteStockRelease);

  const { data: releases } = useQuery({ queryKey: ["stock-releases"], queryFn: () => fetchReleases() });
  const { data: jobs } = useQuery({ queryKey: ["releasable-jobs"], queryFn: () => fetchJobs() });
  const { data: stock } = useQuery({ queryKey: ["stock-items"], queryFn: () => fetchStock() });

  // -------------------------------------------------- release by job number --
  const [jobId, setJobId] = useState("");
  const [jobQty, setJobQty] = useState<Record<string, string>>({});
  const [jobTo, setJobTo] = useState("");
  const [jobNotes, setJobNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: jobItems, error: jobItemsError } = useQuery({
    queryKey: ["job-releasable-items", jobId],
    queryFn: () => fetchJobItems({ data: { job_number_id: jobId } }),
    enabled: !!jobId,
    retry: false,
  });

  // ----------------------------------------------- release without job number --
  const [freeRows, setFreeRows] = useState<FreeRow[]>([{ ...emptyFreeRow }]);
  const [freeTo, setFreeTo] = useState("");
  const [freePurpose, setFreePurpose] = useState("");
  const [freeNotes, setFreeNotes] = useState("");

  const stockOptions = useMemo(
    () =>
      [["", "— select item —"] as [string, string]].concat(
        ((stock as any[]) ?? [])
          .filter((s) => (s.approval_status ?? "pending") === "approved")
          .map((s) => [
            s.id,
            `${s.item_code} — ${s.description} (${s.quantity_on_hand} ${s.unit} on hand)`,
          ] as [string, string]),
      ),
    [stock],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["stock-releases"] });
    qc.invalidateQueries({ queryKey: ["stock-items"] });
    qc.invalidateQueries({ queryKey: ["stock-movements"] });
    qc.invalidateQueries({ queryKey: ["job-releasable-items"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const releaseFromJob = async () => {
    const items = ((jobItems as any)?.items ?? [])
      .map((i: any) => ({
        stock_item_id: i.stock_item_id,
        bom_item_id: i.bom_item_id,
        quantity: Number(jobQty[i.bom_item_id] || 0),
        remarks: "",
      }))
      .filter((i: any) => i.stock_item_id && i.quantity > 0);
    if (items.length === 0) return toast.error("Enter a quantity against at least one item.");
    setSaving(true);
    try {
      const res: any = await create({
        data: {
          release_kind: "job",
          job_number_id: jobId,
          released_to: jobTo,
          purpose: "",
          notes: jobNotes,
          items,
        },
      });
      toast.success(`Release ${res?.reference ?? ""} done — stock deducted`);
      setJobQty({});
      setJobTo("");
      setJobNotes("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not release the items");
    } finally {
      setSaving(false);
    }
  };

  const releaseFree = async () => {
    const items = freeRows
      .filter((r) => r.stock_item_id && Number(r.quantity) > 0)
      .map((r) => ({
        stock_item_id: r.stock_item_id,
        bom_item_id: null,
        quantity: Number(r.quantity),
        remarks: r.remarks,
      }));
    if (items.length === 0) return toast.error("Add at least one item with a quantity.");
    setSaving(true);
    try {
      const res: any = await create({
        data: {
          release_kind: "free",
          job_number_id: null,
          released_to: freeTo,
          purpose: freePurpose,
          notes: freeNotes,
          items,
        },
      });
      toast.success(`Release ${res?.reference ?? ""} sent to Management for approval`);
      setFreeRows([{ ...emptyFreeRow }]);
      setFreeTo("");
      setFreePurpose("");
      setFreeNotes("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the release");
    } finally {
      setSaving(false);
    }
  };

  const q = query.trim().toLowerCase();
  const history = ((releases as any[]) ?? []).filter((r) =>
    !q
      ? true
      : [r.reference, r.job_numbers?.job_number, r.released_to, r.purpose, r.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Release Items</h1>
            <p className="text-sm text-muted-foreground">
              Release against an approved job number — stock is deducted straight away. Releasing
              without a job number needs Management approval before stock moves.
            </p>
          </div>
          <SearchInput value={query} onChange={setQuery} placeholder="Search releases…" />
        </div>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "job", label: "Release by job number" },
            { value: "free", label: "Release without job number" },
            { value: "history", label: `Released (${history.length})` },
          ]}
        />

        {!canRelease && (
          <p className="mt-4 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            Only the Store can release material. You can still review the history below.
          </p>
        )}

        {tab === "job" && (
          <Card className="mt-4">
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Approved job number</Label>
                  <select
                    className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={jobId}
                    onChange={(e) => { setJobId(e.target.value); setJobQty({}); }}
                  >
                    <option value="">— select job —</option>
                    {((jobs as any[]) ?? []).map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.job_number} {j.projects?.project_number ? `· ${j.projects.project_number}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="text-xs">Released to</Label>
                  <Input className="mt-1" value={jobTo} onChange={(e) => setJobTo(e.target.value)} placeholder="Technician / site engineer" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input className="mt-1" value={jobNotes} onChange={(e) => setJobNotes(e.target.value)} />
                </div>
              </div>

              {!jobId && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Pick an approved job number to see the items it contains.
                </p>
              )}
              {jobId && jobItemsError && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {jobItemsError instanceof Error ? jobItemsError.message : "Could not load the job items."}
                </p>
              )}

              {jobId && (jobItems as any)?.items && (
                <>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Item code</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Description</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">In job</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Already released</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">On hand</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Release now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {((jobItems as any).items as any[]).map((i) => (
                          <tr key={i.bom_item_id} className="border-t">
                            <td className="whitespace-nowrap px-2 py-1.5">{i.item_code || "—"}</td>
                            <td className="px-2 py-1.5">{i.description}</td>
                            <td className="px-2 py-1.5 text-right">{i.quantity_planned} {i.unit}</td>
                            <td className="px-2 py-1.5 text-right">{i.quantity_released}</td>
                            <td className="px-2 py-1.5 text-right">{i.quantity_on_hand}</td>
                            <td className="px-2 py-1.5 text-right">
                              {i.stock_item_id ? (
                                <Input
                                  className="ml-auto h-8 w-24 text-right"
                                  value={jobQty[i.bom_item_id] ?? ""}
                                  placeholder="0"
                                  onChange={(e) => setJobQty({ ...jobQty, [i.bom_item_id]: e.target.value })}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">no item code</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {((jobItems as any).items as any[]).length === 0 && (
                          <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">This job contains no items.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={releaseFromJob} disabled={!canRelease || saving}>
                      <PackageMinus className="mr-1 h-4 w-4" /> Release &amp; deduct stock
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {tab === "free" && (
          <Card className="mt-4">
            <CardContent className="space-y-4 p-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Released to</Label>
                  <Input className="mt-1" value={freeTo} onChange={(e) => setFreeTo(e.target.value)} placeholder="Person / department" />
                </div>
                <div>
                  <Label className="text-xs">Purpose</Label>
                  <Input className="mt-1" value={freePurpose} onChange={(e) => setFreePurpose(e.target.value)} placeholder="Reason for the release" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input className="mt-1" value={freeNotes} onChange={(e) => setFreeNotes(e.target.value)} />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label className="text-xs">Items to release</Label>
                  <Button variant="outline" size="sm" onClick={() => setFreeRows([...freeRows, { ...emptyFreeRow }])}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                  </Button>
                </div>
                <div className="space-y-2">
                  {freeRows.map((r, idx) => (
                    <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                      <select
                        className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-6"
                        value={r.stock_item_id}
                        onChange={(e) => setFreeRows(freeRows.map((x, i) => (i === idx ? { ...x, stock_item_id: e.target.value } : x)))}
                      >
                        {stockOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <Input className="sm:col-span-2" placeholder="Qty" value={r.quantity}
                        onChange={(e) => setFreeRows(freeRows.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} />
                      <Input className="sm:col-span-3" placeholder="Remarks" value={r.remarks}
                        onChange={(e) => setFreeRows(freeRows.map((x, i) => (i === idx ? { ...x, remarks: e.target.value } : x)))} />
                      <Button variant="ghost" size="sm" className="sm:col-span-1"
                        onClick={() => setFreeRows(freeRows.length > 1 ? freeRows.filter((_, i) => i !== idx) : freeRows)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Stock is only deducted once Management approves this release.
                </p>
                <Button onClick={releaseFree} disabled={!canRelease || saving}>
                  <Send className="mr-1 h-4 w-4" /> Send for approval
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {tab === "history" && (
          <div className="mt-4 space-y-3">
            {history.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {r.release_kind === "job" ? (
                          <HardHat className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <Boxes className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{r.reference}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(r.status)}`}>
                          {r.status === "pending" ? "Under approval" : humanize(r.status)}
                        </span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {r.release_kind === "job" ? r.job_numbers?.job_number ?? "Job" : "No job number"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[r.released_to && `to ${r.released_to}`, r.purpose, r.projects?.project_number]
                          .filter(Boolean).join(" · ") || "—"} · {(r.stock_release_items ?? []).length} line(s) ·{" "}
                        {CURRENCY} {Number(r.total_value ?? 0).toFixed(3)}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                    {(isAdmin || r.status !== "released") && (
                      <Button variant="outline" size="sm" onClick={async () => {
                        try { await remove({ data: { id: r.id } }); toast.success("Release removed"); refresh(); }
                        catch (e) { toast.error(e instanceof Error ? e.message : "Could not remove"); }
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Item</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Qty released</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Unit cost</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(r.stock_release_items ?? []).map((i: any) => (
                          <tr key={i.id} className="border-t">
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {i.stock_items?.item_code ?? "—"} — {i.description}
                            </td>
                            <td className="px-2 py-1.5 text-right">{i.quantity} {i.unit}</td>
                            <td className="px-2 py-1.5 text-right">{Number(i.unit_cost ?? 0).toFixed(3)}</td>
                            <td className="px-2 py-1.5">{i.remarks || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}
            {history.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">No releases yet.</p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
