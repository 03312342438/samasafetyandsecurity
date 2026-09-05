import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleList = (roles ?? []).map((r) => r.role);
    const isAdmin = roleList.includes("admin");
    return {
      profile,
      isAdmin,
      roles: roleList,
      // Admins are always active; everyone else must be approved.
      isApproved: isAdmin || (profile?.status ?? "approved") === "approved",
      status: profile?.status ?? "approved",
    };
  });




const bootstrapSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(6).max(72),
  full_name: z.string().trim().min(1).max(120),
  designation: z.string().trim().max(120).default(""),
});

export const bootstrapAdmin = createServerFn({ method: "POST" })
  .inputValidator((input) => bootstrapSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existsData, error: existsErr } = await supabaseAdmin.rpc("admin_exists");
    if (existsErr) throw new Error(existsErr.message);
    if (existsData) {
      throw new Error("An administrator already exists. Please ask your admin to create your account.");
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create admin");

    const uid = created.user.id;
    const { error: pErr } = await supabaseAdmin.from("profiles").insert({
      id: uid,
      full_name: data.full_name,
      designation: data.designation,
      email: data.email,
    });
    if (pErr) throw new Error(pErr.message);

    const { error: rErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: uid, role: "admin" });
    if (rErr) throw new Error(rErr.message);

    return { ok: true };
  });

export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("admin_exists");
  if (error) throw new Error(error.message);
  return { exists: Boolean(data) };
});
