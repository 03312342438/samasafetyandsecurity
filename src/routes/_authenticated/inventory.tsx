import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Boxes, Plus, Pencil, Trash2, PackageCheck, Truck, ArrowDownUp, ShieldAlert,
  Layers, Send, Upload,
} from "lucide-react";
import { useProfile } from "@/hooks/use-profile";
import { AppHeader } from "@/components/AppHeader";
import { SearchInput } from "@/components/SearchInput";
import { SegmentedTabs } from "@/components/SegmentedTabs";
import { ItemImage, uploadItemImage } from "@/components/ItemImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listProjects, listJobNumbers } from "@/lib/projects.functions";
import { listBoms } from "@/lib/engineering.functions";
import { submitApproval } from "@/lib/approvals.functions";
import {
  listStockItems, saveStockItem, deleteStockItem,
  listMaterialRequests, saveMaterialRequest, deleteMaterialRequest,
  allocateMaterialRequest, issueMaterialRequest,
  listStockMovements, recordStockMovement, setStockItemApproval, importStockItems,
} from "@/lib/inventory.functions";
import { listStockLots, saveStockLot, deleteStockLot, submitStockLot } from "@/lib/lots.functions";
import { listSuppliers } from "@/lib/finance.functions";
import { UomSelect } from "@/components/UomSelect";
import { can, hasDept, humanize, statusBadgeClass, STOCK_CATEGORIES, CURRENCY } from "@/lib/workflow";

