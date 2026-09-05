import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { assertCan, assertMutable } from "@/lib/permissions";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ==================================================================== BOM ====

export const listBoms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("boms")
      .select("*, customers(name), projects(project_number, name), bom_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = rows.map((r: any) => r.id);
    let usedMap = new Map<string, string>();
    if (ids.length) {
      const { data: qtnLinks } = await context.supabase
        .from("quotations")
        .select("bom_id, reference")
        .in("bom_id", ids);
      usedMap = new Map((qtnLinks ?? []).map((q: any) => [q.bom_id as string, q.reference as string]));
    }
    return rows.map((r: any) => ({
      ...r,
      used_in_quotation: usedMap.get(r.id) ?? null,
    }));
  });

const bomItemSchema = z.object({
  stock_item_id: z.string().uuid().nullable().default(null),
  description: z.string().max(500).default(""),
  category: z.string().max(120).default(""),
  unit: z.string().max(40).default("pcs"),
  quantity: z.number().min(0).default(1),
  unit_cost: z.number().min(0).default(0),
  remarks: z.string().max(500).default(""),
});

/** Create or update a BOM/BOS together with its costed lines. */
export const saveBom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid().nullable().default(null),
        customer_id: z.string().uuid().nullable().default(null),
        title: z.string().max(300).default(""),
        bom_type: z.enum(["material", "service"]).default("material"),
        currency: z.string().max(10).default("BHD"),
        stage: z.string().max(60).default("bom_bos_preparation"),
        status: z.string().max(40).default("draft"),
        notes: z.string().max(4000).default(""),
        items: z.array(bomItemSchema).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, items, ...raw } = data;
    const estimated_cost = round2(items.reduce((s, i) => s + i.quantity * i.unit_cost, 0));
    const fields = { ...raw, estimated_cost };

    let bomId = id;
    let reference = "";

    if (id) {
      const { data: prev } = await supabase.from("boms").select("*").eq("id", id).maybeSingle();
      await assertMutable(supabase, userId, {
        approved: prev?.status === "approved",
        label: `BOM ${prev?.reference ?? ""}`.trim(),
      });
      const { data: usedIn } = await supabase
        .from("quotations")
        .select("reference")
        .eq("bom_id", id)
        .limit(1)
        .maybeSingle();
      if (usedIn) {
        throw new Error(
          `BOM ${prev?.reference ?? ""} is used in quotation ${usedIn.reference} — it can no longer be edited.`,
        );
      }
      const { error } = await supabase.from("boms").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      reference = prev?.reference ?? "";
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "boms",
        entity_id: id,
        entity_label: reference,
        previous_value: prev,
        new_value: fields,
      });
    } else {
      await assertCan(supabase, userId, "bom.create");
      reference = await nextSequence(supabase, "boms", "reference", "BOM");
      const { data: created, error } = await supabase
        .from("boms")
        .insert({ ...fields, reference, prepared_by: userId, created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      bomId = created.id;
      await logActivity(supabase, userId, {
        action: "create",
        entity_table: "boms",
        entity_id: created.id,
        entity_label: reference,
        new_value: fields,
      });
    }

    if (!bomId) throw new Error("BOM could not be saved.");
    await supabase.from("bom_items").delete().eq("bom_id", bomId);
    if (items.length > 0) {
      const { error: itemError } = await supabase.from("bom_items").insert(
        items.map((i, index) => ({
          bom_id: bomId,
          sequence: index + 1,
          stock_item_id: i.stock_item_id || null,
          description: i.description,
          category: i.category,
          unit: i.unit,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          amount: round2(i.quantity * i.unit_cost),
          remarks: i.remarks,
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    if (data.project_id) {
      await supabase.from("projects").update({ stage: "bom_bos_preparation" }).eq("id", data.project_id);
    }

    return { ok: true, id: bomId, reference, estimated_cost };
  });

export const deleteBom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("boms").select("reference, status").eq("id", data.id).maybeSingle();

    // A BOM/BOS that a quotation is built on must stay intact.
    const { data: usedBy } = await supabase
      .from("quotations")
      .select("reference")
      .eq("bom_id", data.id)
      .limit(5);
    if ((usedBy ?? []).length > 0) {
      const refs = (usedBy ?? []).map((q) => q.reference).filter(Boolean).join(", ");
      throw new Error(
        `BOM/BOS ${prev?.reference ?? ""} is used in quotation ${refs} and cannot be deleted.`.trim(),
      );
    }

    await assertMutable(supabase, userId, {
      approved: prev?.status === "approved",
      label: `BOM ${prev?.reference ?? ""}`.trim(),
      action: "delete",
    });

    const { error } = await supabase.from("boms").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "boms",
      entity_id: data.id,
    });
    return { ok: true };
  });

/** Move a BOM/BOS along its own stage flow and alert the next department. */
export const setBomStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        stage: z.enum(["bom_bos_preparation", "bom_bos_approval", "material_planning"]),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: bom } = await supabase.from("boms").select("*").eq("id", data.id).maybeSingle();
    if (!bom) throw new Error("BOM not found");

    const statusByStage: Record<string, string> = {
      bom_bos_preparation: "draft",
      bom_bos_approval: "pending",
      material_planning: "approved",
    };

    const { error } = await supabase
      .from("boms")
      .update({
        stage: data.stage,
        status: statusByStage[data.stage] ?? bom.status,
        notes: data.notes || bom.notes,
        ...(data.stage === "bom_bos_preparation" && bom.stage !== "bom_bos_preparation"
          ? { revision: (bom.revision ?? 0) + 1 }
          : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: `bom_${data.stage}`,
      entity_table: "boms",
      entity_id: data.id,
      entity_label: bom.reference,
      previous_value: { stage: bom.stage },
      new_value: { stage: data.stage },
    });

    const audience =
      data.stage === "bom_bos_approval" ? ["admin"] : data.stage === "material_planning" ? ["inventory"] : ["project_manager"];
    await notifyDepartments(supabase, audience, {
      title: `BOM ${bom.reference}`,
      message: `Moved to ${data.stage.replace(/_/g, " ")}`,
      category: "engineering",
      link: "/engineering",
      entity_table: "boms",
      entity_id: data.id,
    });

    return { ok: true };
  });

