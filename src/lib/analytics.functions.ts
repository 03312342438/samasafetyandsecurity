import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const num = (v: unknown) => Number(v ?? 0) || 0;

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastTwelveMonths() {
  const out: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      key: monthKey(d),
      label: d.toLocaleString("en", { month: "short", year: "2-digit", timeZone: "UTC" }),
    });
  }
  return out;
}

const keyOf = (value: string | null | undefined) =>
  value ? monthKey(new Date(value)) : "";

const QUOTED_STAGES = [
  "quotation_sent",
  "follow_up",
  "negotiation",
  "customer_accepted",
  "po_received",
  "po_verification",
];

const DONE_STAGES = ["final_review", "closed"];

/**
 * Cross-module analytics used by the Management and Sales dashboards:
 * current-month split by count and by value, plus 12-month trends of
 * quotation volume, completed projects and gross margin.
 */
export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role as string);
    if (!roles.includes("admin") && !roles.includes("sales")) {
      throw new Error("Forbidden: analytics are available to Management and Sales.");
    }

    const [quotationsRes, projectsRes] = await Promise.all([
      supabase
        .from("quotations")
        .select("id, stage, total_amount, estimated_cost, created_at, sent_at"),
      supabase
        .from("projects")
        .select("id, stage, status, contract_value, estimated_cost, created_at, completed_date, updated_at"),
    ]);
    if (quotationsRes.error) throw new Error(quotationsRes.error.message);
    if (projectsRes.error) throw new Error(projectsRes.error.message);

    const quotations = quotationsRes.data ?? [];
    const projects = projectsRes.data ?? [];

    const months = lastTwelveMonths();
    const thisMonth = monthKey(new Date());

    // ---- current month split -------------------------------------------
    const quotedThisMonth = quotations.filter(
      (q: any) =>
        QUOTED_STAGES.includes(q.stage) && keyOf(q.sent_at ?? q.created_at) === thisMonth,
    );
    const inProgress = projects.filter(
      (p: any) => !DONE_STAGES.includes(p.stage) && p.status !== "closed",
    );
    const completedThisMonth = projects.filter(
      (p: any) =>
        (DONE_STAGES.includes(p.stage) || p.status === "closed") &&
        keyOf(p.completed_date ?? p.updated_at) === thisMonth,
    );

    const currentMonthCounts = [
      { name: "Quotation sent", value: quotedThisMonth.length },
      { name: "In installation / maintenance", value: inProgress.length },
      { name: "Completed", value: completedThisMonth.length },
    ];
    const currentMonthValues = [
      { name: "Quotation sent", value: quotedThisMonth.reduce((a, q: any) => a + num(q.total_amount), 0) },
      { name: "In installation / maintenance", value: inProgress.reduce((a, p: any) => a + num(p.contract_value), 0) },
      { name: "Completed", value: completedThisMonth.reduce((a, p: any) => a + num(p.contract_value), 0) },
    ];

    // ---- 12 month trends -------------------------------------------------
    const monthly = months.map(({ key, label }) => {
      const qs = quotations.filter((q: any) => keyOf(q.sent_at ?? q.created_at) === key);
      const done = projects.filter(
        (p: any) =>
          (DONE_STAGES.includes(p.stage) || p.status === "closed") &&
          keyOf(p.completed_date ?? p.updated_at) === key,
      );
      const completedValue = done.reduce((a, p: any) => a + num(p.contract_value), 0);
      const completedCost = done.reduce((a, p: any) => a + num(p.estimated_cost), 0);
      return {
        month: label,
        quotations: qs.length,
        completed: done.length,
        quotedValue: qs.reduce((a, q: any) => a + num(q.total_amount), 0),
        completedValue,
        grossMargin: completedValue - completedCost,
      };
    });

    return {
      month: new Date().toLocaleString("en", { month: "long", year: "numeric" }),
      currentMonthCounts,
      currentMonthValues,
      monthly,
    };
  });
