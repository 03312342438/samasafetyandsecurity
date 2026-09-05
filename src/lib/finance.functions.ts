import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { assertCan, myRoles } from "@/lib/permissions";
import { nextSequence } from "@/lib/sequence";
import { CURRENCY } from "@/lib/workflow";

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ============================================================== suppliers ===

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("suppliers")
      .select("*")
      .order("name", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(300),
        contact_person: z.string().max(200).default(""),
        email: z.string().max(200).default(""),
        phone: z.string().max(80).default(""),
        address: z.string().max(500).default(""),
        payment_terms: z.string().max(300).default(""),
        status: z.enum(["active", "inactive"]).default("active"),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    const admin = roles.includes("admin");
    const canCreate = admin || roles.includes("accounts") || roles.includes("project_manager");
    if (!canCreate) {
      throw new Error("Only the Project Manager, Accounts or Management can maintain suppliers.");
    }
    const { id, ...fields } = data;
    if (id) {
      const { data: prev } = await supabase
        .from("suppliers")
        .select("approval_status")
        .eq("id", id)
        .maybeSingle();
      if ((prev as any)?.approval_status === "approved" && !admin) {
        throw new Error("This supplier is approved — only Management can change it.");
      }
      const { error } = await supabase.from("suppliers").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "update", entity_table: "suppliers", entity_id: id, entity_label: fields.name,
      });
      return { ok: true, id };
    }
    const approved = admin;
    const { data: row, error } = await supabase
      .from("suppliers")
      .insert({
        ...fields,
        created_by: userId,
        approval_status: approved ? "approved" : "pending",
        approved_by: approved ? userId : null,
        approved_at: approved ? new Date().toISOString() : null,
      } as any)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "create", entity_table: "suppliers", entity_id: row.id, entity_label: fields.name,
    });
    if (!approved) {
      await supabase.from("approvals").insert({
        approval_type: "supplier",
        entity_table: "suppliers",
        entity_id: row.id,
        title: `Supplier approval — ${fields.name}`,
        details: [fields.contact_person, fields.phone, fields.email, fields.address]
          .filter(Boolean)
          .join(" · "),
        decision: "pending",
        submitted_by: userId,
      } as any);
      await notifyDepartments(supabase, ["admin"], {
        title: "Supplier approval required",
        message: fields.name,
        category: "approval",
        link: "/approvals",
        entity_table: "suppliers",
        entity_id: row.id,
      });
    }
    return { ok: true, id: row.id };
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("admin")) throw new Error("Only Management can delete a supplier.");
    const { error } = await supabase.from("suppliers").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete", entity_table: "suppliers", entity_id: data.id, entity_label: "",
    });
    return { ok: true };
  });


// ====================================================== supplier invoices ===

export const listSupplierInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("supplier_invoices")
      .select("*, suppliers(name), projects(project_number, name), job_numbers(job_number)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveSupplierInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        supplier_id: z.string().uuid().nullable().default(null),
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        invoice_number: z.string().max(120).default(""),
        invoice_date: z.string().nullable().default(null),
        due_date: z.string().nullable().default(null),
        currency: z.string().max(10).default(CURRENCY),
        amount: z.number().min(0).default(0),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "accounts.manage");
    const { id, ...fields } = data;
    if (id) {
      const { error } = await supabase.from("supplier_invoices").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true, id };
    }
    const reference = await nextSequence(supabase, "supplier_invoices", "reference", "SINV");
    const { data: row, error } = await supabase
      .from("supplier_invoices")
      .insert({ ...fields, reference, status: "open", created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Booked straight into project costing when tied to a project/job.
    if (fields.project_id || fields.job_number_id) {
      await supabase.from("project_costs").insert({
        project_id: fields.project_id,
        job_number_id: fields.job_number_id,
        cost_type: "subcontract",
        description: `Supplier invoice ${fields.invoice_number || reference}`,
        amount: fields.amount,
        currency: fields.currency,
        source: "supplier_invoice",
        reference,
        incurred_on: fields.invoice_date ?? new Date().toISOString().slice(0, 10),
        created_by: userId,
      });
    }

    await logActivity(supabase, userId, {
      action: "create", entity_table: "supplier_invoices", entity_id: row.id, entity_label: reference,
      new_value: { amount: fields.amount },
    });
    return { ok: true, id: row.id, reference };
  });

