import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments, notifyUsers } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { myRoles, isManagement } from "@/lib/permissions";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============================================================ stock lots ====

export const listStockLots = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_lots")
      .select("*, stock_lot_items(*, stock_items(item_code, description, unit, quantity_on_hand))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const lotItemSchema = z.object({
  stock_item_id: z.string().uuid(),
  supplier: z.string().max(200).default(""),
  reference: z.string().max(120).default(""),
  quantity: z.number().min(0).default(0),
  unit_cost: z.number().min(0).default(0),
  store_location: z.string().max(200).default(""),
  remarks: z.string().max(500).default(""),
});

/** Store staff build a restock lot. It only affects stock once Management approves. */
export const saveStockLot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        supplier: z.string().max(200).default(""),
        reference: z.string().max(120).default(""),
        received_date: z.string().max(40).nullable().default(null),
        notes: z.string().max(2000).default(""),
        items: z.array(lotItemSchema).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("inventory")) {
      throw new Error("Only the Store (Inventory) can create a restock lot.");
    }
    const { id, items, ...raw } = data;
    const fields = {
      ...raw,
      supplier: raw.supplier || items.find((i) => i.supplier)?.supplier || "",
      reference: raw.reference || items.find((i) => i.reference)?.reference || "",
      received_date: raw.received_date || null,
    };
    const total = round2(items.reduce((s, i) => s + i.quantity * i.unit_cost, 0));

    let lotId = id;
    let lot_number = "";

    if (id) {
      const { data: prev } = await supabase.from("stock_lots").select("*").eq("id", id).maybeSingle();
      if (!prev) throw new Error("Lot not found");
      if (prev.status === "approved") throw new Error(`Lot ${prev.lot_number} is approved — it can no longer be edited.`);
      if (prev.status === "pending") throw new Error(`Lot ${prev.lot_number} is waiting for Management approval.`);
      const { error } = await supabase.from("stock_lots").update({ ...fields, total_value: total }).eq("id", id);
      if (error) throw new Error(error.message);
      lot_number = prev.lot_number;
    } else {
      lot_number = await nextSequence(supabase, "stock_lots", "lot_number", "LOT");
      const { data: created, error } = await supabase
        .from("stock_lots")
        .insert({ ...fields, lot_number, total_value: total, status: "draft", created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      lotId = created.id;
    }

    await supabase.from("stock_lot_items").delete().eq("lot_id", lotId!);
    if (items.length > 0) {
      const ids = items.map((i) => i.stock_item_id);
      const { data: stockRows } = await supabase.from("stock_items").select("id, description, unit").in("id", ids);
      const byId = new Map((stockRows ?? []).map((s: any) => [s.id, s]));
      const { error: itemError } = await supabase.from("stock_lot_items").insert(
        items.map((i, index) => ({
          lot_id: lotId!,
          stock_item_id: i.stock_item_id,
          sequence: index + 1,
          description: byId.get(i.stock_item_id)?.description ?? "",
          unit: byId.get(i.stock_item_id)?.unit ?? "pcs",
          supplier: i.supplier,
          reference: i.reference,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          store_location: i.store_location,
          remarks: i.remarks,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    await logActivity(supabase, userId, {
      action: id ? "edit" : "create",
      entity_table: "stock_lots",
      entity_id: lotId!,
      entity_label: lot_number,
      new_value: { ...fields, total_value: total, lines: items.length },
    });
    return { ok: true, id: lotId!, lot_number };
  });

export const deleteStockLot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("stock_lots").select("*").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("Lot not found");
    const admin = await isManagement(supabase, userId);
    if (prev.status !== "draft" && !admin) {
      throw new Error(`Lot ${prev.lot_number} has been submitted — only Management can remove it.`);
    }
    const { error } = await supabase.from("stock_lots").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "stock_lots",
      entity_id: data.id,
      entity_label: prev.lot_number,
      previous_value: prev,
    });
    return { ok: true };
  });

/** Send the lot to Management. Stock is only updated after they approve. */
export const submitStockLot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: lot } = await supabase
      .from("stock_lots")
      .select("*, stock_lot_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (!lot) throw new Error("Lot not found");
    const submitRoles = await myRoles(supabase, userId);
    if (!submitRoles.includes("inventory")) {
      throw new Error("Only the Store (Inventory) can submit a restock lot.");
    }
    if (lot.status === "approved") throw new Error("This lot is already approved.");
    if ((lot.stock_lot_items ?? []).length === 0) throw new Error("Add at least one item to the lot first.");

    const total = round2(
      (lot.stock_lot_items ?? []).reduce(
        (s: number, i: any) => s + Number(i.quantity ?? 0) * Number(i.unit_cost ?? 0),
        0,
      ),
    );

    await supabase
      .from("stock_lots")
      .update({ status: "pending", submitted_at: new Date().toISOString(), total_value: total })
      .eq("id", data.id);

    const { data: created, error } = await supabase
      .from("approvals")
      .insert({
        approval_type: "stock_lot",
        title: `Restock lot ${lot.lot_number}`,
        details: `${(lot.stock_lot_items ?? []).length} item(s) · supplier ${lot.supplier || "—"}`,
        entity_table: "stock_lots",
        entity_id: lot.id,
        amount: total,
        decision: "pending",
        submitted_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "approval_requested",
      entity_table: "stock_lots",
      entity_id: lot.id,
      entity_label: lot.lot_number,
      new_value: { total_value: total },
    });
    await notifyDepartments(supabase, ["admin"], {
      title: "Restock lot approval required",
      message: `${lot.lot_number} · ${(lot.stock_lot_items ?? []).length} item(s)`,
      category: "inventory",
      link: "/approvals",
      entity_table: "approvals",
      entity_id: created.id,
    });
    return { ok: true };
  });

