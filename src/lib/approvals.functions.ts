import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments, notifyUsers } from "@/lib/activity";
import { applyStockLotDecision } from "@/lib/lots.functions";
import { applyStockReleaseDecision } from "@/lib/releases.functions";


export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("approvals")
      .select("*, projects(project_number, name), job_numbers(job_number)")
      .order("submitted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Full detail of the record a request is attached to, for the approver. */
export const getApprovalEntity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: approval } = await supabase
      .from("approvals")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!approval) throw new Error("Approval not found");
    if (!approval.entity_id) return { kind: "none" as const, approval };

    if (approval.entity_table === "quotations") {
      const [{ data: quotation }, { data: items }] = await Promise.all([
        supabase
          .from("quotations")
          .select("*, customers(name, customer_number)")
          .eq("id", approval.entity_id)
          .maybeSingle(),
        supabase
          .from("quotation_items")
          .select("*")
          .eq("quotation_id", approval.entity_id)
          .order("sequence"),
      ]);

      // Preliminary BOM/BOS lines linked to this quotation.
      let bom: any = null;
      let bomItems: any[] = [];
      if (quotation?.bom_id) {
        const [{ data: b }, { data: bi }] = await Promise.all([
          supabase.from("boms").select("reference, title, estimated_cost, currency").eq("id", quotation.bom_id).maybeSingle(),
          supabase
            .from("bom_items")
            .select("*, stock_items(item_code, description)")
            .eq("bom_id", quotation.bom_id)
            .order("sequence"),
        ]);
        bom = b;
        bomItems = bi ?? [];
      }

      // Project linked to the approval request (or to the quotation's inquiry chain).
      let project: any = null;
      if (approval.project_id) {
        const { data: p } = await supabase
          .from("projects")
          .select("project_number, name, site_location")
          .eq("id", approval.project_id)
          .maybeSingle();
        project = p;
      }

      return { kind: "quotation" as const, approval, quotation, items: items ?? [], bom, bomItems, project };
    }
    if (approval.entity_table === "customer_pos") {
      const { data: po } = await supabase
        .from("customer_pos")
        .select("*, customers(name, customer_number), quotations(reference, total_amount)")
        .eq("id", approval.entity_id)
        .maybeSingle();
      return { kind: "customer_po" as const, approval, po };
    }
    if (approval.entity_table === "stock_lots") {
      const { data: lot } = await supabase
        .from("stock_lots")
        .select("*, stock_lot_items(*, stock_items(item_code, description, quantity_on_hand, unit))")
        .eq("id", approval.entity_id)
        .maybeSingle();
      return { kind: "stock_lot" as const, approval, lot };
    }
    if (approval.entity_table === "stock_releases") {
      const { data: release } = await supabase
        .from("stock_releases")
        .select("*, stock_release_items(*, stock_items(item_code, description, quantity_on_hand, unit))")
        .eq("id", approval.entity_id)
        .maybeSingle();
      return { kind: "stock_release" as const, approval, release };
    }
    return { kind: "none" as const, approval };
  });


/** Management may clear a decided request out of the record. */
export const deleteApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (!(myRoles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Only Management can delete an approval record.");
    }
    const { data: prev } = await supabase.from("approvals").select("*").eq("id", data.id).maybeSingle();
    const { error } = await supabase.from("approvals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "approvals",
      entity_id: data.id,
      entity_label: prev?.title ?? "",
      previous_value: prev,
    });
    return { ok: true };
  });

