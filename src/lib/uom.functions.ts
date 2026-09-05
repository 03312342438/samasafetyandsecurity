import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logActivity } from "@/lib/activity";
import { assertCan } from "@/lib/permissions";

/** Master unit-of-measurement list. Every quantity in the app uses one of these. */
export const listUoms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("units_of_measure")
      .select("*")
      .order("code");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveUom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        code: z.string().trim().min(1).max(20),
        name: z.string().trim().max(120).default(""),
        active: z.boolean().default(true),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "uom.manage");
    const { id, ...fields } = data;

    if (id) {
      const { error } = await supabase.from("units_of_measure").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, {
        action: "edit",
        entity_table: "units_of_measure",
        entity_id: id,
        entity_label: fields.code,
        new_value: fields,
      });
      return { ok: true, id };
    }

    const { data: created, error } = await supabase
      .from("units_of_measure")
      .insert({ ...fields, created_by: userId })
      .select("id")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" ? `Unit "${fields.code}" already exists.` : error.message,
      );
    }
    await logActivity(supabase, userId, {
      action: "create",
      entity_table: "units_of_measure",
      entity_id: created.id,
      entity_label: fields.code,
      new_value: fields,
    });
    return { ok: true, id: created.id };
  });

export const deleteUom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertCan(supabase, userId, "uom.manage");
    const { error } = await supabase.from("units_of_measure").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, {
      action: "delete",
      entity_table: "units_of_measure",
      entity_id: data.id,
    });
    return { ok: true };
  });