/**
 * Apply an approved lot to the store. Called from the approvals decision flow.
 */
export async function applyStockLotDecision(
  supabase: any,
  userId: string,
  lotId: string,
  decision: "approved" | "rejected" | "revision_requested",
) {
  const { data: lot } = await supabase
    .from("stock_lots")
    .select("*, stock_lot_items(*)")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot) return;

  if (decision !== "approved") {
    await supabase
      .from("stock_lots")
      .update({ status: decision === "rejected" ? "rejected" : "draft" })
      .eq("id", lotId);
    return;
  }

  for (const line of lot.stock_lot_items ?? []) {
    const qty = Number(line.quantity ?? 0);
    if (!line.stock_item_id || qty <= 0) continue;
    const { data: item } = await supabase
      .from("stock_items")
      .select("*")
      .eq("id", line.stock_item_id)
      .maybeSingle();
    if (!item) continue;
    const next = round2(Number(item.quantity_on_hand ?? 0) + qty);
    await supabase
      .from("stock_items")
      .update({
        quantity_on_hand: next,
        unit_cost: Number(line.unit_cost ?? 0) || item.unit_cost,
        store_location: line.store_location || item.store_location,
        supplier: line.supplier || lot.supplier || item.supplier,
      })
      .eq("id", line.stock_item_id);
    await supabase.from("stock_movements").insert({
      stock_item_id: line.stock_item_id,
      movement_type: "receipt",
      description: line.description || item.description,
      unit: line.unit || item.unit,
      quantity: qty,
      unit_cost: Number(line.unit_cost ?? 0),
      reference: lot.lot_number,
      remarks: `Restock lot ${lot.lot_number}`,
      moved_by: userId,
    });
  }

  await supabase
    .from("stock_lots")
    .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", lotId);
  await notifyDepartments(supabase, ["inventory"], {
    title: `Restock lot ${lot.lot_number} approved`,
    message: "Stock has been updated in the store.",
    category: "inventory",
    link: "/inventory",
    entity_table: "stock_lots",
    entity_id: lotId,
  });
}

// ==================================================== job number remarks ====

/** BOM lines of a job number, joined with whatever remarks the Store recorded. */
export const getJobItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ job_number_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job } = await supabase
      .from("job_numbers")
      .select("*, projects(project_number, name), customers(name), boms(reference, title)")
      .eq("id", data.job_number_id)
      .maybeSingle();
    if (!job) throw new Error("Job number not found");

    const [{ data: bomItems }, { data: remarks }] = await Promise.all([
      job.bom_id
        ? supabase
            .from("bom_items")
            .select("*, stock_items(item_code, description)")
            .eq("bom_id", job.bom_id)
            .order("sequence")
        : Promise.resolve({ data: [] as any[] }),
      supabase.from("job_item_remarks").select("*").eq("job_number_id", data.job_number_id).order("sequence"),
    ]);

    return { job, bomItems: bomItems ?? [], remarks: remarks ?? [] };
  });

