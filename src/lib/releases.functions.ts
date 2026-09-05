import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity, notifyDepartments, notifyUsers } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { myRoles, isManagement } from "@/lib/permissions";

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

const RELEASE_SELECT =
  "*, job_numbers(job_number, status), projects(project_number, name), stock_release_items(*, stock_items(item_code, description, unit, quantity_on_hand))";

/** Every release raised by the Store, newest first. */
export const listStockReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("stock_releases")
      .select(RELEASE_SELECT)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Job numbers that Management has approved — only these can be released against. */
export const listReleasableJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("job_numbers")
      .select("id, job_number, description, status, bom_id, project_id, projects(project_number, name)")
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * The material contained in an approved job number (its BOM lines), with how much
 * has already been released so the Store cannot over-issue.
 */
export const getJobReleasableItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ job_number_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: job } = await supabase
      .from("job_numbers")
      .select("*, projects(project_number, name), boms(reference, title)")
      .eq("id", data.job_number_id)
      .maybeSingle();
    if (!job) throw new Error("Job number not found");
    if (job.status !== "approved") {
      throw new Error(`Job ${job.job_number} is not approved yet — material cannot be released.`);
    }
    if (!job.bom_id) {
      throw new Error(`Job ${job.job_number} has no BOM / BOS attached, so it contains no items.`);
    }
    const { data: priorRelease } = await supabase
      .from("stock_releases")
      .select("reference")
      .eq("job_number_id", data.job_number_id)
      .in("status", ["released", "pending"])
      .limit(1);
    if ((priorRelease ?? []).length > 0) {
      throw new Error(
        `Job ${job.job_number} has already been used for release ${(priorRelease as any[])[0].reference} — a job number can only be used once.`,
      );
    }

    const [{ data: bomItems }, { data: released }] = await Promise.all([
      supabase
        .from("bom_items")
        .select("*, stock_items(id, item_code, description, unit, quantity_on_hand, unit_cost)")
        .eq("bom_id", job.bom_id)
        .order("sequence"),
      supabase
        .from("stock_release_items")
        .select("bom_item_id, quantity, stock_releases!inner(job_number_id, status)")
        .eq("stock_releases.job_number_id", data.job_number_id)
        .eq("stock_releases.status", "released"),
    ]);

    const alreadyByBomItem = new Map<string, number>();
    for (const r of (released ?? []) as any[]) {
      if (!r.bom_item_id) continue;
      alreadyByBomItem.set(r.bom_item_id, (alreadyByBomItem.get(r.bom_item_id) ?? 0) + Number(r.quantity ?? 0));
    }

    return {
      job,
      items: ((bomItems ?? []) as any[]).map((b) => ({
        bom_item_id: b.id,
        stock_item_id: b.stock_item_id,
        item_code: b.stock_items?.item_code ?? "",
        description: b.description || b.stock_items?.description || "",
        unit: b.unit || b.stock_items?.unit || "",
        unit_cost: Number(b.unit_cost ?? b.stock_items?.unit_cost ?? 0),
        quantity_planned: Number(b.quantity ?? 0),
        quantity_released: alreadyByBomItem.get(b.id) ?? 0,
        quantity_on_hand: Number(b.stock_items?.quantity_on_hand ?? 0),
      })),
    };
  });

/** Take the lines of a release out of live stock and write the movement trail. */
async function deductRelease(supabase: any, userId: string, release: any) {
  for (const line of release.stock_release_items ?? []) {
    const qty = Number(line.quantity ?? 0);
    if (!line.stock_item_id || qty <= 0) continue;
    const { data: item } = await supabase
      .from("stock_items")
      .select("*")
      .eq("id", line.stock_item_id)
      .maybeSingle();
    if (!item) continue;
    const next = round2(Number(item.quantity_on_hand ?? 0) - qty);
    await supabase.from("stock_items").update({ quantity_on_hand: next }).eq("id", line.stock_item_id);
    await supabase.from("stock_movements").insert({
      stock_item_id: line.stock_item_id,
      movement_type: "issue",
      description: line.description || item.description,
      unit: line.unit || item.unit,
      quantity: qty,
      unit_cost: Number(line.unit_cost ?? 0),
      reference: release.reference,
      project_id: release.project_id ?? null,
      job_number_id: release.job_number_id ?? null,
      remarks: `Release ${release.reference}${release.released_to ? ` to ${release.released_to}` : ""}`,
      moved_by: userId,
    });
  }
}

