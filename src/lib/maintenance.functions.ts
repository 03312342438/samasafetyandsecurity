import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin access required");
}

// ---------- Maintenance tasks ----------

// Attach report fields (msr_no, order_no, contract, our_ref_no, report_date)
// to tasks so they can be searched by those values in the UI.
async function attachReportFields(supabase: any, tasks: any[]) {
  const reportIds = Array.from(new Set(tasks.map((t: any) => t.report_id).filter(Boolean)));
  if (!reportIds.length) return tasks;
  const { data: reports } = await supabase
    .from("reports")
    .select("id, msr_no, order_no, contract, our_ref_no, report_date")
    .in("id", reportIds);
  const byId = Object.fromEntries((reports ?? []).map((r: any) => [r.id, r]));
  return tasks.map((t: any) => {
    const r = byId[t.report_id] ?? {};
    return {
      ...t,
      msr_no: r.msr_no ?? "",
      order_no: r.order_no ?? "",
      contract: r.contract ?? "",
      our_ref_no: r.our_ref_no ?? "",
      report_date: r.report_date ?? "",
    };
  });
}

export const listMyMaintenanceTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("maintenance_tasks")
      .select("*")
      .eq("created_by", userId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    return await attachReportFields(supabase, data ?? []);
  });

export const listAllMaintenanceTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("maintenance_tasks")
      .select("*")
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    const tasks = data ?? [];

    // Attach the responsible employee's name.
    const ids = Array.from(new Set(tasks.map((t: any) => t.created_by)));
    let nameById: Record<string, string> = {};
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      nameById = Object.fromEntries(
        (profiles ?? []).map((p: any) => [p.id, p.full_name || p.email || "—"]),
      );
    }
    const enriched = await attachReportFields(supabase, tasks);
    return enriched.map((t: any) => ({ ...t, employee_name: nameById[t.created_by] ?? "—" }));
  });


export const setMaintenanceTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["pending", "completed"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("maintenance_tasks")
      .update({
        status: data.status,
        completed_at: data.status === "completed" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMaintenanceTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("maintenance_tasks")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Reminder email list ----------

export const listReminderEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("maintenance_reminder_emails")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const addEmailSchema = z.object({
  email: z.string().trim().email().max(255),
  label: z.string().trim().max(120).default(""),
});

export const addReminderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => addEmailSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("maintenance_reminder_emails")
      .insert({ email: data.email.toLowerCase(), label: data.label });
    if (error) {
      if (error.code === "23505") throw new Error("That email is already in the list.");
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteReminderEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("maintenance_reminder_emails")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