// ========================================================== project tasks ====

export const listProjectTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("project_tasks")
      .select("*, projects(project_number, name), job_numbers(job_number)")
      .order("planned_start", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveProjectTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        title: z.string().trim().min(1).max(300),
        description: z.string().max(4000).default(""),
        assigned_to: z.string().uuid().nullable().default(null),
        planned_start: z.string().max(40).nullable().default(null),
        planned_end: z.string().max(40).nullable().default(null),
        actual_start: z.string().max(40).nullable().default(null),
        actual_end: z.string().max(40).nullable().default(null),
        progress_percent: z.number().int().min(0).max(100).default(0),
        priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
        status: z.enum(["planned", "in_progress", "blocked", "completed"]).default("planned"),
        notes: z.string().max(2000).default(""),
        sequence: z.number().int().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...raw } = data;
    const fields = {
      ...raw,
      planned_start: raw.planned_start || null,
      planned_end: raw.planned_end || null,
      actual_start: raw.actual_start || null,
      actual_end: raw.actual_end || null,
    };

    if (id) {
      const { data: prev } = await supabase.from("project_tasks").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("project_tasks").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "project_tasks",
        entity_id: id,
        entity_label: fields.title,
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const { data: created, error } = await supabase
      .from("project_tasks")
      .insert({ ...fields, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "project_tasks",
      entity_id: created.id,
      entity_label: fields.title,
      new_value: fields,
    });

    if (fields.assigned_to) {
      await notifyDepartments(supabase, ["technician"], {
        title: "New project task",
        message: fields.title,
        category: "planning",
        link: "/engineering",
        entity_table: "project_tasks",
        entity_id: created.id,
      });
    }

    return { ok: true, id: created.id };
  });

export const deleteProjectTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("project_tasks").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "project_tasks",
      entity_id: data.id,
    });
    return { ok: true };
  });