export const Route = createFileRoute("/_authenticated/inventory")({
  component: InventoryPage,
  head: () => ({
    meta: [
      { title: "Store & Material Control | SAMA Fire & Safety" },
      { name: "description", content: "Track stock on hand, restock by lot with management approval, and issue material against job numbers." },
      { property: "og:title", content: "Store & Material Control | SAMA Fire & Safety" },
      { property: "og:description", content: "Track stock on hand, restock by lot with management approval, and issue material against job numbers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type LineRow = {
  stock_item_id: string; description: string; unit: string;
  quantity_requested: string; unit_cost: string; remarks: string;
};

type LotRow = {
  stock_item_id: string; supplier: string; reference: string; quantity: string;
  unit_cost: string; store_location: string; remarks: string;
};

const emptyLine: LineRow = { stock_item_id: "", description: "", unit: "", quantity_requested: "1", unit_cost: "0", remarks: "" };
const emptyLotLine: LotRow = { stock_item_id: "", supplier: "", reference: "", quantity: "1", unit_cost: "0", store_location: "", remarks: "" };

const emptyStock = {
  item_code: "", description: "", category: STOCK_CATEGORIES[0], unit: "pcs",
  status: "active", notes: "", image_url: "",
};

const emptyLot = { received_date: "", notes: "" };

const emptyRequest = {
  project_id: "", job_number_id: "", bom_id: "", title: "",
  required_date: "", site_location: "", notes: "",
};

const emptyMovement = {
  stock_item_id: "", movement_type: "receipt", quantity: "1", unit_cost: "0",
  project_id: "", job_number_id: "", reference: "", remarks: "",
};

function InventoryPage() {
  const { data: profile } = useProfile();
  const isAdmin = !!profile?.isAdmin;
  const isStore = hasDept(profile?.roles, "inventory");
  const isPm = hasDept(profile?.roles, "project_manager");
  /** Only the Project Manager may create or change an item code. */
  const canManageItems = can(profile?.roles, "stock.item.create");
  const canApproveItems = can(profile?.roles, "stock.item.approve");
  const canManageLots = isStore;

  const qc = useQueryClient();
  const [tab, setTab] = useState(isStore && !isPm ? "lots" : "stock");
  const [query, setQuery] = useState("");

  const fetchStock = useServerFn(listStockItems);
  const approveItem = useServerFn(setStockItemApproval);
  const fetchRequests = useServerFn(listMaterialRequests);
  const fetchMovements = useServerFn(listStockMovements);
  const fetchLots = useServerFn(listStockLots);
  const fetchProjects = useServerFn(listProjects);
  const fetchJobs = useServerFn(listJobNumbers);
  const fetchBoms = useServerFn(listBoms);
  const persistStock = useServerFn(saveStockItem);
  const removeStock = useServerFn(deleteStockItem);
  const persistLot = useServerFn(saveStockLot);
  const removeLot = useServerFn(deleteStockLot);
  const sendLot = useServerFn(submitStockLot);
  const persistRequest = useServerFn(saveMaterialRequest);
  const removeRequest = useServerFn(deleteMaterialRequest);
  const allocate = useServerFn(allocateMaterialRequest);
  const issue = useServerFn(issueMaterialRequest);
  const move = useServerFn(recordStockMovement);
  const requestApproval = useServerFn(submitApproval);

  const { data: stock } = useQuery({ queryKey: ["stock-items"], queryFn: () => fetchStock() });
  const { data: requests } = useQuery({ queryKey: ["material-requests"], queryFn: () => fetchRequests() });
  const { data: movements } = useQuery({ queryKey: ["stock-movements"], queryFn: () => fetchMovements() });
  const { data: lots } = useQuery({ queryKey: ["stock-lots"], queryFn: () => fetchLots() });
  const { data: projects } = useQuery({ queryKey: ["projects"], queryFn: () => fetchProjects() });
  const { data: jobs } = useQuery({ queryKey: ["job-numbers"], queryFn: () => fetchJobs() });
  const { data: boms } = useQuery({ queryKey: ["boms"], queryFn: () => fetchBoms() });

  const [stockOpen, setStockOpen] = useState(false);
  const [stockForm, setStockForm] = useState<any>(emptyStock);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const runImport = useServerFn(importStockItems);

  const importExcel = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) throw new Error("The file has no sheet.");
      const header: Record<string, number> = {};
      (ws.getRow(1).values as any[]).forEach((v, i) => {
        const key = String(v ?? "").trim().toLowerCase();
        if (key) header[key] = i;
      });
      const cell = (row: any, name: string) => {
        const idx = header[name];
        if (!idx) return "";
        const v = row.getCell(idx).value as any;
        if (v == null) return "";
        if (typeof v === "object") return String(v.text ?? v.result ?? v.hyperlink ?? "");
        return String(v);
      };

      // Pictures pasted directly into the sheet (floating over a row).
      const embeddedByRow = new Map<number, string>();
      for (const img of (ws as any).getImages?.() ?? []) {
        const row1 = Math.floor(img?.range?.tl?.row ?? -1) + 1; // tl is 0-based
        if (row1 > 1 && img.imageId != null) embeddedByRow.set(row1, String(img.imageId));
      }
      const embeddedFile = (imageId: string): File | null => {
        try {
          const media: any = (wb as any).getImage?.(imageId);
          if (!media) return null;
          const ext = String(media.extension ?? "png").toLowerCase();
          const raw = media.buffer ?? media.base64;
          if (raw == null) return null;
          let bytes: Uint8Array;
          if (typeof raw === "string") {
            const b64 = raw.includes("base64,") ? raw.split("base64,")[1] : raw;
            const bin = atob(b64);
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          } else if (raw instanceof Uint8Array) {
            bytes = raw;
          } else {
            bytes = new Uint8Array(raw as ArrayBuffer);
          }
          if (!bytes.length) return null;
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`;
          return new File([new Uint8Array(bytes)], `import-${crypto.randomUUID()}.${ext}`, { type: mime });
        } catch {
          return null;
        }
      };

      const rows: any[] = [];
      const pendingImages: { index: number; file: File }[] = [];
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const description = cell(row, "description").trim();
        if (!description) return;
        let image_url = cell(row, "picture").trim();
        const index = rows.length;
        if (!image_url) {
          const imageId = embeddedByRow.get(n);
          if (imageId) {
            const file = embeddedFile(imageId);
            if (file) pendingImages.push({ index, file });
          }
        }
        rows.push({
          item_code: cell(row, "item code").trim(),
          description,
          category: cell(row, "catagory").trim() || cell(row, "category").trim(),
          unit: cell(row, "unit").trim() || "pcs",
          status: cell(row, "status").trim() || "active",
          image_url,
          notes: cell(row, "note").trim() || cell(row, "notes").trim(),
        });
      });
      if (rows.length === 0) throw new Error("No item rows found — check the column headings.");

      // Upload embedded pictures to the item bucket and use their storage paths.
      for (const p of pendingImages) {
        try {
          rows[p.index].image_url = await uploadItemImage(p.file);
        } catch {
          /* keep the row without a picture */
        }
      }
      const res: any = await runImport({ data: { rows } });
      toast.success(`${res.created} item(s) imported — waiting for Management approval.` + (res.skipped ? ` ${res.skipped} skipped (code already exists).` : ""));
      qc.invalidateQueries({ queryKey: ["stock-items"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not read that file.");
    } finally {
      setImporting(false);
    }
  };
  const [lotOpen, setLotOpen] = useState(false);
  const [lotForm, setLotForm] = useState<any>(emptyLot);
  const [lotLines, setLotLines] = useState<LotRow[]>([{ ...emptyLotLine }]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState<any>(emptyRequest);
  const [lines, setLines] = useState<LineRow[]>([{ ...emptyLine }]);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveForm, setMoveForm] = useState<any>(emptyMovement);
  const [approvalPrompt, setApprovalPrompt] = useState<
    { id: string; item_code?: string; description?: string } | null
  >(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["stock-items"] });
    qc.invalidateQueries({ queryKey: ["stock-lots"] });
    qc.invalidateQueries({ queryKey: ["material-requests"] });
    qc.invalidateQueries({ queryKey: ["stock-movements"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const decideItem = async (id: string, approval_status: "approved" | "rejected") => {
    try {
      await approveItem({ data: { id, approval_status } });
      toast.success(`Item ${approval_status}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the item");
    }
  };

  const stockOptions = useMemo(
    () =>
      [["", "— free text —"] as [string, string]].concat(
        ((stock as any[]) ?? []).map((s) => [s.id, `${s.item_code} — ${s.description}`] as [string, string]),
      ),
    [stock],
  );

  const fetchSuppliers = useServerFn(listSuppliers);
  const { data: suppliers } = useQuery({ queryKey: ["suppliers"], queryFn: () => fetchSuppliers() });
  const approvedSuppliers = useMemo(
    () => ((suppliers as any[]) ?? []).filter((s) => (s.approval_status ?? "approved") === "approved"),
    [suppliers],
  );

  const lotItemOptions = useMemo(
    () =>
      [["", "— select item —"] as [string, string]].concat(
        ((stock as any[]) ?? [])
          .filter((s) => (s.approval_status ?? "pending") === "approved")
          .map((s) => [s.id, `${s.item_code} — ${s.description}`] as [string, string]),
      ),
    [stock],
  );

  const filter = (rows: any[], keys: (r: any) => (string | undefined)[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => keys(r).filter(Boolean).join(" ").toLowerCase().includes(q));
  };

  const stockList = filter((stock as any[]) ?? [], (s) => [s.item_code, s.description, s.category, s.store_location]);
  const lotList = filter((lots as any[]) ?? [], (l) => [l.lot_number, l.supplier, l.reference, l.status]);
  const requestList = filter((requests as any[]) ?? [], (r) => [r.reference, r.title, r.projects?.project_number, r.job_numbers?.job_number]);
  const movementList = filter((movements as any[]) ?? [], (m) => [m.reference, m.description, m.movement_type]);

  const lowStock = ((stock as any[]) ?? []).filter(
    (s) => Number(s.quantity_on_hand ?? 0) <= Number(s.reorder_level ?? 0),
  );

  const pickImage = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadItemImage(file);
      setStockForm((f: any) => ({ ...f, image_url: path }));
      toast.success("Picture attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not upload the picture");
    } finally {
      setUploading(false);
    }
  };

  const submitStock = async () => {
    try {
      const res: any = await persistStock({
        data: {
          item_code: stockForm.item_code ?? "",
          description: stockForm.description,
          category: stockForm.category,
          unit: stockForm.unit,
          status: stockForm.status,
          notes: stockForm.notes ?? "",
          image_url: stockForm.image_url ?? "",
          id: stockForm.id || undefined,
        },
      });
      const isNew = !stockForm.id;
      toast.success(stockForm.id ? "Item updated" : "Item added to store");
      setStockOpen(false);
      const created = {
        id: res?.id as string,
        item_code: res?.item_code ?? stockForm.item_code,
        description: stockForm.description,
      };
      setStockForm(emptyStock);
      refresh();
      // A new code is not live until Management clears it — ask before sending.
      if (isNew && !canApproveItems && created.id) setApprovalPrompt(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save item");
    }
  };

  /** Send a pending item code to a Project Manager for approval. */
  const sendItemForApproval = async (item: { id: string; item_code?: string; description?: string }) => {
    try {
      await requestApproval({
        data: {
          approval_type: "item_code",
          title: `Item code approval — ${item.item_code ?? ""}`.trim(),
          details: item.description ?? "",
          entity_table: "stock_items",
          entity_id: item.id,
        },
      });
      toast.success("Sent to Project Manager for approval");
      setApprovalPrompt(null);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request approval");
    }
  };

  // ----------------------------------------------------------------- lots ---
  const submitLot = async () => {
    try {
      const res: any = await persistLot({
        data: {
          id: lotForm.id || undefined,
          received_date: lotForm.received_date || null,
          notes: lotForm.notes,
          items: lotLines
            .filter((l) => l.stock_item_id)
            .map((l) => ({
              stock_item_id: l.stock_item_id,
              supplier: l.supplier,
              reference: l.reference,
              quantity: Number(l.quantity || 0),
              unit_cost: Number(l.unit_cost || 0),
              store_location: l.store_location,
              remarks: l.remarks,
            })),
        },
      });
      toast.success(lotForm.id ? "Lot updated" : `Lot ${res?.lot_number ?? ""} created`);
      setLotOpen(false);
      setLotForm(emptyLot);
      setLotLines([{ ...emptyLotLine }]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the lot");
    }
  };

  const editLot = (l: any) => {
    setLotForm({ ...emptyLot, ...l, received_date: l.received_date ?? "" });
    const rows = [...(l.stock_lot_items ?? [])].sort((a: any, c: any) => a.sequence - c.sequence);
    setLotLines(
      rows.length
        ? rows.map((r: any) => ({
            stock_item_id: r.stock_item_id ?? "",
            supplier: r.supplier ?? "",
            reference: r.reference ?? "",
            quantity: String(r.quantity ?? 0),
            unit_cost: String(r.unit_cost ?? 0),
            store_location: r.store_location ?? "",
            remarks: r.remarks ?? "",
          }))
        : [{ ...emptyLotLine }],
    );
    setLotOpen(true);
  };

  const submitRequest = async () => {
    try {
      const res: any = await persistRequest({
        data: {
          ...requestForm,
          id: requestForm.id || undefined,
          project_id: requestForm.project_id || null,
          job_number_id: requestForm.job_number_id || null,
          bom_id: requestForm.bom_id || null,
          required_date: requestForm.required_date || null,
          items: lines
            .filter((l) => l.description.trim() || l.stock_item_id)
            .map((l) => {
              const picked = ((stock as any[]) ?? []).find((s) => s.id === l.stock_item_id);
              return {
                stock_item_id: l.stock_item_id || null,
                description: l.description || picked?.description || "",
                unit: l.unit || picked?.unit || "pcs",
                quantity_requested: Number(l.quantity_requested || 0),
                unit_cost: Number(l.unit_cost || picked?.unit_cost || 0),
                remarks: l.remarks,
              };
            }),
        },
      });
      toast.success(requestForm.id ? "Request updated" : `Request ${res?.reference ?? ""} created`);
      setRequestOpen(false);
      setRequestForm(emptyRequest);
      setLines([{ ...emptyLine }]);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save request");
    }
  };

  const editRequest = (r: any) => {
    setRequestForm({
      ...emptyRequest, ...r,
      project_id: r.project_id ?? "", job_number_id: r.job_number_id ?? "", bom_id: r.bom_id ?? "",
      required_date: r.required_date ?? "",
    });
    const rows = [...(r.material_request_items ?? [])].sort((a: any, c: any) => a.sequence - c.sequence);
    setLines(
      rows.length
        ? rows.map((l: any) => ({
            stock_item_id: l.stock_item_id ?? "", description: l.description ?? "", unit: l.unit ?? "pcs",
            quantity_requested: String(l.quantity_requested ?? 0), unit_cost: String(l.unit_cost ?? 0),
            remarks: l.remarks ?? "",
          }))
        : [{ ...emptyLine }],
    );
    setRequestOpen(true);
  };

  const submitMovement = async () => {
    try {
      await move({
        data: {
          ...moveForm,
          quantity: Number(moveForm.quantity || 0),
          unit_cost: Number(moveForm.unit_cost || 0),
          project_id: moveForm.project_id || null,
          job_number_id: moveForm.job_number_id || null,
        },
      });
      toast.success("Stock movement recorded");
      setMoveOpen(false);
      setMoveForm(emptyMovement);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record movement");
    }
  };

  const requestExtra = async (r: any) => {
    try {
      const amount = (r.material_request_items ?? []).reduce(
        (s: number, l: any) => s + Number(l.quantity_requested ?? 0) * Number(l.unit_cost ?? 0),
        0,
      );
      await requestApproval({
        data: {
          approval_type: "additional_material",
          title: `A5 — Additional material ${r.reference}`,
          details: `${r.title} · shortage / extra material requested`,
          project_id: r.project_id ?? null,
          job_number_id: r.job_number_id ?? null,
          entity_table: "material_requests",
          entity_id: r.id,
          amount,
        },
      });
      toast.success("Sent for A5 approval");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not request approval");
    }
  };

  const lotTotal = lotLines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unit_cost || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader isAdmin={profile?.isAdmin} name={profile?.profile?.full_name} roles={profile?.roles} />
      <main className="mx-auto max-w-[1400px] px-4 py-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Store & Material Control</h1>
            <p className="text-sm text-muted-foreground">
              Item codes are opened by the Project Manager, stock is restocked by lot with management
              approval, and every issue to site stays on record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search…" />

            {tab === "stock" && canManageItems && (
              <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent">
                <Upload className="h-4 w-4" />
                {importing ? "Importing…" : "Upload Excel"}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  disabled={importing}
                  onChange={(e) => { importExcel(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
            )}

            {tab === "stock" && canManageItems && (
              <Dialog open={stockOpen} onOpenChange={(o) => { setStockOpen(o); if (!o) setStockForm(emptyStock); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New item</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{stockForm.id ? "Edit stock item" : "New stock item"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Item code (auto if blank)" value={stockForm.item_code} onChange={(v) => setStockForm({ ...stockForm, item_code: v })} />
                    <Field label="Description" value={stockForm.description} onChange={(v) => setStockForm({ ...stockForm, description: v })} />
                    <Select label="Category" value={stockForm.category} onChange={(v) => setStockForm({ ...stockForm, category: v })}
                      options={STOCK_CATEGORIES.map((c) => [c, c] as [string, string])} />
                    <UomSelect label="Unit" value={stockForm.unit} onChange={(v) => setStockForm({ ...stockForm, unit: v })} />
                    <Select label="Status" value={stockForm.status} onChange={(v) => setStockForm({ ...stockForm, status: v })}
                      options={[["active", "Active"], ["inactive", "Inactive"]]} />
                    <div>
                      <Label className="text-xs">Picture</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <ItemImage path={stockForm.image_url} alt={stockForm.description || "Item"} className="h-12 w-12" />
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-accent">
                          <Upload className="h-3.5 w-3.5" />
                          {uploading ? "Uploading…" : "Upload"}
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => pickImage(e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="sm:col-span-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                      Quantity, unit price, store location and supplier are captured by the Store when a
                      restock lot is approved — they are not entered here.
                    </div>
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={stockForm.notes} onChange={(e) => setStockForm({ ...stockForm, notes: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitStock} disabled={!stockForm.description.trim() || uploading}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {tab === "lots" && canManageLots && (
              <Dialog open={lotOpen} onOpenChange={(o) => { setLotOpen(o); if (!o) { setLotForm(emptyLot); setLotLines([{ ...emptyLotLine }]); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New lot</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{lotForm.id ? `Edit lot ${lotForm.lot_number ?? ""}` : "New restock lot"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Received date" type="date" value={lotForm.received_date} onChange={(v) => setLotForm({ ...lotForm, received_date: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={lotForm.notes} onChange={(e) => setLotForm({ ...lotForm, notes: e.target.value })} />
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs">Items restocked in this lot</Label>
                      <Button variant="outline" size="sm" onClick={() => setLotLines([...lotLines, { ...emptyLotLine }])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {lotLines.map((l, idx) => (
                        <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                          <select
                            className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-3"
                            value={l.stock_item_id}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, stock_item_id: e.target.value } : r)))}
                          >
                            {lotItemOptions.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                          </select>
                          <select
                            className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-2"
                            value={l.supplier}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, supplier: e.target.value } : r)))}
                          >
                            <option value="">— supplier —</option>
                            {approvedSuppliers.map((s: any) => (
                              <option key={s.id} value={s.name}>{s.name}</option>
                            ))}
                          </select>
                          <Input className="sm:col-span-2" placeholder="DN / invoice" value={l.reference}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, reference: e.target.value } : r)))} />
                          <Input className="sm:col-span-1" placeholder="Qty" value={l.quantity}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))} />
                          <Input className="sm:col-span-1" placeholder="Price" value={l.unit_cost}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r)))} />
                          <Input className="sm:col-span-2" placeholder="Store location" value={l.store_location}
                            onChange={(e) => setLotLines(lotLines.map((r, i) => (i === idx ? { ...r, store_location: e.target.value } : r)))} />
                          <Button variant="ghost" size="sm" className="sm:col-span-1"
                            onClick={() => setLotLines(lotLines.length > 1 ? lotLines.filter((_, i) => i !== idx) : lotLines)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2 text-right text-sm">
                      Lot value: <span className="font-semibold">{CURRENCY} {lotTotal.toFixed(3)}</span>
                    </p>
                  </div>

                  <DialogFooter>
                    <Button onClick={submitLot} disabled={!lotLines.some((l) => l.stock_item_id)}>Save lot</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {tab === "requests" && (
              <Dialog open={requestOpen} onOpenChange={(o) => { setRequestOpen(o); if (!o) { setRequestForm(emptyRequest); setLines([{ ...emptyLine }]); } }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New request</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
                  <DialogHeader><DialogTitle>{requestForm.id ? "Edit material request" : "New material request"}</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Title" value={requestForm.title} onChange={(v) => setRequestForm({ ...requestForm, title: v })} />
                    <Field label="Required date" type="date" value={requestForm.required_date} onChange={(v) => setRequestForm({ ...requestForm, required_date: v })} />
                    <Select label="Project" value={requestForm.project_id} onChange={(v) => setRequestForm({ ...requestForm, project_id: v })}
                      options={[["", "— none —"], ...((projects as any[]) ?? []).map((p) => [p.id, `${p.project_number} — ${p.name}`] as [string, string])]} />
                    <Select label="Job number" value={requestForm.job_number_id} onChange={(v) => setRequestForm({ ...requestForm, job_number_id: v })}
                      options={[["", "— none —"], ...((jobs as any[]) ?? []).map((j) => [j.id, j.job_number] as [string, string])]} />
                    <Select label="Source BOM / BOS" value={requestForm.bom_id} onChange={(v) => setRequestForm({ ...requestForm, bom_id: v })}
                      options={[["", "— none —"], ...((boms as any[]) ?? []).map((b) => [b.id, `${b.reference} — ${b.title}`] as [string, string])]} />
                    <Field label="Site location" value={requestForm.site_location} onChange={(v) => setRequestForm({ ...requestForm, site_location: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Textarea rows={2} value={requestForm.notes} onChange={(e) => setRequestForm({ ...requestForm, notes: e.target.value })} />
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-xs">Requested material</Label>
                      <Button variant="outline" size="sm" onClick={() => setLines([...lines, { ...emptyLine }])}>
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add line
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {lines.map((l, idx) => (
                        <div key={idx} className="grid gap-2 rounded-md border p-2 sm:grid-cols-12">
                          <select
                            className="h-9 rounded-md border bg-background px-2 text-sm sm:col-span-4"
                            value={l.stock_item_id}
                            onChange={(e) => {
                              const picked = ((stock as any[]) ?? []).find((s) => s.id === e.target.value);
                              setLines(lines.map((r, i) => (i === idx
                                ? { ...r, stock_item_id: e.target.value, description: picked?.description ?? r.description, unit: picked?.unit ?? r.unit, unit_cost: String(picked?.unit_cost ?? r.unit_cost) }
                                : r)));
                            }}
                          >
                            {stockOptions.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}
                          </select>
                          <Input className="sm:col-span-3" placeholder="Description" value={l.description}
                            onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r)))} />
                          <div className="sm:col-span-1">
                            <UomSelect value={l.unit}
                              onChange={(v) => setLines(lines.map((r, i) => (i === idx ? { ...r, unit: v } : r)))} />
                          </div>
                          <Input className="sm:col-span-2" placeholder="Qty" value={l.quantity_requested}
                            onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, quantity_requested: e.target.value } : r)))} />
                          <Input className="sm:col-span-1" placeholder="Cost" value={l.unit_cost}
                            onChange={(e) => setLines(lines.map((r, i) => (i === idx ? { ...r, unit_cost: e.target.value } : r)))} />
                          <Button variant="ghost" size="sm" className="sm:col-span-1"
                            onClick={() => setLines(lines.length > 1 ? lines.filter((_, i) => i !== idx) : lines)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <DialogFooter>
                    <Button onClick={submitRequest} disabled={!requestForm.title.trim()}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {tab === "movements" && isAdmin && (
              <Dialog open={moveOpen} onOpenChange={(o) => { setMoveOpen(o); if (!o) setMoveForm(emptyMovement); }}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Record movement</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Record stock movement</DialogTitle></DialogHeader>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select label="Stock item" value={moveForm.stock_item_id} onChange={(v) => setMoveForm({ ...moveForm, stock_item_id: v })}
                      options={((stock as any[]) ?? []).map((s) => [s.id, `${s.item_code} — ${s.description}`] as [string, string])} />
                    <Select label="Type" value={moveForm.movement_type} onChange={(v) => setMoveForm({ ...moveForm, movement_type: v })}
                      options={[["receipt", "Receipt (in)"], ["return", "Site return (in)"], ["adjustment", "Adjustment (in)"], ["issue", "Manual issue (out)"]]} />
                    <Field label="Quantity" value={moveForm.quantity} onChange={(v) => setMoveForm({ ...moveForm, quantity: v })} />
                    <Field label="Unit cost" value={moveForm.unit_cost} onChange={(v) => setMoveForm({ ...moveForm, unit_cost: v })} />
                    <Select label="Project" value={moveForm.project_id} onChange={(v) => setMoveForm({ ...moveForm, project_id: v })}
                      options={[["", "— none —"], ...((projects as any[]) ?? []).map((p) => [p.id, p.project_number] as [string, string])]} />
                    <Select label="Job number" value={moveForm.job_number_id} onChange={(v) => setMoveForm({ ...moveForm, job_number_id: v })}
                      options={[["", "— none —"], ...((jobs as any[]) ?? []).map((j) => [j.id, j.job_number] as [string, string])]} />
                    <Field label="Reference (DN / invoice)" value={moveForm.reference} onChange={(v) => setMoveForm({ ...moveForm, reference: v })} />
                    <div className="sm:col-span-2">
                      <Label className="text-xs">Remarks</Label>
                      <Textarea rows={2} value={moveForm.remarks} onChange={(e) => setMoveForm({ ...moveForm, remarks: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={submitMovement} disabled={!moveForm.stock_item_id}>Record</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {lowStock.length > 0 && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
            <span>
              <span className="font-medium text-destructive">{lowStock.length}</span> item(s) at or below reorder level:{" "}
              {lowStock.slice(0, 4).map((s: any) => s.item_code).join(", ")}
              {lowStock.length > 4 ? "…" : ""}
            </span>
          </div>
        )}

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "stock", label: "Stock" },
            ...(canManageLots ? [{ value: "lots", label: `Restock lots (${lotList.length})` }] : []),
            { value: "requests", label: "Material requests" },
            { value: "movements", label: "Movements" },
          ]}
        />

        <div className="mt-4 space-y-3">
          {tab === "stock" &&
            stockList.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="flex min-w-0 gap-3">
                    <ItemImage path={s.image_url} alt={s.description} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Boxes className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{s.item_code}</span>
                        <span className="text-sm text-muted-foreground">{s.description}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(s.status)}`}>{humanize(s.status)}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(s.approval_status ?? "pending")}`}>
                          {humanize(s.approval_status ?? "pending")}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">
                        On hand <span className="font-medium">{s.quantity_on_hand} {s.unit}</span> · reserved {s.quantity_reserved} · reorder at {s.reorder_level}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {[s.category, s.store_location, s.supplier].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {canApproveItems && (s.approval_status ?? "pending") !== "approved" && (
                      <Button size="sm" onClick={() => decideItem(s.id, "approved")}>Approve</Button>
                    )}
                    {canApproveItems && (s.approval_status ?? "pending") === "pending" && (
                      <Button variant="outline" size="sm" onClick={() => decideItem(s.id, "rejected")}>Reject</Button>
                    )}
                    {canManageItems && !canApproveItems && (s.approval_status ?? "pending") !== "approved" && (
                      <Button variant="outline" size="sm" onClick={() => sendItemForApproval(s)}>
                        Send for approval
                      </Button>
                    )}
                    {isAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => { setStockForm({ ...emptyStock, ...s }); setStockOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={async () => {
                          try { await removeStock({ data: { id: s.id } }); toast.success("Item deleted"); refresh(); }
                          catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "lots" &&
            lotList.map((l: any) => (
              <Card key={l.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Layers className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{l.lot_number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(l.status)}`}>
                          {l.status === "pending" ? "Under approval" : humanize(l.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {[l.supplier, l.reference, l.received_date].filter(Boolean).join(" · ") || "—"} ·{" "}
                        {(l.stock_lot_items ?? []).length} item(s) · {CURRENCY} {Number(l.total_value ?? 0).toFixed(3)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {l.status === "draft" && canManageLots && (
                        <>
                          <Button size="sm" onClick={async () => {
                            try { await sendLot({ data: { id: l.id } }); toast.success("Lot sent to Management"); refresh(); }
                            catch (e) { toast.error(e instanceof Error ? e.message : "Could not submit the lot"); }
                          }}>
                            <Send className="mr-1 h-4 w-4" /> Send for approval
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => editLot(l)}><Pencil className="h-4 w-4" /></Button>
                        </>
                      )}
                      {(l.status === "draft" || isAdmin) && (
                        <Button variant="outline" size="sm" onClick={async () => {
                          try { await removeLot({ data: { id: l.id } }); toast.success("Lot deleted"); refresh(); }
                          catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs">
                        <tr>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Item</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Supplier</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Restock qty</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-right">Unit price</th>
                          <th className="whitespace-nowrap px-2 py-1.5 text-left">Store location</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(l.stock_lot_items ?? []).map((i: any) => (
                          <tr key={i.id} className="border-t">
                            <td className="whitespace-nowrap px-2 py-1.5">
                              {i.stock_items?.item_code ?? "—"} — {i.description}
                            </td>
                            <td className="px-2 py-1.5">{i.supplier || "—"}</td>
                            <td className="px-2 py-1.5 text-right">{i.quantity} {i.unit}</td>
                            <td className="px-2 py-1.5 text-right">{Number(i.unit_cost ?? 0).toFixed(3)}</td>
                            <td className="px-2 py-1.5">{i.store_location || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "requests" &&
            requestList.map((r: any) => (
              <Card key={r.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PackageCheck className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{r.reference}</span>
                      <span className="text-sm text-muted-foreground">{r.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(r.status)}`}>{humanize(r.status)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(r.stage)}`}>{humanize(r.stage)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[r.projects?.project_number, r.job_numbers?.job_number, r.boms?.reference].filter(Boolean).join(" · ") || "—"}
                      {r.required_date ? ` · required ${r.required_date}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(r.material_request_items ?? []).length} line(s) · issued to {r.received_by || "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => allocate({ data: { id: r.id } }).then((res: any) => {
                      toast[res?.shortages?.length ? "warning" : "success"](res?.shortages?.length ? `Shortage: ${res.shortages.join(" · ")}` : "Stock allocated");
                      refresh();
                    }).catch((e) => toast.error(e instanceof Error ? e.message : "Could not allocate"))}>
                      <ArrowDownUp className="mr-1 h-4 w-4" /> Allocate
                    </Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      const who = window.prompt("Received by (site engineer / technician)") ?? "";
                      try { await issue({ data: { id: r.id, received_by: who } }); toast.success("Material issued to site"); refresh(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Could not issue"); }
                    }}>
                      <Truck className="mr-1 h-4 w-4" /> Issue
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => requestExtra(r)}>A5</Button>
                    <Button variant="outline" size="sm" onClick={() => editRequest(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={async () => {
                      try { await removeRequest({ data: { id: r.id } }); toast.success("Request deleted"); refresh(); }
                      catch (e) { toast.error(e instanceof Error ? e.message : "Could not delete"); }
                    }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

          {tab === "movements" &&
            movementList.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{m.stock_items?.item_code ?? m.description}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(m.movement_type)}`}>{humanize(m.movement_type)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {m.quantity} {m.unit} · {m.reference || "—"} · {[m.projects?.project_number, m.job_numbers?.job_number].filter(Boolean).join(" · ") || "no job"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()} {m.remarks ? `· ${m.remarks}` : ""}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}

          {((tab === "stock" && stockList.length === 0) ||
            (tab === "lots" && lotList.length === 0) ||
            (tab === "requests" && requestList.length === 0) ||
            (tab === "movements" && movementList.length === 0)) && (
            <p className="py-10 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}
        </div>

        <Dialog open={!!approvalPrompt} onOpenChange={(o) => { if (!o) setApprovalPrompt(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Send item code for approval?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{approvalPrompt?.item_code}</span>
              {approvalPrompt?.description ? ` — ${approvalPrompt.description}` : ""} is saved but not live.
              It can only be used in BOM / BOS once a Project Manager approves it.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApprovalPrompt(null)}>Not now</Button>
              <Button onClick={() => approvalPrompt && sendItemForApproval(approvalPrompt)}>
                Send for approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text",
}: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input className="mt-1" type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Select({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}
