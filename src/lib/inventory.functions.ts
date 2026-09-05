import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { assertCan, assertMutable, isManagement } from "@/lib/permissions";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ============================================================= stock items ===

export const listStockItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_items")
      .select("*")
      .order("item_code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        item_code: z.string().max(60).default(""),
        description: z.string().trim().min(1).max(500),
        category: z.string().max(120).default(""),
        unit: z.string().max(40).default("pcs"),
        quantity_on_hand: z.number().min(0).default(0),
        reorder_level: z.number().min(0).default(0),
        unit_cost: z.number().min(0).default(0),
        store_location: z.string().max(200).default(""),
        supplier: z.string().max(200).default(""),
        status: z.enum(["active", "inactive"]).default("active"),
        notes: z.string().max(2000).default(""),
        image_url: z.string().max(500).default(""),

      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;

    if (id) {
      const { data: prev } = await supabase.from("stock_items").select("*").eq("id", id).maybeSingle();
      await assertMutable(supabase, userId, {
        approved: prev?.approval_status === "approved",
        label: `Item ${prev?.item_code ?? ""}`.trim(),
      });
      const { error } = await supabase.from("stock_items").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "stock_items",
        entity_id: id,
        entity_label: fields.description,
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    await assertCan(supabase, userId, "stock.item.create");
    const admin = await isManagement(supabase, userId);
    const item_code = fields.item_code || (await nextSequence(supabase, "stock_items", "item_code", "ITM"));
    const { data: created, error } = await supabase
      .from("stock_items")
      .insert({
        ...fields,
        item_code,
        created_by: userId,
        approval_status: admin ? "approved" : "pending",
        approved_by: admin ? userId : null,
        approved_at: admin ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    if (fields.quantity_on_hand > 0) {
      await supabase.from("stock_movements").insert({
        stock_item_id: created.id,
        movement_type: "opening",
        description: fields.description,
        unit: fields.unit,
        quantity: fields.quantity_on_hand,
        unit_cost: fields.unit_cost,
        reference: item_code,
        remarks: "Opening balance",
        moved_by: userId,
      });
    }

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "stock_items",
      entity_id: created.id,
      entity_label: `${item_code} — ${fields.description}`,
      new_value: fields,
    });
    return { ok: true, id: created.id, item_code };
  });

export const deleteStockItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase
      .from("stock_items")
      .select("item_code, approval_status, created_at")
      .eq("id", data.id)
      .maybeSingle();
    await assertMutable(supabase, userId, {
      approved: prev?.approval_status === "approved",
      label: `Item ${prev?.item_code ?? ""}`.trim(),
      action: "delete",
    });
    // An item is frozen 24 hours after it was added — only Management may remove it then.
    const ageHours = prev?.created_at
      ? (Date.now() - new Date(prev.created_at).getTime()) / 3_600_000
      : 0;
    if (ageHours > 24 && !(await isManagement(supabase, userId))) {
      throw new Error(
        `Item ${prev?.item_code ?? ""} was created more than 24 hours ago — only Management can delete it now.`.trim(),
      );
    }
    const { error } = await supabase.from("stock_items").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "stock_items",
      entity_id: data.id,
    });
    return { ok: true };
  });

/** Management clears (or rejects) a new item code before it can be used. */
export const setStockItemApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        approval_status: z.enum(["approved", "rejected", "pending"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await assertCan(supabase, userId, "stock.item.approve");
    if (!roles.includes("admin")) {
      throw new Error("Only Management can approve an item code.");
    }
    const { data: item } = await supabase
      .from("stock_items")
      .select("item_code, description")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("stock_items")
      .update({
        approval_status: data.approval_status,
        approved_by: data.approval_status === "approved" ? userId : null,
        approved_at: data.approval_status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: `item_${data.approval_status}`,
      entity_table: "stock_items",
      entity_id: data.id,
      entity_label: `${item?.item_code ?? ""} — ${item?.description ?? ""}`,
      new_value: { approval_status: data.approval_status },
    });
    await notifyDepartments(supabase, ["project_manager", "technician", "inventory"], {
      title: `Item ${item?.item_code ?? ""} ${data.approval_status}`,
      message: item?.description ?? "",
      category: "inventory",
      link: "/inventory",
      entity_table: "stock_items",
      entity_id: data.id,
    });
    return { ok: true };
  });

