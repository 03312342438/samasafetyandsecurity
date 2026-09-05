import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildSchedule } from "@/lib/maintenance-schedule";

const sparePartSchema = z.object({
  spare_no: z.string().max(100).default(""),
  description: z.string().max(500).default(""),
  qty: z.string().max(50).default(""),
  unit_price: z.string().max(50).default(""),
  total: z.string().max(50).default(""),
});

const reportSchema = z.object({
  client_name: z.string().max(300).default(""),
  client_email: z.string().max(320).default(""),
  contract: z.string().max(300).default(""),
  order_no: z.string().max(300).default(""),
  project: z.string().max(500).default(""),
  site_location: z.string().max(500).default(""),
  msr_no: z.string().max(100).default(""),
  our_ref_no: z.string().max(100).default(""),
  report_date: z.string().max(40).default(""),
  devices: z.record(z.string(), z.enum(["ok", "faulty"])).default({}),
  spare_parts: z.array(sparePartSchema).max(50).default([]),
  action_taken: z.string().max(5000).default(""),
  remarks: z.string().max(2000).default(""),
  next_maintenance: z.string().max(300).default(""),
  maintenance_count: z.string().max(100).default(""),
  maintenance_interval_value: z.string().max(20).default(""),
  maintenance_interval_unit: z.string().max(20).default("months"),
  performed_by: z.string().max(200).default(""),
  employee_signature: z.string().max(2_000_000).default(""),
  client_signature: z.string().max(2_000_000).default(""),
  client_sign_name: z.string().max(200).default(""),
  client_designation: z.string().max(200).default(""),
  date_completed: z.string().max(40).default(""),
});

type ReportFields = z.infer<typeof reportSchema>;

// Turn the form's string interval fields into a DB-ready integer (or null).
function intervalValueToInt(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// (Re)create the scheduled maintenance tasks for a report.
async function regenerateTasks(
  supabase: any,
  reportId: string,
  responsibleUserId: string,
  fields: ReportFields,
) {
  // Clear any existing tasks for this report first.
  await supabase.from("maintenance_tasks").delete().eq("report_id", reportId);

  const baseDate =
    fields.date_completed || fields.report_date || new Date().toISOString().slice(0, 10);
  const intervalValue = intervalValueToInt(fields.maintenance_interval_value) ?? 0;
  const count = parseInt(fields.maintenance_count, 10);

  const schedule = buildSchedule({
    baseDate,
    intervalValue,
    intervalUnit: fields.maintenance_interval_unit || "months",
    count: Number.isFinite(count) ? count : 0,
  });

  if (schedule.length === 0) return;

  const rows = schedule.map((s) => ({
    report_id: reportId,
    created_by: responsibleUserId,
    sequence: s.sequence,
    due_date: s.due_date,
    status: "pending",
    client_name: fields.client_name ?? "",
    project: fields.project ?? "",
    site_location: fields.site_location ?? "",
  }));

  const { error } = await supabase.from("maintenance_tasks").insert(rows);
  if (error) throw new Error(error.message);
}

export const createReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => reportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("reports")
      .insert({
        created_by: userId,
        ...data,
        maintenance_interval_value: intervalValueToInt(data.maintenance_interval_value),
        maintenance_interval_unit: data.maintenance_interval_unit || "months",
        report_date: data.report_date || null,
        date_completed: data.date_completed || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await regenerateTasks(supabase, row.id, userId, data);
    return { id: row.id };
  });


export const listMyReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Forbidden: admin access required");
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Attach the name of the employee who created each report.
    const ids = Array.from(new Set(rows.map((r: any) => r.created_by).filter(Boolean)));
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
    return rows.map((r: any) => ({ ...r, employee_name: nameById[r.created_by] ?? "—" }));
  });

export const updateReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    reportSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { id, ...fields } = data;
    // Determine the responsible employee (the report's original creator).
    const { data: existing } = await supabase
      .from("reports")
      .select("created_by")
      .eq("id", id)
      .single();
    const { error } = await supabase
      .from("reports")
      .update({
        ...fields,
        maintenance_interval_value: intervalValueToInt(fields.maintenance_interval_value),
        maintenance_interval_unit: fields.maintenance_interval_unit || "months",
        report_date: fields.report_date || null,
        date_completed: fields.date_completed || null,
      })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (existing?.created_by) {
      await regenerateTasks(supabase, id, existing.created_by, fields);
    }
    return { ok: true };
  });


export const deleteReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("reports").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Spare parts sales report (admin) ----------

function num(v: any): number {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export const spareParPartsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        start: z.string().max(40).default(""),
        end: z.string().max(40).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!isAdmin) throw new Error("Forbidden: admin access required");

    let query = supabase
      .from("reports")
      .select(
        "id, msr_no, order_no, report_date, created_at, created_by, performed_by, spare_parts",
      );
    // Filter by report date between the two dates (inclusive).
    if (data.start) query = query.gte("report_date", data.start);
    if (data.end) query = query.lte("report_date", data.end);

    const { data: reports, error } = await query.order("report_date", {
      ascending: false,
    });
    if (error) throw new Error(error.message);

    const rows: any[] = [];
    let totalQty = 0;
    let totalAmount = 0;

    for (const r of reports ?? []) {
      const parts = Array.isArray(r.spare_parts) ? r.spare_parts : [];
      for (const p of parts as any[]) {
        const hasContent =
          (p.spare_no && String(p.spare_no).trim()) ||
          (p.description && String(p.description).trim());
        if (!hasContent) continue;
        const qty = num(p.qty);
        const unit = num(p.unit_price);
        const lineTotal = p.total != null && String(p.total).trim() !== "" ? num(p.total) : qty * unit;
        totalQty += qty;
        totalAmount += lineTotal;
        rows.push({
          spare_no: p.spare_no ?? "",
          description: p.description ?? "",
          qty,
          unit_price: unit,
          total: lineTotal,
          msr_no: r.msr_no ?? "",
          order_no: r.order_no ?? "",
          report_date: r.report_date ?? "",
          performed_by: r.performed_by ?? "",
        });
      }
    }

    return { rows, totalQty, totalAmount, count: rows.length };
  });