/** Store records a remark per job item. Locked once the Project Manager approves. */
export const saveJobRemarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        job_number_id: z.string().uuid(),
        submit: z.boolean().default(false),
        items: z
          .array(
            z.object({
              bom_item_id: z.string().uuid().nullable().default(null),
              description: z.string().max(500).default(""),
              unit: z.string().max(40).default(""),
              quantity: z.number().min(0).default(0),
              remarks: z.string().max(2000).default(""),
            }),
          )
          .default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("inventory") && !roles.includes("admin")) {
      throw new Error("Only the Store can record remarks against a job number.");
    }

    const { data: existing } = await supabase
      .from("job_item_remarks")
      .select("status")
      .eq("job_number_id", data.job_number_id);
    if ((existing ?? []).some((r: any) => r.status === "approved") && !roles.includes("admin")) {
      throw new Error("These remarks have been approved — they can no longer be changed.");
    }

    const status = data.submit ? "pending" : "draft";
    await supabase.from("job_item_remarks").delete().eq("job_number_id", data.job_number_id);
    if (data.items.length > 0) {
      const { error } = await supabase.from("job_item_remarks").insert(
        data.items.map((i, index) => ({
          job_number_id: data.job_number_id,
          bom_item_id: i.bom_item_id,
          sequence: index + 1,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          remarks: i.remarks,
          status,
          submitted_by: data.submit ? userId : null,
          submitted_at: data.submit ? new Date().toISOString() : null,
        })),
      );
      if (error) throw new Error(error.message);
    }

    const { data: job } = await supabase
      .from("job_numbers")
      .select("job_number")
      .eq("id", data.job_number_id)
      .maybeSingle();

    await logActivity(supabase, userId, {
      action: data.submit ? "job_remarks_submitted" : "job_remarks_saved",
      entity_table: "job_numbers",
      entity_id: data.job_number_id,
      entity_label: job?.job_number ?? "",
      new_value: { lines: data.items.length },
    });

    if (data.submit) {
      await notifyDepartments(supabase, ["project_manager", "admin"], {
        title: `Store remarks on ${job?.job_number ?? "job number"}`,
        message: "Waiting for your approval.",
        category: "inventory",
        link: "/projects",
        entity_table: "job_numbers",
        entity_id: data.job_number_id,
      });
    }
    return { ok: true };
  });

/** Project Manager (or Management) signs off the Store remarks. */
export const decideJobRemarks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        job_number_id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("project_manager") && !roles.includes("admin")) {
      throw new Error("Only the Project Manager or Management can approve job remarks.");
    }
    const { error } = await supabase
      .from("job_item_remarks")
      .update({
        status: data.decision,
        approved_by: data.decision === "approved" ? userId : null,
        approved_at: data.decision === "approved" ? new Date().toISOString() : null,
      })
      .eq("job_number_id", data.job_number_id);
    if (error) throw new Error(error.message);

    const { data: rows } = await supabase
      .from("job_item_remarks")
      .select("submitted_by")
      .eq("job_number_id", data.job_number_id);
    const submitters = [...new Set((rows ?? []).map((r: any) => r.submitted_by).filter(Boolean))] as string[];

    const { data: job } = await supabase
      .from("job_numbers")
      .select("job_number")
      .eq("id", data.job_number_id)
      .maybeSingle();

    await logActivity(supabase, userId, {
      action: `job_remarks_${data.decision}`,
      entity_table: "job_numbers",
      entity_id: data.job_number_id,
      entity_label: job?.job_number ?? "",
      new_value: { decision: data.decision },
    });
    if (submitters.length) {
      await notifyUsers(supabase, submitters, {
        title: `Job remarks ${data.decision}`,
        message: job?.job_number ?? "",
        category: "inventory",
        link: "/projects",
        entity_table: "job_numbers",
        entity_id: data.job_number_id,
      });
    }
    return { ok: true };
  });