// ======================================================== stock movements ====

export const listStockMovements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_movements")
      .select("*, stock_items(item_code, description), projects(project_number), job_numbers(job_number)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Receipt / return / adjustment. Stock on hand is corrected in the same call. */
export const recordStockMovement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stock_item_id: z.string().uuid(),
        movement_type: z.enum(["receipt", "return", "adjustment", "issue"]).default("receipt"),
        quantity: z.number().min(0).default(0),
        unit_cost: z.number().min(0).default(0),
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        reference: z.string().max(120).default(""),
        remarks: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: item } = await supabase.from("stock_items").select("*").eq("id", data.stock_item_id).maybeSingle();
    if (!item) throw new Error("Stock item not found");

    const sign = data.movement_type === "issue" ? -1 : data.movement_type === "adjustment" ? 1 : 1;
    const delta = data.movement_type === "issue" ? -data.quantity : sign * data.quantity;
    const next = round2(Number(item.quantity_on_hand ?? 0) + delta);
    if (next < 0) throw new Error("Not enough stock on hand for this movement");

    const { error } = await supabase.from("stock_movements").insert({
      stock_item_id: data.stock_item_id,
      project_id: data.project_id,
      job_number_id: data.job_number_id,
      movement_type: data.movement_type,
      description: item.description,
      unit: item.unit,
      quantity: data.quantity,
      unit_cost: data.unit_cost || item.unit_cost,
      reference: data.reference,
      remarks: data.remarks,
      moved_by: userId,
    });
    if (error) throw new Error(error.message);

    await supabase.from("stock_items").update({ quantity_on_hand: next }).eq("id", data.stock_item_id);
    await logActivity(supabase, userId, {
      action: `stock_${data.movement_type}`,
      entity_table: "stock_items",
      entity_id: data.stock_item_id,
      entity_label: `${item.item_code} — ${item.description}`,
      previous_value: { quantity_on_hand: item.quantity_on_hand },
      new_value: { quantity_on_hand: next },
    });

    if (next <= Number(item.reorder_level ?? 0)) {
      await notifyDepartments(supabase, ["inventory", "admin"], {
        title: "Stock below reorder level",
        message: `${item.item_code} — ${item.description}: ${next} ${item.unit} left`,
        category: "inventory",
        link: "/inventory",
        entity_table: "stock_items",
        entity_id: data.stock_item_id,
      });
    }
    return { ok: true, quantity_on_hand: next };
  });

// ======================================================= material requests ===

