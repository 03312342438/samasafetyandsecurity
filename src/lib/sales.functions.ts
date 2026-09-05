import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { assertMutable } from "@/lib/permissions";

// ================================================================ inquiries ==

export const listInquiries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("inquiries")
      .select("*, customers(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        customer_id: z.string().uuid().nullable().default(null),
        contact_person: z.string().max(200).default(""),
        contact_email: z.string().max(320).default(""),
        contact_phone: z.string().max(60).default(""),
        site_location: z.string().max(500).default(""),
        scope_type: z.string().max(120).default("installation"),
        requirement_details: z.string().max(4000).default(""),
        source: z.string().max(120).default("direct"),
        received_date: z.string().max(40).default(""),
        target_date: z.string().max(40).nullable().default(null),
        stage: z.string().max(60).default("inquiry"),
        status: z.string().max(40).default("open"),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...raw } = data;
    const fields = {
      ...raw,
      received_date: raw.received_date || new Date().toISOString().slice(0, 10),
      target_date: raw.target_date || null,
    };

    if (id) {
      const { data: prev } = await supabase.from("inquiries").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("inquiries").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "inquiries",
        entity_id: id,
        entity_label: prev?.reference ?? "",
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const reference = await nextSequence(supabase, "inquiries", "reference", "INQ");
    const { data: created, error } = await supabase
      .from("inquiries")
      .insert({ ...fields, reference, assigned_to: userId, created_by: userId })
      .select("id, reference")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "inquiries",
      entity_id: created.id,
      entity_label: created.reference,
      new_value: fields,
    });
    return { ok: true, id: created.id, reference: created.reference };
  });

export const deleteInquiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("inquiries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "inquiries",
      entity_id: data.id,
    });
    return { ok: true };
  });

// =============================================================== quotations ==

export const listQuotations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("quotations")
      .select("*, customers(name), inquiries(reference), quotation_items(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const itemSchema = z.object({
  description: z.string().max(500).default(""),
  unit: z.string().max(40).default("nos"),
  quantity: z.number().min(0).default(1),
  unit_price: z.number().min(0).default(0),
});

function totals(
  items: { quantity: number; unit_price: number }[],
  discount: number,
  vatPercent: number,
) {
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const net = Math.max(subtotal - discount, 0);
  const total = net + (net * vatPercent) / 100;
  return { subtotal: round2(subtotal), total: round2(total) };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Create or update a quotation together with its priced line items. */
export const saveQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        inquiry_id: z.string().uuid().nullable().default(null),
        customer_id: z.string().uuid().nullable().default(null),
        title: z.string().max(300).default(""),
        site_location: z.string().max(500).default(""),
        currency: z.string().max(10).default("BHD"),
        discount_amount: z.number().min(0).default(0),
        vat_percent: z.number().min(0).max(100).default(15),
        estimated_cost: z.number().min(0).default(0),
        validity_days: z.number().int().min(0).max(365).default(30),
        payment_terms: z.string().max(500).default(""),
        delivery_terms: z.string().max(500).default(""),
        scope_notes: z.string().max(4000).default(""),
        stage: z.string().max(60).default("quotation_draft"),
        status: z.string().max(40).default("draft"),
        items: z.array(itemSchema).default([]),
        // Sales cost build-up (preliminary BOM driven)
        bom_id: z.string().uuid().nullable().default(null),
        material_cost: z.number().min(0).default(0),
        labour_cost: z.number().min(0).default(0),
        inland_percent: z.number().min(0).max(100).default(0),
        transport_cost: z.number().min(0).default(0),
        margin_percent: z.number().min(0).max(100).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, items, ...raw } = data;

    const inland_cost = round2((raw.material_cost * raw.inland_percent) / 100);
    const costBase = raw.material_cost + raw.labour_cost + inland_cost + raw.transport_cost;
    const buildUp = costBase > 0;

    const lineTotals = totals(items, raw.discount_amount, raw.vat_percent);
    const miscSubtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const subtotal = buildUp
      ? round2(costBase * (1 + raw.margin_percent / 100) + miscSubtotal)
      : lineTotals.subtotal;
    const net = Math.max(subtotal - raw.discount_amount, 0);
    const total = buildUp ? round2(net + (net * raw.vat_percent) / 100) : lineTotals.total;

    const fields = {
      ...raw,
      inland_cost,
      estimated_cost: buildUp ? round2(costBase + miscSubtotal) : round2(miscSubtotal),
      subtotal,
      total_amount: total,
    };

    let quotationId = id;
    let reference: string;

    if (id) {
      const { data: prev } = await supabase.from("quotations").select("*").eq("id", id).maybeSingle();
      await assertMutable(supabase, userId, {
        approved: ["approved", "accepted", "won"].includes(prev?.status ?? ""),
        label: `Quotation ${prev?.reference ?? ""}`.trim(),
      });
      const { error } = await supabase.from("quotations").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      reference = prev?.reference ?? "";
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "quotations",
        entity_id: id,
        entity_label: reference,
        previous_value: prev,
        new_value: fields,
      });
    } else {
      reference = await nextSequence(supabase, "quotations", "reference", "QTN");
      const { data: created, error } = await supabase
        .from("quotations")
        .insert({ ...fields, reference, created_by: userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      quotationId = created.id;
      await logActivity(supabase, userId, {
        action: "create",
        entity_table: "quotations",
        entity_id: created.id,
        entity_label: reference,
        new_value: fields,
      });
    }

    // Replace the line items with the submitted set.
    await supabase.from("quotation_items").delete().eq("quotation_id", quotationId!);
    if (items.length > 0) {
      const { error: itemError } = await supabase.from("quotation_items").insert(
        items.map((i, index) => ({
          quotation_id: quotationId!,
          sequence: index + 1,
          description: i.description,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: i.unit_price,
          amount: round2(i.quantity * i.unit_price),
        })),
      );
      if (itemError) throw new Error(itemError.message);
    }

    if (data.inquiry_id) {
      await supabase.from("inquiries").update({ stage: "quotation_draft" }).eq("id", data.inquiry_id);
    }

    return { ok: true, id: quotationId!, reference, subtotal, total };
  });

