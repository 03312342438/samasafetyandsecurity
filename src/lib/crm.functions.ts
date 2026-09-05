import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity";
import { nextSequence } from "@/lib/sequence";
import { assertCan } from "@/lib/permissions";

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCustomer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [{ data: customer }, { data: assets }, { data: projects }] = await Promise.all([
      supabase.from("customers").select("*").eq("id", data.id).maybeSingle(),
      supabase.from("assets").select("*").eq("customer_id", data.id).order("asset_tag"),
      supabase.from("projects").select("*").eq("customer_id", data.id).order("created_at", { ascending: false }),
    ]);
    if (!customer) throw new Error("Customer not found");
    return { customer, assets: assets ?? [], projects: projects ?? [] };
  });

export const saveCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(300),
        customer_number: z.string().trim().max(60).default(""),
        contact_person: z.string().max(200).default(""),
        cr_cpr_number: z.string().max(60).default(""),
        email: z.string().max(320).default(""),
        phone: z.string().max(60).default(""),
        address: z.string().max(500).default(""),
        city: z.string().max(120).default(""),
        payment_terms: z.string().max(300).default(""),
        credit_terms: z.string().max(300).default(""),
        notes: z.string().max(2000).default(""),
        status: z.enum(["active", "inactive"]).default("active"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "customer.manage");
    const { id, ...fields } = data;

    if (id) {
      const { data: prev } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
      const { error } = await supabase.from("customers").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "customers",
        entity_id: id,
        entity_label: fields.name,
        previous_value: prev,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const customerNumber =
      fields.customer_number || (await nextSequence(supabase, "customers", "customer_number", "CUS"));
    const { data: created, error } = await supabase
      .from("customers")
      .insert({ ...fields, customer_number: customerNumber, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "customers",
      entity_id: created.id,
      entity_label: `${customerNumber} — ${fields.name}`,
      new_value: { ...fields, customer_number: customerNumber },
    });
    return { ok: true, id: created.id, customer_number: customerNumber };
  });

export const deleteCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "customer.manage");
    const { data: prev } = await supabase.from("customers").select("*").eq("id", data.id).maybeSingle();

    // A customer number that is already used on a project cannot be removed.
    const { data: linkedProjects } = await supabase
      .from("projects")
      .select("project_number, name")
      .eq("customer_id", data.id)
      .limit(5);
    if ((linkedProjects ?? []).length > 0) {
      const list = (linkedProjects ?? [])
        .map((p: any) => `${p.project_number}${p.name ? ` (${p.name})` : ""}`)
        .join(", ");
      throw new Error(
        `Customer ${prev?.customer_number ?? ""} cannot be deleted — it is entered in project ${list}.`,
      );
    }

    const { data: removed, error } = await supabase
      .from("customers")
      .delete()
      .eq("id", data.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!removed || removed.length === 0) {
      throw new Error("You do not have permission to delete this customer.");
    }
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "customers",
      entity_id: data.id,
      entity_label: prev?.name ?? "",
      previous_value: prev,
    });
    return { ok: true };
  });


// ---------------------------------------------------------------- assets ----

export const listAssets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assets")
      .select("*, customers(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        asset_tag: z.string().trim().min(1).max(100),
        customer_id: z.string().uuid().nullable().default(null),
        site_location: z.string().max(500).default(""),
        system_type: z.string().max(200).default(""),
        manufacturer: z.string().max(200).default(""),
        model: z.string().max(200).default(""),
        serial_number: z.string().max(200).default(""),
        installation_date: z.string().max(40).nullable().default(null),
        warranty_end: z.string().max(40).nullable().default(null),
        maintenance_frequency_months: z.number().int().min(0).max(120).nullable().default(null),
        last_service_date: z.string().max(40).nullable().default(null),
        next_service_date: z.string().max(40).nullable().default(null),
        status: z.string().max(40).default("active"),
        notes: z.string().max(2000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...raw } = data;
    const fields = {
      ...raw,
      installation_date: raw.installation_date || null,
      warranty_end: raw.warranty_end || null,
      last_service_date: raw.last_service_date || null,
      next_service_date: raw.next_service_date || null,
    };

    if (id) {
      const { error } = await supabase.from("assets").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "assets",
        entity_id: id,
        entity_label: fields.asset_tag,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const { data: created, error } = await supabase
      .from("assets")
      .insert({ ...fields, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "assets",
      entity_id: created.id,
      entity_label: fields.asset_tag,
      new_value: fields,
    });
    return { ok: true, id: created.id };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("assets").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "assets",
      entity_id: data.id,
    });
    return { ok: true };
  });