export const listMaterialRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("material_requests")
      .select(
        "*, projects(project_number, name), job_numbers(job_number), boms(reference), material_request_items(*, stock_items(item_code, description, quantity_on_hand, unit))",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const requestItemSchema = z.object({
  stock_item_id: z.string().uuid().nullable().default(null),
  description: z.string().max(500).default(""),
  unit: z.string().max(40).default("pcs"),
  quantity_requested: z.number().min(0).default(0),
  unit_cost: z.number().min(0).default(0),
  remarks: z.string().max(500).default(""),
});

export const saveMaterialRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        bom_id: z.string().uuid().nullable().default(null),
        title: z.string().trim().min(1).max(300),
        required_date: z.string().max(40).nullable().default(null),
        site_location: z.string().max(300).default(""),
        notes: z.string().max(4000).default(""),
        items: z.array(requestItemSchema).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, items, ...raw } = data;
    const fields = { ...raw, required_date: raw.required_date || null };

    let requestId = id;
    let reference = "";

    if (id) {
      const { data: prev } = await supabase.from("material_requests").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("material_requests").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      reference = prev?.reference ?? "";
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "material_requests",
        entity_id: id,
        entity_label: reference,
        previous_value: prev,
        new_value: fields,
      });
    } else {
      reference = await nextSequence(supabase, "material_requests", "reference", "MR");
      const { data: created, error } = await supabase
        .from("material_requests")
        .insert({ ...fields, reference, created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      requestId = created.id;
      await logActivity(supabase, userId, {
        action: "create",
        entity_table: "material_requests",
        entity_id: created.id,
        entity_label: reference,
        new_value: fields,
      });
      await notifyDepartments(supabase, ["inventory"], {
        title: `Material request ${reference}`,
        message: fields.title,
        category: "inventory",
        link: "/inventory",
        entity_table: "material_requests",
        entity_id: created.id,
      });
    }

    await supabase.from("material_request_items").delete().eq("request_id", requestId!);
    if (items.length > 0) {
      const { error: itemError } = await supabase.from("material_request_items").insert(
        items.map((i, index) => ({
          request_id: requestId!,
          stock_item_id: i.stock_item_id,
          sequence: index + 1,
          description: i.description,
          unit: i.unit,
          quantity_requested: i.quantity_requested,
          unit_cost: i.unit_cost,
          remarks: i.remarks,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    return { ok: true, id: requestId!, reference };
  });

export const deleteMaterialRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("material_requests").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "material_requests",
      entity_id: data.id,
    });
    return { ok: true };
  });

/** Reserve available stock against a request (material allocation stage). */
export const allocateMaterialRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: request } = await supabase
      .from("material_requests")
      .select("*, material_request_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (!request) throw new Error("Material request not found");

    const shortages: string[] = [];
    for (const line of request.material_request_items ?? []) {
      const requested = Number(line.quantity_requested ?? 0);
      let allocated = requested;
      if (line.stock_item_id) {
        const { data: item } = await supabase
          .from("stock_items")
          .select("*")
          .eq("id", line.stock_item_id)
          .maybeSingle();
        const available = round2(Number(item?.quantity_on_hand ?? 0) - Number(item?.quantity_reserved ?? 0));
        allocated = Math.min(requested, Math.max(available, 0));
        if (allocated < requested) {
          shortages.push(`${item?.item_code ?? line.description}: short ${round2(requested - allocated)}`);
        }
        await supabase
          .from("stock_items")
          .update({ quantity_reserved: round2(Number(item?.quantity_reserved ?? 0) + allocated) })
          .eq("id", line.stock_item_id);
      }
      await supabase
        .from("material_request_items")
        .update({ quantity_allocated: allocated })
        .eq("id", line.id);
    }

    await supabase
      .from("material_requests")
      .update({ stage: "material_allocation", status: shortages.length ? "shortage" : "allocated" })
      .eq("id", data.id);
    if (request.project_id) {
      await supabase.from("projects").update({ stage: "material_allocation" }).eq("id", request.project_id);
    }

    await logActivity(supabase, userId, {
      action: "material_allocated",
      entity_table: "material_requests",
      entity_id: data.id,
      entity_label: request.reference,
      new_value: { shortages },
    });

    if (shortages.length) {
      await notifyDepartments(supabase, ["project_manager", "admin"], {
        title: `Shortage on ${request.reference}`,
        message: shortages.join(" · "),
        category: "inventory",
        link: "/inventory",
        entity_table: "material_requests",
        entity_id: data.id,
      });
    }
    return { ok: true, shortages };
  });