/** Move a quotation along the sales chain and notify the right department. */
export const setQuotationStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        stage: z.enum([
          "quotation_draft",
          "technical_review",
          "quotation_approval",
          "quotation_sent",
          "follow_up",
          "negotiation",
          "customer_accepted",
        ]),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: quotation } = await supabase
      .from("quotations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!quotation) throw new Error("Quotation not found");

    const statusByStage: Record<string, string> = {
      quotation_draft: "draft",
      technical_review: "in_review",
      quotation_approval: "pending",
      quotation_sent: "sent",
      follow_up: "sent",
      negotiation: "revision",
      customer_accepted: "accepted",
    };

    const patch = {
      stage: data.stage,
      status: statusByStage[data.stage] ?? quotation.status,
      decision_notes: data.notes || quotation.decision_notes,
      ...(data.stage === "quotation_sent" && !quotation.sent_at
        ? { sent_at: new Date().toISOString() }
        : {}),
      ...(data.stage === "negotiation" ? { revision: (quotation.revision ?? 0) + 1 } : {}),
    };

    const { error } = await supabase.from("quotations").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: `quotation_${data.stage}`,
      entity_table: "quotations",
      entity_id: data.id,
      entity_label: quotation.reference,
      previous_value: { stage: quotation.stage },
      new_value: patch,
    });

    if (data.stage === "technical_review") {
      await notifyDepartments(supabase, ["project_manager"], {
        title: "Technical review requested",
        message: `${quotation.reference} needs a technical review.`,
        category: "sales",
        link: "/sales",
        entity_table: "quotations",
        entity_id: data.id,
      });
    }
    if (data.stage === "customer_accepted") {
      await notifyDepartments(supabase, ["admin", "project_manager"], {
        title: "Quotation accepted",
        message: `${quotation.reference} was accepted by the customer.`,
        category: "sales",
        link: "/sales",
        entity_table: "quotations",
        entity_id: data.id,
      });
    }

    if (quotation.inquiry_id) {
      await supabase.from("inquiries").update({ stage: data.stage }).eq("id", quotation.inquiry_id);
    }

    return { ok: true };
  });

export const deleteQuotation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("quotations").select("reference, status").eq("id", data.id).maybeSingle();
    await assertMutable(supabase, userId, {
      approved: ["approved", "accepted", "won"].includes(prev?.status ?? ""),
      label: `Quotation ${prev?.reference ?? ""}`.trim(),
      action: "delete",
    });
    const { error } = await supabase.from("quotations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "quotations",
      entity_id: data.id,
    });
    return { ok: true };
  });

// ========================================================== customer orders ==

