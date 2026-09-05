import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";

// ========================================================= daily progress ===

export const listDailyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("daily_progress")
      .select("*, projects(project_number, name), job_numbers(job_number), customers(name)")
      .order("log_date", { ascending: false })
      .limit(400);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const progressSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid().nullable().default(null),
  job_number_id: z.string().uuid().nullable().default(null),
  customer_id: z.string().uuid().nullable().default(null),
  log_date: z.string().min(1),
  site_location: z.string().max(300).default(""),
  work_description: z.string().trim().min(1).max(4000),
  manpower_count: z.number().min(0).max(9999).default(0),
  hours_worked: z.number().min(0).max(999).default(0),
  equipment_used: z.string().max(1000).default(""),
  materials_consumed: z.string().max(2000).default(""),
  progress_percent: z.number().min(0).max(100).default(0),
  issues: z.string().max(2000).default(""),
  weather: z.string().max(200).default(""),
  supervisor: z.string().max(200).default(""),
  status: z.enum(["submitted", "reviewed", "flagged"]).default("submitted"),
  notes: z.string().max(2000).default(""),
});

export const saveDailyProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => progressSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;

    if (id) {
      const { data: prev } = await supabase.from("daily_progress").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("daily_progress").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "daily_progress",
        entity_id: id,
        entity_label: fields.work_description.slice(0, 80),
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const reference = await nextSequence(supabase, "daily_progress", "reference", "DPR");
    const { data: created, error } = await supabase
      .from("daily_progress")
      .insert({ ...fields, reference, stage: "in_progress", created_by: userId })
      .select("id, reference")
      .single();
    if (error) throw new Error(error.message);

    // Keep the job number progress in step with the latest site report.
    if (fields.job_number_id && fields.progress_percent > 0) {
      await supabase
        .from("job_numbers")
        .update({ progress_percent: fields.progress_percent, status: "in_progress" })
        .eq("id", fields.job_number_id);
    }
    if (fields.project_id && fields.progress_percent > 0) {
      await supabase
        .from("projects")
        .update({ progress_percent: fields.progress_percent, stage: "in_progress" })
        .eq("id", fields.project_id);
    }

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "daily_progress",
      entity_id: created.id,
      entity_label: created.reference,
      new_value: fields,
    });

    if (fields.issues.trim()) {
      await notifyDepartments(supabase, ["project_manager", "admin"], {
        title: `Site issue reported — ${created.reference}`,
        message: fields.issues.slice(0, 200),
        category: "execution",
        link: "/execution",
        entity_table: "daily_progress",
        entity_id: created.id,
      });
    }

    return { ok: true, id: created.id, reference: created.reference };
  });

export const deleteDailyProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("daily_progress").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "daily_progress",
      entity_id: data.id,
      entity_label: "Daily progress log",
    });
    return { ok: true };
  });

// ======================================================== work completion ===

export const listWorkCompletions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("work_completions")
      .select("*, projects(project_number, name), job_numbers(job_number), customers(name)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const completionSchema = z.object({
  id: z.string().uuid().optional(),
  project_id: z.string().uuid().nullable().default(null),
  job_number_id: z.string().uuid().nullable().default(null),
  customer_id: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(300),
  site_location: z.string().max(300).default(""),
  completion_date: z.string().nullable().default(null),
  scope_completed: z.string().max(4000).default(""),
  snag_list: z.string().max(4000).default(""),
  remarks: z.string().max(2000).default(""),
  customer_name: z.string().max(200).default(""),
  customer_designation: z.string().max(200).default(""),
});

export const saveWorkCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => completionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...fields } = data;

    if (id) {
      const { data: prev } = await supabase.from("work_completions").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("work_completions").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "work_completions",
        entity_id: id,
        entity_label: fields.title,
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const reference = await nextSequence(supabase, "work_completions", "reference", "WCR");
    const { data: created, error } = await supabase
      .from("work_completions")
      .insert({ ...fields, reference, stage: "service_report", status: "draft", created_by: userId })
      .select("id, reference")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "work_completions",
      entity_id: created.id,
      entity_label: created.reference,
      new_value: fields,
    });
    return { ok: true, id: created.id, reference: created.reference };
  });

/** Move a completion record along: customer confirmation -> PM review -> billing. */
export const setCompletionStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        stage: z.enum(["service_report", "customer_confirmation", "pm_review", "billing"]),
        customer_confirmed: z.boolean().default(false),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("work_completions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Completion record not found");

    const patch: {
      stage: string;
      status?: string;
      remarks?: string;
      customer_confirmed?: boolean;
      customer_confirmed_at?: string;
    } = { stage: data.stage };
    if (data.stage === "customer_confirmation" && data.customer_confirmed) {
      patch["customer_confirmed"] = true;
      patch["customer_confirmed_at"] = new Date().toISOString();
    }
    if (data.stage === "pm_review") patch["status"] = "under_review";
    if (data.stage === "billing") patch["status"] = "completed";
    if (data.notes) patch["remarks"] = data.notes;

    const { error } = await supabase.from("work_completions").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.stage === "billing" && row.job_number_id) {
      await supabase
        .from("job_numbers")
        .update({ status: "completed", progress_percent: 100, completed_date: new Date().toISOString().slice(0, 10) })
        .eq("id", row.job_number_id);
    }
    if (data.stage === "billing" && row.project_id) {
      await supabase.from("projects").update({ stage: "billing" }).eq("id", row.project_id);
    }

    await logActivity(supabase, userId, {
      action: "stage_change",
      entity_table: "work_completions",
      entity_id: data.id,
      entity_label: row.reference,
      previous_value: { stage: row.stage },
      new_value: { stage: data.stage },
    });

    const audience =
      data.stage === "pm_review"
        ? ["project_manager", "admin"]
        : data.stage === "billing"
          ? ["accounts", "admin"]
          : ["project_manager"];
    await notifyDepartments(supabase, audience, {
      title: `${row.reference} — ${data.stage.replace(/_/g, " ")}`,
      message: row.title ?? "",
      category: "execution",
      link: "/execution",
      entity_table: "work_completions",
      entity_id: data.id,
    });

    return { ok: true };
  });

export const deleteWorkCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("work_completions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "work_completions",
      entity_id: data.id,
      entity_label: "Work completion",
    });
    return { ok: true };
  });