/** Issue allocated material to site: stock leaves the store and is logged. */
export const issueMaterialRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), received_by: z.string().max(200).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: request } = await supabase
      .from("material_requests")
      .select("*, material_request_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (!request) throw new Error("Material request not found");

    for (const line of request.material_request_items ?? []) {
      const qty = Number(line.quantity_allocated ?? 0);
      if (qty <= 0) continue;
      if (line.stock_item_id) {
        const { data: item } = await supabase
          .from("stock_items")
          .select("*")
          .eq("id", line.stock_item_id)
          .maybeSingle();
        const onHand = round2(Number(item?.quantity_on_hand ?? 0) - qty);
        const reserved = round2(Math.max(Number(item?.quantity_reserved ?? 0) - qty, 0));
        if (onHand < 0) throw new Error(`Not enough stock for ${item?.item_code ?? line.description}`);
        await supabase
          .from("stock_items")
          .update({ quantity_on_hand: onHand, quantity_reserved: reserved })
          .eq("id", line.stock_item_id);
      }
      await supabase.from("stock_movements").insert({
        stock_item_id: line.stock_item_id,
        request_id: request.id,
        project_id: request.project_id,
        job_number_id: request.job_number_id,
        movement_type: "issue",
        description: line.description,
        unit: line.unit,
        quantity: qty,
        unit_cost: line.unit_cost,
        reference: request.reference,
        remarks: `Issued to ${data.received_by || "site"}`,
        moved_by: userId,
      });
      await supabase.from("material_request_items").update({ quantity_issued: qty }).eq("id", line.id);
    }

    await supabase
      .from("material_requests")
      .update({
        stage: "material_issued",
        status: "issued",
        issued_by: userId,
        issued_at: new Date().toISOString(),
        received_by: data.received_by,
      })
      .eq("id", data.id);
    if (request.project_id) {
      await supabase.from("projects").update({ stage: "material_issued" }).eq("id", request.project_id);
    }

    await logActivity(supabase, userId, {
      action: "material_issued",
      entity_table: "material_requests",
      entity_id: data.id,
      entity_label: request.reference,
      new_value: { received_by: data.received_by },
    });
    await notifyDepartments(supabase, ["technician", "project_manager"], {
      title: `Material issued — ${request.reference}`,
      message: `${request.title} released from store`,
      category: "inventory",
      link: "/inventory",
      entity_table: "material_requests",
      entity_id: data.id,
    });
    return { ok: true };
  });

// ==================================================== bulk excel import =====

/**
 * Project Manager uploads a spreadsheet of item codes. Every row lands in the
 * store as a pending item and only goes live once Management approves it.
 */
export const importStockItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        rows: z
          .array(
            z.object({
              item_code: z.string().max(60).default(""),
              description: z.string().trim().min(1).max(500),
              category: z.string().max(120).default(""),
              unit: z.string().max(40).default("pcs"),
              status: z.string().max(40).default("active"),
              image_url: z.string().max(500).default(""),
              notes: z.string().max(2000).default(""),
            }),
          )
          .min(1)
          .max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "stock.item.create");

    const { data: existing } = await supabase.from("stock_items").select("item_code");
    const taken = new Set(((existing ?? []) as any[]).map((r) => String(r.item_code ?? "").toLowerCase()));

    let created = 0;
    let skipped = 0;
    for (const row of data.rows) {
      let code = row.item_code.trim();
      if (code && taken.has(code.toLowerCase())) {
        skipped += 1;
        continue;
      }
      if (!code) code = await nextSequence(supabase, "stock_items", "item_code", "ITM");
      const status = row.status.trim().toLowerCase() === "inactive" ? "inactive" : "active";
      const { error } = await supabase.from("stock_items").insert({
        item_code: code,
        description: row.description.trim(),
        category: row.category.trim(),
        unit: row.unit.trim() || "pcs",
        status,
        image_url: row.image_url.trim(),
        notes: row.notes.trim(),
        created_by: userId,
        approval_status: "pending",
      });
      if (error) throw new Error(error.message);
      taken.add(code.toLowerCase());
      created += 1;
    }

    await logActivity(supabase, userId, {
      action: "import",
      entity_table: "stock_items",
      entity_label: `${created} item(s) imported from Excel`,
      new_value: { created, skipped },
    });
    if (created > 0) {
      await notifyDepartments(supabase, ["admin"], {
        title: "Imported item codes need approval",
        message: `${created} item(s) uploaded by the Project Manager are waiting to go live.`,
        category: "inventory",
        link: "/inventory",
        entity_table: "stock_items",
      });
    }
    return { ok: true, created, skipped };
  });