/** Raise an approval request (A1 - A6). Management is notified immediately. */
export const submitApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        approval_type: z.enum([
          "quotation_commercial",
          "project_initiation",
          "bom_bos",
          "job_number",
          "additional_material",
          "final_review",
          "customer_po",
          "commercial_review",
          "item_code",
          "stock_lot",
          "stock_release",
          "supplier",

        ]),
        title: z.string().trim().min(1).max(300),
        details: z.string().max(4000).default(""),
        project_id: z.string().uuid().nullable().default(null),
        job_number_id: z.string().uuid().nullable().default(null),
        entity_table: z.string().max(60).optional(),
        entity_id: z.string().uuid().nullable().optional(),
        amount: z.number().min(0).default(0),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { entity_table, entity_id, ...fields } = data;

    const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isManagement = (myRoles ?? []).some((r) => r.role === "admin");
    const now = new Date().toISOString();

    const { data: created, error } = await supabase
      .from("approvals")
      .insert({
        ...fields,
        decision: isManagement ? "approved" : "pending",
        decision_comments: isManagement ? "Auto-approved: raised by Management." : "",
        approver_id: isManagement ? userId : null,
        decided_at: isManagement ? now : null,
        submitted_by: userId,
        entity_table: entity_table ?? (data.job_number_id ? "job_numbers" : "projects"),
        entity_id: entity_id ?? data.job_number_id ?? data.project_id,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (data.job_number_id && !isManagement) {
      await supabase.from("job_numbers").update({ status: "pending_approval" }).eq("id", data.job_number_id);
    }

    await logActivity(supabase, userId, {
      action: isManagement ? "approval_auto_approved" : "approval_requested",
      entity_table: "approvals",
      entity_id: created.id,
      entity_label: data.title,
      new_value: data,
    });

    if (isManagement) {
      // Management does not wait on anyone — the action goes through immediately
      // and they simply get a confirmation.
      await applyDecisionEffects(supabase, userId, created, "approved");
      await notifyUsers(supabase, [userId], {
        title: "Approved automatically",
        message: `${data.title} — raised by Management, no approval needed.`,
        category: "approval",
        link: "/approvals",
        entity_table: "approvals",
        entity_id: created.id,
      });
      return { ok: true, id: created.id, auto_approved: true };
    }

    await notifyDepartments(supabase, ["admin"], {
      title: "Approval required",
      message: data.title,
      category: "approval",
      link: "/approvals",
      entity_table: "approvals",
      entity_id: created.id,
    });
    return { ok: true, id: created.id, auto_approved: false };
  });

/** Push an approval decision through to the record it gates. */
async function applyDecisionEffects(
  supabase: any,
  userId: string,
  approval: any,
  decision: "approved" | "rejected" | "revision_requested",
) {
  const approved = decision === "approved";
  const now = new Date().toISOString();
  const status = approved ? "approved" : decision === "rejected" ? "rejected" : "pending";

  if (approval.entity_table === "stock_lots" && approval.entity_id) {
    await applyStockLotDecision(supabase, userId, approval.entity_id, decision);
  }
  if (approval.entity_table === "stock_releases" && approval.entity_id) {
    await applyStockReleaseDecision(supabase, userId, approval.entity_id, decision);
  }
  if (approval.entity_table === "suppliers" && approval.entity_id) {
    await supabase
      .from("suppliers")
      .update({
        approval_status: status,
        approved_by: approved ? userId : null,
        approved_at: approved ? now : null,
      } as any)
      .eq("id", approval.entity_id);
  }
  if (approval.entity_table === "stock_items" && approval.entity_id) {
    await supabase
      .from("stock_items")
      .update({
        approval_status: status,
        approved_by: approved ? userId : null,
        approved_at: approved ? now : null,
      })
      .eq("id", approval.entity_id);
  }
  if (approval.job_number_id) {
    await supabase
      .from("job_numbers")
      .update({
        status: approved ? "approved" : decision === "rejected" ? "rejected" : "draft",
        approved_by: approved ? userId : null,
        approved_at: approved ? now : null,
      })
      .eq("id", approval.job_number_id);
  }
  if (approval.project_id && approved) {
    const stageByType: Record<string, string> = {
      project_initiation: "project_initiated",
      bom_bos: "job_number_created",
      job_number: "material_planning",
      final_review: "closed",
    };
    const stage = stageByType[approval.approval_type];
    if (stage) await supabase.from("projects").update({ stage }).eq("id", approval.project_id);
  }
}


/** Management decision. Nothing downstream may proceed until this is approved. */
export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected", "revision_requested"]),
        decision_notes: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: myRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!(myRoles ?? []).some((r) => r.role === "admin")) {
      throw new Error("Only management can decide approvals.");
    }

    const { data: approval } = await supabase
      .from("approvals")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!approval) throw new Error("Approval not found");
    if (approval.decision !== "pending") throw new Error("This request has already been decided.");

    const { error } = await supabase
      .from("approvals")
      .update({
        decision: data.decision,
        decision_comments: data.decision_notes,
        rejection_reason: data.decision === "rejected" ? data.decision_notes : "",
        revision_requested: data.decision === "revision_requested",
        approver_id: userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    await applyDecisionEffects(supabase, userId, approval, data.decision);


    await logActivity(supabase, userId, {
      action: `approval_${data.decision}`,
      entity_table: "approvals",
      entity_id: data.id,
      entity_label: approval.title,
      previous_value: { decision: approval.decision },
      new_value: { decision: data.decision, notes: data.decision_notes },
    });
    await notifyUsers(supabase, [approval.submitted_by], {
      title: `Approval ${data.decision.replace("_", " ")}`,
      message: approval.title,
      category: "approval",
      link: "/approvals",
      entity_table: "approvals",
      entity_id: data.id,
    });
    return { ok: true };
  });