const releaseLineSchema = z.object({
  stock_item_id: z.string().uuid(),
  bom_item_id: z.string().uuid().nullable().default(null),
  quantity: z.number().min(0).default(0),
  remarks: z.string().max(500).default(""),
});

/**
 * Record a release of material.
 * - `job`: only items contained in the approved job's BOM, deducted from live stock straight away.
 * - `free`: no job number, so it goes to Management and is only deducted once approved.
 */
export const createStockRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        release_kind: z.enum(["job", "free"]),
        job_number_id: z.string().uuid().nullable().default(null),
        released_to: z.string().max(200).default(""),
        purpose: z.string().max(500).default(""),
        notes: z.string().max(2000).default(""),
        items: z.array(releaseLineSchema).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const roles = await myRoles(supabase, userId);
    if (!roles.includes("inventory") && !roles.includes("admin")) {
      throw new Error("Only the Store can release items.");
    }

    const lines = data.items.filter((i) => i.stock_item_id && Number(i.quantity) > 0);
    if (lines.length === 0) throw new Error("Add at least one item with a quantity to release.");

    let job: any = null;
    let projectId: string | null = null;

    if (data.release_kind === "job") {
      if (!data.job_number_id) throw new Error("Choose the job number to release against.");
      const { data: j } = await supabase
        .from("job_numbers")
        .select("*")
        .eq("id", data.job_number_id)
        .maybeSingle();
      if (!j) throw new Error("Job number not found");
      if (j.status !== "approved") {
        throw new Error(`Job ${j.job_number} is not approved — material cannot be released against it.`);
      }
      if (!j.bom_id) throw new Error(`Job ${j.job_number} has no BOM / BOS, so it contains no items.`);
      const { data: prior } = await supabase
        .from("stock_releases")
        .select("reference")
        .eq("job_number_id", data.job_number_id)
        .in("status", ["released", "pending"])
        .limit(1);
      if ((prior ?? []).length > 0) {
        throw new Error(
          `Job ${j.job_number} has already been used for release ${(prior as any[])[0].reference} — a job number can only be used once.`,
        );
      }
      job = j;
      projectId = j.project_id ?? null;

      // Only items actually contained in the approved job may leave the store here.
      const { data: bomItems } = await supabase
        .from("bom_items")
        .select("id, stock_item_id")
        .eq("bom_id", j.bom_id);
      const allowed = new Set(
        ((bomItems ?? []) as any[]).map((b) => b.stock_item_id).filter(Boolean),
      );
      const stray = lines.find((l) => !allowed.has(l.stock_item_id));
      if (stray) {
        throw new Error("Only items contained in the approved job number can be released this way.");
      }
    }

    // Enrich the lines from the store master.
    const ids = [...new Set(lines.map((l) => l.stock_item_id))];
    const { data: stockRows } = await supabase
      .from("stock_items")
      .select("id, item_code, description, unit, unit_cost, quantity_on_hand")
      .in("id", ids);
    const byId = new Map(((stockRows ?? []) as any[]).map((s) => [s.id, s]));

    const short = lines.find(
      (l) => Number(byId.get(l.stock_item_id)?.quantity_on_hand ?? 0) < Number(l.quantity),
    );
    if (short) {
      const s = byId.get(short.stock_item_id);
      throw new Error(
        `Not enough stock for ${s?.item_code ?? "item"} — ${s?.quantity_on_hand ?? 0} ${s?.unit ?? ""} on hand.`,
      );
    }

    const total = round2(
      lines.reduce(
        (sum, l) => sum + Number(l.quantity) * Number(byId.get(l.stock_item_id)?.unit_cost ?? 0),
        0,
      ),
    );

    const reference = await nextSequence(supabase, "stock_releases", "reference", "REL");
    const isJob = data.release_kind === "job";

    const { data: created, error } = await supabase
      .from("stock_releases")
      .insert({
        reference,
        release_kind: data.release_kind,
        job_number_id: isJob ? data.job_number_id : null,
        project_id: projectId,
        released_to: data.released_to,
        purpose: data.purpose,
        notes: data.notes,
        status: isJob ? "released" : "pending",
        total_value: total,
        submitted_at: new Date().toISOString(),
        released_at: isJob ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const { error: itemError } = await supabase.from("stock_release_items").insert(
      lines.map((l, index) => ({
        release_id: created.id,
        stock_item_id: l.stock_item_id,
        bom_item_id: isJob ? l.bom_item_id : null,
        sequence: index + 1,
        description: byId.get(l.stock_item_id)?.description ?? "",
        unit: byId.get(l.stock_item_id)?.unit ?? "",
        quantity: Number(l.quantity),
        unit_cost: Number(byId.get(l.stock_item_id)?.unit_cost ?? 0),
        remarks: l.remarks,
      })),
    );
    if (itemError) throw new Error(itemError.message);

    if (isJob) {
      const { data: full } = await supabase
        .from("stock_releases")
        .select("*, stock_release_items(*)")
        .eq("id", created.id)
        .maybeSingle();
      await deductRelease(supabase, userId, full);
    } else {
      const admin = await isManagement(supabase, userId);
      const { data: approval, error: approvalError } = await supabase
        .from("approvals")
        .insert({
          approval_type: "stock_release",
          title: `Release without job number — ${reference}`,
          details: `${lines.length} item(s) · to ${data.released_to || "—"}${data.purpose ? ` · ${data.purpose}` : ""}`,
          entity_table: "stock_releases",
          entity_id: created.id,
          amount: total,
          decision: admin ? "approved" : "pending",
          decision_comments: admin ? "Auto-approved: raised by Management." : "",
          approver_id: admin ? userId : null,
          decided_at: admin ? new Date().toISOString() : null,
          submitted_by: userId,
        })
        .select("id")
        .single();
      if (approvalError) throw new Error(approvalError.message);
      if (admin) {
        await applyStockReleaseDecision(supabase, userId, created.id, "approved");
        await notifyUsers(supabase, [userId], {
          title: "Release approved automatically",
          message: `${reference} · ${lines.length} item(s) — raised by Management, no approval needed.`,
          category: "inventory",
          link: "/releases",
          entity_table: "approvals",
          entity_id: approval.id,
        });
      } else {
        await notifyDepartments(supabase, ["admin"], {
          title: "Stock release approval required",
          message: `${reference} · ${lines.length} item(s) without a job number`,
          category: "inventory",
          link: "/approvals",
          entity_table: "approvals",
          entity_id: approval.id,
        });
      }
    }


    await logActivity(supabase, userId, {
      action: isJob ? "stock_released" : "approval_requested",
      entity_table: "stock_releases",
      entity_id: created.id,
      entity_label: reference,
      new_value: { kind: data.release_kind, job: job?.job_number ?? null, lines: lines.length, total },
    });

    return { ok: true, id: created.id, reference, status: created.status };
  });

