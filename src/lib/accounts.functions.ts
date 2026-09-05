import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { assertCan, assertMutable } from "@/lib/permissions";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

// ================================================================ invoices ===

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select(
        "*, invoice_items(*), payments(*), customers(name), projects(project_number, name), job_numbers(job_number)",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const invoiceSchema = z.object({
  id: z.string().uuid().optional(),
  invoice_number: z.string().max(80).default(""),
  customer_id: z.string().uuid().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  job_number_id: z.string().uuid().nullable().default(null),
  quotation_id: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(300),
  invoice_type: z.enum(["advance", "progress", "final", "amc"]).default("final"),
  invoice_date: z.string().nullable().default(null),
  due_date: z.string().nullable().default(null),
  currency: z.string().max(10).default("BHD"),
  discount_amount: z.number().min(0).default(0),
  vat_percent: z.number().min(0).max(100).default(15),
  payment_terms: z.string().max(500).default(""),
  notes: z.string().max(2000).default(""),
  items: z
    .array(
      z.object({
        description: z.string().max(500).default(""),
        unit: z.string().max(40).default("pcs"),
        quantity: z.number().min(0).default(1),
        unit_price: z.number().min(0).default(0),
      }),
    )
    .default([]),
});

export const saveInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => invoiceSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, items, ...fields } = data;

    const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unit_price, 0));
    const net = Math.max(0, subtotal - fields.discount_amount);
    const total = round2(net + (net * fields.vat_percent) / 100);
    const totals = { subtotal, total_amount: total };

    let invoiceId = id;

    if (id) {
      const { data: prev } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
      if (prev && prev.status !== "draft") {
        throw new Error("An issued invoice can no longer be edited — raise a credit/debit note instead.");
      }
      const { error } = await supabase.from("invoices").update({ ...fields, ...totals }).eq("id", id);
      if (error) throw new Error(error.message);
      await supabase.from("invoice_items").delete().eq("invoice_id", id);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "invoices",
        entity_id: id,
        entity_label: fields.title,
        previous_value: prev,
        new_value: { ...fields, ...totals },
      });
    } else {
      await assertCan(supabase, userId, "invoice.create");
      const reference = await nextSequence(supabase, "invoices", "reference", "INV");
      const { data: created, error } = await supabase
        .from("invoices")
        .insert({
          ...fields,
          ...totals,
          reference,
          invoice_number: fields.invoice_number || reference,
          stage: "billing",
          status: "draft",
          created_by: userId,
        })
        .select("id, reference")
        .single();
      if (error) throw new Error(error.message);
      invoiceId = created.id;
      await logActivity(supabase, userId, {
        action: "create",
        entity_table: "invoices",
        entity_id: created.id,
        entity_label: created.reference,
        new_value: { ...fields, ...totals },
      });
    }

    if (items.length && invoiceId) {
      const { error: itemErr } = await supabase.from("invoice_items").insert(
        items.map((i, idx) => ({
          invoice_id: invoiceId,
          sequence: idx + 1,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price,
          amount: round2(i.quantity * i.unit_price),
        })),
      );
      if (itemErr) throw new Error(itemErr.message);
    }

    return { ok: true, id: invoiceId, total_amount: total };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("invoices").select("reference, status").eq("id", data.id).maybeSingle();
    await assertMutable(supabase, userId, {
      approved: (prev?.status ?? "draft") !== "draft",
      label: `Invoice ${prev?.reference ?? ""}`.trim(),
      action: "delete",
    });
    const { error } = await supabase.from("invoices").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "invoices",
      entity_id: data.id,
      entity_label: "Invoice",
    });
    return { ok: true };
  });

/** Issue / follow up / close an invoice and keep the project stage in step. */
export const setInvoiceStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        stage: z.enum(["billing", "payment", "final_review", "closed"]),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", data.id).maybeSingle();
    if (!inv) throw new Error("Invoice not found");

    const patch: { stage: string; status?: string; notes?: string } = { stage: data.stage };
    if (data.stage === "payment") patch.status = "issued";
    if (data.stage === "final_review") patch.status = "under_review";
    if (data.stage === "closed") patch.status = "closed";
    if (data.notes) patch.notes = data.notes;

    const { error } = await supabase.from("invoices").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    if (inv.project_id) {
      await supabase
        .from("projects")
        .update(
          data.stage === "closed"
            ? { stage: "closed", status: "completed", progress_percent: 100 }
            : { stage: data.stage },
        )
        .eq("id", inv.project_id);
    }

    await logActivity(supabase, userId, {
      action: "stage_change",
      entity_table: "invoices",
      entity_id: data.id,
      entity_label: inv.reference,
      previous_value: { stage: inv.stage },
      new_value: { stage: data.stage },
    });

    await notifyDepartments(
      supabase,
      data.stage === "final_review" || data.stage === "closed" ? ["admin"] : ["accounts", "admin"],
      {
        title: `${inv.reference} — ${data.stage.replace(/_/g, " ")}`,
        message: inv.title ?? "",
        category: "accounts",
        link: "/accounts",
        entity_table: "invoices",
        entity_id: data.id,
      },
    );

    return { ok: true };
  });

// ================================================================ payments ===

export const listPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("payments")
      .select("*, invoices(reference, invoice_number, title), customers(name)")
      .order("payment_date", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const recordPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        invoice_id: z.string().uuid(),
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
    const { data: inv } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (!inv) throw new Error("Invoice not found");

    const { error } = await supabase.from("payments").insert({
      invoice_id: data.invoice_id,
      project_id: inv.project_id,
      customer_id: inv.customer_id,
      payment_date: data.payment_date,
      amount: data.amount,
      currency: inv.currency,
      method: data.method,
      reference: data.reference,
      remarks: data.remarks,
      recorded_by: userId,
    });
    if (error) throw new Error(error.message);

    const paid = round2(Number(inv.amount_paid ?? 0) + data.amount);
    const settled = paid + 0.009 >= Number(inv.total_amount ?? 0);
    await supabase
      .from("invoices")
      .update({
        amount_paid: paid,
        status: settled ? "paid" : "partially_paid",
        stage: settled ? "final_review" : "payment",
      })
      .eq("id", data.invoice_id);

    await logActivity(supabase, userId, {
      action: "payment",
      entity_table: "invoices",
      entity_id: data.invoice_id,
      entity_label: inv.reference,
      new_value: { amount: data.amount, method: data.method, paid_to_date: paid },
    });

    if (settled) {
      await notifyDepartments(supabase, ["admin", "accounts"], {
        title: `${inv.reference} fully paid`,
        message: `${paid} ${inv.currency} received — ready for A6 final review`,
        category: "accounts",
        link: "/accounts",
        entity_table: "invoices",
        entity_id: data.invoice_id,
      });
    }

    return { ok: true, amount_paid: paid, settled };
  });

export const deletePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("payments").select("*").eq("id", data.id).maybeSingle();
    const { error } = await supabase.from("payments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    if (row?.invoice_id) {
      const { data: inv } = await supabase
        .from("invoices")
        .select("amount_paid, total_amount")
        .eq("id", row.invoice_id)
        .maybeSingle();
      if (inv) {
        const paid = Math.max(0, round2(Number(inv.amount_paid ?? 0) - Number(row.amount ?? 0)));
        await supabase
          .from("invoices")
          .update({ amount_paid: paid, status: paid > 0 ? "partially_paid" : "issued" })
          .eq("id", row.invoice_id);
      }
    }

    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "payments",
      entity_id: data.id,
      entity_label: "Payment",
    });
    return { ok: true };
  });