export const recordSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        supplier_invoice_id: z.string().uuid(),
        payment_date: z.string().min(1),
        amount: z.number().min(0.01),
        method: z.enum(["bank_transfer", "cheque", "cash", "card", "other"]).default("bank_transfer"),
        reference: z.string().max(200).default(""),
        remarks: z.string().max(1000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "accounts.manage");
    const { data: inv } = await supabase
      .from("supplier_invoices")
      .select("*")
      .eq("id", data.supplier_invoice_id)
      .maybeSingle();
    if (!inv) throw new Error("Supplier invoice not found");

    const { error } = await supabase.from("supplier_payments").insert({
      supplier_invoice_id: inv.id,
      supplier_id: inv.supplier_id,
      payment_date: data.payment_date,
      amount: data.amount,
      currency: inv.currency,
      method: data.method,
      reference: data.reference,
      remarks: data.remarks,
      approved: false, // management approval required before release
      recorded_by: userId,
    });
    if (error) throw new Error(error.message);

    const paid = round2(num(inv.amount_paid) + data.amount);
    await supabase
      .from("supplier_invoices")
      .update({ amount_paid: paid, status: paid + 0.009 >= num(inv.amount) ? "paid" : "partially_paid" })
      .eq("id", inv.id);

    await notifyDepartments(supabase, ["admin"], {
      title: `Supplier payment awaiting approval`,
      message: `${data.amount} ${inv.currency} against ${inv.reference}`,
      category: "accounts",
      link: "/accounts",
      entity_table: "supplier_invoices",
      entity_id: inv.id,
    });
    await logActivity(supabase, userId, {
      action: "supplier_payment", entity_table: "supplier_invoices", entity_id: inv.id,
      entity_label: inv.reference, new_value: { amount: data.amount },
    });
    return { ok: true, amount_paid: paid };
  });

export const listSupplierPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("supplier_payments")
      .select("*, suppliers(name), supplier_invoices(reference, invoice_number)")
      .order("payment_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const approveSupplierPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      throw new Error("Only Management can approve a supplier payment.");
    }
    const { data: row } = await supabase.from("supplier_payments").select("recorded_by").eq("id", data.id).maybeSingle();
    if (row?.recorded_by === userId) throw new Error("You cannot approve your own transaction.");
    const { error } = await supabase.from("supplier_payments").update({ approved: true }).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "approve", entity_table: "supplier_payments", entity_id: data.id, entity_label: "Supplier payment",
    });
    return { ok: true };
  });

// =========================================================== credit notes ===

export const listCreditNotes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("credit_notes")
      .select("*, customers(name), invoices(reference, invoice_number)")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        note_type: z.enum(["credit", "debit"]).default("credit"),
        invoice_id: z.string().uuid().nullable().default(null),
        customer_id: z.string().uuid().nullable().default(null),
        amount: z.number().min(0.01),
        currency: z.string().max(10).default(CURRENCY),
        reason: z.string().trim().min(1).max(2000),
        note_date: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "accounts.manage");
    const reference = await nextSequence(supabase, "credit_notes", "reference", "CN");
    const { data: row, error } = await supabase
      .from("credit_notes")
      .insert({ ...data, reference, status: "pending", created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await notifyDepartments(supabase, ["admin"], {
      title: `${data.note_type === "credit" ? "Credit" : "Debit"} note ${reference} awaiting approval`,
      message: `${data.amount} ${data.currency} — ${data.reason}`,
      category: "accounts",
      link: "/accounts",
      entity_table: "credit_notes",
      entity_id: row.id,
    });
    await logActivity(supabase, userId, {
      action: "create", entity_table: "credit_notes", entity_id: row.id, entity_label: reference,
    });
    return { ok: true, id: row.id, reference };
  });

export const decideCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), status: z.enum(["approved", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: any) => r.role === "admin")) {
      throw new Error("Only Management can approve credit / debit notes.");
    }
    const { data: note } = await supabase.from("credit_notes").select("*").eq("id", data.id).maybeSingle();
    if (!note) throw new Error("Note not found");
    if (note.created_by === userId) throw new Error("You cannot approve your own transaction.");
    const { error } = await supabase.from("credit_notes").update({ status: data.status }).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (data.status === "approved" && note.invoice_id && note.note_type === "credit") {
      const { data: inv } = await supabase
        .from("invoices")
        .select("total_amount, amount_paid")
        .eq("id", note.invoice_id)
        .maybeSingle();
      if (inv) {
        const total = Math.max(0, round2(num(inv.total_amount) - num(note.amount)));
        await supabase.from("invoices").update({ total_amount: total }).eq("id", note.invoice_id);
      }
    }
    await logActivity(supabase, userId, {
      action: data.status, entity_table: "credit_notes", entity_id: data.id, entity_label: note.reference,
    });
    return { ok: true };
  });

// ========================================================= project costing ===

export const listProjectCosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("project_costs")
      .select("*, projects(project_number, name), job_numbers(job_number)")
      .order("incurred_on", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const addProjectCost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        cost_type: z.enum(["material", "labour", "subcontract", "transport", "other"]).default("other"),
        description: z.string().max(500).default(""),
        amount: z.number().min(0),
        currency: z.string().max(10).default(CURRENCY),
        reference: z.string().max(200).default(""),
        incurred_on: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "accounts.manage");
    const { error } = await supabase
      .from("project_costs")
      .insert({ ...data, source: "manual", created_by: userId });
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "create", entity_table: "project_costs", entity_id: data.project_id,
      entity_label: data.description, new_value: { amount: data.amount },
    });
    return { ok: true };
  });