export const listCustomerPos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customer_pos")
      .select("*, customers(name), quotations(reference, total_amount, title, boms(title)), projects(project_number)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveCustomerPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        po_number: z.string().max(120).default(""),
        po_date: z.string().max(40).nullable().default(null),
        po_value: z.number().min(0).default(0),
        currency: z.string().max(10).default("BHD"),
        quotation_id: z.string().uuid().nullable().default(null),
        customer_id: z.string().uuid().nullable().default(null),
        document_url: z.string().max(1000).default(""),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...raw } = data;
    const fields = { ...raw, po_date: raw.po_date || null };

    if (id) {
      const { data: prevPo } = await supabase
        .from("customer_pos")
        .select("po_number, verification_status")
        .eq("id", id)
        .maybeSingle();
      const { data: approvedReq } = await supabase
        .from("approvals")
        .select("id")
        .eq("entity_table", "customer_pos")
        .eq("entity_id", id)
        .eq("decision", "approved")
        .limit(1)
        .maybeSingle();
      await assertMutable(supabase, userId, {
        approved: prevPo?.verification_status === "verified" || !!approvedReq,
        label: `PO ${prevPo?.po_number ?? ""}`.trim(),
      });
      const { error } = await supabase.from("customer_pos").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "customer_pos",
        entity_id: id,
        entity_label: fields.po_number,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const reference = await nextSequence(supabase, "customer_pos", "reference", "PO");
    const { data: created, error } = await supabase
      .from("customer_pos")
      .insert({ ...fields, reference, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "customer_pos",
      entity_id: created.id,
      entity_label: fields.po_number || reference,
      new_value: fields,
    });
    await notifyDepartments(supabase, ["admin", "project_manager"], {
      title: "Customer PO received",
      message: `${fields.po_number || reference} is waiting for verification.`,
      category: "sales",
      link: "/sales",
      entity_table: "customer_pos",
      entity_id: created.id,
    });
    return { ok: true, id: created.id, reference };
  });

/** PO verification gate — nothing may move to project initiation until verified. */
export const verifyCustomerPo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        verification_status: z.enum(["verified", "clarification_required", "rejected"]),
        discrepancy_notes: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: po } = await supabase
      .from("customer_pos")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!po) throw new Error("Customer PO not found");

    if (data.verification_status !== "verified" && !data.discrepancy_notes.trim()) {
      throw new Error("Please record what needs clarification.");
    }

    const stage =
      data.verification_status === "verified"
        ? "po_verification"
        : data.verification_status === "clarification_required"
          ? "clarification_required"
          : "po_received";

    const { error } = await supabase
      .from("customer_pos")
      .update({
        verification_status: data.verification_status,
        discrepancy_notes: data.discrepancy_notes,
        verified_by: userId,
        verified_at: new Date().toISOString(),
        stage,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await logActivity(supabase, userId, {
      action: `po_${data.verification_status}`,
      entity_table: "customer_pos",
      entity_id: data.id,
      entity_label: po.po_number || po.reference,
      previous_value: { verification_status: po.verification_status },
      new_value: { verification_status: data.verification_status, notes: data.discrepancy_notes },
    });
    await notifyDepartments(supabase, ["sales", "admin"], {
      title: `Customer PO ${data.verification_status.replace(/_/g, " ")}`,
      message: po.po_number || po.reference,
      category: "sales",
      link: "/sales",
      entity_table: "customer_pos",
      entity_id: data.id,
    });

    return { ok: true };
  });

/**
 * Convert a verified customer PO into a project.
 * Requires the A2 (project initiation) approval to be approved first.
 */
export const convertPoToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(300) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: po } = await supabase
      .from("customer_pos")
      .select("*, quotations(reference, site_location, estimated_cost)")
      .eq("id", data.id)
      .maybeSingle();
    if (!po) throw new Error("Customer PO not found");
    if (po.project_id) throw new Error("This PO is already linked to a project.");
    if (po.verification_status !== "verified")
      throw new Error("Verify the customer PO before initiating a project.");

    const { data: approval } = await supabase
      .from("approvals")
      .select("id, decision")
      .eq("approval_type", "project_initiation")
      .eq("entity_id", data.id)
      .eq("decision", "approved")
      .maybeSingle();
    if (!approval)
      throw new Error("Management approval (A2 — Project Initiation) is required for this PO.");

    const project_number = await nextSequence(supabase, "projects", "project_number", "PRJ");
    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        project_number,
        name: data.name,
        customer_id: po.customer_id,
        site_location: (po as any).quotations?.site_location ?? "",
        stage: "project_initiated",
        status: "active",
        contract_value: po.po_value,
        currency: po.currency,
        estimated_cost: (po as any).quotations?.estimated_cost ?? 0,
        created_by: userId,
      })
      .select("id, project_number")
      .single();
    if (error) throw new Error(error.message);

    await supabase
      .from("customer_pos")
      .update({ project_id: project.id, stage: "project_initiated" })
      .eq("id", data.id);

    await logActivity(supabase, userId, {
      action: "project_initiated",
      entity_table: "projects",
      entity_id: project.id,
      entity_label: project.project_number,
      new_value: { from_po: po.reference },
    });
    await notifyDepartments(supabase, ["project_manager", "admin"], {
      title: "Project initiated",
      message: `${project.project_number} — ${data.name}`,
      category: "project",
      link: "/projects",
      entity_table: "projects",
      entity_id: project.id,
    });

    return { ok: true, id: project.id, project_number: project.project_number };
  });
