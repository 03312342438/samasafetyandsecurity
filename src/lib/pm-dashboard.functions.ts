import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { myRoles } from "@/lib/permissions";

/**
 * Project delivery dashboard for Project Managers (and Management).
 * Read-only aggregation: live projects with auto-calculated progress,
 * invoiced vs paid money, and projects completed in the recent months.
 */
export const getProjectDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("admin") && !roles.includes("project_manager")) {
      throw new Error("Only Management and Project Managers can view the project dashboard.");
    }

    const [projectsRes, jobsRes, invoicesRes, paymentsRes, customersRes] = await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, project_number, name, stage, status, progress_percent, contract_value, estimated_cost, currency, site_location, start_date, target_date, completed_date, customer_id, created_at",
        )
        .order("created_at", { ascending: false }),
      supabase.from("job_numbers").select("id, project_id, status, progress_percent"),
      supabase.from("invoices").select("id, project_id, total_amount, amount_paid, status, stage"),
      supabase.from("payments").select("id, project_id, amount, payment_date"),
      supabase.from("customers").select("id, name"),
    ]);

    for (const r of [projectsRes, jobsRes, invoicesRes, paymentsRes, customersRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const projects = projectsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const invoices = invoicesRes.data ?? [];
    const payments = paymentsRes.data ?? [];
    const customers = customersRes.data ?? [];
    const names = new Map(customers.map((c: any) => [c.id, c.name]));
    const currency = (projects[0] as any)?.currency || "BHD";

    const isDone = (p: any) =>
      p.stage === "closed" || p.status === "completed" || !!p.completed_date;

    const rows = projects.map((p: any) => {
      const pJobs = jobs.filter((j: any) => j.project_id === p.id);
      const jobProgress = pJobs.length
        ? Math.round(
            pJobs.reduce((a: number, j: any) => a + Number(j.progress_percent ?? 0), 0) / pJobs.length,
          )
        : null;
      const progress = isDone(p) ? 100 : (jobProgress ?? Number(p.progress_percent ?? 0));
      const pInv = invoices.filter((i: any) => i.project_id === p.id);
      const invoiced = pInv.reduce((a: number, i: any) => a + Number(i.total_amount ?? 0), 0);
      const paidFromInvoices = pInv.reduce((a: number, i: any) => a + Number(i.amount_paid ?? 0), 0);
      const paidFromPayments = payments
        .filter((x: any) => x.project_id === p.id)
        .reduce((a: number, x: any) => a + Number(x.amount ?? 0), 0);
      const paid = Math.max(paidFromInvoices, paidFromPayments);
      return {
        id: p.id,
        project_number: p.project_number,
        name: p.name,
        customer: names.get(p.customer_id) ?? "—",
        site_location: p.site_location ?? "",
        stage: p.stage,
        status: p.status,
        progress,
        contract_value: Number(p.contract_value ?? 0),
        estimated_cost: Number(p.estimated_cost ?? 0),
        invoiced,
        paid,
        outstanding: invoiced - paid,
        jobs: pJobs.length,
        target_date: p.target_date,
        completed_date: p.completed_date,
        completed: isDone(p),
        completed_at: p.completed_date ?? (isDone(p) ? p.created_at : null),
      };
    });

    const ongoing = rows.filter((r) => !r.completed);
    const completed = rows.filter((r) => r.completed);

    // Completed counts per month for the last 12 months.
    const now = new Date();
    const monthly: { key: string; label: string; count: number; value: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const rowsIn = completed.filter((r) => (r.completed_at ?? "").slice(0, 7) === key);
      monthly.push({
        key,
        label: d.toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }),
        count: rowsIn.length,
        value: rowsIn.reduce((a, r) => a + r.contract_value, 0),
      });
    }

    return {
      currency,
      projects: rows,
      ongoing,
      completed,
      monthlyCompleted: monthly,
      totals: {
        ongoing: ongoing.length,
        completed: completed.length,
        avgProgress: ongoing.length
          ? Math.round(ongoing.reduce((a, r) => a + r.progress, 0) / ongoing.length)
          : 0,
        contractValue: rows.reduce((a, r) => a + r.contract_value, 0),
        invoiced: rows.reduce((a, r) => a + r.invoiced, 0),
        paid: rows.reduce((a, r) => a + r.paid, 0),
        outstanding: rows.reduce((a, r) => a + r.outstanding, 0),
        activeJobs: jobs.filter((j: any) => j.status !== "completed").length,
      },
    };
  });