// ============================================================== dashboard ===

/** KPIs, receivables aging, customer balances and project profitability. */
export const financeSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [inv, pay, sinv, spay, costs, projects] = await Promise.all([
      supabase.from("invoices").select("id, reference, customer_id, project_id, total_amount, amount_paid, due_date, status, stage, customers(name)").limit(1000),
      supabase.from("payments").select("amount, payment_date").limit(1000),
      supabase.from("supplier_invoices").select("amount, amount_paid, status").limit(1000),
      supabase.from("supplier_payments").select("amount, approved, payment_date").limit(1000),
      supabase.from("project_costs").select("project_id, amount, cost_type").limit(2000),
      supabase.from("projects").select("id, project_number, name, contract_value, estimated_cost, status").limit(500),
    ]);

    const invoices = (inv.data ?? []) as any[];
    const invoiced = round2(invoices.reduce((s, i) => s + num(i.total_amount), 0));
    const collected = round2(invoices.reduce((s, i) => s + num(i.amount_paid), 0));
    const outstanding = round2(invoiced - collected);

    const today = new Date();
    const buckets = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, d120_plus: 0 };
    let overdue = 0;
    for (const i of invoices) {
      const bal = num(i.total_amount) - num(i.amount_paid);
      if (bal <= 0.009) continue;
      const due = i.due_date ? new Date(`${i.due_date}T00:00:00`) : null;
      const days = due ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0;
      if (days > 0) overdue += bal;
      if (days <= 0) buckets.current += bal;
      else if (days <= 30) buckets.d1_30 += bal;
      else if (days <= 60) buckets.d31_60 += bal;
      else if (days <= 90) buckets.d61_90 += bal;
      else if (days <= 120) buckets.d91_120 += bal;
      else buckets.d120_plus += bal;
    }
    (Object.keys(buckets) as (keyof typeof buckets)[]).forEach((k) => (buckets[k] = round2(buckets[k])));

    const supplierInvoices = (sinv.data ?? []) as any[];
    const payables = round2(
      supplierInvoices.reduce((s, i) => s + Math.max(0, num(i.amount) - num(i.amount_paid)), 0),
    );
    const supplierPaid = round2(((spay.data ?? []) as any[]).reduce((s, p) => s + num(p.amount), 0));
    const pendingSupplierApprovals = ((spay.data ?? []) as any[]).filter((p) => !p.approved).length;

    const costRows = (costs.data ?? []) as any[];
    const totalCost = round2(costRows.reduce((s, c) => s + num(c.amount), 0));

    const costByProject = new Map<string, number>();
    costRows.forEach((c) => {
      if (!c.project_id) return;
      costByProject.set(c.project_id, round2((costByProject.get(c.project_id) ?? 0) + num(c.amount)));
    });
    const paidByProject = new Map<string, number>();
    invoices.forEach((i) => {
      if (!i.project_id) return;
      paidByProject.set(i.project_id, round2((paidByProject.get(i.project_id) ?? 0) + num(i.amount_paid)));
    });

    const projectProfitability = ((projects.data ?? []) as any[]).map((p) => {
      const revenue = num(p.contract_value);
      const cost = costByProject.get(p.id) ?? 0;
      const budget = num(p.estimated_cost);
      return {
        id: p.id,
        project_number: p.project_number,
        name: p.name,
        status: p.status,
        revenue,
        budget,
        cost,
        collected: paidByProject.get(p.id) ?? 0,
        profit: round2(revenue - cost),
        margin: revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : 0,
        budget_variance: round2(budget - cost),
      };
    });

    const balances = new Map<string, { name: string; invoiced: number; paid: number }>();
    invoices.forEach((i) => {
      if (!i.customer_id) return;
      const cur = balances.get(i.customer_id) ?? { name: i.customers?.name ?? "—", invoiced: 0, paid: 0 };
      cur.invoiced = round2(cur.invoiced + num(i.total_amount));
      cur.paid = round2(cur.paid + num(i.amount_paid));
      balances.set(i.customer_id, cur);
    });
    const customerBalances = [...balances.entries()]
      .map(([id, v]) => ({ id, ...v, outstanding: round2(v.invoiced - v.paid) }))
      .sort((a, b) => b.outstanding - a.outstanding);

    const cashIn = round2(((pay.data ?? []) as any[]).reduce((s, p) => s + num(p.amount), 0));

    const readyForBilling = invoices.filter((i) => i.stage === "billing").length;
    const profit = round2(collected - totalCost);

    return {
      currency: CURRENCY,
      kpis: {
        invoiced,
        collected,
        outstanding,
        overdue: round2(overdue),
        payables,
        supplierPaid,
        projectCost: totalCost,
        profit,
        margin: collected > 0 ? round2((profit / collected) * 100) : 0,
        cashFlow: round2(cashIn - supplierPaid),
        pendingApprovals: pendingSupplierApprovals,
        readyForBilling,
      },
      aging: buckets,
      customerBalances,
      projectProfitability,
    };
  });
