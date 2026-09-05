import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: management access required");
}

const sum = (rows: any[], key: string) =>
  (rows ?? []).reduce((acc, r) => acc + Number(r?.[key] ?? 0), 0);

const countBy = (rows: any[], key: string) => {
  const map: Record<string, number> = {};
  (rows ?? []).forEach((r) => {
    const k = String(r?.[key] ?? "—");
    map[k] = (map[k] ?? 0) + 1;
  });
  return Object.entries(map)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
};

/**
 * Full management overview: pipeline value, order intake, billing, cash and
 * live project progress. Read-only aggregation across the workflow modules.
 */
export const getManagementOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const [
      inquiriesRes,
      quotationsRes,
      posRes,
      projectsRes,
      jobsRes,
      invoicesRes,
      paymentsRes,
      approvalsRes,
      materialsRes,
      progressRes,
      customersRes,
    ] = await Promise.all([
      supabase.from("inquiries").select("id, stage, status, created_at"),
      supabase
        .from("quotations")
        .select("id, reference, title, stage, status, total_amount, estimated_cost, currency, created_at"),
      supabase.from("customer_pos").select("id, po_value, verification_status, stage, currency, created_at"),
      supabase
        .from("projects")
        .select(
          "id, project_number, name, stage, status, progress_percent, contract_value, estimated_cost, currency, site_location, target_date, completed_date, customer_id",
        )
        .order("created_at", { ascending: false }),
      supabase.from("job_numbers").select("id, status, progress_percent"),
      supabase
        .from("invoices")
        .select("id, invoice_number, title, stage, status, total_amount, amount_paid, currency, due_date, created_at, project_id")
        .order("created_at", { ascending: false }),
      supabase.from("payments").select("id, amount, payment_date, currency, project_id"),
      supabase.from("approvals").select("id, approval_type, decision, amount, title, created_at"),
      supabase.from("material_requests").select("id, status, stage"),
      supabase.from("daily_progress").select("id, log_date, hours_worked, manpower_count, progress_percent"),
      supabase.from("customers").select("id, name"),
    ]);


    for (const r of [
      inquiriesRes,
      quotationsRes,
      posRes,
      projectsRes,
      jobsRes,
      invoicesRes,
      paymentsRes,
      approvalsRes,
      materialsRes,
      progressRes,
      customersRes,
    ]) {
      if (r.error) throw new Error(r.error.message);
    }

    const inquiries = inquiriesRes.data ?? [];
    const quotations = quotationsRes.data ?? [];
    const pos = posRes.data ?? [];
    const projects = projectsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const approvals = approvalsRes.data ?? [];
    const materials = materialsRes.data ?? [];
    const progress = progressRes.data ?? [];
    const customers = customersRes.data ?? [];

    const customerNames = new Map(customers.map((c: any) => [c.id, c.name]));

    const openQuotations = quotations.filter(
      (q: any) => !["closed", "customer_accepted", "rejected"].includes(q.stage),
    );
    const wonQuotations = quotations.filter((q: any) => q.stage === "customer_accepted");

    const invoicedTotal = sum(invoices, "total_amount");
    const collectedTotal = sum(invoices, "amount_paid");
    const contractValue = sum(projects, "contract_value");
    const estimatedCost = sum(projects, "estimated_cost");

    const activeProjects = projects.filter(
      (p: any) => !["closed", "final_review"].includes(p.stage),
    );

    const currency = (quotations[0] as any)?.currency || (projects[0] as any)?.currency || "BHD";

    return {
      currency,
      kpis: {
        inquiries: inquiries.length,
        openQuotationValue: sum(openQuotations, "total_amount"),
        openQuotationCount: openQuotations.length,
        wonQuotationValue: sum(wonQuotations, "total_amount"),
        winRate: quotations.length ? Math.round((wonQuotations.length / quotations.length) * 100) : 0,
        orderIntake: sum(pos, "po_value"),
        orderCount: pos.length,
        contractValue,
        estimatedCost,
        grossMargin: contractValue - estimatedCost,
        marginPercent: contractValue ? Math.round(((contractValue - estimatedCost) / contractValue) * 100) : 0,
        invoicedTotal,
        collectedTotal,
        outstanding: invoicedTotal - collectedTotal,
        paymentsReceived: sum(payments, "amount"),
        activeProjects: activeProjects.length,
        totalProjects: projects.length,
        activeJobs: jobs.filter((j: any) => j.status !== "completed").length,
        avgProgress: activeProjects.length
          ? Math.round(sum(activeProjects, "progress_percent") / activeProjects.length)
          : 0,
        pendingApprovals: approvals.filter((a: any) => a.decision === "pending").length,
        openMaterialRequests: materials.filter((m: any) => m.status !== "issued").length,
        manpowerLogged: sum(progress, "manpower_count"),
        hoursLogged: sum(progress, "hours_worked"),
        customers: customers.length,
      },
      pipelineByStage: countBy(quotations, "stage"),
      projectsByStage: countBy(projects, "stage"),
      approvalsByType: countBy(
        approvals.filter((a: any) => a.decision === "pending"),
        "approval_type",
      ),
      projectProgress: projects.map((p: any) => {
        const paid =
          payments
            .filter((x: any) => x.project_id === p.id)
            .reduce((a: number, x: any) => a + Number(x.amount ?? 0), 0) ||
          invoices
            .filter((x: any) => x.project_id === p.id)
            .reduce((a: number, x: any) => a + Number(x.amount_paid ?? 0), 0);
        return {
          id: p.id,
          project_number: p.project_number,
          name: p.name,
          customer: customerNames.get(p.customer_id) ?? "—",
          stage: p.stage,
          status: p.status,
          progress_percent: p.progress_percent ?? 0,
          contract_value: Number(p.contract_value ?? 0),
          paid,
          outstanding: Number(p.contract_value ?? 0) - paid,
        };
      }),
      topProjects: activeProjects.slice(0, 8).map((p: any) => ({
        id: p.id,
        project_number: p.project_number,
        name: p.name,
        customer: customerNames.get(p.customer_id) ?? "—",
        stage: p.stage,
        progress_percent: p.progress_percent ?? 0,
        contract_value: Number(p.contract_value ?? 0),
        estimated_cost: Number(p.estimated_cost ?? 0),
        site_location: p.site_location,
        target_date: p.target_date,
      })),
      recentInvoices: invoices.slice(0, 8).map((i: any) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        title: i.title,
        stage: i.stage,
        status: i.status,
        total_amount: Number(i.total_amount ?? 0),
        amount_paid: Number(i.amount_paid ?? 0),
        due_date: i.due_date,
      })),
      recentQuotations: quotations.slice(0, 8).map((q: any) => ({
        id: q.id,
        reference: q.reference,
        title: q.title,
        stage: q.stage,
        total_amount: Number(q.total_amount ?? 0),
        estimated_cost: Number(q.estimated_cost ?? 0),
      })),
    };
  });