/** Management (or the raiser, while still pending) may remove a release. */
export const deleteStockRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prev } = await supabase.from("stock_releases").select("*").eq("id", data.id).maybeSingle();
    if (!prev) throw new Error("Release not found");
    const admin = await isManagement(supabase, userId);
    if (prev.status === "released" && !admin) {
      throw new Error(`Release ${prev.reference} already left the store — only Management can remove it.`);
    }
    const { error } = await supabase.from("stock_releases").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "stock_releases",
      entity_id: data.id,
      entity_label: prev.reference,
      previous_value: prev,
    });
    return { ok: true };
  });

/** Management decision on a release raised without a job number. */
export async function applyStockReleaseDecision(
  supabase: any,
  userId: string,
  releaseId: string,
  decision: "approved" | "rejected" | "revision_requested",
) {
  const { data: release } = await supabase
    .from("stock_releases")
    .select("*, stock_release_items(*)")
    .eq("id", releaseId)
    .maybeSingle();
  if (!release) return;
  if (release.status === "released") return;

  if (decision !== "approved") {
    await supabase
      .from("stock_releases")
      .update({ status: decision === "rejected" ? "rejected" : "draft" })
      .eq("id", releaseId);
    return;
  }

  await deductRelease(supabase, userId, release);
  await supabase
    .from("stock_releases")
    .update({
      status: "released",
      approved_by: userId,
      approved_at: new Date().toISOString(),
      released_at: new Date().toISOString(),
    })
    .eq("id", releaseId);

  await notifyDepartments(supabase, ["inventory"], {
    title: `Release ${release.reference} approved`,
    message: "The items have been deducted from live stock.",
    category: "inventory",
    link: "/releases",
    entity_table: "stock_releases",
    entity_id: releaseId,
  });
}
